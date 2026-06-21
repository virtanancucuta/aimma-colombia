-- ============================================================================
-- INVENTARIO Fase 1b — CHECK del invariante de umbrales por tienda.
-- Defensa a nivel BD (display-only, no es seguridad): ningun valor invalido
-- entra por ninguna via (ni si la validacion de cliente se saltara). El front
-- valida ademas con mensajes amables; el CHECK es el piso duro.
-- Invariante clave: sobrestock_dias > ruptura_dias (si se cruzan, las bandas del
-- semaforo se invierten). Pre-verificado: las tiendas existentes (15/90/30) lo
-- cumplen -> el ADD CONSTRAINT no aborta.
-- ============================================================================
alter table public.tiendas add constraint chk_inv_umbrales
  check (inv_umbral_ruptura_dias >= 1
         and inv_umbral_sobrestock_dias > inv_umbral_ruptura_dias
         and inv_periodo_default_dias between 1 and 60);
