-- AIMMA · Modulo Ventas · Fase 1 · Persistir tasa_iva al CREAR producto via RPC.
-- ADITIVA / IDEMPOTENTE (CREATE OR REPLACE). El path de edicion ya persiste tasa_iva por UPDATE
-- directo; el path de creacion va por este RPC, cuyo INSERT tenia lista de columnas fija SIN tasa_iva
-- (un producto nuevo nacia en 0 ignorando la precarga del form). Aca se agrega tasa_iva al INSERT.
--
-- DIFF vs version actual: SOLO el INSERT cambia (2 adiciones):
--   * columnas: se agrega "tasa_iva" entre cantidad_min_mayorista y estado.
--   * values:   se agrega "coalesce(nullif(p_producto->>'tasa_iva','')::numeric, 0)" en esa posicion.
-- El resto del cuerpo (auth, variantes, stock inicial, kardex saldo_inicial, return) es IDENTICO.

create or replace function public.crear_producto_con_stock(p_producto jsonb, p_variantes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
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
     tasa_iva, estado, guia_tallas_url, ficha_editorial)
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
     coalesce(nullif(p_producto->>'tasa_iva','')::numeric, 0),
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

-- Grants: reproducen EXACTOS los del RPC original (migracion 20260620180000). CREATE OR REPLACE
-- preserva el ACL, pero se re-emiten para que la migracion sea auto-documentada y no se pierda
-- ningun atributo de seguridad por omision. ACL actual: {postgres=X, authenticated=X, service_role=X};
-- public/anon SIN execute.
revoke all on function public.crear_producto_con_stock(jsonb, jsonb) from public, anon;
grant execute on function public.crear_producto_con_stock(jsonb, jsonb) to authenticated;
