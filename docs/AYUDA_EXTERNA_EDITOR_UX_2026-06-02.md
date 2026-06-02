# AIMMA Tienda IA · Editor PRO-MAX · Pedido de auditoría UX externa con contexto completo del proyecto

**Para:** Claude Browse / consultor UX externo
**De:** Jorge Valbuena (founder AIMMA, consultor automatización n8n/IA/redes sociales en Colombia)
**Fecha:** 2026-06-02
**Versión:** v2 (incluye TODAS las fases del proyecto AIMMA)

---

# PARTE 1 · CONTEXTO DEL ECOSISTEMA AIMMA COMPLETO

## 1.1 Quién es AIMMA

**AIMMA** = agencia colombiana de automatización + plataforma SaaS propia. Combina servicios de consultoría con un Panel IA que tiene 3 módulos productivos.

**Founder:** Jorge Valbuena, consultor n8n/IA/redes sociales.
**Sede:** Cúcuta / El Zulia, Norte de Santander, Colombia.
**Modelo:** servicios (consultoría) + producto SaaS (Panel IA).

### Clientes actuales productivos

| Cliente | Sector | Estado AIMMA |
|---|---|---|
| Calzado Maraldo | Producción y comercialización de calzado | Tienda IA + Dashboard activo |
| Industrias Dimac | Diseño y construcción de puntos retail | Tienda IA + Dashboard activo |
| Fullcaps | Fabricación de gorras | Cliente consultoría |
| Kaybu | Ropa deportiva dama/caballero | En onboarding Tienda IA |
| Surtishop (propia) | Almacén ropa y calzado El Zulia | Instagram + Tienda IA testing |

### Las 3 piezas del producto AIMMA

```
┌────────────────────────────────────────────────────────────┐
│                  AIMMA (la agencia)                         │
└────────────────────────────────────────────────────────────┘
              ↓                  ↓                ↓
        SITIO PUBLICO     PANEL IA          AGENTE WhatsApp
        aimma.com.co      (3 módulos)       n8n GCYBhhtI8UTguIeY
                           ↓
                ┌──────────┴──────────┬──────────┐
                ↓                     ↓          ↓
        Dashboard AIMMA       Contenido IA   Tienda IA (este!)
        (financiero PyMEs)   (editor fotos)  (multi-tenant SaaS)
```

**1. Sitio público aimma.com.co**
- Plan PRO con auth Supabase + Mercado Pago production ($1700 COP validado, planes hasta $1.8M COP)
- Repo `aimma-colombia` deploy Easypanel
- LIVE confirmado

**2. Panel IA (`/iapanel/`)**
- Plataforma propia dentro de aimma.com.co
- 3 módulos: Dashboard AIMMA + Contenido IA + Tienda IA
- Login Supabase + cuenta admin Jorge

**3. Dashboard AIMMA** (sub-modulo: 5 gerentes virtuales)
- Top de Ventas y Resurtidos / Sobrestock / Sin Ventas / Gastos Consolidados / Presupuesto Pauta IA
- Carga reportes POS local + parse PDF/Excel
- Privacy 100% local (diferenciador vs Siigo/Alegra)
- LIVE: aimma.com.co/dashboard

**4. Contenido IA (Estudio Visual)**
- Editor de fotos con IA (KIE.ai + tokens)
- Plan PRO uso medido
- LIVE: aimma.com.co/iapanel/estudio/

**5. Tienda IA** ← **objeto de esta auditoría**
- E-commerce multi-tenant SaaS
- Cada cliente tiene su subdominio `*.tienda.aimma.com.co`
- Panel admin para gestionar productos/categorías/pedidos + editor visual (el que está fallando)
- LIVE: aimma.com.co/iapanel/tienda/admin/

**6. Agente WhatsApp**
- n8n workflow GCYBhhtI8UTguIeY (34 nodos, activo)
- Servicio + ventas vía WhatsApp Business +57 313 362 3071
- Voz ElevenLabs Isbelia para respuestas de audio
- 5 fases completas LIVE

