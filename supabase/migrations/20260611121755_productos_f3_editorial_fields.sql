-- F3: campos editoriales por-producto (guia de tallas + ficha editorial).
-- Additive nullable -> productos existentes intactos, sin data-migration.
-- Aplicada via MCP Supabase apply_migration 2026-06-11. Idempotente.
-- guia_tallas_url: URL publica (bucket tienda-productos) de la imagen de guia de tallas.
--   Reusable entre productos via el image-picker del editor (browse <tienda_id>/editor/).
-- ficha_editorial: { material:text, ajuste:text, diseno:text[], beneficios:text[] }.
--   NULL cuando el dueno no carga ficha (garantiza PDP-sin-ficha byte-identico).
--   Texto plano del dueno; se escapa al render (auto-escape Astro), sin sanitize-html ni EF.

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS guia_tallas_url text,
  ADD COLUMN IF NOT EXISTS ficha_editorial jsonb;
