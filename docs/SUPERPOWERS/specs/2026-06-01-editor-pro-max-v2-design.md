# AIMMA Tienda IA · Fase 12.C · Editor PRO-MAX Wix-like (v2)

**Fecha:** 2026-06-01
**Autor:** Claude Opus 4.7 + Jorge Valbuena (brainstorming colaborativo)
**Status:** SPEC aprobado conceptualmente — pendiente revisión final Jorge
**Reemplaza:** `2026-05-31-editor-pro-max-design.md` (v1, paradigma Section JSON simple)
**Estimado:** ~6 semanas (1 dev full-time) o ~4 semanas paralelizado

---

## 1. Resumen ejecutivo

Editor visual tipo Wix Studio / Squarespace Fluid Engine integrado en el panel admin de Tienda IA. Permite al dueño de la tienda construir el contenido de su home page mediante secciones (franjas verticales) que contienen elementos (texto, imagen, botón, productos, formulario) posicionados libremente dentro de un **grid responsive de 24 columnas**. Incluye generación con IA (Claude Haiku 4.5 + Sonnet 4.6) que consume tokens del plan de la tienda.

**Filosofía:** AIMMA es plataforma SaaS, no marketplace. El editor es herramienta para que el dueño construya SU tienda; AIMMA garantiza solo la infraestructura técnica.

**Compatibilidad:** las 3 tiendas activas (Maraldo, Dimac, aimma-test) y el resto de clientes siguen funcionando con plantilla default si no activan el editor — adopción gradual sin migración forzada.

---

## 2. Decisiones aprobadas por Jorge durante brainstorming

| # | Decisión | Opción elegida |
|---|---|---|
| 1 | Paradigma de edición | **Fluid Engine pattern** (grid 24-col responsive con drag libre dentro). NO free-positioning Wix clásico. NO Section JSON Shopify rígido |
| 2 | Sub-páginas vs tabs | **Sub-páginas reales** con URLs propias (Fase 2 post-MVP). NO tabs widget |
| 3 | Plantilla vs Editor | **Híbrido**: plantilla activa = SKIN (fonts/colors/motion), Editor reemplaza CONTENIDO del home |
| 4 | Alcance MVP | **Pack básico + IA generativa**: 8 secciones (Hero/Texto/Imagen/Botones/Productos/Galería/Espaciador/Formulario) + 5 acciones IA |
| 5 | UX de edición | **Opción C — Full visual con drag libre dentro** (interpretado como Fluid Engine grid 24-col + snap a celdas, NO free pixel-positioning) |
| 6 | Modelo de cobro IA | **Opción 3 — Default + Upgrade**: todos los planes ven botón "Generar Haiku" + botón "Generar Premium Sonnet" |
| 7 | Drag-drop library | SortableJS 13KB (reorder sections) + GridStack.js 35KB (drag elementos en grid) |

---

