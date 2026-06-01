# AIMMA Tienda IA · Editor PRO-MAX · Plan 3 (Editor UI admin + 2 EFs)

**Fecha:** 2026-06-02
**Autor:** Claude Opus 4.7 + Jorge Valbuena (brainstorming colaborativo)
**Status:** SPEC aprobado por Jorge — listo para writing-plans
**Implementa Fase del spec maestro:** 12.C.4 + parte de 12.C.6 del [spec v2 2026-06-01](./2026-06-01-editor-pro-max-v2-design.md)
**Reemplaza nada — extiende el spec maestro v2** con detalle ejecutable de Plan 3
**Plans previos cerrados LIVE:** Plan 1 (Foundation + Industrial Clean) HEAD `349cef7` · Plan 2 (21 blocks FB+MA+EM + dispatcher v2) HEAD `8e409d5`
**Estimado:** ~2 semanas (1 dev full-time)

---

## 1. Resumen ejecutivo

Plan 3 entrega el panel admin donde el dueño de la tienda construye el contenido de su home page mediante un editor visual tipo Wix Studio. Plans 1+2 dejaron LIVE solo el storefront público (renderer + 4 plantillas × 7 blocks + Espaciador). Plan 3 cierra el loop end-to-end:

1. Vista `#/editor` en `iapanel/tienda/admin/` (vanilla JS coherente con el resto del panel)
2. 3 paneles fijos: Sidebar (Pages + Outline) · Canvas (SortableJS + GridStack) · Inspector (helpers compartidos + hand-coded por tipo)
3. First-use flow híbrido (modal Starter / Desde Cero + tour overlay)
4. EF `tienda-guardar-layout` con Zod validation server-side + locking optimista + invalidate KV en publish
5. EF `tienda-form-submit` para handle de los blocks Formulario LIVE (cierra el gap de los 4 `Formulario*.astro` que actualmente POST a 404)
6. 6º tab "Mensajes" dentro del CRM existente para que el dueño vea las submissions
7. BD migration consolidada (form_submissions + notif queue + rate limit + flags first-use)

**Filosofía:** mismo principio del spec v2 — AIMMA es plataforma SaaS, el dueño construye SU tienda, AIMMA garantiza infraestructura técnica. Adopción gradual: tiendas existentes (Maraldo/Dimac) siguen con fallback Fase 9 hasta que activen el editor.

**Salida LIVE de Plan 3:**
- Dueño puede entrar a `iapanel/tienda/admin/#/editor`, elegir Starter o Desde Cero, construir su home con drag/resize sobre grid 24-col, editar props via Inspector, deshacer/rehacer, auto-save draft cada 30s, publicar con Ctrl+S
- Storefront refleja cambios en < 10s post-publicación (Plan 1+2 ya lo soporta vía KV invalidate)
- Formularios del storefront capturan submissions reales (no 404)
- Dueño ve mensajes recibidos en CRM > Mensajes con badge no-leídos
- Botón "Responder por WhatsApp" si el submission tiene teléfono colombiano

**Lo que NO entrega Plan 3 (queda para Plans 4-5):**
- IA generativa (botón "Generar con IA" aparece pero disabled con tooltip "Próximamente") — Plan 4
- Envío real del email de notificación — Plan 3 deja stub en cola `form_submission_notifications`, Plan 5 monta worker que las procesa con Resend o Supabase SMTP
- Cloudflare Turnstile captcha — Plan 5
- Storage uploader de imágenes (sigue siendo URLs externas) — Fase 13 según spec maestro
- Sub-páginas reales (quienes-somos, blog) — Fase 2 post-MVP según spec maestro
- Edit-on-mobile completo — banner "mejor en desktop" en MVP

---

## 2. Decisiones aprobadas por Jorge durante brainstorming Plan 3

| # | Decisión | Opción elegida |
|---|---|---|
| 1 | Scope EF form-submit | **Dentro de Plan 3.** Si el editor permite crear formularios pero el submit es 404, ningún cliente puede usar ese bloque en producción |
| 2 | First-use UX | **Híbrido (state-of-art Wix Studio 2026):** modal con 2 caminos — Plantilla Starter (recomendado) o Desde Cero — guardado en `tiendas.editor_first_choice_at` para no preguntar dos veces |
| 3 | Tour overlay | 3 pasos cerrable (canvas / inspector / Ctrl+S) registrado en `tiendas.editor_tour_visto_at` para no repetir |
| 4 | Add-section UX | **Modal catálogo + botón "+ Agregar sección".** SortableJS solo reordena sections vertical. NO drag desde sidebar (complejo + iOS Safari frágil). GridStack maneja drag/resize de elements dentro del grid 24-col |
| 5 | Inspector pattern | **Helpers compartidos + hand-coded por tipo.** Librería interna `editor-controls.js` con 6 helpers (textInput / textarea / urlInput / select / colorPicker / slider / switch). Cada element type tiene su `renderInspector(el)` que compone. Customización total UX sin duplicar código |
| 6 | Copy visible al usuario | **Español natural con ñ correcta + vocabulario localizado.** "Diseñá tu página de inicio" (no "Disenia tu home"). "Iniciar sesión" (no "Login"). Keys internas de BD y código pueden seguir en ASCII (`pages.home`, `editor_state`) |
| 7 | Auto-save cadencia | 30s después del último cambio (debounced) en `personalizaciones.pages.home_draft` |
| 8 | Locking optimista | `base_updated_at` enviado por cliente; si server > cliente → 409 stale_layout + modal "Otro dispositivo modificó esta tienda" |
| 9 | Undo/Redo | 20 snapshots en memoria con `structuredClone`. Debounce 1000ms para typing/sliders (no por keystroke) |
| 10 | Mensajes UX | **6º tab dentro del CRM** (no sidebar item nuevo). Coherente con lifecycle mensaje → posible pedido → cliente |
| 11 | WhatsApp helper | Si submission tiene field con regex `^(\+57)?\d{10}$` → botón "Responder por WhatsApp" con `wa.me/57XXX?text=Hola%20{nombre}` |

---

## 3. Arquitectura general Plan 3

