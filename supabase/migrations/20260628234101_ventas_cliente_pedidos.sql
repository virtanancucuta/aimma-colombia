-- AIMMA · Modulo Ventas · Fase 5 Mejora 2: ficha CRM "Por compra".
-- ventas_cliente_pedidos: lista los pedidos de un cliente (telefono normalizado) en el rango, una fila por ITEM
-- con la cabecera del pedido repetida + el NETO del pedido (pedido_venta) calculado con el MISMO netting que
-- ventas_resumen/ventas_por_cliente (cross join lateral (1,cerrado_at)/(-1,devuelto_at) + filtro de rango).
-- -> coherencia con "Por artículo" POR CONSTRUCCION: Sigma pedido_venta (distinct) == ingreso del cliente.
-- badge "Devuelto" es visual (devuelto_at is not null); el monto sale del netting. Candado es_miembro_tienda.
create or replace function public.ventas_cliente_pedidos(
  p_tienda_id uuid, p_telefono text, p_desde date default null, p_hasta date default null)
returns table(
  pedido_id uuid, codigo_publico text, cerrado_at timestamptz, devuelto_at timestamptz, es_devuelto boolean,
  pedido_venta numeric, pedido_unidades bigint,
  referencia text, nombre text, cantidad integer, subtotal numeric, tasa_iva numeric)
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
  with emis as (
    -- NETO por pedido (mismo netting que las otras RPCs): emite +linea en cerrado_at y -linea en devuelto_at,
    -- filtra por rango sobre la fecha de CADA linea -> el pedido aparece si tuvo actividad neta en el rango.
    select p.id as pedido_id, p.codigo_publico, p.cerrado_at, p.devuelto_at,
           sum(l.signo * pi.subtotal)::numeric as pedido_venta,
           sum(l.signo * pi.cantidad)::bigint as pedido_unidades
    from public.pedidos p
    join public.pedido_items pi on pi.pedido_id = p.id
    cross join lateral (values (1, p.cerrado_at), (-1, p.devuelto_at)) as l(signo, fecha)
    where p.tienda_id = p_tienda_id and p.estado in ('cerrado','devuelto')
      and public.telefono_norm(p.comprador_telefono) = p_telefono
      and l.fecha is not null and l.fecha >= v_ini and l.fecha < v_fin
    group by p.id, p.codigo_publico, p.cerrado_at, p.devuelto_at
  )
  select e.pedido_id, e.codigo_publico, e.cerrado_at, e.devuelto_at,
         (e.devuelto_at is not null) as es_devuelto,
         e.pedido_venta, e.pedido_unidades,
         pi.referencia, pi.nombre, pi.cantidad, pi.subtotal, pi.tasa_iva
  from emis e
  join public.pedido_items pi on pi.pedido_id = e.pedido_id   -- items del pedido (contenido real del pedido, una vez c/u)
  order by e.cerrado_at desc, pi.referencia;
end;
$function$;
revoke all on function public.ventas_cliente_pedidos(uuid, text, date, date) from public, anon;
grant execute on function public.ventas_cliente_pedidos(uuid, text, date, date) to authenticated;
