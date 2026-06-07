# Fase C.2 · Paso 1 — Selección en canvas (chrome + base inspector-driven) · Diseño

**Fecha:** 2026-06-06
**Estado:** SPEC — pendiente OK de Jorge en el gate. Nada de código (ni spike ni build) hasta el OK.
**Predecesores:** [Fase C diseño](2026-06-05-fase-c-design.md) · C.1 (preview en vivo por PATCH SSR por-sección) + fix no-drift CERRADOS y verificados en vivo (storefront `ae81c68a`, main `ed82e04`, EF v9, admin `editor.js v10` cola serial).

---

## 1. Objetivo

Hacer el canvas **directamente manipulable**: click en una sección de la vista previa → la resalta con un chrome de selección (recuadro azul + barrita subir/bajar/duplicar/borrar + etiqueta) y abre su inspector. Los 4 botones estructurales operan sobre las ops del admin que **ya patchean en vivo por C.1**. Cero edición de contenido inline en el canvas (eso es Paso 2).

**Look del chrome:** YA aprobado por Jorge (recuadro azul + barrita 4 botones + etiqueta). Este spec NO re-diseña el look; define el mecanismo, el protocolo y la seguridad.

---

## 2. Alcance

**DENTRO (Paso 1):**
- Chrome de selección sobre la sección elegida (overlay flotante en el iframe).
- Wiring de subir/bajar/duplicar/borrar a las ops estructurales del admin (que patchean por C.1).
- Selección como **fuente única de verdad** (`editorState.selection`); el iframe es reflector.
- Deselección (click en vacío del canvas / cerrar drawer).
- Reuso del inspector existente (ya selection-driven) — sin reescribirlo.

**FUERA (Paso 2 u otros):**
- Edición de contenido inline en el canvas (texto simple inline; rich-text siempre por inspector). → Paso 2.
- Drag-and-drop de reordenamiento (se usa subir/bajar). → no en C.2.
- Cualquier control nuevo de propiedades (siguen en el inspector).

---

## 3. Estado actual (confirmado por código, no asumido)

**Storefront `apps/storefront/src/pages/index.astro`** (bloque `{isPreview && (<script>)}`):
- Click en `[data-section-id]` (capture + `preventDefault`) → `parent.postMessage({type:'select', sectionId}, ADMIN_ORIGIN)`.
- Recibe (con `e.origin !== ADMIN_ORIGIN` → return): `reload`, `theme`, `section-patch` (replace/insert/remove/move, con shape estricto).
- Emite `preview-ready` al cargar.
- **No existe** chrome de selección ni recepción de `set-selection`.

**Admin `editor-canvas.js`** (bridge):
- `state.messageHandler` valida `event.origin === state.tenantOrigin` siempre.
- Recibe `{type:'select', sectionId}` → `editorState.select(sectionId)` + `openInspectorDrawer()` (solo desliza el drawer en `<=1100px`).
- Recibe `preview-ready`.
- Emite (targetOrigin = `tenantOrigin`, nunca `'*'`): `reload`, `theme`, `section-patch`.
- **No** maneja acciones estructurales desde el iframe ni emite `set-selection`.

**Admin `editor-state.js`:**
- `select(id)` / `deselect()` + canal `'selection'`.
- `addSection(tipo,atIndex)`, `removeSection(id)`, `reorderSections(from,to)` (guardas de rango ya presentes), `duplicateSection(id)` (devuelve nuevo id). Todas setean `lastOp` + `notify('patch')` → **ya patchean en vivo por C.1 (v10 cola serial)**.

**Admin `editor-inspector.js`:**
- `bindStateListeners()` → `subscribe('selection', rebuild)` → **ya se re-renderiza con la sección seleccionada**. Sin selección → `renderEmpty()`.
- `renderForSection` ya incluye "Duplicar sección" (→ `duplicateSection`) y "Eliminar sección" (→ `confirm()` nativo → `removeSection`).

**Conclusión:** el lado admin de selección + las ops estructurales + el inspector selection-driven **ya existen**. Lo nuevo es el **chrome en el iframe** y su **wiring bidireccional**.

---

## 4. Decisiones de diseño (Q1–Q5 + condiciones a–d)

