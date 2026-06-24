-- AIMMA · Fase A · Toggle por tienda: segunda foto al pasar el mouse en la card de producto.
-- Aditiva, default ON (espeja el patron de mostrar_buscador_header). Sin datos a migrar.
-- El storefront la recibe via select('*') en tenant.ts; el editor la lee/escribe en Configuracion.

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS hover_segunda_foto boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN public.tiendas.hover_segunda_foto IS
  'Fase A: si true (default), el catalogo hace fade a la 2a foto del producto al hover. Toggle en Configuracion.';
