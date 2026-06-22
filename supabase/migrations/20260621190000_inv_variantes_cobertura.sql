-- ============================================================================
-- INVENTARIO Fase 1b — inventario_variantes v2: cobertura POR VARIANTE.
-- Extiende el drill-down: ademas de stock/reservado/disponible, devuelve por
-- variante las mismas metricas que inventario_resumen pero a nivel variante:
-- unidades_vendidas (kardex, por variante_id, en el periodo), venta_diaria,
-- dias_inventario (0 si stock 0, NULL si sin ventas), clasificacion y
-- datos_insuficientes (guard <7 dias). Asi una talla/color puede estar en ROJO
-- aunque la referencia se vea sana. NO se asume que sumen a la cobertura de la
-- referencia (es justamente el punto). Nuevo param p_periodo (el front pasa el
-- periodo activo 30/60). dias_efectivos usa productos.created_at (igual norma
-- que el padre, para que las coberturas sean comparables).
-- Mismo candado: SECURITY DEFINER STABLE, dueño 1a linea, REVOKE/GRANT,
-- #variable_conflict use_column. La firma cambia (3 args) -> DROP del v1 (2 args).
-- ============================================================================
drop function if exists public.inventario_variantes(uuid, uuid);

create or replace function public.inventario_variantes(p_tienda_id uuid, p_producto_id uuid, p_periodo int default null)
returns table(
  variante_id uuid, color text, talla text, sku text,
  stock int, reservado int, disponible int, foto_color_url text,
  unidades_vendidas bigint, venta_diaria numeric, dias_inventario numeric,
  clasificacion text, datos_insuficientes boolean
)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_periodo int; v_ruptura int; v_sobrestock int;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select least(coalesce(p_periodo, t.inv_periodo_default_dias), 60),
         t.inv_umbral_ruptura_dias, t.inv_umbral_sobrestock_dias
    into v_periodo, v_ruptura, v_sobrestock
    from public.tiendas t where t.id = p_tienda_id;
  if v_periodo is null then raise exception 'tienda inexistente'; end if;

  return query
  with prod as (
    select p.id, p.created_at from public.productos p
    where p.id = p_producto_id and p.tienda_id = p_tienda_id
  ),
  vtas as (
    select im.variante_id,
      (-1 * coalesce(sum(im.cantidad) filter (
         where im.tipo in ('venta','devolucion') and im.created_at >= now() - make_interval(days => v_periodo)
      ),0))::bigint as unidades_vendidas
    from public.inventario_movimientos im
    where im.producto_id = p_producto_id and im.variante_id is not null
    group by im.variante_id
  ),
  base as (
    select pv.id, pv.color, pv.talla, pv.sku, pv.stock, pv.reservado,
           (pv.stock - pv.reservado)::int as disponible, pv.foto_color_url,
           coalesce(v.unidades_vendidas,0)::bigint as unidades_vendidas,
           least(v_periodo, greatest(1, (current_date - (select created_at from prod)::date)))::int as dias_efectivos
    from public.producto_variantes pv
    join public.productos p on p.id = pv.producto_id
    left join vtas v on v.variante_id = pv.id
    where pv.producto_id = p_producto_id and p.tienda_id = p_tienda_id
  ),
  calc as (
    select b.*,
      case when b.unidades_vendidas = 0 then 0::numeric
           else b.unidades_vendidas::numeric / b.dias_efectivos end as venta_diaria,
      case when b.stock = 0 then 0::numeric
           when b.unidades_vendidas = 0 then null::numeric
           else b.stock::numeric / (b.unidades_vendidas::numeric / b.dias_efectivos) end as dias_inventario,
      (b.dias_efectivos < 7) as datos_insuficientes
    from base b
  )
  select c.id, c.color, c.talla, c.sku, c.stock, c.reservado, c.disponible, c.foto_color_url,
    c.unidades_vendidas, c.venta_diaria, c.dias_inventario,
    case
      when c.stock = 0 then 'quiebre'
      when c.unidades_vendidas = 0 then 'sin_ventas'
      when c.dias_efectivos >= 7 and c.dias_inventario < v_ruptura then 'ruptura'
      when c.dias_efectivos >= 7 and c.dias_inventario > v_sobrestock then 'sobrestock'
      else 'normal'
    end as clasificacion,
    c.datos_insuficientes
  from calc c
  order by c.color nulls first, c.talla nulls first, c.sku;
end;
$function$;

revoke all on function public.inventario_variantes(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.inventario_variantes(uuid, uuid, int) to authenticated;
