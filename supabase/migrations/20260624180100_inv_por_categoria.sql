-- ============================================================================
-- INVENTARIO — vista agregada "Por categoría" (lectura) con ROLLUP padre-incluye-hijas.
--  MAIN (p_parent_id null): agrupa por ancestro top-level (coalesce(parent_id, id)) -> cada
--    producto cuenta UNA vez (subcategoría suma al padre, sin doble conteo) + "Sin categoría".
--  DRILL (p_parent_id=X): hijas directas de X + fila "(Directo en categoría)" para productos
--    cuya categoría = X. Σ filas DRILL == costo_total del padre en MAIN.
--  Profundidad 2 confirmada (padre->hija, sin nietos) -> coalesce simple alcanza.
--  pct sobre el costo total de la tienda (así las hijas suman el % del padre).
-- Candado completo + #variable_conflict use_column.
-- ============================================================================
create or replace function public.inventario_por_categoria(p_tienda_id uuid, p_parent_id uuid default null)
returns table(grupo_id uuid, grupo_nombre text, es_sin_grupo boolean, num_referencias bigint, cantidad bigint, costo_total numeric, pct numeric)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_total numeric;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select coalesce(sum(pv.stock * p.costo),0) into v_total
    from public.producto_variantes pv join public.productos p on p.id=pv.producto_id where p.tienda_id=p_tienda_id;
  return query
  with prod as (
    select p.id, coalesce(p.costo,0) as costo,
           coalesce((select sum(pv.stock) from public.producto_variantes pv where pv.producto_id=p.id),0) as stock_total,
           cat.id as cat_id, cat.parent_id as cat_parent,
           coalesce(cat.parent_id, cat.id) as top_id
    from public.productos p left join public.categorias cat on cat.id = p.categoria_id
    where p.tienda_id=p_tienda_id
  ),
  agrupado as (
    -- MAIN: por ancestro top-level (rollup padre-incluye-hijas)
    select prod.top_id as gid, null::text as gname_drill,
           count(*)::bigint nref, sum(prod.stock_total)::bigint cant, sum(prod.stock_total*prod.costo)::numeric costo
    from prod where p_parent_id is null group by prod.top_id
    union all
    -- DRILL: hijas directas de X + "(Directo en categoría)" para productos cuya cat = X
    select prod.cat_id as gid,
           (case when prod.cat_id = p_parent_id then '(Directo en categoría)' else null end) as gname_drill,
           count(*)::bigint, sum(prod.stock_total)::bigint, sum(prod.stock_total*prod.costo)::numeric
    from prod where p_parent_id is not null and (prod.cat_id = p_parent_id or prod.cat_parent = p_parent_id)
    group by prod.cat_id
  )
  select a.gid,
    coalesce(a.gname_drill, c.nombre, 'Sin categoría'),
    (a.gid is null),
    a.nref, a.cant, a.costo,
    case when v_total>0 then round((a.costo/v_total*100)::numeric,1) else 0 end
  from agrupado a left join public.categorias c on c.id = a.gid
  order by a.costo desc, (a.gid is null);
end;
$function$;
revoke all on function public.inventario_por_categoria(uuid, uuid) from public, anon, authenticated;
grant execute on function public.inventario_por_categoria(uuid, uuid) to authenticated;