---

# PARTE 2 · HISTORIAL COMPLETO DE FASES Tienda IA

Tienda IA empezó hace ~4 semanas y ha tenido 12 fases macro + 3 plans del Editor PRO-MAX. Lo listo en orden cronológico para que entiendas qué se construyó y por qué.

## Fase 0 — Setup base (LIVE)
- Migración tabla `image_jobs` cross-módulo (Contenido IA + Tienda IA comparten infra)
- Refactor EF `studio-enqueue`
- DNS Namecheap → Cloudflare

## Fase 1 — BD foundation (LIVE)
- 15 tablas nuevas con RLS multi-tenant: tiendas, categorias, productos, variantes, pedidos, plantillas, paletas, envios, paginas, clientes, OTP, model_costs, etc.
- RPC `reservar_tokens_v2` + `is_admin_or_cofounder`
- Seed inicial: Maraldo + Dimac + admin Jorge
- Páginas legales templates Ley 1581 colombiana
- Audit final BD

## Fase 2 — Infra multi-tenant (LIVE)
- DNS wildcard `*.tienda.aimma.com.co` Cloudflare
- Easypanel domain config
- Test E2E subdominio dummy

## Fase 3 — Panel admin tienda CRUD (LIVE)
- Estructura SPA vanilla JS con auth guard + hash router + sidebar
- Vista Inicio con KPIs propios de cada tienda
- CRUD productos (lista + crear/editar + matriz variantes)
- Wizard onboarding 3 pasos forzados
- CRUD categorías árbol 2 niveles
- Vista Configuración + datos legales
- Editor páginas legales (3 páginas Ley 1581)
- Upload fotos cross-módulo con Estudio Visual
- Tests E2E con tienda Maraldo

## Fase 4 — SSL automatización subdominio (LIVE)
- EF `tienda-publicar-subdominio` Deno/TS
- Easypanel domain auto-add via API tRPC
- Cloudflare cert wildcard ACM activo
- DOMPurify para HTML legales storefront público (anti-XSS)

## Fase 5 — Storefront público (LIVE)
- Setup monorepo workspaces pnpm + Turborepo
- `apps/storefront` Astro 5 SSR + adapter Cloudflare Workers
- `packages/database` tipos Supabase compartidos
- Middleware multi-tenant + supabase client
- Theming dinámico CSS vars `--ta-color-*` por tienda
- Layout + Header + Hero + ProductCard + Footer con variants por plantilla
- Pages: `/`, `/c/[slug]`, `/p/[slug]`, `/garantias`, `/datos`, `/contacto`, `/carrito`
- SEO completo: meta + Open Graph + Schema.org JSON-LD + sitemap + robots
- Lighthouse pass

## Fase 6 — 3 plantillas iniciales (LIVE)
- Research UI-UX Fashion Bold (Anton uppercase, edge-to-edge)
- Research UI-UX Industrial Clean (IBM Plex Sans, split hero)
- Research UI-UX Minimal Artesanal (Fraunces, editorial)
- Fix contraste botón WhatsApp auto-luminance
- Componentes con variants por plantilla
- Iframe paridad panel admin (vista previa)
- Verificación E2E Playwright TODAS plantillas × paletas

## Fase 7 — Slug SEO + Webhook invalidate KV (LIVE)
- Migration `productos.slug` NOT NULL + trigger unaccent slugify + backfill
- Slugs amigables: `/p/aceite-5w-30-valvoline` en vez de UUID
- Endpoint `/_internal/invalidate-kv` con bearer auth (anti-leak GET 404)
- Database Webhook Supabase para invalidar cache KV en cambios productos

