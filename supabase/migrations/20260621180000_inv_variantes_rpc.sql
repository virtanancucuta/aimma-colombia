-- ============================================================================
-- INVENTARIO Fase 1b — RPC de LECTURA para el drill-down por variante.
-- Devuelve las variantes de UN producto (stock/reservado/disponible/foto) para
-- desplegar bajo la fila de la referencia en las vistas de resumen.
-- Mismo patron que 1a: SECURITY DEFINER STABLE, dueño en la 1a linea, REVOKE
-- explicito de public/anon/authenticated + GRANT EXECUTE a authenticated (M6).
-- #variable_conflict use_column (leccion 1a: nombres del RETURNS TABLE chocan con
-- columnas; compila pero falla en cada ejecucion sin esto). Columnas qualificadas.
-- Tenant-scoped: join a productos por tienda_id (si el producto no es de la
-- tienda -> 0 filas), ademas del candado de dueño.
-- ============================================================================
create or replace function public.inventario_variantes(p_tienda_id uuid, p_producto_id uuid)
returns table(variante_id uuid, color text, talla text, sku text,
              stock int, reservado int, disponible int, foto_color_url text)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then
    raise exception 'no autorizado';
  end if;
  return query
  select pv.id, pv.color, pv.talla, pv.sku,
         pv.stock, pv.reservado, (pv.stock - pv.reservado)::int as disponible, pv.foto_color_url
  from public.producto_variantes pv
  join public.productos p on p.id = pv.producto_id
  where p.id = p_producto_id and p.tienda_id = p_tienda_id
  order by pv.color nulls first, pv.talla nulls first, pv.sku;
end;
$function$;

revoke all on function public.inventario_variantes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.inventario_variantes(uuid, uuid) to authenticated;
