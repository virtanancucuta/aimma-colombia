-- AIMMA · Modulo Ventas · Fase 4 · RPCs agregadas: ventas_por_proveedor / ventas_por_categoria.
-- Misma linea-emision que ventas_resumen (cerrado/devuelto; +cerrado_at / -devuelto_at; COGS = LEFT JOIN
-- mov venta por (pedido_id,variante_id) + fallback coalesce(m.costo_unitario, pr.costo, 0); neta por linea;
-- tz America/Bogota; default mes en curso) PERO agregando por grupo en vez de por referencia.
-- Rollup categoria SIN doble conteo = coalesce(parent_id, id) a la raiz (prof. 2). pct = ingreso_grupo /
-- ingreso_total_periodo * 100 (sobre ingreso CON IVA; Sigma = 100). Candado: SECURITY DEFINER STABLE
-- search_path=public, #variable_conflict use_column, gate es_miembro_tienda, REVOKE public/anon + GRANT authenticated.

-- ============================================================
-- 1) ventas_por_proveedor
-- ============================================================
create or replace function public.ventas_por_proveedor(
  p_tienda_id uuid, p_desde date default null, p_hasta date default null)
returns table(
  grupo_id uuid, grupo_nombre text, es_sin_grupo boolean, num_referencias bigint,
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric, utilidad numeric,
  costo_estimado_parcial boolean, pct numeric)
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
  with lineas as (
    select pi.producto_id, pi.referencia, pr.proveedor_id, prov.nombre as proveedor_nombre,
           l.signo, pi.cantidad, pi.subtotal, pi.tasa_iva,
           coalesce(m.costo_unitario, pr.costo, 0)::numeric as costo_unit,
           (m.id is null) as costo_estimado
    from public.pedidos p
    join public.pedido_items pi on pi.pedido_id = p.id
    left join public.inventario_movimientos m
      on m.pedido_id = pi.pedido_id and m.variante_id = pi.variante_id and m.tipo = 'venta'
    left join public.productos pr on pr.id = pi.producto_id
    left join public.proveedores prov on prov.id = pr.proveedor_id
    cross join lateral (values (1, p.cerrado_at), (-1, p.devuelto_at)) as l(signo, fecha)
    where p.tienda_id = p_tienda_id and p.estado in ('cerrado','devuelto')
      and l.fecha is not null and l.fecha >= v_ini and l.fecha < v_fin
  ),
  agg as (
    select l.proveedor_id as grupo_id, max(l.proveedor_nombre) as grupo_nombre, (l.proveedor_id is null) as es_sin_grupo,
           count(distinct coalesce(l.producto_id::text, 'snap:' || l.referencia))::bigint as num_referencias,
           sum(l.signo * l.cantidad)::bigint as unidades,
           sum(l.signo * l.subtotal)::numeric as ingreso,
           sum((l.signo * l.subtotal) / (1 + l.tasa_iva / 100.0))::numeric as neta,
           sum(l.signo * l.cantidad * l.costo_unit)::numeric as costo,
           bool_or(l.costo_estimado) as costo_estimado_parcial
    from lineas l group by l.proveedor_id
  )
  select a.grupo_id, coalesce(a.grupo_nombre, 'Sin proveedor'), a.es_sin_grupo, a.num_referencias,
    a.unidades, a.ingreso, a.neta, (a.ingreso - a.neta) as iva, a.costo, (a.neta - a.costo) as utilidad,
    a.costo_estimado_parcial,
    case when sum(a.ingreso) over () = 0 then 0 else round(a.ingreso / sum(a.ingreso) over () * 100, 2) end as pct
  from agg a
  order by a.ingreso desc nulls last, (a.grupo_id is null);
end;
$function$;
revoke all on function public.ventas_por_proveedor(uuid, date, date) from public, anon;
grant execute on function public.ventas_por_proveedor(uuid, date, date) to authenticated;

