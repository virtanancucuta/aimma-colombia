-- AIMMA · Modulo Ventas · Fase 5 · Venta por Cliente.
-- (1) helper UNICO telefono_norm (solo digitos + strip 57 si 12) -> una sola fuente de la normalizacion.
-- (2) ventas_por_cliente (espeja ventas_por_proveedor; group by telefono_norm; N pedidos; nombre mas reciente).
-- (3) ventas_resumen: DROP+CREATE atomico = cuerpo VERBATIM actual + p_telefono text default null al final +
--     UN solo WHERE nuevo (p_telefono is null or telefono_norm(comprador_telefono)=p_telefono) -> drill cliente.
-- Migracion atomica (DROP+CREATE+REVOKE+GRANT en una transaccion): si el CREATE falla, rollback total.

-- ============================================================
-- (1) helper de normalizacion de telefono (IMMUTABLE, search_path fijo, fuente UNICA)
-- ============================================================
create or replace function public.telefono_norm(p_tel text)
returns text language sql immutable set search_path to 'public'
as $function$
  select case
    when d is null then null
    when length(d) = 12 and left(d, 2) = '57' then right(d, 10)
    else d
  end
  from (select nullif(regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g'), '') as d) x;
$function$;
revoke all on function public.telefono_norm(text) from public, anon;

-- ============================================================
-- (2) ventas_por_cliente  (group by telefono_norm; grupo_id = telefono text; N pedidos)
-- ============================================================
create or replace function public.ventas_por_cliente(
  p_tienda_id uuid, p_desde date default null, p_hasta date default null)
returns table(
  grupo_id text, grupo_nombre text, es_sin_grupo boolean, num_referencias bigint,
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
    select p.id as pedido_id, p.comprador_nombre, p.cerrado_at,
           public.telefono_norm(p.comprador_telefono) as tel,
           l.signo, pi.cantidad, pi.subtotal, pi.tasa_iva,
           coalesce(m.costo_unitario, pr.costo, 0)::numeric as costo_unit,
           (m.id is null) as costo_estimado
    from public.pedidos p
    join public.pedido_items pi on pi.pedido_id = p.id
    left join public.inventario_movimientos m
      on m.pedido_id = pi.pedido_id and m.variante_id = pi.variante_id and m.tipo = 'venta'
    left join public.productos pr on pr.id = pi.producto_id
    cross join lateral (values (1, p.cerrado_at), (-1, p.devuelto_at)) as l(signo, fecha)
    where p.tienda_id = p_tienda_id and p.estado in ('cerrado','devuelto')
      and l.fecha is not null and l.fecha >= v_ini and l.fecha < v_fin
  ),
  agg as (
    select l.tel as grupo_id,
           (array_agg(l.comprador_nombre order by l.cerrado_at desc) filter (where l.comprador_nombre is not null))[1] as grupo_nombre,
           (l.tel is null) as es_sin_grupo,
           count(distinct l.pedido_id) filter (where l.signo = 1)::bigint as num_referencias,  -- N pedidos
           sum(l.signo * l.cantidad)::bigint as unidades,
           sum(l.signo * l.subtotal)::numeric as ingreso,
           sum((l.signo * l.subtotal) / (1 + l.tasa_iva / 100.0))::numeric as neta,
           sum(l.signo * l.cantidad * l.costo_unit)::numeric as costo,
           bool_or(l.costo_estimado) as costo_estimado_parcial
    from lineas l group by l.tel
  )
  select a.grupo_id, coalesce(a.grupo_nombre, 'Sin teléfono') as grupo_nombre, a.es_sin_grupo, a.num_referencias,
    a.unidades, a.ingreso, a.neta, (a.ingreso - a.neta) as iva, a.costo, (a.neta - a.costo) as utilidad,
    a.costo_estimado_parcial,
    case when sum(a.ingreso) over () = 0 then 0 else round(a.ingreso / sum(a.ingreso) over () * 100, 2) end as pct
  from agg a
  order by a.ingreso desc nulls last, (a.grupo_id is null);
end;
$function$;
revoke all on function public.ventas_por_cliente(uuid, date, date) from public, anon;
grant execute on function public.ventas_por_cliente(uuid, date, date) to authenticated;

-- ============================================================
-- (3) ventas_resumen: DROP del 9-args + CREATE del 10-args (cuerpo VERBATIM + p_telefono + 1 WHERE)
-- ============================================================
drop function public.ventas_resumen(uuid, date, date, text, uuid, uuid, text, integer, integer);

create or replace function public.ventas_resumen(p_tienda_id uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_orden text DEFAULT NULL::text, p_proveedor_id uuid DEFAULT NULL::uuid, p_categoria_id uuid DEFAULT NULL::uuid, p_buscar text DEFAULT NULL::text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0, p_telefono text DEFAULT NULL::text)
 RETURNS TABLE(producto_id uuid, referencia text, nombre text, foto_principal_url text, proveedor_id uuid, proveedor_nombre text, categoria_id uuid, categoria_nombre text, unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric, utilidad numeric, rentabilidad numeric, costo_estimado boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and (p_telefono is null or public.telefono_norm(p.comprador_telefono) = p_telefono)
  ),
  lineas as (
    select vi.*, 1 as signo, vi.cerrado_at as fecha from venta_items vi where vi.cerrado_at is not null
    union all
    select vi.*, -1 as signo, vi.devuelto_at as fecha from venta_items vi where vi.devuelto_at is not null
  ),
  en_rango as (select * from lineas where fecha >= v_ini and fecha < v_fin),
  agg as (
    select coalesce(max(l.ref_act), max(l.ref_snap)) as referencia,
      max(l.producto_id::text)::uuid as producto_id,
      coalesce(max(l.nom_act), max(l.nom_snap)) as nombre, max(l.foto_principal_url) as foto_principal_url,
      max(l.proveedor_id::text)::uuid as proveedor_id, max(l.proveedor_nombre) as proveedor_nombre,
      max(l.categoria_id::text)::uuid as categoria_id, max(l.categoria_nombre) as categoria_nombre,
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
revoke all on function public.ventas_resumen(uuid, date, date, text, uuid, uuid, text, integer, integer, text) from public, anon;
grant execute on function public.ventas_resumen(uuid, date, date, text, uuid, uuid, text, integer, integer, text) to authenticated;