## 3. Arquitectura general

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DUEÑO (Easypanel admin)                CLIENTE FINAL (CF Worker)        │
│                                                                          │
│  Editor Panel (vanilla JS)              Storefront Astro 5 SSR           │
│  - SortableJS + GridStack               - BlockRenderer dispatcher       │
│  - 3 paneles (sidebar/canvas/inspector) - 32 archivos block variants     │
│  - Auto-save draft 30s                  - Grid 24-col CSS responsive     │
│           │                                       ▲                       │
│           │ POST /functions/v1/tienda-guardar-    │ GET render            │
│           │      layout                            │                       │
│           ▼                                       │                       │
│  ┌──────────────────────────────────────────────────────────────┐        │
│  │              Supabase BD                                      │        │
│  │  tiendas.personalizaciones JSONB                              │        │
│  │  { schema_version: 2, theme: {...}, pages: { home: {...} } } │        │
│  └──────────────────────────────────────────────────────────────┘        │
│           │                                       ▲                       │
│           │ invalidate                            │ KV miss → fetch fresh │
│           ▼                                       │                       │
│  Cloudflare KV TENANT_CACHE (TTL 60s) ◄──────────┘                       │
│                                                                          │
│  IA: POST /functions/v1/editor-ai-generate                               │
│       ├─ Reserva tokens (RPC reservar_tokens_v2 — sistema existente)     │
│       ├─ Llama Anthropic API (Haiku o Sonnet)                            │
│       ├─ Zod-valida output SectionSchema                                 │
│       ├─ Confirma consumo tokens reales                                  │
│       └─ Devuelve section JSON al editor                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**Stack:**
- **Editor admin:** vanilla JS coherente con resto del panel (no React). SortableJS 13KB + GridStack.js 35KB en `iapanel/tienda/admin/lib/`
- **Storefront:** Astro 5 SSR existente. Nuevos componentes en `apps/storefront/src/components/blocks/`
- **BD:** reusa `tiendas.personalizaciones jsonb` existente (NO tabla nueva). Schema ampliado: `{ pages, theme, schema_version }`
- **EFs nuevas:** `tienda-guardar-layout`, `editor-ai-generate`
- **CSS:** Grid + Container Queries nativos. Reusa CSS vars de plantillas activas (`--ta-color-*`, `--ta-font-*`)
- **IA:** Anthropic SDK directo (no Vercel AI SDK). Claude Haiku 4.5 + Sonnet 4.6 con `output_config.format: json_schema` strict

---

## 4. Data Model

### 4.1 Schema raíz (`tiendas.personalizaciones jsonb`)

```jsonc
{
  "schema_version": 2,
  "theme": {
    "color_primary": "#1B4965",       // overrides paleta plantilla (null = usar paleta)
    "color_accent": "#5FA8D3",
    "font_display_url": null,         // null = usar fonts plantilla
    "font_body_url": null
  },
  "pages": {
    "home": {
      "version": 1,
      "updated_at": "2026-06-01T10:00:00Z",
      "sections": [ /* array de SectionSchema */ ]
    }
    // Fase 2 post-MVP:
    // "quienes-somos": { sections: [...] },
    // "blog": { sections: [...] }
  }
}
```

### 4.2 SectionSchema

```ts
type Section = {
  id: string;                       // nanoid 4 chars, ej "sec_a3f2"
  tipo: 'hero' | 'texto' | 'imagen' | 'botones' | 'productos' |
        'galeria' | 'espaciador' | 'formulario';
  altura_filas: number;             // 1-50 (1 row = 60px desktop)
  fondo: {
    tipo: 'color' | 'imagen' | 'gradient' | 'transparente';
    valor: string;                  // hex, url, CSS gradient
    overlay?: { color: string; opacity: number };
  };
  padding: 'sm' | 'md' | 'lg' | 'xl';
  elementos: Element[];             // max 30
};
```

### 4.3 ElementSchema (discriminated union)

```ts
type Element = {
  id: string;                       // ej "el_x9k1"
  tipo: 'texto' | 'imagen' | 'boton' | 'productos' | 'galeria' |
        'form_field' | 'embed' | 'divisor';
  grid: {
    col_start: number;              // 1-24
    col_end: number;                // 2-25 (exclusivo)
    row_start: number;
    row_end: number;
  };
  grid_mobile?: {                   // override OPCIONAL para mobile
    orden: number;                  // null = orden vertical desktop auto
    col_start: number;
    col_end: number;
  };
  estilo: {
    color_texto?: string | null;    // null = usa tokens plantilla
    alineacion: 'left' | 'center' | 'right';
    tamaño: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
    peso: 'normal' | 'medium' | 'semibold' | 'bold';
  };
  props: { /* específico por tipo */ };
  ai_generated?: {                  // metadata opcional si IA generó este element
    generated_at: string;
    model: 'claude-haiku-4-5' | 'claude-sonnet-4-6';
    prompt: string;
    tokens_consumidos: number;
  };
};
```

### 4.4 Props por tipo de Element

