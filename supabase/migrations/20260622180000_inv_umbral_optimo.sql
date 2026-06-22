-- ============================================================================
-- INVENTARIO — Ajustes: tercer umbral "inventario óptimo" (meta de compra).
-- Agrega tiendas.inv_umbral_optimo_dias (int NOT NULL DEFAULT 30) y extiende el
-- CHECK chk_inv_umbrales a ruptura < óptimo < sobrestock (+ período 1..60).
-- Defaults recomendados (15/30/60) para tiendas NUEVAS; NO pisa valores existentes.
-- ASSERT explícito: aborta si alguna tienda viola el orden ANTES del ADD CONSTRAINT
-- (un ADD CONSTRAINT que aborta a mitad es feo). PASO 0 confirmó que las 3 pasan.
-- ============================================================================

-- 1) columna óptimo (filas existentes -> 30)
alter table public.tiendas add column if not exists inv_umbral_optimo_dias int not null default 30;

-- 2) defaults recomendados para tiendas NUEVAS (no toca filas existentes)
alter table public.tiendas alter column inv_umbral_ruptura_dias set default 15;
alter table public.tiendas alter column inv_umbral_optimo_dias set default 30;
alter table public.tiendas alter column inv_umbral_sobrestock_dias set default 60;

-- 3) ASSERT: ninguna tienda viola ruptura<óptimo<sobrestock antes del constraint
do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.tiendas
   where not (inv_umbral_ruptura_dias >= 1
              and inv_umbral_optimo_dias > inv_umbral_ruptura_dias
              and inv_umbral_sobrestock_dias > inv_umbral_optimo_dias);
  if v_bad > 0 then
    raise exception 'ABORT: % tienda(s) violan ruptura<optimo<sobrestock; no se agrega el CHECK', v_bad;
  end if;
end $$;

-- 4) reemplazar el CHECK
alter table public.tiendas drop constraint if exists chk_inv_umbrales;
alter table public.tiendas add constraint chk_inv_umbrales check (
  inv_umbral_ruptura_dias >= 1
  and inv_umbral_optimo_dias > inv_umbral_ruptura_dias
  and inv_umbral_sobrestock_dias > inv_umbral_optimo_dias
  and inv_periodo_default_dias between 1 and 60
);
