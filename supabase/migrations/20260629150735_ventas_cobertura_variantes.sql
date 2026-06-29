-- AIMMA · Modulo Ventas · Fase 6 · DRILL: ventas_cobertura_variantes (variantes de un producto en "Venta & Cobertura").
-- Composicion (misma logica que ventas_cobertura, a nivel variante): producto_variantes (TODAS las del producto,
-- vendieron o no) LEFT JOIN ventas_variantes (la venta por variante, mismo netting que ventas_resumen) por variante_id.
-- Fechas EXPLICITAS: resuelve v_desde/v_hasta UNA vez (mismo coalesce mes-en-curso) y se las pasa a ventas_variantes
-- -> venta y dias usan el MISMO rango. Cobertura con CASE sin division por cero. Estado = espejo del producto
-- (umbrales tienda 15/60 + guard >=7 dias). On-demand al expandir una fila. NO toca ventas_cobertura/ventas_variantes.
create or replace function public.ventas_cobertura_variantes(
  p_tienda_id uuid, p_producto_id uuid, p_desde date default null, p_hasta date default null)
returns table(
  variante_id uuid, color text, talla text, sku text,
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric, utilidad numeric,
  rentabilidad numeric, costo_estimado boolean,
  stock_disponible bigint, velocidad numeric, cobertura_dias numeric, estado text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_desde date; v_hasta date; v_dias int;
  v_ruptura int; v_sobrestock int;
begin
  if not public.es_miembro_tienda(p_tienda_id) then raise exception 'no autorizado'; end if;
  v_desde := coalesce(p_desde, (date_trunc('month', now() at time zone 'America/Bogota'))::date);
  v_hasta := coalesce(p_hasta, (now() at time zone 'America/Bogota')::date);
  v_dias := greatest(1, (v_hasta - v_desde) + 1);
  select t.inv_umbral_ruptura_dias, t.inv_umbral_sobrestock_dias
    into v_ruptura, v_sobrestock from public.tiendas t where t.id = p_tienda_id;
  return query
  with vv as (
    -- venta por variante: UNA sola fuente (ventas_variantes), fechas EXPLICITAS (mismo rango que arriba)
    select r.variante_id, r.unidades, r.ingreso, r.neta, r.iva, r.costo, r.utilidad, r.rentabilidad, r.costo_estimado
    from public.ventas_variantes(p_tienda_id, array[p_producto_id], v_desde, v_hasta) r
  ),
  base as (
    -- TODAS las variantes del producto (LEFT JOIN desde producto_variantes -> trae las que NO vendieron)
    select pv.id as variante_id, pv.color, pv.talla, pv.sku,
      coalesce(vv.unidades, 0)::bigint as unidades,
      coalesce(vv.ingreso, 0)::numeric as ingreso,
      coalesce(vv.neta, 0)::numeric as neta,
      coalesce(vv.iva, 0)::numeric as iva,
      coalesce(vv.costo, 0)::numeric as costo,
      coalesce(vv.utilidad, 0)::numeric as utilidad,
      vv.rentabilidad as rentabilidad,                       -- null si no vendio (N/A, no 0)
      coalesce(vv.costo_estimado, false) as costo_estimado,
      (coalesce(pv.stock, 0) - coalesce(pv.reservado, 0))::bigint as stock_disponible
    from public.producto_variantes pv
    join public.productos pr on pr.id = pv.producto_id
    left join vv on vv.variante_id = pv.id
    where pv.producto_id = p_producto_id and pr.tienda_id = p_tienda_id   -- tenant-scoped
  ),
  calc as (
    select b.*,
      round(case when b.unidades > 0 then b.unidades::numeric / v_dias else 0 end, 3) as velocidad,
      case when b.stock_disponible = 0 then 0::numeric
           when b.unidades <= 0 then null::numeric
           else round(b.stock_disponible::numeric / (b.unidades::numeric / v_dias), 1) end as cobertura_dias
    from base b
  ),
  est as (
    select c.*,
      case
        when c.stock_disponible = 0 then 'quiebre'
        when c.unidades <= 0 then 'sin_rotacion'
        when v_dias >= 7 and c.cobertura_dias < v_ruptura then 'ruptura'
        when v_dias >= 7 and c.cobertura_dias > v_sobrestock then 'sobrestock'
        else 'normal'
      end as estado
    from calc c
  )
  select e.variante_id, e.color, e.talla, e.sku,
    e.unidades, e.ingreso, e.neta, e.iva, e.costo, e.utilidad, e.rentabilidad, e.costo_estimado,
    e.stock_disponible, e.velocidad, e.cobertura_dias, e.estado
  from est e
  order by e.cobertura_dias asc nulls last,   -- menor cobertura primero (quiebre=0 arriba, sin_rotacion=null al fondo)
           e.sku asc;
end;
$function$;
revoke all on function public.ventas_cobertura_variantes(uuid, uuid, date, date) from public, anon;
grant execute on function public.ventas_cobertura_variantes(uuid, uuid, date, date) to authenticated;
