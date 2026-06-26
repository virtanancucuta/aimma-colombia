create or replace function public.ventas_resumen(
  p_tienda_id uuid, p_desde date default null, p_hasta date default null, p_orden text default null,
  p_proveedor_id uuid default null, p_categoria_id uuid default null, p_buscar text default null,
  p_limit integer default null, p_offset integer default 0)
returns table(
  producto_id uuid, referencia text, nombre text, foto_principal_url text,
  proveedor_id uuid, proveedor_nombre text, categoria_id uuid, categoria_nombre text,
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric,
  utilidad numeric, rentabilidad numeric, costo_estimado boolean, total_count bigint)
 language plpgsql stable security definer set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_desde date; v_hasta date; v_ini timestamptz; v_fin timestamptz;
  v_orden text := coalesce(p_orden, 'ingreso'); v_buscar text;
begin
  if not public.es_miembro_tienda(p_tienda_id) then raise exception 'no autorizado'; end if;
  v_desde := coalesce(p_desde, (date_trunc('month', now() at time zone 'America/Bogota'))::date);
  v_hasta := coalesce(p_hasta, (now() at time zone 'America/Bogota')::date);
  v_ini := v_desde::timestamp at time zone 'America/Bogota';
  v_fin := (v_hasta + 1)::timestamp at time zone 'America/Bogota';
  if p_buscar is not null and length(trim(p_buscar)) > 0 then
    v_buscar := '%' || replace(replace(replace(p_buscar,'\','\\'),'%','\%'),'_','\_') || '%';
  end if;
  return query
  with venta_items as (
    select pi.producto_id, pi.variante_id, pi.referencia as ref_snap, pi.nombre as nom_snap,
           pi.cantidad, pi.subtotal, pi.tasa_iva,
           coalesce(m.costo_unitario, pr.costo, 0)::numeric as costo_unit,
           (m.id is null) as costo_estimado,
           pr.referencia as ref_act, pr.nombre as nom_act, pr.foto_principal_url,
           pr.proveedor_id, prov.nombre as proveedor_nombre, pr.categoria_id, cat.nombre as categoria_nombre,
           p.cerrado_at, p.devuelto_at
    from public.pedidos p
    join public.pedido_items pi on pi.pedido_id = p.id
    left join public.inventario_movimientos m
      on m.pedido_id = pi.pedido_id and m.variante_id = pi.variante_id and m.tipo = 'venta'
    left join public.productos pr on pr.id = pi.producto_id
    left join public.proveedores prov on prov.id = pr.proveedor_id
    left join public.categorias cat on cat.id = pr.categoria_id
    where p.tienda_id = p_tienda_id and p.estado in ('cerrado','devuelto')
      and (p_proveedor_id is null or pr.proveedor_id = p_proveedor_id)
      and (p_categoria_id is null or pr.categoria_id = p_categoria_id
           or pr.categoria_id in (select c.id from public.categorias c where c.parent_id = p_categoria_id))
      and (v_buscar is null or pr.referencia ilike v_buscar or pr.nombre ilike v_buscar
           or pi.referencia ilike v_buscar or pi.nombre ilike v_buscar)
  ),
  lineas as (
    select vi.*, 1 as signo, vi.cerrado_at as fecha from venta_items vi where vi.cerrado_at is not null
    union all
    select vi.*, -1 as signo, vi.devuelto_at as fecha from venta_items vi where vi.devuelto_at is not null
  ),
  en_rango as (select * from lineas where fecha >= v_ini and fecha < v_fin),
  agg as (
    select coalesce(l.ref_act, l.ref_snap) as referencia, max(l.producto_id) as producto_id,
      coalesce(max(l.nom_act), max(l.nom_snap)) as nombre, max(l.foto_principal_url) as foto_principal_url,
      max(l.proveedor_id) as proveedor_id, max(l.proveedor_nombre) as proveedor_nombre,
      max(l.categoria_id) as categoria_id, max(l.categoria_nombre) as categoria_nombre,
      sum(l.signo * l.cantidad)::bigint as unidades,
      sum(l.signo * l.subtotal)::numeric as ingreso,
      sum((l.signo * l.subtotal) / (1 + l.tasa_iva / 100.0))::numeric as neta,
      sum(l.signo * l.cantidad * l.costo_unit)::numeric as costo,
      bool_or(l.costo_estimado) as costo_estimado
    from en_rango l
    group by coalesce(l.producto_id::text, 'snap:' || l.ref_snap)
  )
  select a.producto_id, a.referencia, a.nombre, a.foto_principal_url,
    a.proveedor_id, a.proveedor_nombre, a.categoria_id, a.categoria_nombre,
    a.unidades, a.ingreso, a.neta, (a.ingreso - a.neta) as iva, a.costo,
    (a.neta - a.costo) as utilidad,
    case when a.neta = 0 then null else (a.neta - a.costo) / a.neta end as rentabilidad,
    a.costo_estimado, count(*) over()::bigint as total_count
  from agg a
  order by
    case when v_orden='ingreso' then a.ingreso end desc nulls last,
    case when v_orden='ingreso_asc' then a.ingreso end asc nulls last,
    case when v_orden='unidades' then a.unidades end desc nulls last,
    case when v_orden='utilidad' then (a.neta - a.costo) end desc nulls last,
    case when v_orden='rentabilidad' then (case when a.neta=0 then null else (a.neta-a.costo)/a.neta end) end desc nulls last,
    case when v_orden='referencia' then a.referencia end asc,
    a.ingreso desc nulls last
  limit p_limit offset coalesce(p_offset, 0);
end;
$function$;
revoke all on function public.ventas_resumen(uuid,date,date,text,uuid,uuid,text,integer,integer) from public, anon;
grant execute on function public.ventas_resumen(uuid,date,date,text,uuid,uuid,text,integer,integer) to authenticated;

create or replace function public.ventas_variantes(
  p_tienda_id uuid, p_producto_ids uuid[], p_desde date default null, p_hasta date default null)
returns table(
  producto_id uuid, variante_id uuid, color text, talla text, sku text,
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric,
  utilidad numeric, rentabilidad numeric, costo_estimado boolean)
 language plpgsql stable security definer set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_desde date; v_hasta date; v_ini timestamptz; v_fin timestamptz;
begin
  if not public.es_miembro_tienda(p_tienda_id) then raise exception 'no autorizado'; end if;
  v_desde := coalesce(p_desde, (date_trunc('month', now() at time zone 'America/Bogota'))::date);
  v_hasta := coalesce(p_hasta, (now() at time zone 'America/Bogota')::date);
  v_ini := v_desde::timestamp at time zone 'America/Bogota';
  v_fin := (v_hasta + 1)::timestamp at time zone 'America/Bogota';
  return query
  with venta_items as (
    select pi.producto_id, pi.variante_id, pi.color, pi.talla, pv.sku,
           pi.cantidad, pi.subtotal, pi.tasa_iva,
           coalesce(m.costo_unitario, pr.costo, 0)::numeric as costo_unit,
           (m.id is null) as costo_estimado, p.cerrado_at, p.devuelto_at
    from public.pedidos p
    join public.pedido_items pi on pi.pedido_id = p.id
    left join public.inventario_movimientos m
      on m.pedido_id = pi.pedido_id and m.variante_id = pi.variante_id and m.tipo = 'venta'
    left join public.productos pr on pr.id = pi.producto_id
    left join public.producto_variantes pv on pv.id = pi.variante_id
    where p.tienda_id = p_tienda_id and p.estado in ('cerrado','devuelto')
      and pi.producto_id = any(p_producto_ids) and pi.variante_id is not null
  ),
  lineas as (
    select vi.*, 1 as signo, vi.cerrado_at as fecha from venta_items vi where vi.cerrado_at is not null
    union all
    select vi.*, -1 as signo, vi.devuelto_at as fecha from venta_items vi where vi.devuelto_at is not null
  ),
  en_rango as (select * from lineas where fecha >= v_ini and fecha < v_fin),
  agg as (
    select l.producto_id, l.variante_id, max(l.color) as color, max(l.talla) as talla, max(l.sku) as sku,
      sum(l.signo*l.cantidad)::bigint as unidades, sum(l.signo*l.subtotal)::numeric as ingreso,
      sum((l.signo*l.subtotal)/(1+l.tasa_iva/100.0))::numeric as neta,
      sum(l.signo*l.cantidad*l.costo_unit)::numeric as costo, bool_or(l.costo_estimado) as costo_estimado
    from en_rango l group by l.producto_id, l.variante_id
  )
  select a.producto_id, a.variante_id, a.color, a.talla, a.sku,
    a.unidades, a.ingreso, a.neta, (a.ingreso - a.neta) as iva, a.costo,
    (a.neta - a.costo) as utilidad,
    case when a.neta = 0 then null else (a.neta - a.costo) / a.neta end as rentabilidad, a.costo_estimado
  from agg a order by a.producto_id, a.color nulls first, a.talla nulls first, a.sku;
end;
$function$;
revoke all on function public.ventas_variantes(uuid,uuid[],date,date) from public, anon;
grant execute on function public.ventas_variantes(uuid,uuid[],date,date) to authenticated;

create or replace function public.ventas_totales(
  p_tienda_id uuid, p_desde date default null, p_hasta date default null,
  p_proveedor_id uuid default null, p_categoria_id uuid default null, p_buscar text default null)
returns table(
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric,
  utilidad numeric, margen numeric, pedidos bigint, costo_estimado_parcial boolean, desde date, hasta date)
 language plpgsql stable security definer set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_desde date; v_hasta date; v_ini timestamptz; v_fin timestamptz; v_buscar text;
begin
  if not public.es_miembro_tienda(p_tienda_id) then raise exception 'no autorizado'; end if;
  v_desde := coalesce(p_desde, (date_trunc('month', now() at time zone 'America/Bogota'))::date);
  v_hasta := coalesce(p_hasta, (now() at time zone 'America/Bogota')::date);
  v_ini := v_desde::timestamp at time zone 'America/Bogota';
  v_fin := (v_hasta + 1)::timestamp at time zone 'America/Bogota';
  if p_buscar is not null and length(trim(p_buscar)) > 0 then
    v_buscar := '%' || replace(replace(replace(p_buscar,'\','\\'),'%','\%'),'_','\_') || '%';
  end if;
  return query
  with venta_items as (
    select pi.pedido_id, pi.cantidad, pi.subtotal, pi.tasa_iva,
           coalesce(m.costo_unitario, pr.costo, 0)::numeric as costo_unit,
           (m.id is null) as costo_estimado, p.cerrado_at, p.devuelto_at
    from public.pedidos p
    join public.pedido_items pi on pi.pedido_id = p.id
    left join public.inventario_movimientos m
      on m.pedido_id = pi.pedido_id and m.variante_id = pi.variante_id and m.tipo = 'venta'
    left join public.productos pr on pr.id = pi.producto_id
    where p.tienda_id = p_tienda_id and p.estado in ('cerrado','devuelto')
      and (p_proveedor_id is null or pr.proveedor_id = p_proveedor_id)
      and (p_categoria_id is null or pr.categoria_id = p_categoria_id
           or pr.categoria_id in (select c.id from public.categorias c where c.parent_id = p_categoria_id))
      and (v_buscar is null or pr.referencia ilike v_buscar or pr.nombre ilike v_buscar
           or pi.referencia ilike v_buscar or pi.nombre ilike v_buscar)
  ),
  lineas as (
    select vi.*, 1 as signo, vi.cerrado_at as fecha from venta_items vi where vi.cerrado_at is not null
    union all
    select vi.*, -1 as signo, vi.devuelto_at as fecha from venta_items vi where vi.devuelto_at is not null
  ),
  en_rango as (select * from lineas where fecha >= v_ini and fecha < v_fin),
  agg as (
    select sum(signo*cantidad)::bigint as unidades, sum(signo*subtotal)::numeric as ingreso,
      sum((signo*subtotal)/(1+tasa_iva/100.0))::numeric as neta,
      sum(signo*cantidad*costo_unit)::numeric as costo,
      count(distinct pedido_id)::bigint as pedidos, bool_or(costo_estimado) as costo_estimado_parcial
    from en_rango
  )
  select coalesce(a.unidades,0)::bigint, coalesce(a.ingreso,0)::numeric, coalesce(a.neta,0)::numeric,
    (coalesce(a.ingreso,0)-coalesce(a.neta,0))::numeric as iva, coalesce(a.costo,0)::numeric,
    (coalesce(a.neta,0)-coalesce(a.costo,0))::numeric as utilidad,
    case when coalesce(a.neta,0)=0 then null else (a.neta-a.costo)/a.neta end as margen,
    coalesce(a.pedidos,0)::bigint, coalesce(a.costo_estimado_parcial,false), v_desde, v_hasta
  from agg a;
end;
$function$;
revoke all on function public.ventas_totales(uuid,date,date,uuid,uuid,text) from public, anon;
grant execute on function public.ventas_totales(uuid,date,date,uuid,uuid,text) to authenticated;