## Fase 8 — White-mode total estilo Shopify (LIVE)
- Migración sitio + Hub Panel IA + Dashboard + Contenido + Tienda admin a fondo `#fafafa`
- Redefinir VALORES de tokens existentes (no rename) — backwards compat
- Branding AIMMA preservado (cyan oscurecido `#006d8b` WCAG AA 6.0:1)
- 4 audits: code-explorer + grep + WCAG + Playwright visual 13 URLs
- 0 CRITICAL al cierre

## Fase 9 — Rediseño plantillas agency-level (LIVE)
- Eliminar eyebrows tracked + logo placeholder retirado
- Cards typography-driven, motion intencional, 1 solo CTA
- Plantilla nueva **Editorial Magazine** (Vogue/Kinfolk Fraunces + pull quote MMXXVI)
- BD: 4 plantillas activas + 6 catalogadas (10 total)
- 20 paletas (15 + 5 premium WCAG: obsidian/glacier/sequoia/riviera/slate_linen)

## Fase 10 — Dashboard reportes fix (LIVE)
- 22 reemplazos charts-modal.js `rgba(255,255,255)` → `rgba(26,26,26)`
- Casillas rediseño high-end (shadow soft + iconos badge + CTAs WCAG)
- Verificado LIVE Last-Modified 18:47

## Fase 11 — Componentes shared con variants por plantilla (LIVE)
- Asociar paletas a editorial_magazine
- Rediseñar componentes shared (Hero, ProductCard, Footer) con switch por plantilla
- Verificación visual 4 plantillas LIVE

## Fase 12 — Tienda IA producto vendible (LIVE en pedazos)

### 12.A · Worker INVALIDATE_SECRET setup (LIVE)
- Endpoint `/_internal/invalidate-kv` con bearer auth en CF Worker

### 12.B · WhatsApp checkout E2E (LIVE)
- Trigger `gen_codigo_publico_pedido` PED-YYYYMMDD-XXXXXX
- RPC `reservar_stock_variante` atómico SECURITY DEFINER
- EF `tienda-crear-pedido` v1 con Zod + service_role + rollback
- Page `/checkout.astro` + Update `/carrito.astro`
- Cliente abre `wa.me` en browser (no Meta Cloud API)
- Decisión arquitectural: AIMMA es plataforma SaaS, NO marketplace

### 12.B+ · CRM expansion (LIVE)
- BD CRM expansion: 14 cols nuevas en tiendas + tabla clientes
- Sidebar "Pedidos" → "CRM"
- View CRM 5 tabs: Pedidos / Clientes / Top compradores / Stock bajo / Devoluciones
- Modal acciones Cerrar/Cancelar/Devolver
- Vista Clientes con segmentación

### 12.C · Editor PRO-MAX (LIVE en pedazos — **objeto de esta auditoría**)

Ver Parte 3 completa abajo.

### 12.D · Polish 4 plantillas (PENDIENTE)

---

# PARTE 3 · PLAN 3 EDITOR PRO-MAX (CERRADO 2026-06-02, OBJETO DE LA AUDITORÍA)

El Editor PRO-MAX se ejecutó en 3 plans secuenciales:

## Plan 1 — Foundation + Industrial Clean (LIVE, HEAD 349cef7)
- Zod schemas compartidos `editor-schema.ts` con CSS injection regex hardening
- `apps/storefront/src/styles/blocks.css` CSS grid 24-col + @media auto-collapse mobile
- 8 blocks Industrial Clean: Hero / Texto / Imagen / Botones / Productos / Galería / Espaciador / Formulario
- `BlockRenderer.astro` dispatcher inicial
- `index.astro` branch: si `pages.home` existe → BlockRenderer, else fallback Fase 9
- Audit final fixeó 6 bugs (regex id, XSS embed, GridPosition order, CSS injection, @container self-ref, Tailwind dynamic class)

