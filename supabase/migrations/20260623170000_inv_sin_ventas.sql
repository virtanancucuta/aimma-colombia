-- ============================================================================
-- INVENTARIO — Sin Ventas: ventana de venta más amplia + última fecha de ingreso.
--  (1) Sube el cap de período 60 -> 120 en inventario_variantes (CREATE OR REPLACE)
--      e inventario_resumen, para habilitar la ventana de 90 días del tab Sin Ventas.
--      GENERAL/S&R pasan <=60 (toggle); el default de tienda sigue 1-60 (CHECK intacto).
--  (2) inventario_resumen gana la columna fecha_ultimo_ingreso = ÚLTIMO movimiento que
--      SUMA stock: entrada + saldo_inicial + ajuste CON cantidad > 0. (El kardex guarda
--      cantidad con signo; existe ajuste=-4 -> un ajuste a la baja NO es ingreso.)
--      Agregar columna cambia el RETURNS TABLE -> DROP + CREATE.
-- Mismo candado en ambas: SECURITY DEFINER STABLE, dueño 1a línea, REVOKE/GRANT,
-- #variable_conflict use_column.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- inventario_variantes: solo cap 60 -> 120 (return type sin cambios)
-- ---------------------------------------------------------------------------
create or replace function public.inventario_variantes(p_tienda_id uuid, p_producto_ids uuid[], p_periodo int default null)
returns table(
  producto_id uuid, variante_id uuid, color text, talla text, sku text,
  stock int, reservado int, disponible int, foto_color_url text,
  unidades_vendidas bigint, venta_diaria numeric, dias_inventario numeric,
  clasificacion text, datos_insuficientes boolean
)
language plpgsql security definer stable set search_path to 'public'
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
           least(v_periodo, greatest(1, (current_date - p.created_at::date)))::int as dias_efectivos
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
    c.datos_insuficientes
  from calc c
  order by c.producto_id, c.color nulls first, c.talla nulls first, c.sku;
end;
$function$;
revoke all on function public.inventario_variantes(uuid, uuid[], int) from public, anon, authenticated;
grant execute on function public.inventario_variantes(uuid, uuid[], int) to authenticated;