### Q1 — El chrome vive DENTRO del iframe (preview-gated)
El preview del storefront inyecta el chrome en su propio documento. Razón: `getBoundingClientRect` de elementos dentro de un iframe cross-origin está bloqueado para el admin → un overlay dibujado por el admin sería frágil. El chrome se dibuja donde se conoce la geometría.

### Q2 — Wiring de los 4 botones
- **subir** → `reorderSections(idx, idx-1)`; **bajar** → `reorderSections(idx, idx+1)`. El admin calcula `idx` desde `sectionId` contra su estado.
- **duplicar** → `duplicateSection(sectionId)` → el admin selecciona el nuevo id y emite `set-selection(nuevoId)` tras drenar el patch → el chrome salta a la copia.
- **borrar** → **confirmación** (no inmediato). Doble red: el modal **previene** + el Deshacer de la toolbar **recupera** (snapshots ya existen). El modal vive en el **admin** (los diálogos son UI del admin; no metemos modales en el storefront): el chrome solo manda `section-action(remove)` → el admin **dispara su modal** → al confirmar → `removeSection`. CANCELAR = default seguro/prominente; ELIMINAR = color de advertencia (aun un tap accidental en el modal cae en seguro). up/down/duplicate llaman la op **directo**, sin confirmar.
- **Límites:** subir en la primera y bajar en la última se **deshabilitan en gris** (no se ocultan) → layout estable de 4 botones, predecible para no-técnicos. El gris es **cosmético**; el guard funcional autoritativo es el no-op del admin fuera de rango (`reorderSections` ya guarda).

### Q3 — Fuente única de verdad = `editorState.selection`; el iframe es reflector
Cualquier disparador (click en canvas, click en lista del sidebar, auto-selección tras duplicar) → `editorState.select(id)` en el admin → el admin emite `set-selection` al iframe → el iframe dibuja/mueve/limpia el chrome **solo al recibir `set-selection`**. El click del iframe **solo manda** `{type:'select'}`; nunca pinta chrome por su cuenta. El round-trip es un postMessage (sin fetch/render; el chrome se dibuja sobre un nodo ya renderizado) → instantáneo. La deselección sale gratis: `set-selection` con `sectionId` nulo.

**Deselección — disparadores:** click en espacio vacío del canvas (fuera de toda sección) y/o cerrar el drawer → `editorState.select(null)` → `set-selection(null)` → chrome limpio.

### Q4 — Overlay flotante anclado al DOCUMENTO (no dentro de la sección)
El preview crea UN elemento de chrome en su propio `document.body`, `position:absolute` anclado al documento (`top = rect.top + scrollY`, `left = rect.left + scrollX`). Por anclarse al documento (no al viewport) **scrollea solo con el contenido, sin listener de scroll**.

Por qué overlay flotante y NO chrome hijo de la sección:
- **Byte-identidad (A3):** el nodo de la sección queda **byte-idéntico al SSR** (no se le inyecta nada) → la paridad render==página y el byte-compare de fragmentos siguen válidos.
- **Overflow:** secciones con `overflow:hidden` (heroes) recortarían un chrome hijo; el overlay por encima nunca se recorta.
- **Sobrevive el replace-patch:** C.1 reemplaza el nodo con `outerHTML`; un chrome hijo se borraría. Como hermano, el patch swapea la sección y el chrome solo re-posiciona.

Refinamientos:
- **pointer-events:** el recuadro/outline `pointer-events:none` (clicks y scroll **pasan** a la sección, para seguir seleccionando/scrolleando); solo la barrita/botones `pointer-events:auto`. Los handlers de los botones hacen `stopPropagation` para no re-disparar el click→select de la sección.
- **Recompute** (re-query por `data-section-id`, nunca referencia al nodo viejo): en `set-selection`, `resize`, cambio de dispositivo (desktop/mobile), **después de cada `section-patch`** (condición c), y reflows por carga de fuentes/imágenes vía **`ResizeObserver` sobre el body**. (Si algún reflow solo-de-ancho llegara a driftear, observar también la sección — pero body es el punto de partida; no se pre-construye.)

