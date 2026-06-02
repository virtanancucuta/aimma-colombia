# AIMMA Tienda IA · Editor PRO-MAX · Pedido de auditoría UX externa

**Para:** Claude Browse / consultor UX externo
**De:** Jorge Valbuena (founder AIMMA, consultor n8n/IA/automatización Colombia)
**Fecha:** 2026-06-02
**Contexto:** Editor visual estilo Wix/Shopify para que dueños de tiendas colombianas editen su home page sin saber código

---

## 1. Resumen del proyecto

**AIMMA Tienda IA** es un módulo SaaS multi-tenant dentro del Panel IA de AIMMA. Permite a PyMEs colombianas armar su tienda online sin saber código.

**Audiencia objetivo:** dueños de negocios colombianos sin conocimiento de UX/diseño/dev. Ejemplos reales actuales:
- Maraldo (calzado)
- Industrias Dimac (puntos retail)
- Kaybu (ropa deportiva)
- Surtishop (almacén de ropa)

**Stack del proyecto:**
- Storefront público: Astro 5 SSR + Cloudflare Workers + Supabase (4 plantillas activas: Industrial Clean / Fashion Bold / Minimal Artesanal / Editorial Magazine × 20 paletas de color)
- Panel admin: vanilla JS SPA (sin React/Vue) en `iapanel/tienda/admin/`
- Editor PRO-MAX (Plan 3, recién entregado): vanilla JS + SortableJS 1.15.6 + GridStack 11.5.0 sobre grid 24 columnas
- BD: Supabase Postgres con RLS multi-tenant
- 2 Edge Functions: tienda-guardar-layout, tienda-form-submit

**Pricing actual:** plan PRO $300K/mes (precio aspiracional, MP en producción)

---

## 2. URLs LIVE para que puedas testear

### Storefront público (esto SÍ funciona bien, es referencia de cómo se debe ver al final)
- **aimma-test:** https://aimma-test.tienda.aimma.com.co/ (plantilla industrial_clean, paleta corporate)
- **Maraldo:** https://maraldo.tienda.aimma.com.co/
- **Dimac:** https://dimac.tienda.aimma.com.co/

### Panel admin con el editor visual (esto NO está bien según el cliente)
- **URL:** https://aimma.com.co/iapanel/tienda/admin/#/editor
- **Login:** requiere cuenta admin AIMMA (Jorge tiene una de test)

---

## 3. Lo que se entregó en Plan 3 (Editor PRO-MAX)

### Lado backend (LIVE y funciona)
- **EF tienda-guardar-layout** v2: auto-save draft cada 30s + save manual con publish → invalidate KV
- **EF tienda-form-submit**: handler público de submits con honeypot + rate limit 10/h IP+tienda
- **BD migration**: `form_submissions` + `form_submission_notifications` + `form_submit_rate_limit` + flags `tiendas.editor_first_choice_at` / `editor_tour_visto_at` + `notif_email`
- **Storefront blocks**: 4 archivos `Formulario*.astro` MOD para postear a la EF + `_FormSubmitHandler.astro` DRY

### Lado frontend admin (LIVE pero usabilidad cuestionable)
- **#/editor:** vista con 3 paneles fijos
  - Sidebar izquierdo (240px): Pages + Outline de secciones + botón "+ Agregar sección"
  - Canvas central: grid 24-col visible con `linear-gradient` opacity 0.08
  - Inspector derecho (320px): props contextuales según selección

- **Bloques disponibles** (8 tipos): Banner principal (hero), Texto, Imagen, Botones, Productos, Galería, Espacio en blanco, Formulario

- **First-use modal:** al primer ingreso muestra 2 cards (Plantilla starter / Desde cero)

- **Tour overlay:** 3 pasos secuenciales (canvas / inspector / Ctrl+S)

- **Modal catálogo:** al click "+ Agregar sección" se abre modal con 8 thumbnails (icono emoji + título + descripción en castellano colombiano)

- **Inspector contextual:** cuando seleccionás un bloque, panel derecho muestra props editables (texto, color picker, sliders para posición, etc.) usando 6 helpers reusables (textInput, urlInput, colorPicker, slider, switch, select)

- **Atajos teclado:** Ctrl+Z undo (20 snapshots), Ctrl+Shift+Z redo, Ctrl+S guardar, Esc deselect, Delete eliminar

### 6º tab CRM "Mensajes"
- Lista form_submissions con badge no-leídos
- Modal detalle con campos labeled + IP + UA + botón "Responder por WhatsApp" si detecta tel CO