```
+-----------------------------------------------------------------+
|  DUEÑO (Easypanel admin)        STOREFRONT publico (CF Worker)  |
|                                                                 |
|  Panel Admin SPA vanilla JS    Astro 5 SSR (Plan 1+2 LIVE)      |
|                                                                 |
|  #/editor (NUEVO)              BlockRenderer (existente)        |
|   |-- editor-toolbar.js        |-- 4 plantillas x 7 blocks      |
|   |-- editor-sidebar.js        |-- Espaciador agnostico         |
|   |-- editor-canvas.js  ----+  |-- 4 Formulario*.astro          |
|   |     +-- SortableJS      |       (MOD: fetch a EF)           |
|   |     +-- GridStack       |                                   |
|   |-- editor-inspector.js   |                                   |
|   |-- editor-modal-catalog  |                                   |
|   |-- editor-first-use.js   |                                   |
|   |-- editor-controls.js    |                                   |
|   |-- editor-state.js       |                                   |
|   +-- editor.js             |                                   |
|                             |                                   |
|  POST /tienda-guardar-layout|                                   |
|       ^                     |                                   |
|       |                     |    POST /tienda-form-submit       |
|       |                     |    (publico, verify_jwt=false)    |
|       |                     |         ^                         |
|       v                     |         |                         |
|  +-------------------------------------+                        |
|  |       Supabase BD                   |                        |
|  |   tiendas.personalizaciones jsonb   |                        |
|  |   form_submissions (NUEVA)          |                        |
|  |   form_submission_notifications     |                        |
|  |   form_submit_rate_limit            |                        |
|  +-------------------------------------+                        |
|       |                                                         |
|       | invalidate                                              |
|       v                                                         |
|  Cloudflare KV TENANT_CACHE (TTL 60s)                           |
|                                                                 |
|  Plan 4 (futuro): IA editor-ai-generate                         |
+-----------------------------------------------------------------+
```

**Stack:**

- **Panel admin:** vanilla JS coherente. SortableJS 13KB + GridStack.js 35KB en `iapanel/tienda/admin/views/editor/lib/`
- **Storefront blocks Formulario:** Astro 5 SSR existente. Modificación quirúrgica del action + script inline DRY
- **BD:** reusa `tiendas.personalizaciones jsonb` (Plan 1). Migration consolidada para nuevas tablas
- **EFs nuevas:** `tienda-guardar-layout` (verify_jwt=true) y `tienda-form-submit` (verify_jwt=false, CORS *.tienda.aimma.com.co)
- **Validación:** Zod schemas compartidos en `packages/database/src/editor-schema.ts` (Plan 1) + copia server-side en `supabase/functions/_shared/editor-schema.ts` para Deno

---

## 4. Editor UI · Arquitectura archivos

**Ruta nueva:** `#/editor` agregada al hash router de `admin.js` (ROUTES).

**Carpeta nueva:** `iapanel/tienda/admin/views/editor/`

```
views/editor/
├── editor.js              ← entry, registra view + monta UI
├── editor-state.js        ← singleton state (sections, selection, dirty, snapshots)
├── editor-toolbar.js      ← top toolbar (volver / device / undo-redo / IA / guardar)
├── editor-sidebar.js      ← Pages + Outline + botón "+ Agregar sección"
├── editor-canvas.js       ← contenedor sections, init GridStack por section, init SortableJS
├── editor-inspector.js    ← panel derecho contextual (renderInspectorFor{Section,Element})
├── editor-modal-catalog.js← modal 8 thumbnails al agregar sección
├── editor-first-use.js    ← modal Starter/Desde Cero + tour overlay 3 pasos
├── editor-controls.js     ← helpers reusables (textInput/colorPicker/slider/select/urlInput/switch)
├── editor-styles.css      ← scoped, 3-paneles + grid lines + handles
└── lib/
    ├── sortable.min.js    ← 13KB vendored
    ├── gridstack.min.js   ← 35KB vendored
    └── gridstack.min.css  ← grid lines, handles
```

**Layout 3 paneles desktop ≥1280px:**

```
+------------------------------------------------------------+
| TOOLBAR 56px                                               |
+--------+------------------------------+--------------------+
| SIDEBAR| CANVAS (flex, scrollable)    | INSPECTOR          |
| 240px  | render in-place              | 320px              |
|        | grid lines opacity 0.08      | contextual         |
+--------+------------------------------+--------------------+
```

**Mobile <768px:** canvas full width, sidebar/inspector son bottom sheets con tap. Banner "Mejor experiencia en desktop" no bloqueante. Edit funcional pero más lento (esperado, no MVP).

---

## 5. First-use flow + tour

**Trigger:** al entrar a `#/editor`, leer `tienda.personalizaciones.pages.home` y `tienda.editor_first_choice_at`.

**Decisión arbol:**

```
abre #/editor
  |
  v
editor_first_choice_at IS NULL ?
  |                      |
  sí                     no
  |                      |
  v                      v
MODAL FIRST-USE         render editor con pages.home actual
[Starter] [Desde Cero]
  |
  +-- Starter elegido:
  |     - seed JSON Hero+Productos+Botones (fallback Fase 9 materializado, con placeholders intencionalmente bracketed "[Tu título aquí]")
  |     - UPDATE tiendas SET editor_first_choice_at = now()
  |
  +-- Desde Cero elegido:
  |     - canvas vacío con CTA gigante "+ Agregar sección"
  |     - UPDATE tiendas SET editor_first_choice_at = now()
  |
  v
TOUR overlay 3 pasos (solo si editor_tour_visto_at IS NULL)
  paso 1: "Este es tu canvas, podés mover las secciones"
  paso 2: "El inspector a la derecha edita la sección o elemento seleccionado"
  paso 3: "Ctrl+S guarda y publica los cambios"
  [Saltar] [Siguiente] / [Listo]
  |
  v
UPDATE tiendas SET editor_tour_visto_at = now()
```

**Modal first-use UI (copy en español natural con ñ):**

```
+--------------------------------------------------------------+
|                  Diseñá tu página de inicio                  |
|                                                              |
|  ¿Cómo querés arrancar?                                      |
|                                                              |
|  +--------------------+        +-----------------------+    |
|  | [thumbnail starter]|        |  [icon canvas vacío]  |    |
|  |                    |        |                       |    |
|  | Plantilla starter  |        |  Desde cero           |    |
|  | 3 secciones listas |        |  Canvas vacío.        |    |
|  | para editar        |        |  Vos agregás lo que   |    |
|  | (Recomendado)      |        |  quieras.             |    |
|  |                    |        |                       |    |
|  +--------------------+        +-----------------------+    |
|                                                              |
|                      [Cerrar X]                              |
+--------------------------------------------------------------+
```

**Starter JSON exacto** (factory function `seedStarterPage(tienda)`):

