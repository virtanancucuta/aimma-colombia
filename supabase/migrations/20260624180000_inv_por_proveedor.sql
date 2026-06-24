-- ============================================================================
-- INVENTARIO — vista agregada "Por proveedor" (lectura). Cada proveedor (o "Sin proveedor")
-- con # referencias, cantidad (Σ stock), costo total (Σ stock×costo) y % sobre el costo total
-- de inventario de la tienda. Σ costo_total de todas las filas == costo total == GENERAL.
-- Candado: SECURITY DEFINER, dueño 1ª línea, REVOKE + GRANT authenticated, #variable_conflict.
-- ============================================================================
create or replace function public.inventario_por_proveedor(p_tienda_id uuid)
returns table(grupo_id uuid, grupo_nombre text, es_sin_grupo boolean, num_referencias bigint, cantidad bigint, costo_total numeric, pct numeric)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_total numeric;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select coalesce(sum(pv.stock * p.costo),0) into v_total
    from public.producto_variantes pv join public.productos p on p.id=pv.producto_id where p.tienda_id=p_tienda_id;
  return query
  with prod as (
    select p.id, p.proveedor_id, prov.nombre as proveedor_nombre, coalesce(p.costo,0) as costo,
           coalesce((select sum(pv.stock) from public.producto_variantes pv where pv.producto_id=p.id),0) as stock_total
    from public.productos p left join public.proveedores prov on prov.id=p.proveedor_id
    where p.tienda_id=p_tienda_id
  )
  select prod.proveedor_id, coalesce(prod.proveedor_nombre,'Sin proveedor'), (prod.proveedor_id is null),
    count(*)::bigint, coalesce(sum(prod.stock_total),0)::bigint, coalesce(sum(prod.stock_total*prod.costo),0)::numeric,
    case when v_total>0 then round((sum(prod.stock_total*prod.costo)/v_total*100)::numeric,1) else 0 end
  from prod group by prod.proveedor_id, prod.proveedor_nombre
  order by coalesce(sum(prod.stock_total*prod.costo),0) desc, (prod.proveedor_id is null);
end;
$function$;
revoke all on function public.inventario_por_proveedor(uuid) from public, anon, authenticated;
grant execute on function public.inventario_por_proveedor(uuid) to authenticated;