---

## 4. Feedback literal de Jorge Valbuena al probar

Cito textual lo que Jorge me dijo después de redeploy LIVE:

> "Pero editar así es casi imposible eso de hero nadie en colombia sabe que es eso ni yo y no se puede mover nada."

> "Cuando coloco plantillas no hay plantillas es una imagen blanca."

> "Lo actual es imposible que alguien edite no tiene plantilla el texto no se ve queda en una celda como de excel."

> "Es 0% parecido a wix y 0% parecido a shopify."

### Interpretación de esos comentarios:

1. **Copy técnico anglo:** "Hero" no se entiende en Colombia. Fix YA aplicado: "Hero" → "Banner principal", "Espaciador" → "Espacio en blanco", "Embed" → "Video o mapa", descripciones agregadas a cada thumbnail.

2. **No se puede mover nada:** el drag/resize de GridStack 11.x no estaba funcionando. Fix YA aplicado: cambié de `addWidget({content})` a crear DOM directo + `makeWidget(el)`. Pendiente confirmar empíricamente.

3. **Canvas como celda de Excel:** el canvas del editor renderea mockups *minimalistas* de los blocks (sin la plantilla aplicada). El usuario ve grid lines + texto plano sin estilos de la plantilla → percepción "Excel". **Este es el quiebre fundamental** vs Wix/Shopify donde el canvas muestra el preview EXACTO de cómo se va a ver.

4. **Plantillas no se aplican en preview:** Jorge dice ver "imagen blanca" cuando elige plantilla. El storefront público SÍ renderea con plantillas correctas (verificado curl). El bug puede ser que el iframe de vista previa interna no carga.

---

## 5. Lo que queremos pedirte

**Pregunta principal:** ¿Cómo lograr que este editor sea genuinamente usable por un dueño de tienda colombiano sin formación técnica, alcanzando un mínimo del 60-70% de la usabilidad de Wix Editor o Shopify Online Store 2.0?

**Constraints duros (no negociables):**
- **Stack:** vanilla JS panel admin (sin React/Vue — el resto del panel ya es vanilla JS y se mantiene así por consistencia y por evitar bundle weight). SortableJS + GridStack vendoreados.
- **Multi-tenant:** cada tienda es un subdominio `*.tienda.aimma.com.co` con CSS vars `--ta-color-*` y `--ta-font-*` específicas de su plantilla+paleta.
- **Storefront separado:** el render real es Astro SSR. El admin solo gestiona el JSON `personalizaciones.pages.home.sections` que el storefront lee.
- **No bundler en admin:** los archivos JS se cargan con `<script src>` directo. Cada archivo expone un namespace `window.TiendaIA.editorX`.

**Constraints semi-flexibles:**
- Tipografía y diseño del panel admin debe seguir el sistema actual (`--ta-color-*`, Exo 2 + JetBrains Mono)
- Copy en español natural colombiano con ñ correcta
- Mobile: aceptable que el editor sea "view-only" en mobile (banner "mejor en desktop")

### Mejoras específicas que vienen a mente (las nuestras, vos podés agregar más)

#### A. WYSIWYG real en el canvas (el quiebre fundamental)
- En vez de mockup minimalista, renderizar dentro del canvas un **iframe sandboxed con el storefront preview real** consumiendo el draft JSON
- O bien: importar los componentes del storefront al panel y montarlos en el canvas
- Tradeoff: implementación más compleja vs Wix/Shopify experience

#### B. Onboarding con templates pre-armados
- Más allá del "Plantilla starter / Desde cero", ofrecer **5-10 templates pre-armados** por industria: restaurante, retail-moda, retail-calzado, servicios, productos-belleza, etc.
- Cada template = JSON pre-poblado con copy + imágenes placeholder de placehold.co
- Tradeoff: hay que diseñar los 5-10 templates

#### C. Click-to-edit inline en vez de inspector lateral
- Click sobre un texto en canvas → input editable inline + popover de formato
- Click sobre una imagen → file picker + crop tool
- Reducir el "viaje del ojo" canvas ↔ inspector
- Tradeoff: GridStack + edición inline pueden colisionar

#### D. Reducir el grid 24-col a algo más natural
- Wix usa snap to columns (12 visible) con free positioning
- Shopify usa sections fixed sin grid editing (solo orden vertical)
- Quizá nuestro grid 24-col es demasiado libre para usuarios sin formación
- Tradeoff: limitar libertad de diseño vs pérdida de flexibilidad