```json
{
  "version": 1,
  "updated_at": "2026-06-02T...",
  "sections": [
    {
      "id": "sec_hero01",
      "tipo": "hero",
      "altura_filas": 10,
      "fondo": { "tipo": "transparente", "valor": "" },
      "padding": "lg",
      "elementos": [
        {
          "id": "el_titulo",
          "tipo": "texto",
          "grid": { "col_start": 1, "col_end": 17, "row_start": 3, "row_end": 6 },
          "estilo": { "tamaño": "3xl", "peso": "bold", "alineacion": "left" },
          "props": { "contenido": "[Tu título aquí]" }
        },
        {
          "id": "el_subtitulo",
          "tipo": "texto",
          "grid": { "col_start": 1, "col_end": 17, "row_start": 6, "row_end": 8 },
          "estilo": { "tamaño": "lg", "peso": "normal", "alineacion": "left" },
          "props": { "contenido": "[Describí tu negocio en una frase]" }
        },
        {
          "id": "el_cta",
          "tipo": "boton",
          "grid": { "col_start": 1, "col_end": 7, "row_start": 8, "row_end": 10 },
          "estilo": { "tamaño": "lg", "peso": "semibold", "alineacion": "left" },
          "props": {
            "texto": "Ver productos",
            "url": "#productos",
            "estilo_visual": "primary",
            "target": "_self"
          }
        }
      ]
    },
    {
      "id": "sec_prods1",
      "tipo": "productos",
      "altura_filas": 10,
      "fondo": { "tipo": "transparente", "valor": "" },
      "padding": "md",
      "elementos": [
        {
          "id": "el_prods",
          "tipo": "productos",
          "grid": { "col_start": 1, "col_end": 25, "row_start": 1, "row_end": 10 },
          "estilo": { "alineacion": "center", "tamaño": "md", "peso": "normal" },
          "props": {
            "categoria_id": null,
            "limite": 8,
            "orden": "recientes",
            "columnas": "auto",
            "mostrar_precio": true
          }
        }
      ]
    },
    {
      "id": "sec_btn001",
      "tipo": "botones",
      "altura_filas": 3,
      "fondo": { "tipo": "transparente", "valor": "" },
      "padding": "md",
      "elementos": [
        {
          "id": "el_wsp",
          "tipo": "boton",
          "grid": { "col_start": 9, "col_end": 17, "row_start": 1, "row_end": 3 },
          "estilo": { "tamaño": "md", "peso": "semibold", "alineacion": "center" },
          "props": {
            "texto": "[Contactanos por WhatsApp]",
            "url": "https://wa.me/57XXXXXXXXXX",
            "estilo_visual": "primary",
            "target": "_blank",
            "icono": "whatsapp"
          }
        }
      ]
    }
  ]
}
```

Los placeholders bracketed (`[Tu título aquí]`) son friction positiva: se ven feos hasta editar, lo que motiva al dueño a reemplazarlos. El botón Guardar muestra warning "Tu página tiene placeholders sin reemplazar" si detecta `^\[.+\]$` en algún texto.

**Tour overlay UX:**
- Backdrop dimmed 60% opacity
- Tooltip con arrow apuntando al canvas / inspector / botón Guardar
- Botones [Saltar] / [Siguiente] (paso 1-2) / [Listo] (paso 3)
- Esc cierra
- No bloquea click en UI (es informativo, no modal)

---

## 6. Modal catálogo + agregar sección

**Trigger:** click en botón `+ Agregar sección` (sidebar al final del outline, o CTA gigante centrado si canvas vacío).

**Modal UI (8 thumbnails grid 4×2):**

```
+--------------------------------------------------------------+
|  Agregá una sección                                    [X]   |
+--------------------------------------------------------------+
|                                                              |
|  +---------+  +---------+  +---------+  +---------+         |
|  | [img]   |  | [img]   |  | [img]   |  | [img]   |         |
|  | Hero    |  | Texto   |  | Imagen  |  | Botones |         |
|  | banner  |  | rico    |  | banner  |  | de acción|        |
|  +---------+  +---------+  +---------+  +---------+         |
|                                                              |
|  +---------+  +---------+  +---------+  +---------+         |
|  | [img]   |  | [img]   |  | [img]   |  | [img]   |         |
|  |Productos|  | Galería |  |Espaciador|  |Formulario|       |
|  +---------+  +---------+  +---------+  +---------+         |
|                                                              |
+--------------------------------------------------------------+
```

**Flow al click en thumbnail:**
1. Cerrar modal
2. Llamar `editorState.insertSection(tipo, atIndex = sections.length)`
3. Factory `createSectionDefault(tipo)` devuelve Section JSON con valores default + ID `sec_` + nanoid(4)
4. Push snapshot al undo stack
5. Re-render canvas + scroll auto a la nueva section
6. Auto-select la section → inspector la muestra

**Defaults por tipo:**

| Tipo | altura_filas | seed elementos |
|---|---|---|
| Hero | 10 | 1 texto título placeholder + 1 botón CTA |
| Texto | 5 | 1 elemento texto placeholder |
| Imagen | 7 | 1 elemento imagen con URL `https://placehold.co/1200x600` |
| Botones | 3 | 2 botones (WhatsApp + Ubicación) |
| Productos | 10 | 1 elemento productos config `recientes/8/auto` |
| Galería | 8 | 1 elemento galería con 3 placeholders `placehold.co` |
| Espaciador | 2 | vacío |
| Formulario | 8 | 1 texto título + 3 form_field (nombre/email/mensaje) + 1 botón submit |

---

## 7. Canvas + GridStack + SortableJS

**Estructura DOM del canvas:**

```html
<div id="editor-canvas" data-edit-mode="true">
  <div id="editor-sections-list">
    <!-- Cada section ↓ -->
    <article class="ed-section" data-section-id="sec_a3f2" data-tipo="hero">
      <button class="ed-section-handle" aria-label="Mover sección">⋮⋮</button>
      <div class="ed-section-toolbar">
        <span>Hero</span>
        <button data-action="dup">Duplicar</button>
        <button data-action="del">Eliminar</button>
      </div>
      <div class="grid-stack ed-section-grid"
           data-gs-column="24"
           data-gs-cell-height="60">
        <div class="grid-stack-item"
             gs-x="0" gs-y="0" gs-w="12" gs-h="5"
             data-element-id="el_titulo">
          <div class="grid-stack-item-content">
            <!-- Render visual del element según tipo -->
          </div>
        </div>
      </div>
    </article>
  </div>
  <button class="ed-add-section-cta">+ Agregar sección</button>
</div>
```

**Init GridStack por section:**

```js
function initGridStackForSection(sectionEl, sectionData) {
  const grid = GridStack.init({
    column: 24,
    cellHeight: 60,
    margin: 0,
    float: true,                  // permite huecos (libertad creativa)
    animate: true,
    disableOneColumnMode: true,   // mobile lo maneja CSS @media de blocks.css (Plan 1)
    handle: '.ed-element-drag',
    resizable: { handles: 'se, sw, ne, nw, e, w, n, s' },
    minRow: sectionData.altura_filas,
  }, sectionEl.querySelector('.grid-stack'));

  grid.on('change', (event, items) => {
    items.forEach(item => {
      editorState.updateElementGrid(sectionData.id, item.el.dataset.elementId, {
        col_start: item.x + 1,     // GridStack 0-based, schema 1-based
        col_end: item.x + item.w + 1,
        row_start: item.y + 1,
        row_end: item.y + item.h + 1,
      });
    });
    editorState.pushSnapshot();
    editorState.markDirty();
  });
  return grid;
}
```

**Init SortableJS sobre lista de sections:**

```js
new Sortable(document.getElementById('editor-sections-list'), {
  handle: '.ed-section-handle',
  animation: 200,
  ghostClass: 'ed-section-ghost',
  onEnd: (evt) => {
    editorState.reorderSections(evt.oldIndex, evt.newIndex);
    editorState.pushSnapshot();
    editorState.markDirty();
  },
});
```

**Render visual del element en `.grid-stack-item-content`:**

