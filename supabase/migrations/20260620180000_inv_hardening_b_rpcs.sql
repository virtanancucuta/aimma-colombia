-- ============================================================================
-- HARDENING INVENTARIO — Fase B, parte 1: RPCs owner-facing (la capa que impone
-- la invariante). SEGURO de aplicar ANTES del front y del REVOKE.
--   #1: el form deja de escribir stock/costo directo; rutea por estos RPCs.
--   Patron M6: SECURITY DEFINER con tienda_ia_es_dueno como PRIMERA linea.
--   Engine kardex_registrar se llama internamente (corre como definer → ok
--   aunque kardex este revocado de authenticated).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- crear_producto_con_stock: crea producto + variantes + saldo_inicial, atomico.
-- p_producto: jsonb con los campos del producto (sin slug → trigger auto_slug).
-- p_variantes: jsonb array [{color,talla,sku,stock,precio_override}]  (>=1).
-- Devuelve la fila del producto creado (jsonb) — el form la usa (fotos, etc).
-- ----------------------------------------------------------------------------
create or replace function public.crear_producto_con_stock(p_producto jsonb, p_variantes jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_tienda uuid := (p_producto->>'tienda_id')::uuid;
  v_costo_ini numeric := nullif(p_producto->>'costo','')::numeric;
  v_prod_id uuid; v_var_id uuid; v_el jsonb; v_stock int; v_row jsonb;
begin
  if v_tienda is null then raise exception 'tienda_id requerido'; end if;
  if not public.tienda_ia_es_dueno(v_tienda) then raise exception 'no autorizado'; end if;

  insert into public.productos
    (tienda_id, nombre, referencia, categoria_id, variante_tipo_1, variante_tipo_2,
     descripcion, precio_venta, costo, precio_promo, precio_mayorista, cantidad_min_mayorista,
     estado, guia_tallas_url, ficha_editorial)
  values (
     v_tienda,
     p_producto->>'nombre',
     p_producto->>'referencia',
     nullif(p_producto->>'categoria_id','')::uuid,
     nullif(p_producto->>'variante_tipo_1',''),
     nullif(p_producto->>'variante_tipo_2',''),
     nullif(p_producto->>'descripcion',''),
     (p_producto->>'precio_venta')::numeric,
     v_costo_ini,
     nullif(p_producto->>'precio_promo','')::numeric,
     nullif(p_producto->>'precio_mayorista','')::numeric,
     nullif(p_producto->>'cantidad_min_mayorista','')::int,
     coalesce(nullif(p_producto->>'estado',''),'activo'),
     nullif(p_producto->>'guia_tallas_url',''),
     case when p_producto ? 'ficha_editorial' then p_producto->'ficha_editorial' else null end
  )
  returning id into v_prod_id;

  for v_el in select value from jsonb_array_elements(p_variantes) loop
    insert into public.producto_variantes (producto_id, color, talla, sku, stock, precio_override)
    values (v_prod_id, nullif(v_el->>'color',''), nullif(v_el->>'talla',''), v_el->>'sku', 0,
            nullif(v_el->>'precio_override','')::numeric)
    returning id into v_var_id;
    v_stock := coalesce((v_el->>'stock')::int, 0);
    if v_stock > 0 then
      perform public.kardex_registrar(v_prod_id, v_var_id, 'saldo_inicial', v_stock, v_costo_ini, now(), null, 'Carga inicial');
    end if;
  end loop;

  select to_jsonb(p.*) into v_row from public.productos p where p.id = v_prod_id;
  return v_row;
end; $function$;

-- ----------------------------------------------------------------------------
-- editar_variantes_producto: aplica cambios de variantes de un producto EXISTENTE.
--   altas (sin id)  -> insert variante (stock 0) + entrada(stock, costo) si stock>0.
--   edicion (con id) -> update color/talla/sku/precio_override; delta de stock:
--        delta>0 -> entrada (con costo: p_costo_entrada o promedio actual)
--        delta<0 -> ajuste (sin costo)
--   p_eliminar       -> delete con guard de reservas activas.
-- p_costo_entrada: costo unitario para las entradas (default = promedio actual).
-- ----------------------------------------------------------------------------
create or replace function public.editar_variantes_producto(
  p_producto_id uuid, p_variantes jsonb, p_eliminar uuid[] default '{}', p_costo_entrada numeric default null)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_tienda uuid; v_avg numeric; v_costo_ent numeric;
  v_el jsonb; v_id uuid; v_vid uuid; v_target int; v_cur int; v_delta int;
begin
  select tienda_id, costo into v_tienda, v_avg from public.productos where id = p_producto_id;
  if v_tienda is null then raise exception 'producto inexistente'; end if;
  if not public.tienda_ia_es_dueno(v_tienda) then raise exception 'no autorizado'; end if;
  v_costo_ent := coalesce(p_costo_entrada, v_avg);

  -- DELETES (guard reservas)
  if array_length(p_eliminar,1) is not null then
    if exists (select 1 from public.producto_variantes where id = any(p_eliminar) and producto_id = p_producto_id and reservado > 0) then
      raise exception 'No se puede eliminar variantes con reservas activas';
    end if;
    delete from public.producto_variantes where id = any(p_eliminar) and producto_id = p_producto_id;
  end if;

  for v_el in select value from jsonb_array_elements(coalesce(p_variantes,'[]'::jsonb)) loop
    v_id := nullif(v_el->>'id','')::uuid;
    v_target := coalesce((v_el->>'stock')::int, 0);
    if v_id is null then
      -- ALTA
      insert into public.producto_variantes (producto_id, color, talla, sku, stock, precio_override)
      values (p_producto_id, nullif(v_el->>'color',''), nullif(v_el->>'talla',''), v_el->>'sku', 0,
              nullif(v_el->>'precio_override','')::numeric)
      returning id into v_vid;
      if v_target > 0 then
        perform public.kardex_registrar(p_producto_id, v_vid, 'entrada', v_target, v_costo_ent, now(), null, 'Alta variante');
      end if;
    else
      -- EDICION: campos no-stock directo (permitido), stock por kardex (delta)
      update public.producto_variantes
        set color = nullif(v_el->>'color',''), talla = nullif(v_el->>'talla',''),
            sku = v_el->>'sku', precio_override = nullif(v_el->>'precio_override','')::numeric
        where id = v_id and producto_id = p_producto_id;
      select stock into v_cur from public.producto_variantes where id = v_id and producto_id = p_producto_id for update;
      if not found then raise exception 'variante % no pertenece al producto', v_id; end if;
      v_delta := v_target - v_cur;
      if v_delta > 0 then
        perform public.kardex_registrar(p_producto_id, v_id, 'entrada', v_delta, v_costo_ent, now(), null, 'Ajuste form (+)');
      elsif v_delta < 0 then
        perform public.kardex_registrar(p_producto_id, v_id, 'ajuste', v_delta, null, now(), null, 'Ajuste form (-)');
      end if;
    end if;
  end loop;
end; $function$;

-- ----------------------------------------------------------------------------
-- Grants: owner-facing → authenticated SI (con ownership check interno);
--         anon/public NO.
-- ----------------------------------------------------------------------------
revoke all on function public.crear_producto_con_stock(jsonb, jsonb) from public, anon;
grant execute on function public.crear_producto_con_stock(jsonb, jsonb) to authenticated;
revoke all on function public.editar_variantes_producto(uuid, jsonb, uuid[], numeric) from public, anon;
grant execute on function public.editar_variantes_producto(uuid, jsonb, uuid[], numeric) to authenticated;
