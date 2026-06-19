-- categoria_descendientes: ids de UNA categoria + TODAS sus descendientes (recursivo).
-- Fix B (rollup): /c/[slug] debe mostrar productos de la categoria + sus subcategorias
-- (productos.categoria_id es FK simple -> sin esto, /c/ropa-dama omite los productos de
-- BLUSA DAMA que cuelgan de ropa-dama). Reusable por el Administrador de Paginas (auto-nest).
-- SECURITY INVOKER -> la RLS de categorias aplica (anon lee categorias de tiendas publicadas);
-- el tenant-scoping final lo da el consumidor (.eq('tienda_id') en la query de productos).
-- Depth-guard (< 10) contra ciclos en parent_id (el modelo enforce 2 niveles, esto es defensa).
create or replace function public.categoria_descendientes(p_categoria_id uuid)
returns table(id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive sub as (
    select c.id, c.parent_id, 1 as depth
    from categorias c
    where c.id = p_categoria_id
    union all
    select c.id, c.parent_id, sub.depth + 1
    from categorias c
    join sub on c.parent_id = sub.id
    where sub.depth < 10
  )
  select sub.id from sub;
$$;

grant execute on function public.categoria_descendientes(uuid) to anon, authenticated;
