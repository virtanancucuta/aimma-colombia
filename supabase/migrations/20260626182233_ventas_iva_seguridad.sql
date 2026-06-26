-- AIMMA · Modulo Ventas · Fase 1 · Cimiento de datos de IVA + cierre de seguridad.
-- 100% ADITIVA, IDEMPOTENTE, APPEND-ONLY. Cero drops, cero perdida de datos. Datos TEST.
-- Modelo A: precio_venta / precio_unitario son IVA-incluido. El IVA por producto se CONGELA en la
-- venta (pedido_items.tasa_iva) al hacer checkout (server-side, Task 2). La tasa "19" NO se
-- hardcodea en ningun lado: vive en tiendas.tasa_iva_default (multi-pais).
-- Patron: ADD COLUMN IF NOT EXISTS / DO-block guard por columna nueva (backfill 1 sola vez) /
--         CREATE INDEX IF NOT EXISTS / CREATE OR REPLACE FUNCTION / ENABLE RLS (no-op si ya esta).

-- ============================================================
-- 1) tiendas: flag de facturacion + tasa por defecto (multi-pais)
--    NOT NULL DEFAULT -> las tiendas existentes quedan pobladas al instante (sin backfill).
-- ============================================================
alter table public.tiendas
  add column if not exists factura_con_iva boolean not null default true;
comment on column public.tiendas.factura_con_iva is
  'Si la empresa factura con IVA. Solo decide el DEFAULT de precarga al crear productos; NO entra en ningun calculo.';

alter table public.tiendas
  add column if not exists tasa_iva_default numeric not null default 19
    check (tasa_iva_default >= 0 and tasa_iva_default <= 100);
comment on column public.tiendas.tasa_iva_default is
  '% IVA por defecto al crear productos (editable por producto). Multi-pais: la tasa vive aca, no hardcodeada.';

-- ============================================================
-- 2) productos.tasa_iva (+ backfill UNA sola vez, al crear la columna)
--    Orden: requiere tiendas.factura_con_iva / tasa_iva_default ya creadas (paso 1).
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'productos' and column_name = 'tasa_iva'
  ) then
    alter table public.productos
      add column tasa_iva numeric not null default 0
        check (tasa_iva >= 0 and tasa_iva <= 100);
    -- Backfill: cada producto hereda la tasa de SU tienda (0 si la tienda no factura con IVA).
    update public.productos p
      set tasa_iva = case when t.factura_con_iva then t.tasa_iva_default else 0 end
      from public.tiendas t
      where t.id = p.tienda_id;
  end if;
end $$;
comment on column public.productos.tasa_iva is
  '% IVA del producto (Modelo A: precio_venta IVA-incluido). Editable por producto. Se congela en la venta.';

-- ============================================================
-- 3) pedido_items.tasa_iva (+ backfill UNA sola vez). Hecho historico inmutable:
--    se congela aqui; en checkout (Task 2) se copia del producto al momento de la venta.
--    Orden: requiere productos.tasa_iva ya creada (paso 2).
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pedido_items' and column_name = 'tasa_iva'
  ) then
    alter table public.pedido_items
      add column tasa_iva numeric not null default 0
        check (tasa_iva >= 0 and tasa_iva <= 100);
    -- Backfill historico: COALESCE(producto.tasa_iva, 0). Items con producto_id NULL quedan en 0
    -- (el UPDATE..FROM no matchea -> conservan el default 0).
    update public.pedido_items pi
      set tasa_iva = coalesce(pr.tasa_iva, 0)
      from public.productos pr
      where pr.id = pi.producto_id;
  end if;
end $$;
comment on column public.pedido_items.tasa_iva is
  '% IVA congelado al momento de la venta (copiado del producto en checkout). Hecho historico inmutable.';

-- ============================================================
-- 4) Indices para que "ventas del periodo" escale por tienda (hoy no existen)
-- ============================================================
create index if not exists idx_pedidos_tienda_cerrado
  on public.pedidos (tienda_id, cerrado_at desc);
create index if not exists idx_pedidos_tienda_devuelto
  on public.pedidos (tienda_id, devuelto_at) where devuelto_at is not null;

-- ============================================================
-- 5) Helper de seguridad: membresia de tienda.
--    Hoy membresia = propiedad; disenado para evolucionar a staff con roles SIN tocar las RPCs
--    de Ventas (Fase 2) que lo usaran.
-- ============================================================
create or replace function public.es_miembro_tienda(p_tienda_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tiendas
    where id = p_tienda_id and user_id = auth.uid()
  ) or public.is_admin_or_cofounder();
$$;
revoke execute on function public.es_miembro_tienda(uuid) from public, anon;
grant  execute on function public.es_miembro_tienda(uuid) to authenticated;

-- ============================================================
-- 6) Cierre de seguridad: RLS ON en 3 tablas que estaban abiertas.
--    Ningun path con anon key las lee (confirmado Fase 0); service_role salta RLS.
--    Sin policies = deny-all para anon/authenticated.
-- ============================================================
alter table public.editor_v2_backup        enable row level security;
alter table public.rate_buckets             enable row level security;
alter table public.form_submit_rate_limit   enable row level security;
