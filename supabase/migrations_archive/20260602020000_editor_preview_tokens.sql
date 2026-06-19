-- Plan 4: tokens efimeros para preview WYSIWYG del editor (sin secretos HMAC).
-- Aplicada via MCP Supabase 2026-06-02.
-- El admin pide un token (EF tienda-preview-token, JWT+ownership), el Worker del
-- storefront lo valida contra esta tabla para servir pages.home_draft.

CREATE TABLE IF NOT EXISTS preview_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id uuid NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_preview_tokens_tienda ON preview_tokens(tienda_id);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_expires ON preview_tokens(expires_at);

ALTER TABLE preview_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION cleanup_preview_tokens()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM preview_tokens WHERE expires_at < now() - interval '1 hour';
$$;