Tipos inline simple (texto / imagen / botón / divisor): render directo en HTML del item.
Tipos complejos (productos / galería / formulario / embed): mockup minimalista en canvas — la versión real solo se ve en preview/storefront. Ej. productos en canvas = grid 8 placeholders gris con badge "Productos (8, recientes)".

**Select element:**
- Click en `.grid-stack-item-content` → outline azul + `editorState.select('element', elementId)`
- Inspector se actualiza al element seleccionado
- Click en `.ed-section-toolbar` o área vacía de section → `editorState.select('section', sectionId)`
- Click fuera del canvas o tecla Esc → `deselect()`

**Indicadores visuales edit-mode:**
- Grid lines `opacity: 0.08` con `background-image: linear-gradient(...)`
- Handles resize aparecen en hover del element
- Section toolbar visible siempre en edit
- Botón eliminar element en hover top-right del item

**Toggle Edit ↔ Preview:**
- Botón toolbar "Vista previa" hace `data-edit-mode="false"` → oculta handles + grid lines + toolbars
- Útil antes de guardar para ver el look final

---

## 8. Inspector (panel derecho)

**Estado contextual:**

| Estado | Contenido |
|---|---|
| Nada seleccionado | "Seleccioná una sección o un elemento para editarlo" + tip rápido |
| Section seleccionada | Props sección (fondo / padding / altura_filas) + botón "+ Agregar elemento" + footer (Duplicar / Eliminar) |
| Element seleccionado | Props del element + Estilo (colapsable) + Posición (colapsable) + footer Eliminar |

**Helpers reusables `editor-controls.js`:**

```js
control.textInput(label, value, onChange, opts?)        // text/email/tel
control.textarea(label, value, onChange, opts?)         // multiline
control.urlInput(label, value, onChange, opts?)         // url + validate regex
control.select(label, value, options, onChange)         // <select>
control.colorPicker(label, value, onChange, opts?)      // input type=color + hex text
control.slider(label, value, min, max, step, onChange)  // <input type=range> + número
control.switch(label, value, onChange)                  // toggle bool
```

Cada helper:
- Devuelve un elemento DOM listo
- Maneja debounce 200ms internamente
- Muestra error rojo inline si validación falla (URL inválida, color hex mal formado)
- No bloquea save (server-side Zod hace el gate definitivo)

**Composición hand-coded por element type (ejemplo `boton`):**

```js
function renderInspectorForButton(el) {
  const c = document.createElement('div');
  c.className = 'ed-inspector-body';

  c.appendChild(headerLabel('Editar botón'));

  c.appendChild(control.textInput('Texto del botón', el.props.texto,
    v => editorState.updateElementProp(el.id, 'texto', v), { maxLength: 80 }));

  c.appendChild(control.urlInput('URL (https / mailto / tel / wa.me)', el.props.url,
    v => editorState.updateElementProp(el.id, 'url', v)));

  c.appendChild(control.select('Estilo visual', el.props.estilo_visual, [
    { v: 'primary', l: 'Principal' },
    { v: 'secondary', l: 'Secundario' },
    { v: 'ghost', l: 'Fantasma' },
    { v: 'outline', l: 'Borde' },
  ], v => editorState.updateElementProp(el.id, 'estilo_visual', v)));

  c.appendChild(control.select('Abrir en', el.props.target, [
    { v: '_self', l: 'Misma pestaña' },
    { v: '_blank', l: 'Nueva pestaña' },
  ], v => editorState.updateElementProp(el.id, 'target', v)));

  c.appendChild(collapsibleSection('Estilo', commonStyleControls(el)));
  c.appendChild(collapsibleSection('Posición', commonGridControls(el)));
  c.appendChild(dangerButton('Eliminar elemento',
    () => editorState.removeElement(el.id)));
  return c;
}
```

**Pattern equivalente para los 7 tipos restantes:** texto / imagen / productos / galeria / form_field / embed / divisor. Cada uno compose con los helpers; el código común (estilo + posición) se factoriza en `commonStyleControls(el)` + `commonGridControls(el)`.

**Inspector para section:**

```js
function renderInspectorForSection(section) {
  const c = document.createElement('div');
  c.appendChild(headerLabel('Editar sección · ' + section.tipo));

  // Fondo - select tipo dispara render del input correspondiente
  c.appendChild(control.select('Tipo de fondo', section.fondo.tipo, [
    { v: 'transparente', l: 'Transparente' },
    { v: 'color', l: 'Color' },
    { v: 'imagen', l: 'Imagen' },
    { v: 'gradient', l: 'Degradado' },
  ], v => {
    editorState.updateSectionProp(section.id, 'fondo', { tipo: v, valor: '' });
    rerenderInspector(); // re-render para mostrar input correspondiente
  }));

  if (section.fondo.tipo === 'color') {
    c.appendChild(control.colorPicker('Color de fondo', section.fondo.valor || '#FFFFFF',
      v => editorState.updateSectionProp(section.id, 'fondo',
        { ...section.fondo, valor: v })));
  } else if (section.fondo.tipo === 'imagen') {
    c.appendChild(control.urlInput('URL imagen (https)', section.fondo.valor,
      v => editorState.updateSectionProp(section.id, 'fondo',
        { ...section.fondo, valor: v })));
  } else if (section.fondo.tipo === 'gradient') {
    c.appendChild(control.textarea('CSS gradient',
      section.fondo.valor || 'linear-gradient(135deg, #1B4965, #5FA8D3)',
      v => editorState.updateSectionProp(section.id, 'fondo',
        { ...section.fondo, valor: v })));
  }

  c.appendChild(control.select('Padding', section.padding, [
    { v: 'sm', l: 'Pequeño' }, { v: 'md', l: 'Medio' },
    { v: 'lg', l: 'Grande' }, { v: 'xl', l: 'Extra grande' },
  ], v => editorState.updateSectionProp(section.id, 'padding', v)));

  c.appendChild(control.slider('Altura (filas)', section.altura_filas, 1, 50, 1,
    v => editorState.updateSectionProp(section.id, 'altura_filas', v)));

  c.appendChild(primaryButton('+ Agregar elemento',
    () => abrirModalAgregarElemento(section.id)));

  c.appendChild(dangerButton('Duplicar sección',
    () => editorState.duplicateSection(section.id)));
  c.appendChild(dangerButton('Eliminar sección',
    () => editorState.removeSection(section.id)));
  return c;
}
```

---

## 9. Toolbar + atajos teclado

**Layout (56px alto, sticky):**

```
+--------------------------------------------------------------------------+
| [< Volver] | [💻 Desktop] [📱 Mobile] | [↶] [↷] | [✨ IA] | [Guardar]    |
+--------------------------------------------------------------------------+
```

**Botones (etiquetas en español natural):**