| Tipo | Props específicas |
|---|---|
| `texto` | `contenido` (string, max 5000), `formato` opcional rich (negrita/cursiva inline) |
| `imagen` | `src`, `alt`, `objeto` (cover/contain), `link_url?`, `aspect_ratio?` |
| `boton` | `texto`, `url`, `estilo_visual` (primary/secondary/ghost/outline), `target` (_self/_blank), `icono?` |
| `productos` | `categoria_id?`, `limite` (1-12), `orden` ('recientes'/'precio_asc'/'precio_desc'/'manual'), `columnas` (auto/2/3/4), `mostrar_precio` (bool) |
| `galeria` | `imagenes` (array {src, alt}), `layout` ('grid'/'carrusel'/'mosaico'), `gap` ('tight'/'normal'/'loose') |
| `form_field` | `tipo_campo` ('text'/'email'/'tel'/'select'/'textarea'/'checkbox'), `label`, `placeholder?`, `requerido` (bool), `opciones?` (para select) |
| `embed` | `html` (sanitizado DOMPurify), `aspect_ratio` ('16:9'/'4:3'/'1:1') |
| `divisor` | `estilo` ('linea'/'punto'/'icono'), `color` |

### 4.5 Validación Zod compartida

Archivo: `packages/database/src/editor-schema.ts` (nuevo).
Usado en:
1. EF `tienda-guardar-layout` (validate body)
2. Storefront BlockRenderer (type-safe iteration)
3. Editor panel admin (validate before save + auto-gen inspector forms desde schema)

### 4.6 Política de fallback

Si el JSON al cargar en storefront tiene errores:
1. **No romper la tienda** — renderiza plantilla default
2. Log warning en CF Worker para debugging
3. Marca `personalizaciones_invalid: true` para que panel admin alerte al dueño

### 4.7 Compatibilidad con tiendas existentes

- Si `personalizaciones.pages.home` ausente/null → Storefront renderiza plantilla por defecto (estado actual de Fase 9)
- Si existe → BlockRenderer toma control
- **Cero migración requerida**

### 4.8 Límites de seguridad

| Límite | Valor | Razón |
|---|---|---|
| Sections por página | 20 | UX research bounce 4x con >20 |
| Elementos por section | 30 | Cluttering + perf |
| Altura section | 50 filas | Anti-scroll-infinito |
| Total `personalizaciones` | 2 MB | Postgres jsonb soft cap |
| URLs imagen | HTTPS + whitelist | Anti-XSS |
| Texto element | 5000 chars + DOMPurify | Anti-XSS/DoS |
| URLs button | `https:` / `mailto:` / `tel:` / `wa.me/` solo | Anti-phishing |

---

## 5. Editor UI Layout

### 5.1 Desktop (≥1280px)

3 paneles fijos:

```
┌────────────────────────────────────────────────────────────────────┐
│ TOOLBAR (56px): Volver | Device toggle | Undo/Redo | IA | Guardar  │
├──────────┬─────────────────────────────────────┬───────────────────┤
│ SIDEBAR  │           CANVAS                     │  INSPECTOR        │
│ izquierdo│        (preview live con grid)       │  derecho          │
│ 240px    │                                      │  320px            │
│          │  - Render con plantilla activa       │                   │
│ Pages    │  - Grid 24-col visible (opacity 0.08)│  Contextual:      │
│  • Home  │  - Drag handles en elementos         │   - Nada sel:     │
│          │  - Resize handles 4 esquinas         │     panel Insertar│
│ + Nueva  │  - Click vacío en grid: + agregar    │   - Sección sel:  │
│  (Fase 2)│                                      │     fondo/padding │
│          │                                      │   - Elemento sel: │
│ Outline  │                                      │     props del tipo│
│  sections│                                      │     + grid + estilo│
│          │                                      │                   │
│ + Nueva  │                                      │                   │
│  sección │                                      │                   │
└──────────┴─────────────────────────────────────┴───────────────────┘
```

### 5.2 Mobile (<768px, dueño edita desde celular)

```
┌────────────────────────────┐
│ ◄ Editor   🔧 Inspector    │
├────────────────────────────┤
│  Canvas (viewport mobile)  │
│  Banner sutil:             │
│  "Edición desde celular.   │
│   Mejor experiencia en     │
│   desktop."                │
└────────────────────────────┘
```