-- ---------------------------------------------------------------------------
-- inventario_resumen: cap 120 + columna fecha_ultimo_ingreso (DROP + CREATE)
-- ---------------------------------------------------------------------------
drop function if exists public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int);
create or replace function public.inventario_resumen(
  p_tienda_id uuid, p_periodo int default null, p_orden text default null,
  p_clasificacion text[] default null, p_proveedor_id uuid default null,
  p_categoria_id uuid default null, p_buscar text default null,
  p_limit int default null, p_offset int default 0
)
returns table(
  producto_id uuid, referencia text, nombre text, foto_principal_url text,
  proveedor_id uuid, proveedor_nombre text, categoria_id uuid, categoria_nombre text,
  stock_total bigint, reservado_total bigint, stock_disponible bigint,
  costo_unitario numeric, valor_inventario numeric,
  unidades_vendidas bigint, dias_efectivos int, venta_diaria numeric, dias_inventario numeric,
  sin_ventas boolean, datos_insuficientes boolean,
  fecha_ultima_venta timestamptz, fecha_ingreso timestamptz, fecha_ultimo_ingreso timestamptz,
  clasificacion text, total_count bigint
)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_periodo int; v_ruptura int; v_sobrestock int; v_orden text := coalesce(p_orden,'valor'); v_buscar text;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select least(coalesce(p_periodo, t.inv_periodo_default_dias), 120),
         t.inv_umbral_ruptura_dias, t.inv_umbral_sobrestock_dias
    into v_periodo, v_ruptura, v_sobrestock from public.tiendas t where t.id = p_tienda_id;
  if v_periodo is null then raise exception 'tienda inexistente'; end if;
  if p_buscar is not null and length(trim(p_buscar)) > 0 then
    v_buscar := '%' || replace(replace(replace(p_buscar,'\','\\'),'%','\%'),'_','\_') || '%';
  end if;
  return query
  with base as (
    select p.id, p.referencia, p.nombre, p.foto_principal_url, p.costo, p.created_at,
           p.proveedor_id, prov.nombre as proveedor_nombre, p.categoria_id, cat.nombre as categoria_nombre
    from public.productos p
    left join public.proveedores prov on prov.id = p.proveedor_id
    left join public.categorias cat on cat.id = p.categoria_id
    where p.tienda_id = p_tienda_id
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
      and (p_categoria_id is null or p.categoria_id = p_categoria_id
           or p.categoria_id in (select c.id from public.categorias c where c.parent_id = p_categoria_id))
      and (v_buscar is null or p.referencia ilike v_buscar or p.nombre ilike v_buscar)
  ),
  stk as (
    select pv.producto_id, coalesce(sum(pv.stock),0)::bigint as stock_total, coalesce(sum(pv.reservado),0)::bigint as reservado_total
    from public.producto_variantes pv where pv.producto_id in (select id from base) group by pv.producto_id
  ),
  vta as (
    select im.producto_id,
      (-1 * coalesce(sum(im.cantidad) filter (where im.tipo in ('venta','devolucion') and im.created_at >= now() - make_interval(days => v_periodo)),0))::bigint as unidades_vendidas,
      max(im.fecha) filter (where im.tipo = 'venta') as fecha_ultima_venta,
      min(im.fecha) filter (where im.tipo in ('entrada','saldo_inicial')) as fecha_primera_entrada,
      max(im.fecha) filter (where im.tipo in ('entrada','saldo_inicial') or (im.tipo = 'ajuste' and im.cantidad > 0)) as fecha_ultimo_ingreso
    from public.inventario_movimientos im where im.producto_id in (select id from base) group by im.producto_id
  ),
  metrics as (
    select b.id, b.referencia, b.nombre, b.foto_principal_url, b.proveedor_id, b.proveedor_nombre, b.categoria_id, b.categoria_nombre,
      coalesce(s.stock_total,0)::bigint as stock_total, coalesce(s.reservado_total,0)::bigint as reservado_total,
      coalesce(b.costo,0)::numeric as costo_unitario, (coalesce(s.stock_total,0)*coalesce(b.costo,0))::numeric as valor_inventario,
      coalesce(v.unidades_vendidas,0)::bigint as unidades_vendidas,
      least(v_periodo, greatest(1, (current_date - b.created_at::date)))::int as dias_efectivos,
      v.fecha_ultima_venta, coalesce(v.fecha_primera_entrada, b.created_at) as fecha_ingreso, v.fecha_ultimo_ingreso
    from base b left join stk s on s.producto_id=b.id left join vta v on v.producto_id=b.id
  ),
  computed as (
    select m.*,
      case when m.unidades_vendidas=0 then 0::numeric else m.unidades_vendidas::numeric/m.dias_efectivos end as venta_diaria,
      case when m.stock_total=0 then 0::numeric when m.unidades_vendidas=0 then null::numeric else m.stock_total::numeric/(m.unidades_vendidas::numeric/m.dias_efectivos) end as dias_inventario,
      (m.unidades_vendidas=0) as sin_ventas, (m.dias_efectivos<7) as datos_insuficientes
    from metrics m
  ),
  clasif as (
    select c.*, case when c.stock_total=0 then 'quiebre' when c.unidades_vendidas=0 then 'sin_ventas'
      when c.dias_efectivos>=7 and c.dias_inventario<v_ruptura then 'ruptura'
      when c.dias_efectivos>=7 and c.dias_inventario>v_sobrestock then 'sobrestock' else 'normal' end as clasificacion
    from computed c
  ),
  filtered as (select * from clasif where (p_clasificacion is null or clasif.clasificacion = any(p_clasificacion)))
  select f.id, f.referencia, f.nombre, f.foto_principal_url, f.proveedor_id, f.proveedor_nombre, f.categoria_id, f.categoria_nombre,
    f.stock_total, f.reservado_total, (f.stock_total-f.reservado_total)::bigint, f.costo_unitario, f.valor_inventario,
    f.unidades_vendidas, f.dias_efectivos, f.venta_diaria, f.dias_inventario, f.sin_ventas, f.datos_insuficientes,
    f.fecha_ultima_venta, f.fecha_ingreso, f.fecha_ultimo_ingreso, f.clasificacion, count(*) over()::bigint
  from filtered f
  order by
    case when v_orden='valor' then f.valor_inventario end desc nulls last,
    case when v_orden='valor_asc' then f.valor_inventario end asc nulls last,
    case when v_orden='cantidad_desc' then f.stock_total end desc nulls last,
    case when v_orden='cantidad_asc' then f.stock_total end asc nulls last,
    case when v_orden='unidades' then f.unidades_vendidas end desc nulls last,
    case when v_orden='dias_asc' then f.dias_inventario end asc nulls last,
    case when v_orden='dias_desc' then f.dias_inventario end desc nulls last,
    case when v_orden='referencia' then f.referencia end asc, f.referencia asc
  limit p_limit offset coalesce(p_offset,0);
end;
$function$;
revoke all on function public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int) from public, anon, authenticated;
grant execute on function public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int) to authenticated;
