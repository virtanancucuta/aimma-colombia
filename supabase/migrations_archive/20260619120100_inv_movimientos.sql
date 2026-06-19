-- 20260619120100_inv_movimientos — kardex: libro de movimientos de inventario.
create table if not exists public.inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  variante_id uuid not null references public.producto_variantes(id) on delete cascade,
  tipo text not null check (tipo in ('saldo_inicial','entrada','salida','ajuste','venta','devolucion')),
  cantidad integer not null check (cantidad <> 0),
  costo_unitario numeric,
  costo_saldo numeric,
  fecha timestamptz not null default now(),
  pedido_id uuid references public.pedidos(id) on delete set null,
  nota text,
  creado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_invmov_variante_fecha on public.inventario_movimientos(variante_id, fecha);
create index if not exists idx_invmov_producto on public.inventario_movimientos(producto_id);
create index if not exists idx_invmov_tienda on public.inventario_movimientos(tienda_id);
create index if not exists idx_invmov_pedido on public.inventario_movimientos(pedido_id);

alter table public.inventario_movimientos enable row level security;

create policy invmov_select_dueno on public.inventario_movimientos
  for select to authenticated
  using (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder());

create policy invmov_write_dueno on public.inventario_movimientos
  for all to authenticated
  using (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder())
  with check (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder());