Sidebar e Inspector se abren como **bottom sheets** al tap del botón correspondiente. Drag funcional pero más lento. Recomendamos al dueño editar en desktop.

### 5.3 Auto-save y save manual

- **Auto-save** cada 30s en `personalizaciones.pages.home_draft`
- **Save manual** (botón Guardar):
  - Promueve `home_draft` → `home`
  - Invalida KV via `POST /internal/invalidate-kv` (Fase 12.A LIVE)
  - Storefront refresca en ~10s globalmente

### 5.4 Undo/Redo

- 20 snapshots en memoria del editor
- Botones ↶ ↷ en toolbar
- Atajos teclado: Ctrl+Z / Ctrl+Shift+Z

### 5.5 Cleanup al cerrar editor sin guardar

Modal "¿Descartar cambios?":
- Confirmar → revierte a último publicado
- El draft queda en BD por 7 días para retomar

---

## 6. Catálogo de 8 secciones MVP

**8 secciones × 4 plantillas = 32 combinaciones**, pero `Espaciador` no tiene variantes (solo altura/fondo) → **29 archivos `.astro` reales** en `apps/storefront/src/components/blocks/`.

### Hero
- Banner principal de impacto. Altura sugerida 8-12 filas.
- Elementos típicos: título grande + subtítulo + CTA + imagen.
- Variantes plantilla en font sizing + image aspect + button style.

### Texto rico
- Narrativa de marca, párrafos. Altura 4-8 filas.
- Solo formato básico (negrita/cursiva/link inline). NO HTML libre (XSS).
- Variantes: prose Inter / IBM Plex / Fraunces italic / Cormorant editorial.

### Imagen banner
- Visual full-width destacado. Altura 6-10 filas.
- Imagen como fondo + overlay opcional + texto/CTA encima.

### Botones
- Fila CTAs (WhatsApp, ubicación, redes). Altura 2-3 filas.
- 1-4 botones inline, distribución (left/center/right/space-between).
- URLs validadas: `https:`/`mailto:`/`tel:`/`wa.me/`.

### Productos
- Grid productos filtrado por categoría. Altura 8-12 filas.
- Props: `categoria_id`, `limite` (4-12), `orden`, `columnas`, `mostrar_precio`.
- Reusa ProductCard por plantilla existente (Fashion Bold / Industrial Clean / Minimal Artesanal / Editorial Magazine).

### Galería
- Lookbook / imágenes inspiracionales. Altura 6-10 filas.
- Layouts: grid uniforme / carrusel horizontal / mosaico bento.
- 3-12 imágenes max, 2MB cada una.

### Espaciador
- Respiro vertical entre secciones. Altura 1-4 filas.
- Sin elementos. Idéntica en 4 plantillas (solo altura + fondo).

### Formulario
- Captura leads / contacto custom. Altura 6-10 filas.
- 1-8 campos: text/email/tel/textarea/select/checkbox.
- Destinos: email dueño / panel admin Submissions / webhook URL custom.
- Anti-spam: honeypot + rate limit IP CF (10/hora).

---

## 7. IA Integration

### 7.1 Casos de uso

| Acción | Modelo recomendado | Tokens típicos |
|---|---|---|
| Generar sección suelta | Haiku 4.5 | 500-1500 |
| Generar página completa (6-8 sections) | Sonnet 4.6 | 5000-12000 |
| Mejorar texto seleccionado | Haiku | 400-1000 |
| Reescribir sección existente | Haiku | 800-2000 |
| Sugerir paleta + fonts | Haiku | 500-1500 |

### 7.2 Modelo de cobro: Default + Upgrade (Opción 3)

Todos los planes ven en el modal:

```
[ ✨ Generar (Haiku, ~500tk) ]
─ o ─
[ 💎 Generar premium (Sonnet, ~3000tk) ]

Tokens disponibles: 12,400
```

El dueño elige; el sistema descuenta tokens del pack del plan vigente (PRO o PRO-MAX).

