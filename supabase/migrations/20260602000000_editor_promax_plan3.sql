-- supabase/migrations/20260602000000_editor_promax_plan3.sql
-- AIMMA Tienda IA · Editor PRO-MAX Plan 3
-- Agrega: form_submissions + notifs queue + rate limit RPC + flags first-use + notif_email

-- =========================================================
-- 1) Flags first-use editor en tiendas
-- =========================================================
ALTER TABLE tiendas
  ADD COLUMN IF NOT EXISTS editor_first_choice_at timestamptz,
  ADD COLUMN IF NOT EXISTS editor_tour_visto_at   timestamptz,
  ADD COLUMN IF NOT EXISTS notif_email            text;

COMMENT ON COLUMN tiendas.editor_first_choice_at IS
  'Plan 3: timestamp en que el dueno respondio el modal Starter/Desde Cero';
COMMENT ON COLUMN tiendas.editor_tour_visto_at IS
  'Plan 3: timestamp en que el dueno cerro el tour overlay';
COMMENT ON COLUMN tiendas.notif_email IS
  'Plan 3: email opcional para notificaciones de form submissions';

-- =========================================================
-- 2) form_submissions
-- =========================================================
CREATE TABLE form_submissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id   uuid NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  section_id  text NOT NULL,
  fields      jsonb NOT NULL,
  ip          text,
  user_agent  text,
  leido_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_submissions_tienda_created
  ON form_submissions(tienda_id, created_at DESC);

CREATE INDEX idx_form_submissions_unread
  ON form_submissions(tienda_id)
  WHERE leido_at IS NULL;

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_submissions"
  ON form_submissions FOR SELECT
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));

CREATE POLICY "owner_update_submissions"
  ON form_submissions FOR UPDATE
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));

-- INSERT solo via service_role (sin policy = denied a anon/authenticated)

-- =========================================================
-- 3) Cola notificaciones email (stub Plan 3, envio real Plan 5)
-- =========================================================
CREATE TABLE form_submission_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id     uuid NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES form_submissions(id) ON DELETE CASCADE,
  destino       text NOT NULL,
  asunto        text NOT NULL,
  cuerpo        text NOT NULL,
  estado        text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','enviado','fallido')),
  intentos      int NOT NULL DEFAULT 0,
  error_msg     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  enviado_at    timestamptz
);

CREATE INDEX idx_notif_pendientes
  ON form_submission_notifications(created_at)
  WHERE estado = 'pendiente';

ALTER TABLE form_submission_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_read_notifs"
  ON form_submission_notifications FOR SELECT
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));

-- =========================================================
-- 4) Rate limit sliding window
-- =========================================================
CREATE TABLE form_submit_rate_limit (
  rate_key      text PRIMARY KEY,
  count         int NOT NULL,
  window_start  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_submit_rate_window
  ON form_submit_rate_limit(window_start);

CREATE OR REPLACE FUNCTION check_rate_limit_form_submit(
  p_key text,
  p_max int,
  p_window_minutes int
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_window_start timestamptz;
BEGIN
  SELECT count, window_start
    INTO v_count, v_window_start
    FROM form_submit_rate_limit
    WHERE rate_key = p_key
    FOR UPDATE;

  IF NOT FOUND OR v_window_start < now() - (p_window_minutes || ' minutes')::interval THEN
    INSERT INTO form_submit_rate_limit (rate_key, count, window_start)
    VALUES (p_key, 1, now())
    ON CONFLICT (rate_key) DO UPDATE
      SET count = 1, window_start = now();
    RETURN 1;
  END IF;

  UPDATE form_submit_rate_limit
    SET count = count + 1
    WHERE rate_key = p_key;
  RETURN v_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION check_rate_limit_form_submit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit_form_submit TO service_role;

CREATE OR REPLACE FUNCTION cleanup_form_submit_rate_limit() RETURNS int
LANGUAGE sql
SET search_path = public
AS $$
  WITH d AS (
    DELETE FROM form_submit_rate_limit
      WHERE window_start < now() - interval '24 hours'
      RETURNING 1
  )
  SELECT count(*)::int FROM d;
$$;

REVOKE ALL ON FUNCTION cleanup_form_submit_rate_limit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_form_submit_rate_limit TO service_role;