## Plan 2 — 21 blocks restantes + dispatcher v2 (LIVE, HEAD 8e409d5)
- 7 blocks Fashion Bold (Anton uppercase border-radius 0)
- 7 blocks Minimal Artesanal (Fraunces opsz 48/96 pill 999px)
- 7 blocks Editorial Magazine (Fraunces 300 + italic accent spans)
- `BlockRenderer.astro` v2 dispatcher con tabla `BLOCKS[tipo][plantilla]` 28 mappings + Espaciador agnóstico + fallback IC
- Verificado LIVE 4 plantillas × 6 paletas

## Plan 3 — Editor admin + 2 EFs + CRM Mensajes (LIVE, HEAD 62e5f93)

### Backend (LIVE verificado empíricamente)
- **BD migration consolidada**: 3 tablas (form_submissions, form_submission_notifications, form_submit_rate_limit) + 2 RPCs + 3 columnas tiendas
- **EF tienda-guardar-layout v2** ACTIVE verify_jwt=true:
  - Zod validate body con `PersonalizacionesSchema.refine()` requiere pages.home
  - Ownership check + locking optimista base_updated_at → 409 stale_layout
  - Mode draft → pages.home_draft, mode publish → promueve home + invalidate KV
- **EF tienda-form-submit v2** ACTIVE verify_jwt=false:
  - CORS regex `^https://[a-z0-9-]+\.tienda\.aimma\.com\.co$`
  - Rate limit ANTES de honeypot (5 HIGHs audit todos fixeados durante implementación)
  - Honeypot silent drop 200 + max 8 fields + body 100KB
  - Insert form_submissions + cola notif email opcional

### Frontend storefront blocks (commits Tasks 7-9)
- `_FormSubmitHandler.astro` DRY script que captura submit, fetch a EF, mensaje success/error
- 4 `Formulario*.astro` MOD: action 404 → data attrs + honeypot + p.form-message + import handler

### Frontend admin panel — EL EDITOR (LIVE)

**Estructura archivos** (10 JS + 1 CSS + 3 libs vendored):
```
iapanel/tienda/admin/views/editor/
├── editor.js                    Entry + auto-save 30s + handleBack guard
├── editor-state.js              Singleton + 20 snapshots structuredClone
├── editor-controls.js           6 helpers reusables (textInput, urlInput, colorPicker, slider, switch, select)
├── editor-styles.css            3 paneles + grid lines + tokens --ed-color-*
├── editor-toolbar.js            Toolbar 56px + atajos Ctrl+Z/S/Esc/Del
├── editor-sidebar.js            Pages + Outline + +Agregar
├── editor-canvas.js             SortableJS reorder + GridStack 24-col
├── editor-inspector.js          Hand-coded por tipo
├── editor-modal-catalog.js      Modal 8 thumbnails con descripciones
├── editor-first-use.js          Modal Starter/Cero + tour 3 pasos
└── lib/
    ├── sortable.min.js          1.15.6 (13KB gzip)
    ├── gridstack.min.js         11.5.0 (35KB gzip)
    └── gridstack.min.css        4KB compact
```

**Layout 3 paneles fijos:**
```
+----------------------------------------------------------+
| TOOLBAR 56px: Volver | Desktop/Mobile | Undo/Redo | IA | Guardar |
+--------+------------------------------+------------------+
| SIDEBAR| CANVAS (scrollable)          | INSPECTOR        |
| 240px  | grid 24-col opacity 0.08     | 320px            |
| Pages  | sections con drag handle ⋮⋮  | contextual       |
| Outline| GridStack init por section   | (nada / section  |
| +Nueva | con elementos drag/resize    |  / element)      |
+--------+------------------------------+------------------+
```

**8 tipos de secciones disponibles** (con copy localizado post-feedback):
1. **Banner principal** (hero) — Encabezado grande con título, descripción y botón
2. **Texto** — Párrafo descriptivo o título secundario
3. **Imagen** — Una imagen destacada de tu negocio
4. **Botones** — Fila de botones (WhatsApp, ubicación, llamar)
5. **Productos** — Grilla con los productos de tu tienda
6. **Galería** — Varias imágenes en grilla o carrusel
7. **Espacio en blanco** — Separador vertical entre secciones
8. **Formulario** — Para que los clientes te dejen mensajes

