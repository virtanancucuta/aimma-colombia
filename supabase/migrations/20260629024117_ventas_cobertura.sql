-- AIMMA · Modulo Ventas · Fase 6: ventas_cobertura (pestaña "Venta & Cobertura").
-- Opcion A (una sola fuente de la matematica de venta): LLAMA a ventas_resumen(p_limit:=null) en FROM + LEFT JOIN
-- stock disponible (Σ stock − Σ reservado por producto) + velocidad/cobertura/estado encima. NO toca ventas_resumen.
-- Fechas EXPLICITAS: ventas_cobertura resuelve v_desde/v_hasta (mismo coalesce mes-en-curso) y las pasa a
-- ventas_resumen -> la venta y los dias usan el MISMO rango. Cobertura con CASE (sin division por cero).
-- Clasificacion de estado = espejo de inventario_resumen (umbrales tienda 15/60 + guard >=7 dias de historia).
create or replace function public.ventas_cobertura(
  p_tienda_id uuid, p_desde date default null, p_hasta date default null, p_orden text default null,
  p_proveedor_id uuid default null, p_categoria_id uuid default null, p_buscar text default null,
  p_limit integer default null, p_offset integer default 0)
returns table(
  producto_id uuid, referencia text, nombre text, foto_principal_url text,
  proveedor_id uuid, proveedor_nombre text, categoria_id uuid, categoria_nombre text,
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric, utilidad numeric,
  rentabilidad numeric, costo_estimado boolean,
  stock_disponible bigint, velocidad numeric, cobertura_dias numeric, estado text, total_count bigint)
 language plpgsql stable security definer set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_desde date; v_hasta date; v_dias int; v_orden text := coalesce(p_orden, 'cobertura');
  v_ruptura int; v_sobrestock int;
begin
  if not public.es_miembro_tienda(p_tienda_id) then raise exception 'no autorizado'; end if;
  v_desde := coalesce(p_desde, (date_trunc('month', now() at time zone 'America/Bogota'))::date);
  v_hasta := coalesce(p_hasta, (now() at time zone 'America/Bogota')::date);
  v_dias := greatest(1, (v_hasta - v_desde) + 1);
  select t.inv_umbral_ruptura_dias, t.inv_umbral_sobrestock_dias
    into v_ruptura, v_sobrestock from public.tiendas t where t.id = p_tienda_id;
  return query
  with v as (
    -- venta por referencia: UNA sola fuente (ventas_resumen), fechas EXPLICITAS, sin limite (trae todo)
    select r.producto_id, r.referencia, r.nombre, r.foto_principal_url, r.proveedor_id, r.proveedor_nombre,
           r.categoria_id, r.categoria_nombre, r.unidades, r.ingreso, r.neta, r.iva, r.costo, r.utilidad,
           r.rentabilidad, r.costo_estimado
    from public.ventas_resumen(p_tienda_id, v_desde, v_hasta, 'ingreso',
           p_proveedor_id, p_categoria_id, p_buscar, null, 0) r
  ),
  st as (
    select pv.producto_id, (coalesce(sum(pv.stock),0) - coalesce(sum(pv.reservado),0))::bigint as disponible
    from public.producto_variantes pv group by pv.producto_id
  ),
  j as (
    select v.*, coalesce(s.disponible, 0)::bigint as stock_disponible,
      round(case when v.unidades > 0 then v.unidades::numeric / v_dias else 0 end, 3) as velocidad,
      case when coalesce(s.disponible, 0) = 0 then 0::numeric
           when v.unidades <= 0 then null::numeric
           else round(coalesce(s.disponible, 0)::numeric / (v.unidades::numeric / v_dias), 1) end as cobertura_dias
    from v left join st s on s.producto_id = v.producto_id
  ),
  est as (
    select j.*,
      case
        when j.stock_disponible = 0 then 'quiebre'
        when j.unidades <= 0 then 'sin_rotacion'
        when v_dias >= 7 and j.cobertura_dias < v_ruptura then 'ruptura'
        when v_dias >= 7 and j.cobertura_dias > v_sobrestock then 'sobrestock'
        else 'normal'
      end as estado
    from j
  )
  select e.producto_id, e.referencia, e.nombre, e.foto_principal_url,
    e.proveedor_id, e.proveedor_nombre, e.categoria_id, e.categoria_nombre,
    e.unidades, e.ingreso, e.neta, e.iva, e.costo, e.utilidad, e.rentabilidad, e.costo_estimado,
    e.stock_disponible, e.velocidad, e.cobertura_dias, e.estado,
    count(*) over()::bigint as total_count
  from est e
  order by
    case when v_orden = 'cobertura' then e.cobertura_dias end asc nulls last,   -- default: menor cobertura primero (quiebre=0 arriba, sin_rotacion=null al fondo)
    case when v_orden = 'cobertura_desc' then e.cobertura_dias end desc nulls last,
    case when v_orden = 'ingreso' then e.ingreso end desc nulls last,
    case when v_orden = 'ingreso_asc' then e.ingreso end asc nulls last,
    case when v_orden = 'unidades' then e.unidades end desc nulls last,
    case when v_orden = 'utilidad' then e.utilidad end desc nulls last,
    case when v_orden = 'rentabilidad' then e.rentabilidad end desc nulls last,
    case when v_orden = 'stock' then e.stock_disponible end desc nulls last,
    case when v_orden = 'referencia' then e.referencia end asc,
    e.cobertura_dias asc nulls last
  limit p_limit offset coalesce(p_offset, 0);
end;
$function$;
revoke all on function public.ventas_cobertura(uuid, date, date, text, uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.ventas_cobertura(uuid, date, date, text, uuid, uuid, text, integer, integer) to authenticated;
