-- F4: reseñas de clientes por-producto, con moderacion del dueño.
-- Modelo de seguridad (mirror de pedidos + productos_select_publico):
--   * NINGUNA policy anon de escritura -> anon NO inserta/actualiza/borra directo.
--     TODA reseña entra solo por la EF tienda-crear-resena (service-role, fuerza pendiente
--     + honeypot + rate-limit). Asi el anti-spam no se puede esquivar.
--   * anon SOLO lee 'aprobada' de tiendas publicadas (mirror productos_select_publico).
--   * dueño (auth, su tienda) ve TODO + UPDATE estado + DELETE (mirror productos_write_dueno).
-- Aplicada via MCP apply_migration 2026-06-11.

CREATE TABLE IF NOT EXISTS resenas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id     uuid NOT NULL REFERENCES tiendas(id)   ON DELETE CASCADE,
  producto_id   uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  calificacion  smallint NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  nombre_cliente text NOT NULL,
  comentario    text,                          -- opcional (calificacion + nombre son el minimo)
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Lectura publica del PDP: aprobadas de un producto (index parcial).
CREATE INDEX IF NOT EXISTS resenas_publico_idx ON resenas (producto_id) WHERE estado = 'aprobada';
-- Moderacion del dueño: por tienda + estado, recientes primero.
CREATE INDEX IF NOT EXISTS resenas_moderacion_idx ON resenas (tienda_id, estado, created_at DESC);

ALTER TABLE resenas ENABLE ROW LEVEL SECURITY;

-- anon/publico: SOLO aprobadas de tiendas publicadas (mirror exacto de productos_select_publico).
CREATE POLICY resenas_select_publico ON resenas
  FOR SELECT TO anon, authenticated
  USING (
    estado = 'aprobada'
    AND EXISTS (SELECT 1 FROM tiendas t WHERE t.id = resenas.tienda_id AND t.estado = 'publicada')
  );

-- dueño: ve TODAS las de su tienda (incl. pendientes/rechazadas).
CREATE POLICY resenas_select_dueno ON resenas
  FOR SELECT TO authenticated
  USING (tienda_ia_es_dueno(tienda_id) OR is_admin_or_cofounder());

-- dueño: modera estado (aprobar/rechazar) de su tienda.
CREATE POLICY resenas_update_dueno ON resenas
  FOR UPDATE TO authenticated
  USING (tienda_ia_es_dueno(tienda_id) OR is_admin_or_cofounder())
  WITH CHECK (tienda_ia_es_dueno(tienda_id) OR is_admin_or_cofounder());

-- dueño: borra reseñas de su tienda.
CREATE POLICY resenas_delete_dueno ON resenas
  FOR DELETE TO authenticated
  USING (tienda_ia_es_dueno(tienda_id) OR is_admin_or_cofounder());

-- NOTA: NO hay policy INSERT -> bajo RLS nadie inserta directo; solo service-role (EF) escribe.

-- Toggle de la seccion reseñas en el PDP (default ON -> con OFF el PDP queda byte-identico).
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS mostrar_resenas_productos boolean NOT NULL DEFAULT true;