| Botón | Acción | Atajo | Notas |
|---|---|---|---|
| `< Volver` | Navega a `#/` | — | Si dirty → modal "¿Descartar cambios sin guardar?" |
| `Desktop / Mobile` | Toggle viewport canvas (1280px / 375px) | — | Solo previsualiza, NO edita mobile-only en MVP |
| `↶ Deshacer` | Pop snapshot anterior | `Ctrl+Z` | Disabled si idx=0 |
| `↷ Rehacer` | Push snapshot siguiente | `Ctrl+Shift+Z` | Disabled si idx=last |
| `✨ Generar con IA` | Placeholder Plan 4 | — | Disabled con tooltip "Próximamente" |
| `Guardar` | Promueve `home_draft` → `home` + invalidate KV | `Ctrl+S` | Primary, badge dinámico |

**Estados visuales del botón Guardar:**

```
Limpio (no dirty):       [Publicado ✓]  gris
Dirty (cambios):         [Guardar •]    azul primary + dot
Saving:                  [Guardando...] spinner
Auto-saved (draft):      [Borrador guardado · hace 12s]  gris pequeño debajo
```

**Listener atajos teclado:**

```js
document.addEventListener('keydown', e => {
  if (!editorVisible() || isTypingInField(e.target)) return;
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    editorState.undo();
  } else if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    editorState.redo();
  } else if (mod && e.key === 's') {
    e.preventDefault();
    save({ mode: 'publish' });
  } else if (e.key === 'Escape') {
    editorState.deselect();
  } else if (e.key === 'Delete' && editorState.selection) {
    e.preventDefault();
    confirmAndDelete();
  }
});
```

**Modal "¿Descartar cambios?" al salir con dirty:**

```
+----------------------------------------------+
|  Tenés cambios sin publicar                  |
|                                              |
|  Tu borrador quedó guardado y podrás         |
|  retomarlo cuando vuelvas a abrir el editor. |
|                                              |
|  ¿Querés salir igual?                        |
|                                              |
|     [Quedarme aquí]    [Salir igual]         |
+----------------------------------------------+
```

(Draft persiste 7 días según spec maestro v2 sec 5.5.)

---

## 10. State + Auto-save + Undo/Redo

**`editor-state.js` singleton API pública:**

```js
const editorState = {
  // Datos
  tienda_id: null,
  sections: [],
  theme: {},

  // Selección
  selection: null,           // { tipo: 'section'|'element', id }

  // Estado UI
  dirty: false,
  saving: false,
  lastDraftSavedAt: null,
  lastPublishedAt: null,
  base_updated_at: null,     // para locking optimista

  // Undo/Redo
  snapshots: [],
  snapshotIdx: -1,
  MAX_SNAPSHOTS: 20,

  // Listeners (observer)
  _listeners: { sections: [], selection: [], dirty: [] },

  // API
  init(personalizaciones, tienda_id, base_updated_at) {},
  insertSection(tipo, atIndex = null) {},
  removeSection(sectionId) {},
  reorderSections(fromIdx, toIdx) {},
  duplicateSection(sectionId) {},
  updateSectionProp(sectionId, key, value) {},

  insertElement(sectionId, tipo, atGrid?) {},
  removeElement(elementId) {},
  updateElementGrid(sectionId, elementId, grid) {},
  updateElementProp(elementId, key, value) {},
  updateElementStyle(elementId, key, value) {},

  select(tipo, id) {},
  deselect() {},

  undo() {},
  redo() {},
  pushSnapshot() {},

  markDirty() {},
  serialize() {},            // devuelve PersonalizacionesSchema completo

  subscribe(channel, fn) {},
};
```

**Auto-save mecánica:**

```js
let autoSaveTimer = null;
editorState.subscribe('dirty', isDirty => {
  if (!isDirty) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveDraft, 30000); // 30s después del último cambio
});

async function saveDraft() {
  if (editorState.saving) return;
  editorState.saving = true;
  try {
    const body = {
      tienda_id: editorState.tienda_id,
      page_id: 'home',
      mode: 'draft',
      personalizaciones: editorState.serialize(),
      base_updated_at: editorState.base_updated_at,
    };
    const r = await callEF('tienda-guardar-layout', body);
    if (r.success) {
      editorState.lastDraftSavedAt = new Date();
      editorState.base_updated_at = r.updated_at;
      updateToolbarBadge('draft');
    } else if (r.error === 'stale_layout') {
      mostrarModalConflicto(r.server_personalizaciones);
    }
  } finally {
    editorState.saving = false;
  }
}

async function save({ mode = 'publish' } = {}) {
  // mismo body pero mode=publish; server promueve draft → home + invalida KV
  // si success: editorState.dirty = false, lastPublishedAt = new Date(), toast 'Tienda actualizada'
}
```

**Undo/Redo con snapshots:**

```js
pushSnapshot() {
  // Si hicimos undo y ahora editamos, descartar redo stack
  this.snapshots = this.snapshots.slice(0, this.snapshotIdx + 1);
  const snap = structuredClone({ sections: this.sections, theme: this.theme });
  this.snapshots.push(snap);
  this.snapshotIdx = this.snapshots.length - 1;
  if (this.snapshots.length > this.MAX_SNAPSHOTS) {
    this.snapshots.shift();
    this.snapshotIdx--;
  }
}

undo() {
  if (this.snapshotIdx <= 0) return;
  this.snapshotIdx--;
  this._restoreFromSnapshot();
}

redo() {
  if (this.snapshotIdx >= this.snapshots.length - 1) return;
  this.snapshotIdx++;
  this._restoreFromSnapshot();
}

_restoreFromSnapshot() {
  const snap = this.snapshots[this.snapshotIdx];
  this.sections = structuredClone(snap.sections);
  this.theme = structuredClone(snap.theme);
  this.selection = null;
  this._notify('sections');
  this._notify('selection');
  this.dirty = true;
  this._notify('dirty');
  // NO push otro snapshot acá
}
```

**Granularidad del push de snapshots:**

| Acción | Push snapshot |
|---|---|
| insert/remove/reorder/duplicate section | Sí, inmediato |
| insert/remove element | Sí, inmediato |
| updateElementGrid (drag/resize GridStack) | Sí, al `gridstack:change` end |
| updateElementProp (typing en inspector) | Sí, debounce 1000ms |
| updateSectionProp (color picker drag) | Sí, debounce 1000ms |
| select/deselect | NO push |
| undo/redo | NO push |

---

## 11. EF `tienda-guardar-layout`

**Endpoint:** `POST /functions/v1/tienda-guardar-layout`
**verify_jwt:** `true` (JWT del dueño autenticado)
**CORS:** `https://aimma.com.co` solamente

**Request body:**

```ts
{
  tienda_id: string,            // uuid
  page_id: 'home',              // futuro: 'quienes-somos', 'blog'
  mode: 'draft' | 'publish',
  personalizaciones: PersonalizacionesSchema,
  base_updated_at: string | null,  // ISO timestamp, null en first save
}
```

**Flujo interno:**