### 7.3 EF nueva: `editor-ai-generate`

```
POST /functions/v1/editor-ai-generate
Auth: JWT del dueño (verify_jwt=true)

Body:
{
  accion: 'generar_seccion' | 'generar_pagina' | 'mejorar_texto' | 'sugerir_estilo',
  tipo_seccion?: 'hero' | 'texto' | ...,
  prompt: string,
  modelo: 'haiku' | 'sonnet',
  contexto_seccion_actual?: SectionType
}

Response success:
{
  success: true,
  section: SectionType,
  tokens_consumidos: number,
  modelo_usado: string,
  duracion_ms: number
}

Response error:
{ error: 'tokens_insuficientes' | 'invalid_output' | 'rate_limit' | 'api_timeout' }
```

### 7.4 Flujo interno EF

1. Verify JWT dueño (verify_jwt=true)
2. Estimar tokens necesarios según `accion` + `modelo`
3. RPC `reservar_tokens_v2(tienda_id, tokens_estimados)` (sistema existente)
4. Si reserva falla: return `tokens_insuficientes`
5. Llamar Anthropic API con system prompt + JSON schema strict
6. Stream response
7. Zod validate output contra `SectionSchema`
8. Si invalid: retry 1 vez con prompt reforzado
9. RPC `confirmar_consumo_tokens(reserva_id, tokens_reales)`
10. Insert auditoría en `editor_ai_generations`
11. Return JSON al cliente

### 7.5 System prompt (template)

```
Sos un asistente de diseño para AIMMA Tienda IA.

REGLAS:
1. Output JSON válido SectionSchema (te paso el schema)
2. Tono comercial colombiano natural
3. Texto conciso: max 80 chars títulos, max 200 subtítulos
4. NUNCA inventes URLs imagen — usa placeholders `https://placehold.co/...`
5. Respeta límites schema (max 30 elementos/sección)
6. Considera mobile-first

CONTEXTO TIENDA:
- Nombre: {tienda.nombre_negocio}
- Plantilla: {tienda.plantilla.slug}
- Paleta primary/accent
- Categorías
- Top 3 productos

ACCIÓN: {accion}: {prompt_usuario}
OUTPUT: JSON solo, sin markdown.
```

### 7.6 Tabla auditoría

```sql
CREATE TABLE editor_ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id uuid REFERENCES tiendas(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  accion text NOT NULL,
  tipo_seccion text,
  modelo text NOT NULL,
  prompt text NOT NULL,
  tokens_input int,
  tokens_output int,
  exito boolean,
  duracion_ms int,
  created_at timestamptz DEFAULT now()
);

