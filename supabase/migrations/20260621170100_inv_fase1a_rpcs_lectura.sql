-- ============================================================================
-- INVENTARIO Fase 1a — RPCs de LECTURA (la capa que consumen las 4 vistas).
--   inventario_resumen  -> GENERAL / SOBRESTOCK&RUPTURA / SIN VENTAS
--   inventario_kardex   -> KARDEX
-- Ambas: SECURITY DEFINER, STABLE, dueño en la 1a linea; REVOKE explicito de
-- public/anon/authenticated + GRANT EXECUTE solo a authenticated (leccion M6).
-- Semantica confirmada: venta=-qty, devolucion=+qty -> unidades_vendidas =
-- -1*SUM(cantidad) de venta+devolucion en el periodo. Fila = PRODUCTO (referencia
-- 1:1). Categorias 2 niveles (parent_id). Saldo del kardex corre por created_at
-- (fecha es backdateable); el rango p_desde/p_hasta filtra por fecha (intencion
-- del usuario), el saldo se computa sobre todo el historial antes de filtrar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- inventario_resumen
-- ----------------------------------------------------------------------------
create or replace function public.inventario_resumen(
  p_tienda_id uuid,
  p_periodo int default null,
  p_orden text default null,
  p_clasificacion text[] default null,
  p_proveedor_id uuid default null,
  p_categoria_id uuid default null,
  p_buscar text default null,
  p_limit int default null,
  p_offset int default 0
)
returns table(
  producto_id uuid, referencia text, nombre text, foto_principal_url text,
  proveedor_id uuid, proveedor_nombre text, categoria_id uuid, categoria_nombre text,
  stock_total bigint, reservado_total bigint, stock_disponible bigint,
  costo_unitario numeric, valor_inventario numeric,
  unidades_vendidas bigint, dias_efectivos int, venta_diaria numeric, dias_inventario numeric,
  sin_ventas boolean, datos_insuficientes boolean,
  fecha_ultima_venta timestamptz, fecha_ingreso timestamptz,
  clasificacion text, total_count bigint
)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_periodo int; v_ruptura int; v_sobrestock int;
  v_orden text := coalesce(p_orden, 'valor');
  v_buscar text;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then
    raise exception 'no autorizado';
  end if;

  select least(coalesce(p_periodo, t.inv_periodo_default_dias), 60),
         t.inv_umbral_ruptura_dias, t.inv_umbral_sobrestock_dias
    into v_periodo, v_ruptura, v_sobrestock
    from public.tiendas t where t.id = p_tienda_id;
  if v_periodo is null then raise exception 'tienda inexistente'; end if;

  if p_buscar is not null and length(trim(p_buscar)) > 0 then
    v_buscar := '%' || replace(replace(replace(p_buscar, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with base as (
    select p.id, p.referencia, p.nombre, p.foto_principal_url, p.costo, p.created_at,
           p.proveedor_id, prov.nombre as proveedor_nombre,
           p.categoria_id, cat.nombre as categoria_nombre
    from public.productos p
    left join public.proveedores prov on prov.id = p.proveedor_id
    left join public.categorias cat on cat.id = p.categoria_id
    where p.tienda_id = p_tienda_id
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
      and (p_categoria_id is null
           or p.categoria_id = p_categoria_id
           or p.categoria_id in (select c.id from public.categorias c where c.parent_id = p_categoria_id))
      and (v_buscar is null or p.referencia ilike v_buscar or p.nombre ilike v_buscar)
  ),
  stk as (
    select pv.producto_id,
           coalesce(sum(pv.stock),0)::bigint as stock_total,
           coalesce(sum(pv.reservado),0)::bigint as reservado_total
    from public.producto_variantes pv
    where pv.producto_id in (select id from base)
    group by pv.producto_id
  ),
  vta as (
    select im.producto_id,
           (-1 * coalesce(sum(im.cantidad) filter (
              where im.tipo in ('venta','devolucion')
                and im.created_at >= now() - make_interval(days => v_periodo)
           ),0))::bigint as unidades_vendidas,
           max(im.fecha) filter (where im.tipo = 'venta') as fecha_ultima_venta,
           min(im.fecha) filter (where im.tipo in ('entrada','saldo_inicial')) as fecha_primera_entrada
    from public.inventario_movimientos im
    where im.producto_id in (select id from base)
    group by im.producto_id
  ),
  metrics as (
    select b.id, b.referencia, b.nombre, b.foto_principal_url,
           b.proveedor_id, b.proveedor_nombre, b.categoria_id, b.categoria_nombre,
           coalesce(s.stock_total,0)::bigint as stock_total,
           coalesce(s.reservado_total,0)::bigint as reservado_total,
           coalesce(b.costo,0)::numeric as costo_unitario,
           (coalesce(s.stock_total,0) * coalesce(b.costo,0))::numeric as valor_inventario,
           coalesce(v.unidades_vendidas,0)::bigint as unidades_vendidas,
           least(v_periodo, greatest(1, (current_date - b.created_at::date)))::int as dias_efectivos,
           v.fecha_ultima_venta,
           coalesce(v.fecha_primera_entrada, b.created_at) as fecha_ingreso
    from base b
    left join stk s on s.producto_id = b.id
    left join vta v on v.producto_id = b.id
  ),
  computed as (
    select m.*,
           case when m.unidades_vendidas = 0 then 0::numeric
                else m.unidades_vendidas::numeric / m.dias_efectivos end as venta_diaria,
           case when m.stock_total = 0 then 0::numeric
                when m.unidades_vendidas = 0 then null::numeric
                else m.stock_total::numeric / (m.unidades_vendidas::numeric / m.dias_efectivos)
           end as dias_inventario,
           (m.unidades_vendidas = 0) as sin_ventas,
           (m.dias_efectivos < 7) as datos_insuficientes
    from metrics m
  ),
  clasif as (
    select c.*,
      case
        when c.stock_total = 0 then 'quiebre'
        when c.unidades_vendidas = 0 then 'sin_ventas'
        when c.dias_efectivos >= 7 and c.dias_inventario < v_ruptura then 'ruptura'
        when c.dias_efectivos >= 7 and c.dias_inventario > v_sobrestock then 'sobrestock'
        else 'normal'
      end as clasificacion
    from computed c
  ),
  filtered as (
    select * from clasif
    where (p_clasificacion is null or clasif.clasificacion = any(p_clasificacion))
  )
  select
    f.id, f.referencia, f.nombre, f.foto_principal_url,
    f.proveedor_id, f.proveedor_nombre, f.categoria_id, f.categoria_nombre,
    f.stock_total, f.reservado_total, (f.stock_total - f.reservado_total)::bigint as stock_disponible,
    f.costo_unitario, f.valor_inventario,
    f.unidades_vendidas, f.dias_efectivos, f.venta_diaria, f.dias_inventario,
    f.sin_ventas, f.datos_insuficientes,
    f.fecha_ultima_venta, f.fecha_ingreso,
    f.clasificacion,
    count(*) over()::bigint as total_count
  from filtered f
  order by
    case when v_orden = 'valor' then f.valor_inventario end desc nulls last,
    case when v_orden = 'unidades' then f.unidades_vendidas end desc nulls last,
    case when v_orden = 'dias_asc' then f.dias_inventario end asc nulls last,
    case when v_orden = 'dias_desc' then f.dias_inventario end desc nulls last,
    case when v_orden = 'referencia' then f.referencia end asc,
    f.referencia asc
  limit p_limit offset coalesce(p_offset, 0);
end;
$function$;

revoke all on function public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int) from public, anon, authenticated;
grant execute on function public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int) to authenticated;

-- ----------------------------------------------------------------------------
-- inventario_kardex
-- ----------------------------------------------------------------------------
create or replace function public.inventario_kardex(
  p_tienda_id uuid,
  p_producto_id uuid default null,
  p_variante_id uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_limit int default 200,
  p_offset int default 0
)
returns table(
  fecha timestamptz, tipo text, cantidad int, entrada int, salida int,
  costo_unitario numeric, costo_saldo numeric, saldo_acumulado bigint,
  color text, talla text, sku text, nota text, pedido_id uuid
)
language plpgsql security definer stable set search_path to 'public'
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
    m.nota, m.pedido_id
  from mov m
  left join public.producto_variantes pv on pv.id = m.variante_id
  where (p_desde is null or m.fecha::date >= p_desde)
    and (p_hasta is null or m.fecha::date <= p_hasta)
  order by m.created_at asc, m.id asc
  limit coalesce(p_limit, 200) offset coalesce(p_offset, 0);
end;
$function$;

revoke all on function public.inventario_kardex(uuid,uuid,uuid,date,date,int,int) from public, anon, authenticated;
grant execute on function public.inventario_kardex(uuid,uuid,uuid,date,date,int,int) to authenticated;
