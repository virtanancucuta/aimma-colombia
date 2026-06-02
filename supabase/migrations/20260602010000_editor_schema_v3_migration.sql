-- Plan 4: migracion personalizaciones v2 -> v3 (secciones apiladas, sin grid 2D).
-- Aplicada via MCP Supabase 2026-06-02. Idempotente. Backup previo.
-- Solo aimma-test tenia home v2 (dimac/maraldo sin personalizaciones). Verificado.

CREATE TABLE IF NOT EXISTS editor_v2_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id uuid NOT NULL,
  slug text,
  personalizaciones_old jsonb NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO editor_v2_backup (tienda_id, slug, personalizaciones_old)
SELECT t.id, t.slug, t.personalizaciones
FROM tiendas t
WHERE (t.personalizaciones->>'schema_version') = '2'
  AND NOT EXISTS (SELECT 1 FROM editor_v2_backup b WHERE b.tienda_id = t.id);

UPDATE tiendas
SET personalizaciones = '{
  "schema_version": 3,
  "pages": {
    "home": {
      "version": 2,
      "updated_at": "2026-06-02T00:00:00Z",
      "sections": [
        {
          "id": "sec_hero01",
          "tipo": "banner",
          "ancho": "completo",
          "fondo": { "tipo": "transparente", "valor": "" },
          "padding": "lg",
          "props": {
            "titulo": "Tienda construida con el Editor PRO-MAX",
            "subtitulo": "Probamos el render del nuevo dispatcher.",
            "boton": { "texto": "Ver productos", "url": "#productos", "estilo_visual": "primary", "target": "_self" },
            "alineacion": "left"
          }
        },
        {
          "id": "sec_prods01",
          "tipo": "productos",
          "ancho": "completo",
          "fondo": { "tipo": "transparente", "valor": "" },
          "padding": "lg",
          "props": {
            "categoria_id": null,
            "limite": 4,
            "orden": "recientes",
            "columnas": "auto",
            "mostrar_precio": true
          }
        }
      ]
    }
  }
}'::jsonb
WHERE slug = 'aimma-test'
  AND (personalizaciones->>'schema_version') = '2';