### Q5 — Etiqueta en el mensaje; gris de límite computado por el iframe
- **Etiqueta:** viaja en `{type:'set-selection', sectionId, label}`. El admin la saca de `sectionDefs` (fuente única A.1). El iframe la pinta con **`textContent` escapado** (nunca `innerHTML` → un label no puede inyectar markup). No se hornea `data-label` en el nodo (rompería A3).
- **Gris de límite:** lo **computa el iframe** desde su propio DOM (`querySelectorAll('[data-section-id]')` → índice/total → primera/última), re-evaluado en el recompute. Es cosmético; no es autoridad competidora del orden (la autoridad es el admin). Sin dato extra en el mensaje.

### Condiciones transversales (a–d)
- **(a) Preview-gated estricto:** el chrome tiene CERO presencia en la tienda publicada (mismo `isPreview` que el bridge; el script y el overlay solo existen en preview). Se verifica con **byte-compare público** en el deploy (como 7a): público byte-idéntico, chrome ausente.
- **(b) Mensajes validados (estándar G3):** ver §5.
- **(c) Chrome trackea por `data-section-id`** y re-posiciona tras cada patch; `set-selection` se secuencia DESPUÉS de que el patch landa.
- **(d) Reusar** las ops estructurales (C.1 v10) + el look aprobado.

---

## 5. Protocolo de mensajes (contrato + seguridad G3)

Origin canónicos: `ADMIN_ORIGIN = https://aimma.com.co`; `tenantOrigin = https://<slug>.tienda.aimma.com.co`.

### Existentes (sin cambios)
- Admin→iframe: `{type:'reload'}`, `{type:'theme', colors, font_pairing}`, `{type:'section-patch', op, sectionId, html?, index?, toIndex?}`.
- iframe→admin: `{type:'select', sectionId}`, `{type:'preview-ready'}`.

### NUEVOS

**`{type:'set-selection', sectionId, label}`** — admin → iframe.
- targetOrigin = `tenantOrigin` (nunca `'*'`).
- Recepción en el iframe: `e.origin !== ADMIN_ORIGIN` → return (igual que el resto del bridge).
- `sectionId`: `null` (deselección, limpia el chrome) o string que matchea `/^sec_[a-z0-9]{4,}$/`. Si no matchea → return.
- `label`: string; pintado con `textContent` (escapado). Si no es string → label vacío.
- Efecto: re-query `[data-section-id="<id>"]`; si existe → dibuja/posiciona el chrome + computa gris de límite; si no existe → limpia el chrome (defensivo).

**`{type:'section-action', action, sectionId}`** — iframe → admin.
- targetOrigin = `ADMIN_ORIGIN` (nunca `'*'`).
- Validación en el admin **ANTES** de tocar `editorState` (un frame malicioso no debe poder disparar ops estructurales):
  1. `event.origin === state.tenantOrigin` (ya lo hace el handler).
  2. `action ∈ {'up','down','duplicate','remove'}` (enum exacto).
  3. `typeof sectionId === 'string'` && matchea `/^sec_[a-z0-9]{4,}$/` && **`editorState.findSection(sectionId)` existe** (sección conocida).
  - Cualquier fallo → return silencioso.
- Despacho:
  - `up` → `idx = índice de sectionId`; `reorderSections(idx, idx-1)` (no-op si idx<=0).
  - `down` → `reorderSections(idx, idx+1)` (no-op si idx>=len-1).
  - `duplicate` → `nuevo = duplicateSection(sectionId)`; tras drenar el patch → `select(nuevo)` (→ `set-selection(nuevo)`).
  - `remove` → **dispara el modal de confirmación del admin**; al confirmar → `removeSection(sectionId)` (→ selección se limpia → `set-selection(null)`).

### Secuenciación con C.1 (condición c)
El admin emite `set-selection` **después** de que la cola serial (v10) drena el patch resultante de la op estructural. Para selección sin op (click simple) el `set-selection` se emite al cambiar `editorState.selection`. Mecanismo: el admin escucha `'selection'` y, en ops que generan patch, encola el `set-selection` tras `drainPatches()`.

---

## 6. Modelo de selección (flujo)

