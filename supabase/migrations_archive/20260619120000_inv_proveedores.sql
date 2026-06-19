-- 20260619120000_inv_proveedores — proveedores por tienda + FK opcional en productos.
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  nombre text not null,
  telefono text,
  created_at timestamptz not null default now()
);
create index if not exists idx_proveedores_tienda on public.proveedores(tienda_id);

alter table public.productos
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;
create index if not exists idx_productos_proveedor on public.productos(proveedor_id);

alter table public.proveedores enable row level security;

create policy proveedores_select_dueno on public.proveedores
  for select to authenticated
  using (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder());

create policy proveedores_write_dueno on public.proveedores
  for all to authenticated
  using (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder())
  with check (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder());
