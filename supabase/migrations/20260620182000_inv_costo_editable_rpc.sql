-- ============================================================================
-- INVENTARIO Fase B — RPC para editar el costo del producto desde el form.
-- Decision de producto (Jorge 2026-06-20): no todos los comerciantes usaran el
-- modulo de Compras; un emprendedor debe poder ajustar el costo manualmente.
-- Tras el REVOKE (20260620181000) el UPDATE directo de productos.costo por
-- authenticated esta bloqueado, asi que el costo manual entra por esta RPC
-- (SECURITY DEFINER, ownership-checked) — sin reabrir la escritura directa.
--
-- Nota contable: setea productos.costo (la proyeccion del promedio). Es un
-- override manual; la siguiente entrada-con-costo del kardex recalcula el
-- promedio desde este valor. No toca el stock ni la invariante stock==SUM(kardex).
-- ============================================================================
create or replace function public.actualizar_costo_producto(p_producto_id uuid, p_costo numeric)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from public.productos where id = p_producto_id;
  if v_tienda is null then raise exception 'producto inexistente'; end if;
  if not public.tienda_ia_es_dueno(v_tienda) then raise exception 'no autorizado'; end if;
  update public.productos set costo = p_costo where id = p_producto_id;
end; $function$;

revoke all on function public.actualizar_costo_producto(uuid, numeric) from public, anon;
grant execute on function public.actualizar_costo_producto(uuid, numeric) to authenticated;