**Decisiones aprobadas durante brainstorming Plan 3:**
1. Form-submit dentro de Plan 3 (no diferir)
2. First-use UX híbrido state-of-art Wix Studio 2026 (Starter vs Desde Cero)
3. Tour overlay 3 pasos
4. Modal catálogo + botón "+ Agregar sección" (NO drag from sidebar — complejidad + iOS Safari frágil)
5. Inspector con helpers compartidos + hand-coded compose por tipo
6. Copy español natural con ñ correcta
7. Auto-save draft 30s debounced
8. Locking optimista base_updated_at → 409 stale_layout
9. Undo/Redo 20 snapshots structuredClone + debounce 1000ms typing
10. Mensajes UX = 6º tab CRM (no sidebar item nuevo)
11. WhatsApp helper si detecta tel CO regex

**6º tab CRM "Mensajes"** (incluido en Plan 3):
- Lista form_submissions con badge no-leídos
- Modal detalle con campos labeled + IP + UA
- Botón "Responder por WhatsApp" si detecta tel CO

**5 HIGHs audit fixeados durante implementación:**
1. Data loss silencioso con `pages: {}` → Zod `.refine()` requiere home
2. Rate limit bypass via honeypot → reorder rate limit ANTES de honeypot
3. Silent failure notif INSERT → error capture
4. Astro JSX `<_FormSubmitHandler />` underscore rompía build SSR → rename
5. `window.TiendaIA.supabase` factory function — leía como property → `?.()` invocation

**3 Tipo B Jorge pendientes:**
- Task 9: storefront wrangler deploy (forms LIVE)
- Task 24 + 28: Easypanel redeploy aimma-web (activar editor LIVE)
- Task 29: Playwright suite E2E (requiere CI con pnpm)

---

# PARTE 4 · FEEDBACK LITERAL DE JORGE POST-REDEPLOY

Después del redeploy de Easypanel que activó el Plan 3 LIVE, Jorge probó el editor y dijo:

> "Al dar click en editor me sale el home o inicio de tienda ia no editor"

(Bug runtime: `registerView({render, cleanup})` rejected — fix aplicado commit d5c70d6)

> "Pero editar así es casi imposible eso de hero nadie en colombia sabe que es eso ni yo y no se puede mover nada o en otra fase se va a mejorar."

> "Cuando coloco plantillas no hay plantillas es una imagen blanca."

> "Lo actual es imposible que alguien edite no tiene plantilla el texto no se ve queda en una celda como de excel."

> "Es 0% parecido a wix y 0% parecido a shopify."

### Mi interpretación (Claude Opus) de estos comentarios

1. **Copy técnico anglo:** "Hero" no se entiende en CO. **Fix aplicado** commit 62e5f93: "Hero" → "Banner principal", "Espaciador" → "Espacio en blanco", "Embed" → "Video o mapa", descripciones agregadas al modal catálogo.

2. **No se puede mover nada:** GridStack 11.x drag/resize no funcionaba. **Fix aplicado** commit 62e5f93: cambio de `addWidget({content})` a DOM directo + `makeWidget(el)`. Pendiente confirmación empírica de Jorge.

3. **"Canvas como celda Excel":** el canvas del editor renderea **mockups minimalistas** (caja gris con label + botones styling default), NO la versión real con plantilla aplicada. **Este es el quiebre fundamental** vs Wix/Shopify donde el canvas muestra exactamente cómo se va a ver.

4. **"Plantillas son imagen blanca":** Jorge dice ver "imagen blanca" cuando elige plantilla. Verifiqué empíricamente: el storefront público (`*.tienda.aimma.com.co`) SÍ renderea con plantilla industrial_clean correctamente. El bug puede ser en el **iframe de vista previa interna del panel admin** (`#/vista-previa` carga storefront en iframe — quizá no se actualiza o tiene CORS).