```
[click en sección del iframe]
  → iframe: postMessage {select, sectionId} → admin
  → admin: editorState.select(sectionId)            (fuente única)
  → admin: (notify 'selection') → inspector rebuild  (ya existe)
  → admin: postMessage {set-selection, sectionId, label} → iframe
  → iframe: dibuja/posiciona chrome sobre [data-section-id], computa gris

[botón subir/bajar/duplicar del chrome]
  → iframe: postMessage {section-action, action, sectionId} → admin
  → admin: valida (origin+enum+conocido) → op estructural → patch (C.1, serial)
  → (drena patch) → admin: select(target) → set-selection → iframe re-posiciona

[botón borrar del chrome]
  → iframe: {section-action, remove, sectionId} → admin
  → admin: modal confirmación (CANCELAR seguro / ELIMINAR advertencia)
       confirmar → removeSection → patch remove (C.1) → select(null) → set-selection(null) → chrome limpio
       cancelar  → no-op

[click en vacío del canvas | cerrar drawer]
  → editorState.select(null) → set-selection(null) → chrome limpio
```

---

## 7. Archivos (crear / modificar) — mapa, sin código

**Storefront (deploy primero — orden A2):**
- `apps/storefront/src/pages/index.astro` (MOD, bloque `{isPreview}`):
  - Recibir `set-selection` (validado) → dibujar/limpiar chrome (overlay flotante doc-anchored).
  - Crear el overlay del chrome (recuadro `pointer-events:none` + barrita `pointer-events:auto` con 4 botones + etiqueta `textContent`).
  - Botones → `postMessage {section-action, action, sectionId}` con `stopPropagation`.
  - Recompute: en `set-selection`, `resize`, `section-patch` (engancha al final del handler existente), `ResizeObserver(body)`.
  - Gris de límite computado del DOM.
  - Click en vacío (no `closest('[data-section-id]')`) → `postMessage {select, sectionId:null}` (deselección).
  - **Todo dentro de `{isPreview}`** (condición a).
  - Posible CSS del chrome: `<style>` también dentro de `{isPreview}` (o inline en el script) para no tocar el bundle público.

**Admin (merge a main → Easypanel; cache-busters):**
- `editor-canvas.js` (MOD): manejar `section-action` (validar origin+enum+conocido → despachar ops); emitir `set-selection` (incl. label desde sectionDefs) al cambiar selección y tras drenar patch; emitir `set-selection(null)` en deselección.
- `editor.js` (MOD, mínimo): enganchar el `set-selection` post-drain en el carril patch serial (v10) si hace falta orquestar el "después de que el patch landa".
- `editor-modal-confirm` (NUEVO o helper en un módulo existente): modal estilizado del admin (CANCELAR prominente / ELIMINAR advertencia). Reutilizable.
- `editor-inspector.js` (MOD, **polish opcional Q3-nota2**): cambiar el `confirm()` nativo de "Eliminar sección" por el mismo modal estilizado → UX de borrado consistente. Si infla el scope se difiere; no bloquea Paso 1.
- `editor-styles.css` (MOD): estilos del modal de confirmación (el chrome se estiliza en el storefront).
- `index.html` (MOD): cache-busters de los archivos tocados.

**Tests:** ver §9.

---

## 8. Seguridad

- **Preview-gated (a):** chrome y su script viven dentro de `{isPreview}`; público sin chrome. Verificado por byte-compare público.
- **Origin en ambos sentidos:** iframe valida `ADMIN_ORIGIN`; admin valida `tenantOrigin`. targetOrigin siempre el esperado, nunca `'*'`.
- **`section-action` no es una superficie de privilegio:** el admin valida enum + sección conocida antes de mutar; un frame hostil no dispara ops. (La ops viven en el admin autenticado; el iframe solo "pide".)
- **Label:** `textContent`, nunca `innerHTML`.
- **`set-selection`:** `sectionId` validado por regex; `null` permitido (deselección).
- **Byte-identidad del nodo (A3):** el chrome es overlay hermano; el nodo de la sección no se muta → el fragmento SSR sigue byte-idéntico.

---

## 9. Tests y gates de deploy

**Unit / jsdom (admin):**
- Validación de `section-action`: rechaza action fuera de enum, sectionId mal formado, sección inexistente; acepta y despacha los 4 válidos.
- `up`/`down` calculan idx y no-opean en límites.
- `duplicate` selecciona la copia; `remove` pasa por el modal (mock confirm→sí/no).
- `set-selection` se emite con el label correcto (desde sectionDefs) y tras drenar el patch.

