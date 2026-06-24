-- ============================================================================
-- INVENTARIO — inventario_resumen += tuvo_abastecimiento / tuvo_venta (aditivo).
--  Para el filtro reconcebido del Kardex (panel + lista Nivel 1): "Entradas y ajustes"
--  (= abastecimiento) / "Ventas" / "Todos".
--  tuvo_abastecimiento = entrada/ajuste/devolucion/salida (NO saldo_inicial — lo tienen casi
--                        todos; NO venta) -> refs con ACTIVIDAD de abastecimiento real.
--  tuvo_venta          = solo 'venta'.
--  Se MANTIENEN tuvo_entrada/tuvo_salida (FIX4) para no romper el front v=25 vivo durante la
--  ventana de deploy; quedan sin uso tras el deploy del front nuevo (cleanup futuro).
--  CERO cambio en la lógica de cobertura/clasificación. Cambio de return type -> DROP+CREATE.
-- ============================================================================
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
  sin_ventas boolean, datos_insuficientes boolean, tuvo_entrada boolean, tuvo_salida boolean,
  tuvo_abastecimiento boolean, tuvo_venta boolean,
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
      max(im.fecha) filter (where im.tipo in ('entrada','saldo_inicial') or (im.tipo = 'ajuste' and im.cantidad > 0)) as fecha_ultimo_ingreso,
      bool_or(im.tipo = 'entrada' or (im.tipo = 'ajuste' and im.cantidad > 0)) as tuvo_entrada,
      bool_or(im.tipo = 'venta' or (im.tipo = 'ajuste' and im.cantidad < 0)) as tuvo_salida,
      bool_or(im.tipo in ('entrada','ajuste','devolucion','salida')) as tuvo_abastecimiento,
      bool_or(im.tipo = 'venta') as tuvo_venta
    from public.inventario_movimientos im where im.producto_id in (select id from base) group by im.producto_id
  ),
  metrics as (
    select b.id, b.referencia, b.nombre, b.foto_principal_url, b.proveedor_id, b.proveedor_nombre, b.categoria_id, b.categoria_nombre,
      coalesce(s.stock_total,0)::bigint as stock_total, coalesce(s.reservado_total,0)::bigint as reservado_total,
      coalesce(b.costo,0)::numeric as costo_unitario, (coalesce(s.stock_total,0)*coalesce(b.costo,0))::numeric as valor_inventario,
      coalesce(v.unidades_vendidas,0)::bigint as unidades_vendidas,
      least(v_periodo, greatest(1, (current_date - b.created_at::date)))::int as dias_efectivos,
      v.fecha_ultima_venta, coalesce(v.fecha_primera_entrada, b.created_at) as fecha_ingreso, v.fecha_ultimo_ingreso,
      coalesce(v.tuvo_entrada, false) as tuvo_entrada, coalesce(v.tuvo_salida, false) as tuvo_salida,
      coalesce(v.tuvo_abastecimiento, false) as tuvo_abastecimiento, coalesce(v.tuvo_venta, false) as tuvo_venta
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
    f.unidades_vendidas, f.dias_efectivos, f.venta_diaria, f.dias_inventario, f.sin_ventas, f.datos_insuficientes, f.tuvo_entrada, f.tuvo_salida,
    f.tuvo_abastecimiento, f.tuvo_venta,
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