---

# PARTE 5 · LO QUE TE PEDIMOS

## 5.1 Pregunta principal

¿Cómo lograr que este editor sea **genuinamente usable** por un dueño de tienda colombiano sin formación técnica, alcanzando un mínimo del **60-70% de la usabilidad de Wix Editor o Shopify Online Store 2.0**?

## 5.2 Constraints duros (no negociables)

- **Stack admin:** vanilla JS (sin React/Vue — el resto del panel ya es vanilla JS y se mantiene así por consistencia y bundle weight). SortableJS 1.15.6 + GridStack 11.5.0 vendoreados.
- **Multi-tenant:** cada tienda es subdominio `*.tienda.aimma.com.co` con CSS vars `--ta-color-*` específicas de su plantilla+paleta.
- **Storefront separado:** el render real es Astro SSR. El admin solo gestiona el JSON `personalizaciones.pages.home.sections` que el storefront lee vía Cloudflare KV TTL 60s + invalidate on publish.
- **No bundler en admin:** archivos JS cargan con `<script src>` directo. Cada archivo expone namespace `window.TiendaIA.editorX`.
- **BD schema fijo:** PersonalizacionesSchema (Zod) ya validado por la EF — cambios de schema requieren versionado.

## 5.3 Constraints semi-flexibles

- Tipografía panel admin: Exo 2 + JetBrains Mono (consistencia con resto del Panel IA)
- Copy en español natural colombiano con ñ correcta
- Mobile editing: aceptable que sea "view-only" en mobile (banner "mejor en desktop")
- Cloudflare Workers free tier preferido (sin Worker Paid plan si se puede)

## 5.4 Mejoras candidatas (las nuestras — vos podés agregar o descartar)

### A. WYSIWYG real en el canvas (el quiebre fundamental)
- Reemplazar mockup minimalista por **iframe sandboxed con el storefront preview real** consumiendo el draft JSON
- Postmessage para comunicar selección/edición entre iframe ↔ panel
- Tradeoff: complejidad técnica vs experience Wix/Shopify

### B. Onboarding con templates pre-armados por industria
- En vez de "Plantilla starter / Desde cero", ofrecer **8-10 templates** por sector:
  - Restaurante / Comida
  - Retail moda mujer
  - Retail moda hombre
  - Retail calzado
  - Servicios profesionales
  - Belleza y bienestar
  - Productos artesanales
  - Tienda de barrio
- Cada template = JSON pre-poblado + copy + imágenes placeholder placehold.co
- Tradeoff: hay que diseñar los 8-10 templates (~16-24h diseño)

### C. Click-to-edit inline en vez de inspector lateral
- Click sobre texto en canvas → input editable inline + popover formato (negrita/cursiva/link)
- Click sobre imagen → file picker + crop tool
- Inspector lateral queda solo para props "no obvias" (URL botón, categoría productos)
- Reduce "viaje del ojo" canvas ↔ inspector
- Tradeoff: GridStack + edición inline pueden colisionar

### D. Reducir grid 24-col a algo más natural
- Wix: snap to columns (12 visible) con free positioning dentro
- Shopify: sections fixed sin grid editing, solo orden vertical
- Quizá grid 24-col es demasiado libre para usuarios sin formación → más errores
- Tradeoff: limitar libertad vs simplicidad

### E. Onboarding tour reforzado
- Actual: 3 tooltips texto (canvas / inspector / Ctrl+S)
- Mejor:
  - GIF/video corto 60s embebido al primer ingreso (YouTube)
  - Tooltips contextuales en cada control inspector cuando hover por primera vez
  - "Modo guiado" opcional: el editor te lleva paso a paso a editar el primer Hero
- Tradeoff: contenido a producir

