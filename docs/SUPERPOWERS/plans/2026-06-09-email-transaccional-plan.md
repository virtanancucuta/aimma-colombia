# Email transaccional — PLAN DE IMPLEMENTACIÓN

> Ejecuta el diseño `2026-06-09-email-transaccional-design.md` (5 decisiones aprobadas + refinamiento B).
> Prerequisitos LISTOS: dominio `send.aimma.com.co` Verified en Resend, `RESEND_API_KEY` guardada como secret (verificada, 36 chars).

**Goal:** enviar 2 emails transaccionales (confirmación al crear pedido / rastreo al cerrar con guía), branded por tienda, desde `@send.aimma.com.co` vía Resend, **sin tocar el flujo de pedido/reserva** (observa la tabla con DB Webhooks).

**Arquitectura:** `pedidos` INSERT/UPDATE → trigger pg_net (`net.http_post`) → EF `tienda-notif-pedido` (valida secret, ramifica A/B, carga tienda+items tenant-scoped, renderiza, llama Resend, registra en `pedido_notificaciones` idempotente).

**Tech:** Supabase EF (Deno) + pg_net + Resend HTTP API. Storefront Astro para el checkout requerido.

---

## Datos verificados (fuente: BD viva)
- `pedidos`: id, tienda_id, codigo_publico, comprador_nombre/email/telefono/direccion/ciudad/observ, subtotal_productos, costo_envio, total, metodo_envio, estado, pendiente_at/confirmado_at/cerrado_at/devuelto_at, numero_guia, transportadora, notif_email_enviado_at.
- `pedido_items`: nombre, referencia, color, talla, cantidad, precio_unitario, subtotal.
- `tiendas`: nombre_negocio, logo_url, email_contacto, whatsapp_dueno, paleta_id, slug.
- `pg_net` instalado. `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` ya inyectados en EFs.

## Auth del webhook (sin secret nuevo de Jorge)
- Genero un token aleatorio T. Tabla `notif_webhook_config(id=1, secret)` con T (RLS on, sin policies → solo service_role).
- El trigger manda header `x-webhook-secret: T` (T literal en el SQL del trigger, server-side).
- La EF lee T de `notif_webhook_config` (service_role) y compara. Mismatch → 401.

---

## Tarea 1 — Migración: tabla de notificaciones + config
**Archivo:** `supabase/migrations/2026060X_email_notif.sql` (apply_migration)
- `pedido_notificaciones (id uuid pk, pedido_id uuid fk, tienda_id uuid, tipo text check in('confirmacion','rastreo'), estado text check in('pendiente','enviado','fallido') default 'pendiente', proveedor_id text, error text, enviado_at timestamptz, created_at timestamptz default now(), UNIQUE(pedido_id, tipo))`. RLS on; policy owner SELECT (por tienda). service_role bypassa.
- `notif_webhook_config (id int pk default 1 check(id=1), secret text not null)` + insert T. RLS on, sin policies.
- Test: `select` columnas existen + unique index.

## Tarea 2 — EF `tienda-notif-pedido`
**Archivo:** `supabase/functions/tienda-notif-pedido/index.ts` (deploy MCP, verify_jwt=false)
- CORS no aplica (server-to-server). Valida `x-webhook-secret` vs `notif_webhook_config`.
- Parse payload `{type, table, record, old_record}`.
- Ramifica:
  - `type==='INSERT'` → tipo='confirmacion' si `record.comprador_email`.
  - `type==='UPDATE'` → tipo='rastreo' SOLO si `record.estado==='cerrado' && record.numero_guia && old_record?.estado!=='cerrado' && record.comprador_email`.
  - otro → 200 `{skipped:true}`.
- Idempotencia: `insert pedido_notificaciones {pedido_id,tienda_id,tipo,estado:'pendiente'}`; si 23505 → 200 `{deduped:true}` (no reenvía).
- Carga `tienda` (branding) + `pedido_items` por `record.tienda_id`/`record.id` (service_role).
- Render plantilla (Tarea 3). `From: "{nombre_negocio}" <no-reply@send.aimma.com.co>`, `reply_to: email_contacto || undefined`, `to: comprador_email`.
- POST `https://api.resend.com/emails` con `RESEND_API_KEY`. OK → update estado='enviado', enviado_at, proveedor_id; además si confirmacion set `pedidos.notif_email_enviado_at`. Falla → estado='fallido', error; responde 200 igual (no romper el webhook; reintento manual).
- Tests (node/deno): secret inválido→401; INSERT sin email→skip; UPDATE no-cerrado→skip; UPDATE cerrado+guia→rastreo; doble webhook mismo (pedido,tipo)→1 envío (dedupe); tenant-scope (carga solo de su tienda).

## Tarea 3 — Plantillas (HTML + texto)
**Archivo:** `supabase/functions/tienda-notif-pedido/templates.ts`
- `renderConfirmacion(tienda, pedido, items)` y `renderRastreo(tienda, pedido)`.
- HTML email-safe (tablas + estilos inline), logo (logo_url) o wordmark, nombre tienda, accent neutro (paleta = mejora futura), datos del pedido (codigo, items, totales, dirección), contacto (Reply-To/WhatsApp). Texto plano fallback.
- Rastreo: transportadora + numero_guia + link (mapa transportadora→URL; fallback "consultá con la guía").
- Test: render incluye codigo_publico, items, total; no rompe sin logo; escapa HTML del input.

## Tarea 4 — Webhooks (triggers pg_net)
**Archivo:** migración `2026060X_email_webhooks.sql` (apply_migration)
- `notif_pedido_webhook()` trigger fn: `perform net.http_post(url, jsonb body {type:TG_OP, table:'pedidos', record:row_to_json(NEW), old_record:row_to_json(OLD)}, headers {content-type, x-webhook-secret:T})`.
- `after insert on pedidos` → fire siempre.
- `after update on pedidos when (NEW.estado='cerrado' and OLD.estado is distinct from 'cerrado')` → solo transición de cierre.
- Test (vivo, aimma-test): insertar pedido de prueba → confirmación llega; cerrar con guía → rastreo llega; segundo UPDATE no-cierre → no dispara.

## Tarea 5 — Checkout email requerido
**Archivos:** `apps/storefront/src/pages/checkout.astro` (label sin "(opcional)", `required`, validación) + `supabase/functions/tienda-crear-pedido/index.ts` (Zod email requerido). 
- Antes de tocar crear-pedido: comparar disco vs live (get_edge_function) para no regresar; cambiar SOLO el requiredness del email. Redeploy.
- Deploy storefront wrangler. Test: submit sin email → bloquea (cliente + EF 400).

## Tarea 6 — Gate
- Suite EF + storefront verdes. byte-compare storefront (checkout). 
- **Smoke real:** crear pedido de prueba en aimma-test con un email mío → confirmación llega al inbox (no spam) con SPF/DKIM/DMARC pass; cerrar con guía → rastreo llega. Limpiar pedidos de prueba + reserva.
- Reporte + OK visual/funcional de Jorge → merge a main (storefront + migraciones; EFs ya desplegadas).

---

## Orden de ejecución
1 (migración config+tabla) → 2+3 (EF+plantillas, deploy) → smoke manual EF (curl simulando webhook) → 4 (triggers, smoke vivo) → 5 (checkout requerido) → 6 (gate + smoke real + reporte).
