# FASE C — Edición en vivo: preview por PATCH SSR + click-to-edit — Spec de diseño

> Estado: diseña-primero APROBADO por Jorge en gates Q1–Q4 (2026-06-05). Este spec aterriza esas decisiones. NADA de código hasta OK de Jorge sobre el spec. Branch `feat/fase-c` (desde main, post-hotfix autosave). C.3 (autosave robusto) YA hecho en el hotfix [[project_aimma_editor_hotfix_autosave]].

## 0. Anclaje (verificado, file:line)
- **Canvas = iframe del storefront en preview** (`editor-canvas.js`), token efímero. Hoy tras cada save: `refresh()` → `{type:'reload'}` → `location.reload()` del iframe (recarga COMPLETA). C reemplaza esto por PATCH.
- **Toda sección se envuelve en `_SectionShell.astro:37`**: `<section class="block-section …" data-section-id={id} data-section-tipo={tipo}>`. Wrapper DRY de los 30 blocks → **nodo de swap uniforme**.
- **`BlockRenderer.astro:72`** mapea `sections.map((section) => <Block section={section} />)` — **NO pasa índice**. Cada block renderiza solo de su `section`. **Chequeo posición-horneada: PASS** — ningún block hornea posición de sección (los `idx` existentes son intra-sección: `Formulario` campos, `BotonesFashionBold` items; estables bajo move). → **reorder = mover-nodo seguro**.
- **Contenido referencia tokens**: blocks usan `var(--ta-color-*)`/`var(--ta-font-*)` (Tailwind). El `_SectionShell` hornea solo `section.fondo` (per-sección, CSS-safe Zod) — eso es contenido, no tema. **Dos carriles ya separados por construcción.**
- **Bridge de preview** (`index.astro`, solo `isPreview`): listener `message` origin-gated (`e.origin !== ADMIN_ORIGIN`), handlers `reload`/`theme`/`select`/`preview-ready`. Click delegado (`document` + `closest('[data-section-id]')`). Las 4 defensas del bridge del tema verificadas adversarialmente en G3.
- **editorState** (admin): ops `addSection/removeSection/reorderSections/duplicateSection/updateSectionProps/updateSectionBase/setTheme*` + snapshots/undo/redo. `serialize()` manda `theme` + `pages.home`.
- **EF save** (`tienda-guardar-layout`): `PersonalizacionesSchema` (Zod) + `sanitizeHome` (sanitize-html sobre secciones `texto`). verify_jwt=true. **sanitize-html corre en Deno Y CF Workers** (DOMPurify no — lección rich-text).

## 1. Alcance
- **C.1**: preview en vivo por **PATCH de fragmento SSR por-sección** (no reload). + carril tema instantáneo (ya existe) intacto.
- **C.2**: **click-to-edit** en dos pasos. Paso 1: edición en inspector + chrome de selección/estructura en el canvas. Paso 2: inline de TEXTO SIMPLE en el canvas.
- **C.3**: hecho (hotfix). Fuera de alcance acá salvo integración.
- NO toca el schema de secciones, ni las plantillas, ni el flujo de publicación. Meta: editor "en vivo" estilo Wix sin sacrificar fidelidad ni seguridad.