```ts
serve(async (req) => {
  if (req.method === 'OPTIONS') return cors(204);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1) Auth JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  // 2) Validar body con Zod
  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json({ error: 'invalid_body', detail: e.errors }, 400);
  }

  // 3) Tamaño JSON < 2MB
  const serialized = JSON.stringify(body.personalizaciones);
  if (serialized.length > 2_000_000) return json({ error: 'payload_too_large' }, 413);

  // 4) Ownership check
  const supabaseSvc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: tienda, error: tErr } = await supabaseSvc
    .from('tiendas')
    .select('id, user_id, slug, subdominio, personalizaciones')
    .eq('id', body.tienda_id)
    .single();
  if (tErr || !tienda) return json({ error: 'tienda_not_found' }, 404);
  if (tienda.user_id !== user.id) return json({ error: 'not_owner' }, 403);

  // 5) Locking optimista
  const currentHome = tienda.personalizaciones?.pages?.home;
  if (currentHome && body.base_updated_at &&
      currentHome.updated_at > body.base_updated_at) {
    return json({
      error: 'stale_layout',
      server_updated_at: currentHome.updated_at,
      server_personalizaciones: tienda.personalizaciones,
    }, 409);
  }

  // 6) Construir nuevo JSON segun mode
  const now = new Date().toISOString();
  const next = structuredClone(tienda.personalizaciones || { schema_version: 2, pages: {} });
  next.schema_version = 2;
  if (body.personalizaciones.theme) next.theme = body.personalizaciones.theme;

  if (body.mode === 'draft') {
    next.pages.home_draft = { ...body.personalizaciones.pages.home, updated_at: now };
  } else {
    next.pages.home = { ...body.personalizaciones.pages.home, updated_at: now };
    delete next.pages.home_draft;
  }

  // 7) Upsert
  const { error: uErr } = await supabaseSvc
    .from('tiendas')
    .update({ personalizaciones: next, updated_at: now })
    .eq('id', body.tienda_id);
  if (uErr) return json({ error: 'upsert_failed' }, 500);

  // 8) Si publish, invalidate KV best-effort
  if (body.mode === 'publish' && tienda.slug) {
    invalidateKV(tienda.slug).catch(err => console.error('kv_invalidate_failed', err));
  }

  return json({
    success: true,
    mode: body.mode,
    updated_at: now,
    home: next.pages.home || null,
  });
});

async function invalidateKV(slug: string) {
  const url = `https://${slug}.tienda.aimma.com.co/_internal/invalidate-kv`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + Deno.env.get('INVALIDATE_SECRET'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key: 'tenant:' + slug }),
  });
}
```

**Secrets requeridos en Supabase EF Dashboard:**
- `INVALIDATE_SECRET` (ya existe desde Fase 12.A)
- `SUPABASE_SERVICE_ROLE_KEY` (auto)
- `SUPABASE_URL` (auto)
- `SUPABASE_ANON_KEY` (auto)

**Errores devueltos:**

| Code | HTTP | Cuándo |
|---|---|---|
| `unauthorized` | 401 | JWT inválido o ausente |
| `invalid_body` | 400 | Zod parse error |
| `payload_too_large` | 413 | JSON > 2MB |
| `tienda_not_found` | 404 | tienda_id no existe |
| `not_owner` | 403 | user_id ≠ tienda.user_id |
| `stale_layout` | 409 | Locking optimista conflict |
| `upsert_failed` | 500 | BD error |

---

## 12. EF `tienda-form-submit`

**Endpoint:** `POST /functions/v1/tienda-form-submit`
**verify_jwt:** `false` (público — el cliente final del storefront NO está logueado)
**CORS:** `*.tienda.aimma.com.co` (regex match — wildcard subdominios)

**Request body (JSON, no multipart):**

```ts
{
  tienda_slug: string,           // regex ^[a-z0-9-]{3,50}$
  section_id: string,            // regex ^sec_[a-z0-9]{4,}$
  fields: Record<string, string>,// keys 'field_0', 'field_1', ...
  honeypot: string,              // anti-spam (hidden field, debe estar vacío)
}
```

**Límites:**
- Max payload: 100 KB
- Max fields: 8
- Rate limit: 10 submits/hora por IP + tienda

**Flujo interno (resumen):**

1. CORS origin allowlist (regex `^https://[a-z0-9-]+\.tienda\.aimma\.com\.co$`)
2. Body size guard (100KB)
3. Zod validation body
4. Honeypot check — si tiene valor, retornar 200 success pero NO insertar (silent drop)
5. Max fields guard
6. Rate limit RPC `check_rate_limit_form_submit(rateKey, max=10, window=60min)`
7. Lookup tienda por slug + verificar `section_id` es tipo `formulario` en `personalizaciones.pages.home.sections`
8. Mapear `field_N` → labels reales desde la declaración del Section
9. Validar required fields + email format
10. Sanitizar (strip `<` y `>` para anti-XSS básico — guardado solo como texto plano)
11. INSERT en `form_submissions`
12. Si `tienda.notif_email` no es null → INSERT en `form_submission_notifications` con estado pendiente
13. Return `{ success: true, message: '¡Gracias! Recibimos tu mensaje...' }`

**Errores devueltos:**

| Code | HTTP | Cuándo |
|---|---|---|
| `origin_not_allowed` | 403 | Origin no es `*.tienda.aimma.com.co` |
| `payload_too_large` | 413 | Body > 100KB |
| `invalid_body` | 400 | Zod fail |
| `too_many_fields` | 400 | > 8 fields |
| `rate_limited` | 429 | > 10/h por IP+tienda |
| `tienda_not_found` | 404 | slug no existe |
| `invalid_section` | 400 | section_id no es tipo formulario en personalizaciones |
| `missing_required_field` | 400 | Campo requerido vacío |
| `invalid_email` | 400 | Email mal formado |
| `insert_failed` | 500 | BD error |

**Cambios storefront (4 archivos `Formulario*.astro`):**

Reemplazar `<form action="/internal/form-submit">` por form con dataset + script DRY.

Pattern: el `<form>` cambia a `data-form-section-id={section.id}` + `data-tienda-slug={Astro.locals.tienda.slug}`. Honeypot field oculto. Mensaje `<p class="form-message" hidden>` para feedback.

El handler JS vive **una sola vez** en `apps/storefront/src/components/blocks/formulario/_FormSubmitHandler.astro` (NUEVO archivo con `<script is:inline>`) que los 4 importan — DRY, un solo lugar de mantenimiento. Maneja: fetch POST, disable submit durante request, mensaje success/error, reset form en success.

---

## 13. BD migrations consolidadas

**Path:** `supabase/migrations/20260602000000_editor_promax_plan3.sql`

**Tablas + columnas nuevas:**

