-- ============================================================================
-- INVENTARIO Fase 1a — umbrales de inventario POR TIENDA.
-- Mismo patron que mostrar_resenas_productos (config en la fila de la tienda).
-- NOT NULL DEFAULT rellena las tiendas existentes automaticamente (backfill
-- nativo de Postgres; default constante => rapido). Las RPCs de lectura leen
-- estos valores; nada se hardcodea. La UI para editarlos es Fase 1b.
-- ============================================================================
alter table public.tiendas
  add column if not exists inv_umbral_ruptura_dias int not null default 15,
  add column if not exists inv_umbral_sobrestock_dias int not null default 90,
  add column if not exists inv_periodo_default_dias int not null default 30;
