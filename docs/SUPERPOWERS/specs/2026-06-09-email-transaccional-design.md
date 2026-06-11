# Email transaccional al cliente — DESIGN + PLAN

> Estado: PROPUESTA para revisión de Jorge. **NO se construye hasta aprobar.**
> Fecha: 2026-06-09. Pieza siguiente a F1 (PDP/carrito ya cerrado).
> Regla: NO toca el flujo de pedido/reserva. Solo AGREGA el envío (observa la tabla, no la muta).

---

## 0. Estado actual (evidencia, no asunción)

| Cosa | Estado verificado |
|---|---|
| Dominio | `aimma.com.co` registrado en **Namecheap** |
| Correo actual | **Email forwarding de Namecheap** (MX `eforward1-5.registrar-servers.com`). Recibe y reenvía; **no es un servidor de envío**. |
| SPF | `v=spf1 include:spf.efwd.registrar-servers.com ~all` (solo cubre el forwarding) |
| DMARC | **NO existe** (`_dmarc.aimma.com.co` vacío) |
| DKIM de app | **NO existe** |
| Envío de email en el código | **NINGUNO activo.** Solo un *stub*: tabla `form_submission_notifications` que `tienda-form-submit` llena, con `estado IN (pendiente/enviado/fallido)` + `enviado_at`. El envío real estaba marcado "Plan 5" y **nunca se construyó**. No hay SMTP ni servicio configurado. |
| "Patrón Believe" | NO está en este repo (es infra externa/n8n de Jorge). No reutilizable tal cual sin la misma autenticación de dominio. |
| Esquema `pedidos` | Ya tiene: `estado`, `pendiente_at`, `confirmado_at`, `cerrado_at`, `devuelto_at`, `numero_guia`, `transportadora`, `comprador_email`, `notif_email_enviado_at`, `codigo_publico`. |
| Esquema `tiendas` | `nombre_negocio`, `email_contacto`, `notif_email`, `whatsapp_dueno`, `logo_url`. |
| CRM (`crm.js`) | Flujo `pendiente_confirmacion → cerrado (con guía + wa.me cliente) → devuelto`. El cierre setea `numero_guia/transportadora/cerrado_at` desde el admin (cliente). |

**Conclusión:** el dato (`comprador_email`, `numero_guia`, marcador `notif_email_enviado_at`) y el ciclo de estados ya están. Falta: (1) un proveedor de envío con el dominio autenticado, (2) el motor que renderiza y envía, (3) los disparadores, (4) las plantillas.

---

## 1. Mecanismo — recomendación: servicio HTTP (Resend), NO SMTP crudo

**Recomiendo un servicio transaccional vía API HTTP, específicamente Resend.** Razón:

- **Runtime:** el envío natural vive en una **Edge Function (Deno)** / o reaccionando a la BD. Desde edge, un `fetch` a una API es trivial y robusto; **SMTP crudo desde edge es frágil** (sockets TCP, timeouts, puertos, sin firma DKIM propia).
- **Deliverability:** el servicio firma **DKIM** por nosotros (pegás unos registros DNS una vez), maneja rebotes/quejas/supresión y reputación de IP. Con el dominio hoy SIN DKIM ni DMARC, mandar "desde @aimma.com.co" por SMTP genérico = spam casi seguro.
- **Multi-tenant:** `From` (display) + `Reply-To` por envío son triviales por API.
- **Costo/escala:** Resend free = 3.000/mes (100/día), suficiente ahora. A escala, **Amazon SES** es el más barato ($0.10/1.000) — lo dejamos como upgrade; misma arquitectura (solo cambia el cliente HTTP).

**Alternativa (la descarto para v1):** EF/webhook encola → **n8n drena la cola → nodo SMTP** ("patrón Believe"). Reutiliza n8n, pero: (a) la deliverability **igual** depende de autenticar el dominio, (b) suma una pieza móvil (uptime n8n) y latencia de cola, (c) no nos ahorra el trabajo de DNS. Solo conviene si Jorge ya tiene un relay SMTP con `aimma.com.co` autenticado — que **no es el caso hoy**.

