-- ============================================================================
-- INVENTARIO GENERAL — inventario_totales: KPIs agregados sobre el set FILTRADO
-- completo (sin paginar). Devuelve total de unidades, valor de inventario (a costo),
-- costo de venta del periodo (COGS) y la cobertura general POR COSTO (DIO):
--   cobertura = valor_inventario / (costo_venta_periodo / dias_efectivos)
-- dias_efectivos = LEAST(periodo, antiguedad de la tienda) -> normaliza tienda nueva.
-- Mismos filtros (proveedor/categoria con hijos/buscador) y candado que inventario_resumen.
-- SECURITY DEFINER, dueño 1a linea, REVOKE/GRANT, #variable_conflict use_column.
-- ============================================================================
create or replace function public.inventario_totales(
  p_tienda_id uuid, p_periodo int default null,
  p_proveedor_id uuid default null, p_categoria_id uuid default null, p_buscar text default null
)
returns table(total_unidades bigint, valor_inventario numeric, costo_venta_periodo numeric,
              cobertura_general_dias numeric, periodo int)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_periodo int; v_dias_efectivos int; v_buscar text; v_creada date;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select least(coalesce(p_periodo, t.inv_periodo_default_dias), 60), t.created_at::date
    into v_periodo, v_creada from public.tiendas t where t.id = p_tienda_id;
  if v_periodo is null then raise exception 'tienda inexistente'; end if;
  v_dias_efectivos := least(v_periodo, greatest(1, current_date - v_creada));
  if p_buscar is not null and length(trim(p_buscar)) > 0 then
    v_buscar := '%' || replace(replace(replace(p_buscar, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  with base as (
    select p.id, p.costo
    from public.productos p
    where p.tienda_id = p_tienda_id
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
      and (p_categoria_id is null or p.categoria_id = p_categoria_id
           or p.categoria_id in (select c.id from public.categorias c where c.parent_id = p_categoria_id))
      and (v_buscar is null or p.referencia ilike v_buscar or p.nombre ilike v_buscar)
  ),
  stk as (
    select coalesce(sum(pv.stock),0)::bigint as unidades,
           coalesce(sum(pv.stock * b.costo),0)::numeric as valor
    from public.producto_variantes pv join base b on b.id = pv.producto_id
  ),
  cogs as (
    select (-1 * coalesce(sum(im.cantidad * im.costo_unitario),0))::numeric as costo_venta
    from public.inventario_movimientos im join base b on b.id = im.producto_id
    where im.tipo in ('venta','devolucion') and im.created_at >= now() - make_interval(days => v_periodo)
  )
  select s.unidades, s.valor, c.costo_venta,
    case when s.valor = 0 then 0::numeric
         when c.costo_venta <= 0 then null::numeric
         else s.valor / (c.costo_venta / v_dias_efectivos) end as cobertura_general_dias,
    v_periodo
  from stk s cross join cogs c;
end;
$function$;

revoke all on function public.inventario_totales(uuid, int, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.inventario_totales(uuid, int, uuid, uuid, text) to authenticated;