-- ============================================================
-- 2) ventas_por_categoria  (p_parent_id null = top-level rollup a la raiz; set = drill a subcats)
-- ============================================================
create or replace function public.ventas_por_categoria(
  p_tienda_id uuid, p_desde date default null, p_hasta date default null, p_parent_id uuid default null)
returns table(
  grupo_id uuid, grupo_nombre text, es_sin_grupo boolean, num_referencias bigint,
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric, utilidad numeric,
  costo_estimado_parcial boolean, pct numeric)
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
  with lineas as (
    select pi.producto_id, pi.referencia, pr.categoria_id, cat.parent_id as cat_parent,
           coalesce(cat.parent_id, cat.id) as top_id,
           l.signo, pi.cantidad, pi.subtotal, pi.tasa_iva,
           coalesce(m.costo_unitario, pr.costo, 0)::numeric as costo_unit,
           (m.id is null) as costo_estimado
    from public.pedidos p
    join public.pedido_items pi on pi.pedido_id = p.id
    left join public.inventario_movimientos m
      on m.pedido_id = pi.pedido_id and m.variante_id = pi.variante_id and m.tipo = 'venta'
    left join public.productos pr on pr.id = pi.producto_id
    left join public.categorias cat on cat.id = pr.categoria_id
    cross join lateral (values (1, p.cerrado_at), (-1, p.devuelto_at)) as l(signo, fecha)
    where p.tienda_id = p_tienda_id and p.estado in ('cerrado','devuelto')
      and l.fecha is not null and l.fecha >= v_ini and l.fecha < v_fin
  ),
  agrupado as (
    -- TOP-LEVEL: agrupa a la raiz (coalesce(parent_id,id)); cada producto cae en UN root -> sin doble conteo.
    select l.top_id as gid, null::text as gname_drill,
           l.producto_id, l.referencia, l.signo, l.cantidad, l.subtotal, l.tasa_iva, l.costo_unit, l.costo_estimado
    from lineas l where p_parent_id is null
    union all
    -- DRILL: subcategorias del padre + ventas DIRECTAS en el padre como fila propia "(Directo en categoria)".
    select l.categoria_id as gid,
           (case when l.categoria_id = p_parent_id then '(Directo en categoría)' else null end) as gname_drill,
           l.producto_id, l.referencia, l.signo, l.cantidad, l.subtotal, l.tasa_iva, l.costo_unit, l.costo_estimado
    from lineas l where p_parent_id is not null and (l.categoria_id = p_parent_id or l.cat_parent = p_parent_id)
  ),
  agg as (
    select a.gid, max(a.gname_drill) as gname_drill, (a.gid is null) as es_sin_grupo,
           count(distinct coalesce(a.producto_id::text, 'snap:' || a.referencia))::bigint as num_referencias,
           sum(a.signo * a.cantidad)::bigint as unidades,
           sum(a.signo * a.subtotal)::numeric as ingreso,
           sum((a.signo * a.subtotal) / (1 + a.tasa_iva / 100.0))::numeric as neta,
           sum(a.signo * a.cantidad * a.costo_unit)::numeric as costo,
           bool_or(a.costo_estimado) as costo_estimado_parcial
    from agrupado a group by a.gid
  )
  select g.gid, coalesce(g.gname_drill, c.nombre, 'Sin categoría'), g.es_sin_grupo, g.num_referencias,
    g.unidades, g.ingreso, g.neta, (g.ingreso - g.neta) as iva, g.costo, (g.neta - g.costo) as utilidad,
    g.costo_estimado_parcial,
    case when sum(g.ingreso) over () = 0 then 0 else round(g.ingreso / sum(g.ingreso) over () * 100, 2) end as pct
  from agg g left join public.categorias c on c.id = g.gid
  order by g.ingreso desc nulls last, (g.gid is null);
end;
$function$;
revoke all on function public.ventas_por_categoria(uuid, date, date, uuid) from public, anon;
grant execute on function public.ventas_por_categoria(uuid, date, date, uuid) to authenticated;