### F. Mejor visualización tipos complejos en canvas
- Actual "Productos" en canvas = caja gris con "Productos (8, recientes, auto col)"
- Mejor: thumbnail real de la grilla con productos placeholder estilo plantilla activa
- Mismo para Galería, Formulario, Embed
- Tradeoff: render de productos reales en canvas implica cargar productos en cada render

### G. Mobile preview side-by-side
- Wix Studio muestra mobile preview en panel lateral mientras editás desktop
- Actual: toggle desktop/mobile (one at a time)
- Tradeoff: ocupa espacio en pantalla

### H. Reducir cantidad de bloques iniciales mostrados
- 8 tipos puede ser demasiado para users nuevos
- Mejor: 3-4 esenciales primero (Hero, Productos, Botones) + "Más" para los avanzados
- Tradeoff: limita exploración

### I. Templates reusables a nivel de sección
- "Guarda esta sección como reusable" → biblioteca personal del dueño
- Permite copiar layouts entre tiendas (si es franquicia/multi-marca)
- Tradeoff: requiere tabla nueva + UI

## 5.5 Lo que queremos de tu respuesta

1. **Priorización A-I:** cuáles atacar primero. Justifica con **impact × effort**.
2. **Anti-patterns que detectes:** sé brutal, queremos honestidad. Cosas que estamos haciendo mal estructuralmente.
3. **Quick wins concretos** (cada uno <8h): lista 5-10 con pseudo-código o instrucciones específicas.
4. **Roadmap sugerido:**
   - **Plan 4 propuesto** (~2 sem): fixes UX más críticos
   - **Plan 5 propuesto** (~2 sem): polish + IA (Claude Haiku 4.5 generar contenido)
   - **Plan 6+ propuesto:** mobile editing real, A/B testing, marketplace templates
5. **Referencias visuales:** links/screenshots de patrones específicos Wix/Shopify/Webflow/Squarespace que apliquen al caso.
6. **Estimación honesta:** ¿es realista 60-70% Wix con vanilla JS, o conviene migrar a React/Vue + bundler para el editor?

---

# PARTE 6 · URLs LIVE para testear

## Storefront público (esto SÍ funciona — referencia de cómo se debe ver al final)
- **aimma-test:** https://aimma-test.tienda.aimma.com.co/ (plantilla industrial_clean, paleta corporate)
- **Maraldo:** https://maraldo.tienda.aimma.com.co/
- **Dimac:** https://dimac.tienda.aimma.com.co/

## Panel admin con el editor visual (esto es lo que falla según Jorge)
- **URL:** https://aimma.com.co/iapanel/tienda/admin/#/editor
- **Requiere:** cuenta admin AIMMA (Jorge tiene cuenta de test)

## Sitio público AIMMA
- **https://aimma.com.co/**

## Dashboard AIMMA (referencia de estilo)
- **https://aimma.com.co/dashboard**

---

# PARTE 7 · Archivos clave del repo

**Repo público GitHub:** https://github.com/virtanancucuta/aimma-colombia

## Editor admin
```
iapanel/tienda/admin/views/editor/
├── editor.js                Entry + auto-save
├── editor-state.js          Singleton + snapshots
├── editor-canvas.js         SortableJS + GridStack
├── editor-inspector.js      Panel derecho contextual
├── editor-controls.js       6 helpers reusables
├── editor-first-use.js      Modal + tour + starter JSON
├── editor-modal-catalog.js  8 thumbnails
├── editor-toolbar.js        Atajos teclado
├── editor-sidebar.js        Pages + Outline
└── editor-styles.css        Tokens + 3 paneles + grid lines
```

## Storefront blocks (Astro)
```
apps/storefront/src/components/blocks/
├── BlockRenderer.astro       Dispatcher por plantilla
├── _ElementRenderer.astro    Helper texto/imagen/botón/divisor
├── hero/Hero{IndustrialClean,FashionBold,MinimalArtesanal,EditorialMagazine}.astro
├── texto/...
├── imagen/...
├── botones/...
├── productos/...
├── galeria/...
├── formulario/...
└── espaciador/Espaciador.astro
```

