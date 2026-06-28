-- AIMMA · Modulo Ventas · Fase 5 ajuste: ventas_por_cliente + ultima_compra / email / ciudad.
-- Agregar columnas al RETURNS TABLE cambia el tipo de retorno -> DROP+CREATE (CREATE OR REPLACE lo rechaza).
-- Migracion atomica. Cuerpo verbatim de la version anterior + 3 agregados nuevos (ultima_compra = max(cerrado_at)
-- filter signo=1; email/ciudad = mas reciente por cerrado_at, mismo patron que el nombre). El calculo
-- (netting/COGS/neta/pct/orden) NO cambia -> invariante intacto. Sin callers internos (solo el front, named args).
drop function public.ventas_por_cliente(uuid, date, date);

create function public.ventas_por_cliente(
  p_tienda_id uuid, p_desde date default null, p_hasta date default null)
returns table(
  grupo_id text, grupo_nombre text, es_sin_grupo boolean, num_referencias bigint,
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric, utilidad numeric,
  costo_estimado_parcial boolean, pct numeric,
  ultima_compra timestamptz, email text, ciudad text)
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
    select p.id as pedido_id, p.comprador_nombre, p.comprador_email, p.comprador_ciudad, p.cerrado_at,
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
           count(distinct l.pedido_id) filter (where l.signo = 1)::bigint as num_referencias,
           sum(l.signo * l.cantidad)::bigint as unidades,
           sum(l.signo * l.subtotal)::numeric as ingreso,
           sum((l.signo * l.subtotal) / (1 + l.tasa_iva / 100.0))::numeric as neta,
           sum(l.signo * l.cantidad * l.costo_unit)::numeric as costo,
           bool_or(l.costo_estimado) as costo_estimado_parcial,
           max(l.cerrado_at) filter (where l.signo = 1) as ultima_compra,
           (array_agg(l.comprador_email order by l.cerrado_at desc) filter (where l.comprador_email is not null))[1] as email,
           (array_agg(l.comprador_ciudad order by l.cerrado_at desc) filter (where l.comprador_ciudad is not null))[1] as ciudad
    from lineas l group by l.tel
  )
  select a.grupo_id, coalesce(a.grupo_nombre, 'Sin teléfono') as grupo_nombre, a.es_sin_grupo, a.num_referencias,
    a.unidades, a.ingreso, a.neta, (a.ingreso - a.neta) as iva, a.costo, (a.neta - a.costo) as utilidad,
    a.costo_estimado_parcial,
    case when sum(a.ingreso) over () = 0 then 0 else round(a.ingreso / sum(a.ingreso) over () * 100, 2) end as pct,
    a.ultima_compra, a.email, a.ciudad
  from agg a
  order by a.ingreso desc nulls last, (a.grupo_id is null);
end;
$function$;
revoke all on function public.ventas_por_cliente(uuid, date, date) from public, anon;
grant execute on function public.ventas_por_cliente(uuid, date, date) to authenticated;