```sql
-- 1) Flags first-use editor en tiendas
ALTER TABLE tiendas
  ADD COLUMN IF NOT EXISTS editor_first_choice_at timestamptz,
  ADD COLUMN IF NOT EXISTS editor_tour_visto_at   timestamptz,
  ADD COLUMN IF NOT EXISTS notif_email            text;

-- 2) form_submissions
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
  ON form_submissions(tienda_id) WHERE leido_at IS NULL;

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_submissions" ON form_submissions FOR SELECT
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));
CREATE POLICY "owner_update_submissions" ON form_submissions FOR UPDATE
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));

-- 3) Cola notificaciones email
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
  ON form_submission_notifications(created_at) WHERE estado = 'pendiente';

ALTER TABLE form_submission_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_read_notifs" ON form_submission_notifications FOR SELECT
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));

-- 4) Rate limit sliding window
CREATE TABLE form_submit_rate_limit (
  rate_key      text PRIMARY KEY,
  count         int NOT NULL,
  window_start  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_form_submit_rate_window
  ON form_submit_rate_limit(window_start);

CREATE OR REPLACE FUNCTION check_rate_limit_form_submit(
  p_key text, p_max int, p_window_minutes int
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
  v_window_start timestamptz;
BEGIN
  SELECT count, window_start INTO v_count, v_window_start
    FROM form_submit_rate_limit WHERE rate_key = p_key FOR UPDATE;
  IF NOT FOUND OR v_window_start < now() - (p_window_minutes || ' minutes')::interval THEN
    INSERT INTO form_submit_rate_limit (rate_key, count, window_start)
    VALUES (p_key, 1, now())
    ON CONFLICT (rate_key) DO UPDATE SET count = 1, window_start = now();
    RETURN 1;
  END IF;
  UPDATE form_submit_rate_limit SET count = count + 1 WHERE rate_key = p_key;
  RETURN v_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION check_rate_limit_form_submit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit_form_submit TO service_role;

CREATE OR REPLACE FUNCTION cleanup_form_submit_rate_limit() RETURNS int
LANGUAGE sql AS $$
  DELETE FROM form_submit_rate_limit
    WHERE window_start < now() - interval '24 hours'
    RETURNING 1;
$$;
```

---

## 14. Vista CRM > Mensajes (6º tab)

**Decisión:** NO sidebar item nuevo — 6º tab dentro del CRM existente que ya tiene 5 (Pedidos / Clientes / etc).

**UI tab principal:**

```
+----------------------------------------------------------------+
| CRM > Mensajes                                                 |
| [Pedidos][Clientes][...][Mensajes(3)]                          |
+----------------------------------------------------------------+
| Filtros: [Todos ▾] [No leídos] [Últimos 30 días] [Buscar..]    |
+----------------------------------------------------------------+
| ● 02/06 14:32  Nombre: Camilo P  email@..  "Quiero saber..."  |
|   01/06 09:15  Nombre: Ana L     312..     "Hola..."           |
|   30/05 22:08  Nombre: Pedro M   null      "Pregunta..."       |
| ● = no leído                                                   |
+----------------------------------------------------------------+
```

**Modal detalle:**

```
+----------------------------------------------------------------+
|  Mensaje recibido · 02/06/2026 14:32              [X]          |
|  Sección: Formulario contacto                                  |
|                                                                |
|  Nombre:        Camilo Pérez                                   |
|  Email:         camilo@gmail.com                               |
|  Teléfono:      +57 312 555 1234                               |
|  Mensaje:       Quiero saber si tienen talla 42 de las botas  |
|                                                                |
|  IP:            190.x.x.x                                      |
|  Navegador:     Chrome 130 / Android                           |
|                                                                |
|     [Marcar como leído]  [Responder por WhatsApp]              |
+----------------------------------------------------------------+
```

Si algún field tiene regex `^(\+57)?\d{10}$` → botón "Responder por WhatsApp" abre `wa.me/57XXXXXXXXXX?text=Hola%20{nombre}%2C%20vi%20tu%20mensaje%20en%20la%20tienda...` (reusa pattern Fase 12.B).

**Archivo nuevo:** `iapanel/tienda/admin/views/crm-mensajes.js`

**Cambios en archivos existentes:**

- `views/crm.js`: agregar 'mensajes' al array TABS + delegar render a `window.TiendaIA.crmMensajes.render`
- `admin.js`: agregar `setInterval(refreshBadgeMensajes, 60000)` para mantener badge actualizado
- `index.html`: agregar `<script src="views/crm-mensajes.js?v=1"></script>` antes del cierre body

---

## 15. Resumen archivos tocados Plan 3

| Categoría | Archivos | Acción |
|---|---|---|
| BD | 1 migration `20260602000000_editor_promax_plan3.sql` | NEW |
| EFs Supabase | `supabase/functions/tienda-guardar-layout/index.ts` | NEW |
| EFs Supabase | `supabase/functions/tienda-form-submit/index.ts` | NEW |
| EFs _shared | `supabase/functions/_shared/editor-schema.ts` (copia Plan 1) | NEW |
| Panel admin editor | `iapanel/tienda/admin/views/editor/` (10 archivos JS/CSS + 3 libs) | NEW carpeta completa |
| Panel admin existentes | `iapanel/tienda/admin/admin.js` (agregar ROUTE `editor`) | MOD |
| Panel admin existentes | `iapanel/tienda/admin/index.html` (nav item + scripts) | MOD |
| Panel admin existentes | `iapanel/tienda/admin/admin.css` (estilo nav item editor) | MOD |
| Panel admin CRM | `iapanel/tienda/admin/views/crm.js` (6º tab) | MOD |
| Panel admin CRM | `iapanel/tienda/admin/views/crm-mensajes.js` | NEW |
| Storefront blocks | `apps/storefront/src/components/blocks/formulario/_FormSubmitHandler.astro` | NEW |
| Storefront blocks | `apps/storefront/src/components/blocks/formulario/Formulario{IndustrialClean,FashionBold,MinimalArtesanal,EditorialMagazine}.astro` | MOD x4 |
| Storefront env | `apps/storefront/src/env.d.ts` (tipar tienda.slug si falta) | MOD condicional |

**Total:** ~17 archivos NEW + 8 archivos MOD.

---

## 16. Plan de verificación E2E (Plan 3 LIVE)

20 tests obligatorios antes de cerrar Plan 3. Cada uno con verificación empírica (curl o Playwright). Si alguno falla → bug → fix → re-test.