**Storefront (vitest / DOM):**
- El bloque de chrome **no** aparece sin `isPreview`.
- `set-selection` válido dibuja el chrome; `null` lo limpia; sectionId desconocido no rompe.
- Gris de límite: primera deshabilita subir, última deshabilita bajar.
- pointer-events: outline `none`, barrita `auto`.

**Adversarial bridge (runtime real, estándar G3) — foco en `section-action` (el mensaje NUEVO que dispara ops → el sensible):**
- **Sanity positivo PRIMERO:** `section-action` válidos (`up`/`down`/`duplicate` con origin y sectionId correctos) → aplican la op (el camino feliz funciona antes de probar el rechazo).
- `set-selection` / `section-action` con `origin` forjado (≠ ADMIN_ORIGIN en el iframe; ≠ tenantOrigin en el admin) → ignorado.
- `section-action` con `action` fuera del enum → ignorado.
- `section-action` con `sectionId` desconocido (no en `editorState`) → ignorado, sin mutar estado.
- **CRÍTICO:** `section-action(action='remove')` **solo ABRE el modal**, NUNCA borra por sí solo. Un mensaje no puede auto-confirmar: el borrado exige un click humano en ELIMINAR del modal. Test: enviar el mensaje remove → assert que la sección **sigue presente** y el modal está abierto; solo el click en ELIMINAR la borra.
- Probado en chromium real (no solo curl/synthetic — lección 7b: el fetch cross-origin del browser y los `MessageEvent` reales hay que ejercitarlos).

**Byte-compare público (condición a, como 7a):**
- Leer el HTML público (no-preview) de tiendas reales antes/después → **byte-idéntico**, chrome ausente.
- Paridad de fragmento (A3) sigue verde (el nodo no se mutó).

**Verificación live (Playwright contra admin prod, sesión minteada):**
- click en sección → chrome aparece sobre ella + inspector muestra esa sección.
- subir/bajar → reordena en vivo (patch) + chrome sigue a la sección + límites grises correctos.
- duplicar → copia aparece + chrome salta a la copia.
- borrar → modal; cancelar = no-op; confirmar = sección desaparece + chrome limpio; Deshacer la recupera.
- deselección por click en vacío.
- **AVISO:** no verificar JUSTO tras el redeploy de Easypanel (worker asentándose da falsos FAIL); esperar y aislar con probes.

**Orden de deploy — ADITIVO/DORMIDO (A2, como el bridge en C.1-7a):**
1. **Storefront primero** (wrangler): chrome + recepción `set-selection` + emisión `section-action`. Es **dormido** por construcción: el chrome NO se dibuja sin recibir `set-selection`, y el admin VIEJO (aún vivo) NO manda `set-selection` → el chrome queda inerte para el usuario actual.
2. **Gate del estado dormido (empírico, antes de tocar el admin):**
   - **byte-compare público** de tiendas reales → idéntico, chrome ausente para visitantes (condición a).
   - **Confirmar que con el admin VIEJO todavía vivo el chrome NO se activa** (dormido): abrir el editor actual contra el storefront nuevo → ningún chrome aparece al seleccionar (el admin viejo no emite `set-selection`). Sin regresión del preview C.1 (patch/save siguen).
3. Recién con (2) verde → **merge a main → Jorge redeploya Easypanel** (admin nuevo que ya emite `set-selection` + maneja `section-action`).
4. **Verificación live** del flujo completo. Restaurar aimma-test al cierre.

---

## 10. Bloqueante previo a spike/build (NO en spec)

**🔴 ROTAR CREDENCIALES antes de cualquier spike/build de C.2** (no diferible): Management PAT (`sbp_6bc938…`) + service_role + Supabase PAT — re-expuestos en las verificaciones de C.1. La fase de spec no toca credenciales; el gate de implementación arranca con la rotación.

---

## 11. YAGNI / fuera de alcance
- Sin drag-and-drop (subir/bajar cubre el reorder).
- Sin edición inline (Paso 2).
- Sin observar la sección individual en el ResizeObserver salvo que aparezca drift solo-de-ancho (no pre-construir).
- Sin nuevos controles de propiedades (siguen en el inspector).