> **Decisión para Jorge:** ¿Resend (recomendado) / SES / SendGrid? Por defecto sigo con **Resend**.

### Modelo de remitente (ya decidido por Jorge, aterrizado)
- **Subdominio de envío dedicado:** `send.aimma.com.co` (aísla la reputación transaccional del forwarding del dominio raíz; no toca el MX actual).
- **From:** `"{tienda.nombre_negocio}" <no-reply@send.aimma.com.co>` → el cliente VE el nombre de la tienda; el dominio técnico es AIMMA autenticado.
- **Reply-To:** `tienda.email_contacto` (si está; si no, se omite y el cuerpo deja el WhatsApp de la tienda como contacto).
- **Contenido:** marca de la tienda (logo `tiendas.logo_url`, nombre, color de tema), datos del pedido.
- Dominio propio del dueño = upgrade futuro (verificación DNS por tienda). NO ahora.

---

## 2. Disparadores (tenant-scoped, sin tocar el flujo de pedido)

Para respetar "no toca el flujo de pedido/reserva", los dos envíos se disparan **observando la tabla `pedidos` con Database Webhooks de Supabase**, no metiendo lógica de envío dentro de la EF de creación ni del cierre del CRM.

- **(A) Pedido CREADO → confirmación al cliente.**
  Webhook en `pedidos` **INSERT** → llama a la EF de email. La EF manda la confirmación a `comprador_email` y marca `notif_email_enviado_at`.
- **(B) Pedido CERRADO con guía → rastreo al cliente.**
  Webhook en `pedidos` **UPDATE** → la EF guarda contra envíos espurios: dispara el rastreo **SOLO en la transición real**, es decir `record.estado === 'cerrado'` **Y** `record.numero_guia` presente **Y** `old_record.estado !== 'cerrado'`. Cualquier otro UPDATE de `pedidos` (editar dirección, etc.) → no-op. (El webhook puede ya filtrar por UPDATE de la columna `estado`, pero la EF re-valida la transición de todas formas.)

Ambos llegan a una **única EF `tienda-notif-pedido`** que ramifica por tipo de evento. La EF es tenant-scoped: del row del pedido obtiene `tienda_id` → carga branding/Reply-To de esa tienda → no cruza datos entre tiendas.

> **Por qué webhook y no inline:** la EF `tienda-crear-pedido` y el cierre del CRM quedan **intactos**; si el email falla, el pedido/reserva NO se ven afectados (desacople total). Alternativa más simple (llamar a Resend inline tras crear/cerrar) la descarto por acoplar el envío al flujo crítico.

> **Decisión para Jorge:** ¿OK con Database Webhooks (recomendado, no toca nada) vs. EF dedicada de cierre? Por defecto: **webhooks**.

---

## 3. Idempotencia (1 evento = 1 email)

- **A (confirmación):** usa el marcador existente `pedidos.notif_email_enviado_at`. La EF: si ya está seteado → no reenvía (dedupe de webhooks reintentados).
- **B (rastreo):** se agrega columna `pedidos.notif_tracking_enviado_at` (mínimo) **o** —mejor para auditoría/reintentos— una tabla `pedido_notificaciones (pedido_id, tipo, estado pendiente/enviado/fallido, proveedor_id, error, enviado_at, UNIQUE(pedido_id, tipo))`.
  **Recomiendo la tabla** `pedido_notificaciones`: idempotencia por `UNIQUE(pedido_id,tipo)`, log de fallos, base para reintentos. (Agregar tabla NO toca el flujo de pedido.)

---

## 4. Plantillas (2, con marca de la tienda, español)

HTML responsive + fallback texto plano. Branding por tienda (logo, nombre, color). Datos del pedido.

1. **Confirmación** (`pedido creado`): saludo con nombre, `codigo_publico`, lista de ítems (variante + cantidad + precio), subtotal/envío/total, dirección y ciudad, método de envío, nota "te avisamos cuando despachemos", contacto (Reply-To / WhatsApp tienda).
2. **Rastreo** (`pedido cerrado`): "tu pedido va en camino", `codigo_publico`, **transportadora + número de guía**, **link de rastreo** (mapa `transportadora → URL de tracking`; si no hay match, link genérico/copiar guía), resumen breve.