## Edge Functions (Supabase Deno)
```
supabase/functions/
├── _shared/editor-schema.ts        Zod schemas compartidos
├── tienda-guardar-layout/index.ts  verify_jwt=true, locking optimista
├── tienda-form-submit/index.ts     verify_jwt=false, CORS subdominios
├── tienda-crear-pedido/index.ts    WhatsApp checkout (Fase 12.B)
└── tienda-publicar-subdominio/index.ts  Easypanel + SSL (Fase 4)
```

## BD migrations
```
supabase/migrations/
└── 20260602000000_editor_promax_plan3.sql
    (3 tablas + 2 RPCs + flags first-use + notif_email)
```

## Specs y plans del Editor PRO-MAX
- `docs/SUPERPOWERS/specs/2026-06-02-editor-pro-max-plan3-design.md` (spec aprobado)
- `docs/SUPERPOWERS/plans/2026-06-02-editor-pro-max-plan3.md` Parte 1
- `docs/SUPERPOWERS/plans/2026-06-02-editor-pro-max-plan3-part2.md` Parte 2

---

# PARTE 8 · Stack técnico detallado

## Hosting
- **Easypanel:** `dvisualproyect.easypanel.host` (panel admin + sitio aimma.com.co)
- **Cloudflare Workers:** `aimma-storefront` para `*.tienda.aimma.com.co`
- **Cloudflare KV:** `TENANT_CACHE` TTL 60s para personalización por tienda

## Backend
- **Supabase Postgres** con RLS multi-tenant (proyecto `rsmxklkxqsaptchcjszd`)
- **Supabase Edge Functions** Deno
- **Supabase Auth** + JWT
- **Supabase Storage** para fotos de productos
- **Anthropic API** para Claude Haiku 4.5 (Plan 4 futuro: IA generativa contenido)
- **ElevenLabs** para voz Isbelia (agente WhatsApp)
- **KIE.ai** para edición de fotos con IA (Contenido IA)

## Frontend
- **Astro 5 SSR** para storefront
- **Vanilla JS ES2020** para panel admin
- **Supabase JS UMD** cargado vía CDN jsDelivr
- **SortableJS 1.15.6** + **GridStack 11.5.0** vendoreados local

## Tipografía
- **Exo 2** (display panel admin)
- **JetBrains Mono** (monospace KPIs)
- **IBM Plex Sans** (storefront Industrial Clean)
- **Anton** (storefront Fashion Bold)
- **Fraunces** (storefront Minimal Artesanal + Editorial Magazine)

## Colores principales
- Panel admin: `#fafafa` bg + `#1a1a1a` ink + `#006d8b` cyan AIMMA WCAG 6.0:1
- Storefront: CSS vars `--ta-color-*` por tienda (cada paleta tiene primary/accent/bg/text)

---

# PARTE 9 · Notas finales

Las decisiones técnicas se tomaron iterativamente con criterio MVP-first. El stack vanilla JS del panel admin nació de Fase 3.1 hace 4 semanas — el costo de migrar a React ahora es alto pero **no descartable** si la UX lo requiere.

El editor PRO-MAX fue diseñado en brainstorming colaborativo (skill `superpowers:brainstorming`) y ejecutado con metodología `subagent-driven-development`. El plan ejecutable es público en el repo y los SHAs de commits están trackeados.

**Meta honesta:** un dueño de tienda colombiano sin formación que pueda armar y mantener su home **sin frustración**. Cualquier sugerencia tuya que acerque a esa meta es bienvenida.

Si necesitás screenshots, dame URLs específicas a navegar y los tomo. Si necesitás acceso al panel admin con cuenta de test, decímelo y te lo paso por canal privado.

— Jorge Valbuena, AIMMA Colombia · virtana.comercial@gmail.com
