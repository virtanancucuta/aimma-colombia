-- Email transaccional: log/idempotencia de notificaciones + config de webhook.
create table if not exists public.pedido_notificaciones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  tipo text not null check (tipo in ('confirmacion','rastreo')),
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','fallido')),
  proveedor_id text,
  error text,
  enviado_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists pedido_notif_uniq on public.pedido_notificaciones(pedido_id, tipo);
create index if not exists pedido_notif_tienda_idx on public.pedido_notificaciones(tienda_id);
alter table public.pedido_notificaciones enable row level security;
drop policy if exists owner_read_pedido_notif on public.pedido_notificaciones;
create policy owner_read_pedido_notif on public.pedido_notificaciones
  for select using (tienda_ia_es_dueno(tienda_id));

-- Secret del webhook (generado por Postgres; solo service_role lo lee).
create table if not exists public.notif_webhook_config (
  id int primary key default 1 check (id = 1),
  secret text not null
);
insert into public.notif_webhook_config (id, secret)
  values (1, replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''))
  on conflict (id) do nothing;
alter table public.notif_webhook_config enable row level security;
