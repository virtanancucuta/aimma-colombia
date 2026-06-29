-- AIMMA · Variantes Genericas · Sub-fase B1: capa de lectura — exponer atributo_3 + variante_tipo_1/2/3.
-- 4 DROP+CREATE (cambia el RETURNS -> no admite CREATE OR REPLACE). Todo en 1 transaccion (atomico, sin ventana).
-- Conserva color/talla/atributo_3 (valores) sin renombrar; AGREGA nombres de eje via JOIN productos. NO cambia logica.
-- atributo_3: ventas_variantes = snapshot pedido_items; las otras 3 = catalogo vivo producto_variantes.

drop function if exists public.ventas_variantes(uuid, uuid[], date, date);
create function public.ventas_variantes(p_tienda_id uuid, p_producto_ids uuid[], p_desde date default null, p_hasta date default null)
returns table(producto_id uuid, variante_id uuid, color text, talla text, sku text,
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric, utilidad numeric, rentabilidad numeric, costo_estimado boolean,
  atributo_3 text, variante_tipo_1 text, variante_tipo_2 text, variante_tipo_3 text)
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
    select pi.producto_id, pi.variante_id, pi.color, pi.talla, pi.atributo_3, pv.sku,
           pi.cantidad, pi.subtotal, pi.tasa_iva,
           coalesce(m.costo_unitario, pr.costo, 0)::numeric as costo_unit,
           (m.id is null) as costo_estimado, p.cerrado_at, p.devuelto_at,
           pr.variante_tipo_1, pr.variante_tipo_2, pr.variante_tipo_3
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
    select l.producto_id, l.variante_id, max(l.color) as color, max(l.talla) as talla,
      max(l.atributo_3) as atributo_3, max(l.sku) as sku,
      sum(l.signo*l.cantidad)::bigint as unidades, sum(l.signo*l.subtotal)::numeric as ingreso,
      sum((l.signo*l.subtotal)/(1+l.tasa_iva/100.0))::numeric as neta,
      sum(l.signo*l.cantidad*l.costo_unit)::numeric as costo, bool_or(l.costo_estimado) as costo_estimado,
      max(l.variante_tipo_1) as variante_tipo_1, max(l.variante_tipo_2) as variante_tipo_2, max(l.variante_tipo_3) as variante_tipo_3
    from en_rango l group by l.producto_id, l.variante_id
  )
  select a.producto_id, a.variante_id, a.color, a.talla, a.sku,
    a.unidades, a.ingreso, a.neta, (a.ingreso - a.neta) as iva, a.costo,
    (a.neta - a.costo) as utilidad,
    case when a.neta = 0 then null else (a.neta - a.costo) / a.neta end as rentabilidad, a.costo_estimado,
    a.atributo_3, a.variante_tipo_1, a.variante_tipo_2, a.variante_tipo_3
  from agg a order by a.producto_id, a.color nulls first, a.talla nulls first, a.sku;
end;
$function$;
revoke all on function public.ventas_variantes(uuid, uuid[], date, date) from public, anon;
grant execute on function public.ventas_variantes(uuid, uuid[], date, date) to authenticated, service_role;