## 2. C.1 — Endpoint SSR por-sección (Opción A)
### 2.1 Endpoint `/_internal/render-section` (ruta Astro del storefront — necesario: solo el storefront puede SSR los blocks)
- **POST**, **gated por preview-token** [req#1] — MISMA validación que el render del preview (`validate_preview_token` RPC, `tienda_id` == tenant resuelto). Sin token válido → 403.
- Body: `{ tienda_id, section: <1 sección JSON> }`.
- Pipeline:
  1. **`validateAndSanitizeSection(section)` — FUNCIÓN COMPARTIDA, UN SOLO SOURCE** [req#2, blindaje Q3]: `SectionSchema.parse` (Zod) + sanitize-html de los campos rich-text (hoy `props.contenido` de `texto`). El **save (EF) y el endpoint importan LA MISMA función** — no dos implementaciones → `render == lo que se guarda`, cero bypass, no puede derivar. (Hoy el EF tiene `sanitizeHome` + `PersonalizacionesSchema`; se extrae la lógica por-sección a un módulo compartido importable por ambos runtimes — Zod ya está en `packages/database` + mirror EF; la policy sanitize-html se comparte igual. sanitize-html corre en CF y Deno.)
  2. Render vía **BlockRenderer de una sección** (array `[section]`) → produce el `<section data-section-id>…</section>` **idéntico** al output de página completa (mismo `_SectionShell`, mismas clases, **referencia `var(--ta-*)` — cero valor de tema horneado**).
  3. `productos`: el endpoint carga el catálogo por `tienda_id` (igual que la página).
- Devuelve: `{ html: '<section data-section-id=…>…</section>' }` (fragmento sanitizado).

### 2.2 Flujo DESACOPLADO [Q3]
Un edit de contenido dispara DOS flujos independientes desde el MISMO state local:
- **Patch (feedback):** debounce corto (~300 ms) → POST `/_internal/render-section` con el JSON de la sección del **state local** (no espera el save) → `html` → swap en el iframe. Near-instant.
- **Save (persistencia):** debounce 1.5 s → `saveDraft` → EF → BD (ya robusto, hotfix).
Ambos del mismo state; el endpoint valida/sanitiza igual que el save → el preview muestra exactamente lo que se guardará. Correctitud > los pocos ms (CF edge). *Optimistic-text overlay reconciliado = optimización POSTERIOR, no base.*

### 2.3 Dos carriles (NO re-acoplar) [blindaje Q4]
- **Tema** (color/tipografía) → carril instantáneo `postMessage` CSS-var existente (`type:'theme'`). NUNCA re-fetchea fragmentos.
- **Contenido/estructura** → fragmento SSR. El fragmento **referencia** tokens; un cambio de tema jamás toca fragmentos.

## 3. C.1 — Mecánica del swap [Q4]
Bridge nuevo en el preview (`index.astro`), DENTRO del listener `message` origin-gated. Mensaje `{ type:'section-patch', op, sectionId, html?, index?, toIndex? }`.

| editorState op | patch op | mecánica iframe | fetch? |
|---|---|---|---|
| updateSectionProps / updateSectionBase / fondo | `replace` | `el=[data-section-id=sectionId]; el.outerHTML=html` | sí (1) |
| addSection(tipo, idx) | `insert` | nodo desde `html` → insertar en `index` del contenedor de secciones | sí (1) |
| duplicateSection | `insert` | render de la copia → insertar después | sí (1) |
| removeSection | `remove` | quitar `[data-section-id=sectionId]` | no |
| reorderSections(from,to) | `move` | mover el nodo existente a `toIndex` (HTML idéntico — chequeo §0 PASS) | no |

- **Contenedor de secciones**: el padre de los `[data-section-id]` (output de BlockRenderer dentro de `<main>`). El bridge lo deriva del primer `[data-section-id]` o de un selector estable.
- **Click-select delegado** sobrevive los swaps (listener en `document`).

### 3.1 Seguridad del bridge del swap [req#3 + rigor G3, Q4.3]
- **Origin EXACTO**: `e.origin === ADMIN_ORIGIN` (match estricto, NO `startsWith`). (Confirmar que el handler `theme`/`select` existentes también son `===`; si alguno usa laxo, endurecer.)
- **Shape validado ANTES de tocar el DOM**: `op ∈ {replace,insert,remove,move}` (enum conocido); `sectionId` con formato conocido (`/^sec_[a-z0-9]{4,}$/`); `index`/`toIndex` enteros en rango. Mensaje fuera de forma → ignorado.
- **Confiar el `html` SIN re-sanitizar en browser** [Q4.3]: el HTML viene de NUESTRO SSR (sanitizado por la fn compartida) + bridge origin+shape-gated. Re-sanitizar en browser DIVERGIRÍA del publicado (la página real no re-sanitiza) y sería un 3er sanitizer (lección rich-text). La defensa es (a) la fn sanitize compartida en el source, (b) el origin EXACTO + shape estricto antes del `outerHTML`.

### 3.2 Fallback de reload ACOTADO
`editorCanvas.reloadFull()` (re-mintea el token — sin 403, ya del hotfix). Se dispara SOLO en: error/timeout del endpoint, nodo-no-encontrado (desync), o **undo/redo** (reemplazan el array entero → multi-sección; primer corte = reloadFull; diff-y-patch fino = optimización posterior [Q4.2]). Edits de rutina = **cero reload**.

## 4. C.2 — Click-to-edit (DOS pasos, gate entre cada uno)
### 4.1 PASO 1 — base inspector-driven (capa nueva grande)
- **Chrome de selección en el canvas** (vía bridge, en el preview): al click en una sección → `outline` + **barra flotante de sección** (subir/bajar/duplicar/borrar) + **etiqueta** del tipo. Las acciones mapean a editorState ops → patch (§3).
- **Edición de contenido en el INSPECTOR** (DOM del admin): reusa el inspector + el widget **rich-text de B-controles #4**. El canvas refleja por fragmento SSR (§2–3). Cero edición cross-origin.
- Gate: probado + verificado en vivo antes del paso 2.

### 4.2 PASO 2 — inline de texto simple (destino comprometido)
- **Solo TEXTO SIMPLE/PLANO** (strings: títulos/subtítulos): doble-click en el canvas → editable in-situ → reconciliación contra el fragmento SSR.
- **GUARDRAIL DURO**: el inline es SOLO texto plano. **Rich-text SIEMPRE en el inspector** — cero contenteditable de rich-text/HTML en el storefront (lección rich-text). Imagen/fondo/link/listas/estructura → SIEMPRE inspector.
- Cross-origin: el editable vive en el preview; el script del preview maneja la edición + postMessage del string plano al admin (que actualiza state → save + patch). Sanitize del string plano = trivial (sin HTML).
- C.2 **cierra** cuando el inline de texto simple está vivo y verificado.

## 5. Seguridad (resumen, no-negociable)
1. `/_internal/render-section` gated por preview-token.
2. `validateAndSanitizeSection` = MISMA función que el save (un source) → render==save, cero bypass, sanitize-html (corre en CF + Deno).
3. Bridge del swap: origin EXACTO + shape estricto antes del DOM; html confiado (SSR-sanitizado), sin 3er sanitizer.
4. Dos carriles independientes (tema ≠ fragmento).

## 6. Tests
- **Paridad render==página**: golden — el fragmento del endpoint para una sección == ese `<section data-section-id>` dentro del render de página completa (byte-idéntico).
- **Fuente única sanitize/Zod**: test que el endpoint y el save path importan/usan la MISMA `validateAndSanitizeSection` (no duplicada); payload malicioso (XSS en `contenido`) → sanitizado idéntico en ambos.
- **Swap por op** (jsdom o golden de la transformación DOM): replace/insert/remove/move producen el árbol esperado; reorder=move no cambia el HTML del nodo.
- **Bridge seguridad** (runtime, como G3): origin malo → ignorado; op fuera de enum → ignorado; sectionId mal formado → ignorado.
- **Desacople**: un cambio de tema NO dispara fetch al endpoint (carriles).
- **Fallback**: error del endpoint / nodo ausente → reloadFull (re-mint), sin 403.
- Suites existentes (tests/editor, storefront vitest) verdes.

## 7. Secuencia + gates (una capa nueva a la vez)
1. **C.1**: fn compartida `validateAndSanitizeSection` + endpoint `/_internal/render-section` + bridge `section-patch` + flujo desacoplado en el admin + fallback. → tests + **gate** (deploy storefront wrangler [endpoint+bridge] + admin Easypanel [flujo]; verificación en vivo del patch + seguridad bridge).
2. **C.2 Paso 1**: chrome de selección + edición en inspector sobre la base C.1. → **gate** (vivo).
3. **C.2 Paso 2**: inline de texto simple + reconciliación. → **gate** (vivo). C.2 cierra acá.
- Deploy por superficie: storefront = wrangler (endpoint+bridge, branch ok); admin = merge `--no-ff` a main + Easypanel. Rollback = wrangler rollback / git revert.

## 8. Invariantes
- Una sola fuente de render (BlockRenderer) y una sola de validate+sanitize (fn compartida) → cero drift, fidelidad real.
- Dos carriles: tema=CSS-var instantáneo; contenido=fragmento SSR. No re-acoplar.
- reorder/remove sin fetch; prop/add/duplicate con 1 fetch; undo/redo + errores → fallback acotado (re-mint).
- Rich-text nunca sale del inspector.
- Cada gate: diff + tests + verificación en vivo + OK de Jorge. Nada a prod sin OK.
