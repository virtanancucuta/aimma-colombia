-- Plan 4 fix: el storefront (anon key) valida un token de preview puntual sin
-- poder listar preview_tokens (RLS cerrada). SECURITY DEFINER. Aplicada via MCP.
CREATE OR REPLACE FUNCTION validate_preview_token(p_token uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tienda_id FROM preview_tokens
  WHERE token = p_token AND expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION validate_preview_token(uuid) TO anon, authenticated;