#### E. Onboarding tour reforzado
- El tour actual son 3 pasos texto. Falta:
  - Animación de "drag this here" visual
  - Tooltips contextuales en cada control del inspector
  - Video tutorial 60s embebido (YouTube)
- Tradeoff: contenido a producir

#### F. Mejorar visualización de tipos complejos en canvas
- Actualmente "Productos" en canvas = caja gris con "Productos (8, recientes, auto col)"
- Mejor: thumbnail real de la grilla con 8 productos placeholder
- Mismo para Galería, Formulario, Embed

#### G. Mobile preview side-by-side
- Wix muestra mobile preview en panel lateral mientras editás desktop
- Ahora tenemos toggle desktop/mobile (one at a time)

### Lo que queremos de tu respuesta

1. **Priorización:** de A-G (y las que vos agregues), cuáles atacar primero. Justifica con impact/effort.

2. **Anti-patterns que detectes:** cosas que estamos haciendo mal estructuralmente. Sé brutal, queremos honestidad.

3. **Quick wins concretos** (cosas que se pueden hacer en <8h cada una): lista 5-10 con código pseudo o instrucciones específicas.

4. **Roadmap sugerido** dividido en:
   - **Plan 4 propuesto** (~2 semanas): los fixes UX más críticos
   - **Plan 5 propuesto** (~2 semanas): polish + IA (Claude Haiku 4.5 para generar contenido)
   - **Plan 6+ propuesto** (futuro): mobile editing real, A/B testing, marketplace de templates

5. **Referencias visuales:** screenshots o links de patrones específicos de Wix/Shopify/Webflow/Squarespace que apliquen a nuestro caso.

6. **Estimación honesta:** ¿es realista llegar al 60-70% de Wix con este stack vanilla JS, o conviene migrar a React/Astro Admin?

---

## 6. Archivos clave del proyecto

Si necesitás contexto técnico exacto, los archivos están públicamente en GitHub:

- Repo: https://github.com/virtanancucuta/aimma-colombia (público)
- Editor admin: `iapanel/tienda/admin/views/editor/`
  - `editor.js` (entry, monta UI, auto-save)
  - `editor-state.js` (singleton state + 20 snapshots undo/redo)
  - `editor-canvas.js` (SortableJS + GridStack init)
  - `editor-inspector.js` (panel derecho contextual)
  - `editor-controls.js` (helpers reusables)
  - `editor-first-use.js` (modal + tour + starter JSON)
  - `editor-modal-catalog.js` (8 thumbnails)
  - `editor-toolbar.js` (atajos teclado)
  - `editor-sidebar.js` (Pages + Outline)
- Storefront blocks: `apps/storefront/src/components/blocks/` (4 plantillas × 7 tipos × 1 block agnostic = 29 archivos)
- Specs: `docs/SUPERPOWERS/specs/2026-06-02-editor-pro-max-plan3-design.md`
- Plans: `docs/SUPERPOWERS/plans/2026-06-02-editor-pro-max-plan3.md` y `-part2.md`

---

## 7. Decisiones aprobadas durante el brainstorming Plan 3 (contexto)

Durante el diseño de Plan 3 yo (Claude) hice estas 11 decisiones con Jorge. Las menciono para que no propongas cambios que ya descartamos a sabiendas:

1. Form-submit dentro de Plan 3 (no diferir a Plan 5)
2. First-use UX híbrido state-of-art Wix Studio 2026 (Starter vs Desde Cero, no AI generation aún)
3. Tour overlay 3 pasos
4. Modal catálogo + botón "+ Agregar sección" (NO drag from sidebar — complejidad + iOS Safari frágil)
5. Inspector con helpers compartidos + hand-coded compose por tipo
6. Copy en español natural con ñ correcta + vocabulario localizado
7. Auto-save draft 30s debounced
8. Locking optimista con base_updated_at → 409 stale_layout
9. Undo/Redo 20 snapshots structuredClone + debounce 1000ms typing
10. Mensajes UX = 6º tab CRM (no sidebar item nuevo)
11. WhatsApp helper si detecta tel CO regex

---

## 8. Próximo paso

**Recibo tu sugerencia priorizada y la convierto en Plan 4 ejecutable.** Si tu propuesta requiere cambios de arquitectura (ej. migrar a React, usar iframe sandboxed), discutimos el costo antes de comprometernos.

Gracias por la ayuda. La meta es honesta: un dueño de tienda colombiano sin formación que pueda armar y mantener su home **sin frustración**.

— Jorge Valbuena, AIMMA Colombia · jorge@aimma.com.co