---

## 5. ¿Email requerido en el checkout? — recomendación: SÍ, requerido

Hoy es opcional (`comprador.email` optional). **Si no lo cargan, no hay a quién enviar** → la pieza no sirve.
**Recomiendo hacerlo requerido** en el checkout (estándar e-commerce, fricción baja) con copy "para enviarte la confirmación y el rastreo de tu pedido". Cambios: quitar "(opcional)" del label, `required` en el input, validación en `checkout.astro` y endurecer el Zod de la EF (`email` requerido). Bajo riesgo, no toca reserva.

> **Decisión para Jorge:** requerido (recomendado) vs. seguir opcional. Si opcional: el email solo se manda cuando el cliente lo cargó (degradación graciosa).

---

## 6. DNS / setup — prerequisito (Tipo B, Jorge en Namecheap)

Bloqueante de deliverability. Al dar de alta `send.aimma.com.co` en Resend, **Resend genera los valores exactos**; Jorge los pega en Namecheap:
- **TXT SPF** del subdominio `send` (`v=spf1 include:amazonses.com ~all` o el que indique Resend).
- **DKIM** (CNAME/TXT que entrega Resend).
- **MX** del subdominio `send` (feedback) — NO toca el MX raíz del forwarding.
- **DMARC** en `_dmarc.aimma.com.co` (`v=DMARC1; p=none; rua=...` para arrancar, luego endurecer).
- Guardar `RESEND_API_KEY` como **secret de Supabase Functions** (no en repo).

No invento los valores: salen de la consola de Resend al verificar el dominio.

---

## 7. Plan de implementación (fases; build solo tras aprobar)

**Fase 0 — Prerequisito (Tipo B Jorge):** cuenta Resend + verificar `send.aimma.com.co` (DNS Namecheap) + DMARC + `RESEND_API_KEY` secret. *Sin esto, los envíos caen en spam o fallan.*

**Fase 1 — Migración (Tipo A):** tabla `pedido_notificaciones` (idempotencia/log) + índice `UNIQUE(pedido_id,tipo)`. (No toca `pedidos` salvo lectura.)

**Fase 2 — EF `tienda-notif-pedido` (Tipo A):**
- Deno, `verify_jwt=false`, valida un **secret de webhook** propio (header) — no es pública.
- Entrada: payload del Database Webhook (`type`, `record`, `old_record`).
- Lógica: ramifica A (INSERT) / B (UPDATE→cerrado+guía); carga `tienda` (branding, Reply-To) y `pedido_items` con service_role, **scoped por `tienda_id` del row**; chequea idempotencia (`pedido_notificaciones`); renderiza plantilla; `fetch` a Resend; registra `enviado/fallido`.
- Sin email del comprador → no-op registrado (no error).

**Fase 3 — Plantillas (Tipo A):** módulos de render (HTML+texto) confirmación y rastreo, con branding tenant + mapa transportadora→tracking.

**Fase 4 — Database Webhooks (Tipo B Supabase / o SQL trigger `supabase_functions.http_request`):** `pedidos` INSERT y UPDATE → EF, con el secret.

**Fase 5 — Checkout email requerido (Tipo A, si Jorge aprueba):** `checkout.astro` + Zod EF.

**Fase 6 — Gate (Tipo A):** tests EF (render por plantilla, idempotencia doble-webhook→1 envío, tenant-scope, email inválido/ausente) + **smoke real** enviando a una casilla de prueba y revisando inbox/spam + SPF/DKIM/DMARC `pass`. Reporte + OK visual de Jorge.

---

## 8. Preguntas abiertas para Jorge (las reviso una vez)
1. Proveedor: **Resend** (rec.) / SES / SendGrid.
2. Disparo: **Database Webhooks** (rec.) / EF dedicada.
3. Email en checkout: **requerido** (rec.) / opcional.
4. Subdominio de envío `send.aimma.com.co` y local-part `no-reply@` — ¿OK?
5. ¿Mandar también copia al dueño (`tiendas.notif_email`) en cada pedido? (opcional, fácil de sumar).