drop function if exists public.ventas_cobertura_variantes(uuid, uuid, date, date);
create function public.ventas_cobertura_variantes(p_tienda_id uuid, p_producto_id uuid, p_desde date default null, p_hasta date default null)
returns table(variante_id uuid, color text, talla text, sku text,
  unidades bigint, ingreso numeric, neta numeric, iva numeric, costo numeric, utilidad numeric, rentabilidad numeric, costo_estimado boolean,
  stock_disponible bigint, velocidad numeric, cobertura_dias numeric, estado text,
  atributo_3 text, variante_tipo_1 text, variante_tipo_2 text, variante_tipo_3 text)
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
    select r.variante_id, r.unidades, r.ingreso, r.neta, r.iva, r.costo, r.utilidad, r.rentabilidad, r.costo_estimado
    from public.ventas_variantes(p_tienda_id, array[p_producto_id], v_desde, v_hasta) r
  ),
  base as (
    select pv.id as variante_id, pv.color, pv.talla, pv.sku,
      coalesce(vv.unidades, 0)::bigint as unidades,
      coalesce(vv.ingreso, 0)::numeric as ingreso,
      coalesce(vv.neta, 0)::numeric as neta,
      coalesce(vv.iva, 0)::numeric as iva,
      coalesce(vv.costo, 0)::numeric as costo,
      coalesce(vv.utilidad, 0)::numeric as utilidad,
      vv.rentabilidad as rentabilidad,
      coalesce(vv.costo_estimado, false) as costo_estimado,
      (coalesce(pv.stock, 0) - coalesce(pv.reservado, 0))::bigint as stock_disponible,
      pv.atributo_3 as atributo_3,
      pr.variante_tipo_1, pr.variante_tipo_2, pr.variante_tipo_3
    from public.producto_variantes pv
    join public.productos pr on pr.id = pv.producto_id
    left join vv on vv.variante_id = pv.id
    where pv.producto_id = p_producto_id and pr.tienda_id = p_tienda_id
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
    e.stock_disponible, e.velocidad, e.cobertura_dias, e.estado,
    e.atributo_3, e.variante_tipo_1, e.variante_tipo_2, e.variante_tipo_3
  from est e
  order by e.cobertura_dias asc nulls last, e.sku asc;
end;
$function$;
revoke all on function public.ventas_cobertura_variantes(uuid, uuid, date, date) from public, anon;
grant execute on function public.ventas_cobertura_variantes(uuid, uuid, date, date) to authenticated, service_role;

drop function if exists public.inventario_variantes(uuid, uuid[], integer);
create function public.inventario_variantes(p_tienda_id uuid, p_producto_ids uuid[], p_periodo integer default null)
returns table(producto_id uuid, variante_id uuid, color text, talla text, sku text, stock integer, reservado integer, disponible integer, foto_color_url text, unidades_vendidas bigint, venta_diaria numeric, dias_inventario numeric, clasificacion text, datos_insuficientes boolean,
  atributo_3 text, variante_tipo_1 text, variante_tipo_2 text, variante_tipo_3 text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_periodo int; v_ruptura int; v_sobrestock int;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select least(coalesce(p_periodo, t.inv_periodo_default_dias), 120),
         t.inv_umbral_ruptura_dias, t.inv_umbral_sobrestock_dias
    into v_periodo, v_ruptura, v_sobrestock from public.tiendas t where t.id = p_tienda_id;
  if v_periodo is null then raise exception 'tienda inexistente'; end if;
  return query
  with vtas as (
    select im.variante_id,
      (-1 * coalesce(sum(im.cantidad) filter (where im.tipo in ('venta','devolucion') and im.created_at >= now() - make_interval(days => v_periodo)),0))::bigint as unidades_vendidas
    from public.inventario_movimientos im
    where im.producto_id = any(p_producto_ids) and im.variante_id is not null
    group by im.variante_id
  ),
  base as (
    select pv.producto_id, pv.id, pv.color, pv.talla, pv.sku, pv.stock, pv.reservado,
           (pv.stock - pv.reservado)::int as disponible, pv.foto_color_url,
           coalesce(v.unidades_vendidas,0)::bigint as unidades_vendidas,
           least(v_periodo, greatest(1, (current_date - p.created_at::date)))::int as dias_efectivos,
           pv.atributo_3, p.variante_tipo_1, p.variante_tipo_2, p.variante_tipo_3
    from public.producto_variantes pv
    join public.productos p on p.id = pv.producto_id
    left join vtas v on v.variante_id = pv.id
    where pv.producto_id = any(p_producto_ids) and p.tienda_id = p_tienda_id
  ),
  calc as (
    select b.*,
      case when b.unidades_vendidas = 0 then 0::numeric else b.unidades_vendidas::numeric / b.dias_efectivos end as venta_diaria,
      case when b.stock = 0 then 0::numeric when b.unidades_vendidas = 0 then null::numeric
           else b.stock::numeric / (b.unidades_vendidas::numeric / b.dias_efectivos) end as dias_inventario,
      (b.dias_efectivos < 7) as datos_insuficientes
    from base b
  )
  select c.producto_id, c.id, c.color, c.talla, c.sku, c.stock, c.reservado, c.disponible, c.foto_color_url,
    c.unidades_vendidas, c.venta_diaria, c.dias_inventario,
    case when c.stock = 0 then 'quiebre'
         when c.unidades_vendidas = 0 then 'sin_ventas'
         when c.dias_efectivos >= 7 and c.dias_inventario < v_ruptura then 'ruptura'
         when c.dias_efectivos >= 7 and c.dias_inventario > v_sobrestock then 'sobrestock'
         else 'normal' end as clasificacion,
    c.datos_insuficientes,
    c.atributo_3, c.variante_tipo_1, c.variante_tipo_2, c.variante_tipo_3
  from calc c
  order by c.producto_id, c.color nulls first, c.talla nulls first, c.sku;
end;
$function$;
revoke all on function public.inventario_variantes(uuid, uuid[], integer) from public, anon;
grant execute on function public.inventario_variantes(uuid, uuid[], integer) to authenticated, service_role;

drop function if exists public.inventario_kardex(uuid, uuid, uuid, date, date, integer, integer);
create function public.inventario_kardex(p_tienda_id uuid, p_producto_id uuid default null, p_variante_id uuid default null, p_desde date default null, p_hasta date default null, p_limit integer default 200, p_offset integer default 0)
returns table(fecha timestamp with time zone, tipo text, cantidad integer, entrada integer, salida integer, costo_unitario numeric, costo_saldo numeric, saldo_acumulado bigint, color text, talla text, sku text, nota text, pedido_id uuid,
  atributo_3 text, variante_tipo_1 text, variante_tipo_2 text, variante_tipo_3 text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then
    raise exception 'no autorizado';
  end if;
  return query
  with mov as (
    select im.id, im.fecha, im.tipo, im.cantidad, im.costo_unitario, im.costo_saldo,
           im.variante_id, im.nota, im.pedido_id, im.created_at,
           sum(im.cantidad) over (partition by im.variante_id order by im.created_at, im.id rows unbounded preceding) as saldo_acum
    from public.inventario_movimientos im
    where im.tienda_id = p_tienda_id
      and (p_producto_id is null or im.producto_id = p_producto_id)
      and (p_variante_id is null or im.variante_id = p_variante_id)
  )
  select
    m.fecha, m.tipo, m.cantidad,
    greatest(m.cantidad, 0)::int as entrada,
    greatest(-m.cantidad, 0)::int as salida,
    m.costo_unitario, m.costo_saldo,
    m.saldo_acum::bigint as saldo_acumulado,
    pv.color, pv.talla, pv.sku,
    m.nota, m.pedido_id,
    pv.atributo_3, pr.variante_tipo_1, pr.variante_tipo_2, pr.variante_tipo_3
  from mov m
  left join public.producto_variantes pv on pv.id = m.variante_id
  left join public.productos pr on pr.id = pv.producto_id
  where (p_desde is null or m.fecha::date >= p_desde)
    and (p_hasta is null or m.fecha::date <= p_hasta)
  order by m.created_at asc, m.id asc
  limit coalesce(p_limit, 200) offset coalesce(p_offset, 0);
end;
$function$;
revoke all on function public.inventario_kardex(uuid, uuid, uuid, date, date, integer, integer) from public, anon;
grant execute on function public.inventario_kardex(uuid, uuid, uuid, date, date, integer, integer) to authenticated, service_role;