-- RLS: solo el dueño puede leer sus generaciones
ALTER TABLE editor_ai_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_read" ON editor_ai_generations FOR SELECT
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));
```

### 7.7 Pricing referencial

Asumiendo Claude Haiku 4.5 $1/$5/M y Sonnet 4.6 $3/$15/M, margen 3x AIMMA:

| Acción | Modelo | Costo AIMMA |
|---|---|---|
| Sección Hero | Haiku | ~$85 COP |
| Página completa | Sonnet | ~$1200 COP |
| Mejorar texto | Haiku | ~$25 COP |

Pack sugerido inicial:
- **PRO básico:** 50,000 tokens/mes
- **PRO-MAX:** 250,000 tokens/mes

(Jorge define precios finales al lanzar.)

---

## 8. Fases de implementación

### 12.C.1 — Foundation (Semana 1)

1. `packages/database/src/editor-schema.ts` — Zod schemas
2. `apps/storefront/src/components/BlockRenderer.astro` — dispatcher inicial con placeholders
3. `apps/storefront/src/pages/index.astro` — branch if/else: si `pages.home` existe usa BlockRenderer, else fallback actual
4. Test manual: hardcoded JSON en BD aimma-test → ver outline sin estilo

### 12.C.2 — Storefront blocks Industrial Clean (Semana 2)

5. 8 archivos en `apps/storefront/src/components/blocks/`:
   - `hero/HeroIndustrialClean.astro`
   - `texto/TextoIndustrialClean.astro`
   - ... (8 total)
6. Cada uno implementa grid 24-col CSS responsive + Container Queries
7. Test: home aimma-test con todas las 8 secciones renderizando

### 12.C.3 — Storefront blocks 3 plantillas restantes (Semana 3)

8. 24 archivos: Fashion Bold + Minimal Artesanal + Editorial Magazine (8 × 3)
9. BlockRenderer recibe `tienda.plantilla.slug` y elige archivo correcto
10. Test cada combinación de las 4 plantillas con misma `pages.home`

### 12.C.4 — Editor UI panel admin (Semanas 4-5)

11. Sidebar admin: agregar item "Editor visual"
12. `iapanel/tienda/admin/views/editor/` (carpeta nueva):
    - `editor.js`, `editor-state.js`, `editor-canvas.js`, `editor-sidebar.js`, `editor-inspector.js`, `editor-toolbar.js`, `editor-blocks/*.js`, `editor-styles.css`
13. Install SortableJS + GridStack.js locales
14. EF nueva: `supabase/functions/tienda-guardar-layout/index.ts`
    - Verify JWT
    - Zod validate
    - Upsert tiendas.personalizaciones
    - Invalidate KV
15. Auto-save draft 30s + Save manual
16. Undo/Redo 20 snapshots
17. Cleanup modal al cerrar sin guardar

### 12.C.5 — IA Integration (Semana 5-6)

18. EF nueva: `supabase/functions/editor-ai-generate/index.ts`
19. Reusa RPC `reservar_tokens_v2` + `confirmar_consumo_tokens` (sistema existente Fase 1)
20. Modal "✨ Generar IA" en editor.js
21. Tabla `editor_ai_generations` para auditoría
22. **[Tipo B Jorge]** Configurar secret `ANTHROPIC_API_KEY` en Supabase Edge Functions Dashboard

### 12.C.6 — Test E2E + audit + deploy (0.5 sem)

23. Test manual completo en aimma-test
24. `/impeccable detect` sobre los 32 archivos blocks
25. `code-reviewer` agent sobre las 2 EFs nuevas
26. Build + deploy CF Worker
27. **[Tipo B Jorge]** Redeploy Easypanel para activar editor.js en panel
28. Commit + push + memoria

### Total: ~6 semanas (1 dev), ~4 semanas paralelizado

Si despliego agentes en paralelo (blocks + editor UI simultáneo después de Fase 12.C.1), ahorro ~30% tiempo pero subo riesgo coordinación.

---

## 9. Riesgos y mitigaciones

### Técnicos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Performance canvas >50 elementos | Límite 30/sección + virtualize Fase 2 |
| 2 | CSS Container Queries soporte | Polyfill solo si <2% tráfico |
| 3 | Output IA JSON inválido | `output_config.format: json_schema` strict + Zod + retry |
| 4 | Race condition draft vs save manual | Locking optimista timestamp |
| 5 | Tokens insuficientes mid-generation | RPC reservar PRIMERO |
| 6 | KV cache stale | `/internal/invalidate-kv` LIVE (Fase 12.A) |
| 7 | Multi-tenant token leak | RLS existente + EF verify owner |
| 8 | Cambio plantilla rompe layout | TEST CRÍTICO Fase 12.C.3 |
| 9 | Imagen URL externa 404 | onerror fallback placeholder |
| 10 | SortableJS/GridStack iOS Safari bugs | Test E2E real Fase 12.C.6 |
| 11 | XSS via prompt IA | DOMPurify + system prompt instruye NO HTML |

### UX/Producto

| # | Riesgo | Mitigación |
|---|---|---|
| 12 | Dueño hace algo monstruoso | Plantilla preserva tokens, dueño no puede romper design system |
| 13 | No entiende grid 24-col | Onboarding modal primera vez + tooltips |
| 14 | Confusión draft vs publicado | Badge "Draft" + banner "tienes cambios sin publicar" |
| 15 | Mobile editor limitado | Banner "Mejor experiencia en desktop" |
| 16 | Form spam sin captcha | Honeypot + CF rate limit (Cloudflare Turnstile Fase 13) |
| 17 | Imagen sin uploader Storage | URLs externas MVP. Storage Fase 13 |

### Comerciales

| # | Riesgo | Mitigación |
|---|---|---|
| 18 | Pack tokens agotado mid-month | Modal upgrade pack |
| 19 | Anthropic API outage | Editor manual sigue, IA deshabilitada con mensaje |
| 20 | Margen 3x insuficiente | Monitoring primer mes + ajuste |
| 21 | Sub-páginas demandadas | Roadmap visible "Próximamente" |

---

## 10. Lo que NO está en MVP

- ❌ Sub-páginas (`/quienes-somos`, `/blog`) → Fase 2 post-MVP
- ❌ Tabs widget dentro de páginas → Fase 2
- ❌ Custom CSS / código libre → siempre (XSS)
- ❌ Uploader Supabase Storage para imágenes → Fase 13
- ❌ Animations custom configurables → plantilla lo cubre
- ❌ Versionado histórico pages → Fase 13
- ❌ Templates página pre-armados → Fase 13
- ❌ Marketplace bloques third-party → nunca (security)
- ❌ Conditional logic en forms → MVP solo lineal
- ❌ Edición colaborativa multi-user → no aplica
- ❌ Edit-on-mobile completo → MVP solo preview
- ❌ A/B testing layout → Fase 14+

---

## 11. Decisiones pendientes

| # | Pregunta | Cuándo se decide |
|---|---|---|
| Q1 | ¿Paralelo agentes en Fase 12.C.2-4? | Antes Fase 12.C.4 |
| Q2 | ¿Migración auto al cambiar plantilla? | Fase 12.C.3 test E2E |
| Q3 | ¿Edit-on-mobile completo Fase 13? | Post-MVP |
| Q4 | ¿Onboarding tour primer uso? | Fase 12.C.6 |
| Q5 | ¿Migrar Maraldo/Dimac a editor o quedan plantilla default? | Decisión Jorge antes launch público |
| Q6 | Pricing exacto packs PRO / PRO-MAX | Jorge define con métricas reales primer mes |

---

## 12. Métricas de éxito

| Métrica | +1 mes | +3 meses |
|---|---|---|
| % tiendas que activan editor | 30% | 60% |
| % tiendas que usan IA 1x+ | 20% | 50% |
| Tokens consumidos promedio | - | 15K-30K |
| Tickets "se rompió mi tienda" | <5/mes | <10/mes |
| Conversion PRO → PRO-MAX | +10% | +25% |

---

## 13. Apéndice: archivos a crear

### Storefront (Astro 5)
- `apps/storefront/src/components/BlockRenderer.astro` (NEW)
- `apps/storefront/src/components/blocks/hero/Hero{FashionBold,IndustrialClean,MinimalArtesanal,EditorialMagazine}.astro` (4)
- ... (8 secciones × 4 plantillas = 32 archivos)
- `apps/storefront/src/components/blocks/espaciador/Espaciador.astro` (1, sin variantes — total real: 29 archivos)
- `apps/storefront/src/pages/index.astro` (MODIFY: branch if pages.home)

### Edge Functions (Supabase)
- `supabase/functions/tienda-guardar-layout/index.ts` (NEW)
- `supabase/functions/editor-ai-generate/index.ts` (NEW)

### Packages
- `packages/database/src/editor-schema.ts` (NEW: Zod schemas compartidos)

### Panel admin (Easypanel)
- `iapanel/tienda/admin/views/editor/editor.js` (NEW)
- `iapanel/tienda/admin/views/editor/editor-state.js` (NEW)
- `iapanel/tienda/admin/views/editor/editor-canvas.js` (NEW)
- `iapanel/tienda/admin/views/editor/editor-sidebar.js` (NEW)
- `iapanel/tienda/admin/views/editor/editor-inspector.js` (NEW)
- `iapanel/tienda/admin/views/editor/editor-toolbar.js` (NEW)
- `iapanel/tienda/admin/views/editor/editor-blocks/{hero,texto,imagen,boton,productos,galeria,form_field,embed,divisor}.js` (9)
- `iapanel/tienda/admin/views/editor/editor-styles.css` (NEW)
- `iapanel/tienda/admin/lib/sortable.min.js` (vendored)
- `iapanel/tienda/admin/lib/gridstack.min.js` (vendored)
- `iapanel/tienda/admin/lib/gridstack.min.css` (vendored)
- `iapanel/tienda/admin/index.html` (MODIFY: agregar nav item + script tag)
- `iapanel/tienda/admin/admin.js` (MODIFY: agregar 'editor' a ROUTES)

### BD
- Migration: tabla `editor_ai_generations` (NEW)
- NO migration en `tiendas` (reusa columna existente `personalizaciones jsonb`)

---

## 14. Apéndice: ejemplo JSON completo

Hero de Maraldo armado con el editor:

```json
{
  "id": "sec_a3f2",
  "tipo": "hero",
  "altura_filas": 12,
  "fondo": {
    "tipo": "color",
    "valor": "#1B4965"
  },
  "padding": "lg",
  "elementos": [
    {
      "id": "el_titulo",
      "tipo": "texto",
      "grid": { "col_start": 1, "col_end": 13, "row_start": 2, "row_end": 7 },
      "grid_mobile": { "orden": 1, "col_start": 1, "col_end": 25 },
      "estilo": { "tamaño": "3xl", "peso": "bold", "color_texto": "#FFFFFF", "alineacion": "left" },
      "props": { "contenido": "ZAPATOS QUE TRANSFORMAN" }
    },
    {
      "id": "el_subtitulo",
      "tipo": "texto",
      "grid": { "col_start": 1, "col_end": 13, "row_start": 7, "row_end": 9 },
      "grid_mobile": { "orden": 2, "col_start": 1, "col_end": 25 },
      "estilo": { "tamaño": "lg", "peso": "normal", "color_texto": "#E0E7EE", "alineacion": "left" },
      "props": { "contenido": "Hechos para durar. Garantía 1 año." }
    },
    {
      "id": "el_imagen",
      "tipo": "imagen",
      "grid": { "col_start": 13, "col_end": 25, "row_start": 1, "row_end": 12 },
      "grid_mobile": { "orden": 4, "col_start": 1, "col_end": 25 },
      "estilo": { "alineacion": "center", "tamaño": "lg", "peso": "normal" },
      "props": {
        "src": "https://maraldo.aimma.com.co/storage/hero-zapatos.jpg",
        "alt": "Colección Maraldo otoño 2026",
        "objeto": "cover"
      }
    },
    {
      "id": "el_cta",
      "tipo": "boton",
      "grid": { "col_start": 1, "col_end": 7, "row_start": 9, "row_end": 11 },
      "grid_mobile": { "orden": 3, "col_start": 1, "col_end": 25 },
      "estilo": { "tamaño": "lg", "peso": "semibold", "alineacion": "left" },
      "props": {
        "texto": "Ver colección",
        "url": "#productos",
        "estilo_visual": "primary",
        "target": "_self"
      }
    }
  ],
  "ai_generated": {
    "generated_at": "2026-06-01T15:30:00Z",
    "model": "claude-haiku-4-5",
    "prompt": "Hero impactante para tienda de zapatos urbanos colombianos, navy + acento blanco",
    "tokens_consumidos": 1247
  }
}
```

---

## 15. Próximos pasos

1. **Jorge revisa este spec** y aprueba / pide cambios
2. Si aprobado → invocar skill `writing-plans` para crear plan de implementación detallado paso-a-paso
3. Plan ejecutable arranca con Fase 12.C.1 (Foundation)

**Owner del spec:** Jorge Valbuena
**Implementación:** Claude Opus 4.7 con agentes paralelos según permitan dependencias

---

*Spec generado durante sesión brainstorming colaborativa 2026-06-01.*
*Reemplaza spec previo `2026-05-31-editor-pro-max-design.md`.*