| # | Test | Cómo verificar | Pass criteria |
|---|---|---|---|
| 1 | Editor route existe LIVE | `curl admin.js` grep `'editor'` en ROUTES | ROUTES incluye `'editor'` |
| 2 | Vista Editor monta | Navegar a `#/editor` (Playwright) | 3 paneles visibles, 0 errores consola |
| 3 | Modal first-use (Starter) | Tienda nueva sin `pages.home` → abrir editor | Modal aparece con 2 opciones |
| 4 | Starter seed correcto | Click "Plantilla starter" → guardar | BD `pages.home` tiene 3 sections (Hero+Productos+Botones) |
| 5 | Desde Cero canvas vacío | Click "Desde cero" → no modal otra vez | Canvas vacío con CTA "+ Agregar sección" |
| 6 | Modal catálogo 8 tipos | Click `+ Agregar sección` | Modal con 8 thumbnails |
| 7 | Insert Hero render | Click Hero | Section en canvas con grid 24-col |
| 8 | GridStack drag element | Drag elemento dentro grid | State actualiza grid.col_start/col_end |
| 9 | SortableJS reorder sections | Drag handle de section #2 a #1 | Array sections reordenado |
| 10 | Inspector edit prop | Cambiar texto Hero en inspector | Canvas re-rendea (debounce 200ms) |
| 11 | Auto-save draft 30s | Editar → esperar 35s | BD `home_draft` actualizado |
| 12 | Save manual + KV invalidate | Click Guardar → curl storefront | HTML refleja cambio < 10s |
| 13 | Undo/Redo Ctrl+Z | Editar + Ctrl+Z | Canvas vuelve a estado previo |
| 14 | EF stale_layout 409 | 2 tabs editan + ambos save | Segundo save da 409 + modal conflict |
| 15 | Form submit funciona | Storefront formulario → submit | BD `form_submissions` tiene row + response success |
| 16 | Honeypot bloquea bot | POST con `honeypot="bot"` | Response 200 success pero NO row |
| 17 | Rate limit 10/h | 11 submits mismo IP+tienda | 11vo devuelve 429 rate_limited |
| 18 | RLS owner_select | Login otra tienda → query submissions | Solo ve sus propias submissions |
| 19 | Panel CRM Mensajes tab | Login dueño → CRM > Mensajes | Lista DESC + badge no-leídos |
| 20 | Marcar como leído | Click marcar | `leido_at` actualizado + badge baja |

**Criterios pass/fail al cierre:**

| Criterio | Threshold |
|---|---|
| Tests pass | 18/20 mínimo (los 2 que pueden fallar: KV propagación tardía o flaky network) |
| Errores consola en editor | 0 |
| EF p95 guardar-layout | < 500ms |
| EF p95 form-submit | < 300ms |
| RLS leaks | 0 (verificar con otra tienda) |
| Audit code-reviewer HIGH | 0 (todos los HIGH resueltos antes de merge) |

**Verificación empírica final post-deploy:**

```powershell
# 1) Curl admin LIVE — ROUTES debe tener 'editor'
$r = Invoke-WebRequest 'https://aimma.com.co/iapanel/tienda/admin/admin.js' -UseBasicParsing
$r.Content | Select-String "'editor'"

# 2) Curl storefront aimma-test — debe tener marker del último save
$r = Invoke-WebRequest 'https://aimma-test.tienda.aimma.com.co/' -UseBasicParsing
$r.Headers['Last-Modified']
$r.Content | Select-String 'PLAN3-LIVE-'

# 3) Probar EF guardar-layout con JWT real
curl -X POST 'https://rsmxklkxqsaptchcjszd.functions.supabase.co/tienda-guardar-layout' `
  -H "Authorization: Bearer $JWT" `
  -H "Content-Type: application/json" `
  -d '{"tienda_id":"...","page_id":"home","mode":"draft","personalizaciones":{...},"base_updated_at":null}'

# 4) Probar EF form-submit
curl -X POST 'https://rsmxklkxqsaptchcjszd.functions.supabase.co/tienda-form-submit' `
  -H "Origin: https://aimma-test.tienda.aimma.com.co" `
  -H "Content-Type: application/json" `
  -d '{"tienda_slug":"aimma-test","section_id":"sec_form01","fields":{"field_0":"Test"},"honeypot":""}'

# 5) Query BD form_submissions
psql "$DATABASE_URL" -c "SELECT id, created_at FROM form_submissions ORDER BY created_at DESC LIMIT 5"
```

**Marker único por commit:**

Cada deploy debe incluir marker visible (ej. `<!-- editor-plan3-v1 2026-06-02 -->` en `editor-styles.css`) para verificar via curl que deploy nuevo está LIVE — NO asumir.

---

## 17. Tipo A vs Tipo B (responsabilidades)

Según protocolo "de inicio a fin" del usuario:

**Tipo A (Claude lo hace):**
- Toda la implementación de código (EFs, admin JS, blocks Astro mod)
- Migration SQL (aplicar via `apply_migration` MCP Supabase)
- Deploy EFs (via MCP Supabase `deploy_edge_function`)
- Audit code-reviewer
- git add / commit / push (CON co-authored-by Claude)
- Tests E2E con Playwright donde aplique

**Tipo B (solo Jorge):**
- Redeploy de aimma-web en Easypanel (panel admin LIVE)
- Configurar/confirmar secrets `INVALIDATE_SECRET` ya existe en EF dashboard
- Setup eventual de SMTP/Resend para Plan 5 (no Plan 3)
- Aprobar cambios en producción si aplica

Sin pasar git add/commit/push como instrucción a Jorge.

---

## 18. Riesgos específicos Plan 3 (delta sobre spec maestro v2)

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | SortableJS + GridStack juntos: drag conflict (SortableJS captura el drag del element dentro de GridStack) | Usar `handle: '.ed-section-handle'` exclusivo para SortableJS, GridStack tiene `handle: '.ed-element-drag'` distinto. Test E2E: tests 8 + 9 cubren ambos |
| 2 | Form submit storefront con CORS: si origin no coincide regex, no envía | Test 15 con browser real verifica Origin header. Allowlist regex en EF cubre todos los subdominios |
| 3 | Auto-save vs save manual race condition | Promise queue: si save manual en flight, descartar auto-save próximo |
| 4 | Snapshots 20 con sections grandes (10MB cada uno) ocupa mucha RAM browser | Cap MAX_SNAPSHOTS=20 + estructuras pequeñas. Si supera 2MB serializado, drop oldest agresivo |
| 5 | Honeypot bot que pone honeypot vacío y submits | Rate limit 10/h cubre. Plan 5 agrega Turnstile |
| 6 | Section "formulario" sin form_fields → schema valid pero form sin campos | Frontend warning + validación inspector "Agregá al menos 1 campo" |

---

## 19. Lo que NO está en Plan 3 (queda para Plans 4-5)

- IA generativa (Plan 4)
- Envío real email notificación (Plan 5)
- Cloudflare Turnstile captcha (Plan 5)
- Storage uploader imágenes (Fase 13 spec maestro)
- Sub-páginas reales (Fase 2 post-MVP)
- Edit-on-mobile completo (Fase 13)
- A/B testing layout (Fase 14+)
- Marketplace bloques third-party (nunca)

---

## 20. Próximos pasos

1. **Jorge revisa este spec** y aprueba / pide cambios
2. Si aprobado → invocar skill `writing-plans` para crear plan implementación detallado paso-a-paso
3. Plan ejecutable arranca con Task 1 (BD migration consolidada) por ser dependencia común
4. Subagent-driven-development methodology aplicada con review por tarea

**Owner del spec:** Jorge Valbuena
**Implementación:** Claude Opus 4.7 con subagents según permitan dependencias

---

*Spec generado durante sesión brainstorming colaborativa 2026-06-02.*
*Extiende `2026-06-01-editor-pro-max-v2-design.md` con detalle ejecutable de Fase 12.C.4.*
