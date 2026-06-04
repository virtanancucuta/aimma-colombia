# B-CONTROLES — Diseño aprobado (Fase B, primera fase visible)

> Estado: APROBADO por Jorge 2026-06-04. Gate: implementar piloto (image-picker) → diff + validación → deploy admin + prueba en vivo → replicar los otros 3.

## Objetivo y límite de alcance
Agregar 4 controles nuevos al toolkit del inspector del editor (hoy 7), todos **registry-driven** vía `sectionDefs` (A.1): **image-picker, category/collection picker, color, rich-text**.

**FUERA de alcance:** editor de tema global (B-tema), secciones nuevas (B-secciones), selección manual de productos (diferida, ver abajo).

## El insight que ordena todo: Clase A vs Clase B
- **Clase A — swap de widget:** reemplaza el `control` de un campo existente, **mismo shape de valor**. → cero cambio Zod/storefront/golden; drift-guard verde por construcción.
- **Clase B — shape/semántica nueva:** campo nuevo o nuevo significado. → toca Zod + mirror EF (`tienda-guardar-layout/editor-schema.ts`) + storefront + golden (diff intencional).

**3 de 4 son Clase A** (image-picker, category picker, color) → baratos y seguros. Solo **rich-text es Clase B**.

## Contrato del toolkit (cómo se enchufa un control)
4 puntos de toque:
1. `iapanel/tienda/admin/views/editor/editor-controls.js` → `fn(label, value, onChange, opts)` devuelve HTMLElement, `onChange(value)` debounced 200ms.
2. `editor-inspector.js` `renderCampo()` → un `case 'x':` que llama `C.fn(...)` → `setProp(ES, sec, key, v, campo)` → `updateSectionProps`.
3. `section-defs.js` campo → `{ key, control:'x', label, default, opts, ... }`.
4. `editor-state.js` `defaultProps()` copia `campo.default` (structuredClone) como prop inicial.

**Drift-guard (`tests/editor/03-drift-guard.test.mjs`):** asierta sectionDefs↔Zod en (tipos + keys de campos + opcionalidad). Cambiar el `control` de un campo (misma key) → **verde**. Agregar campo → tocar ambos lados + mirror EF (`04-ef-schema-sync`).

## Controles (contrato + decisiones)

### 1. image-picker — Clase A — PILOTO
- **Widget:** botón → modal (patrón `editor-modal-catalog`) que lista objetos de `tienda-productos/<tienda_id>/…` (async) **+ upload** (decisión: IN).
- **Valor:** string URL https (idéntico al control `url`). Default igual que hoy.
- **Dónde:** reemplaza `control:'url'` en `imagen.src`, `banner.imagen_fondo.src`, `galeria.imagenes[].src`.
- **Impacto:** Zod/drift-guard/storefront/golden **sin cambios**. Deploy: **solo admin (Easypanel)**, NO storefront.
- **Decisión (a) — upload IN**, al path `<tienda_id>/editor/<ts>.<ext>`. **Dos guardas de seguridad, ambas verificadas YA enforced en BD (no convención):**
  - *Tipo+tamaño:* bucket `tienda-productos` con `file_size_limit=5MB` + `allowed_mime_types=[image/jpeg,jpg,png,webp]` (server-side). + validación client-side para fail-fast/UX.
  - *Path RLS:* policy `tienda_productos_insert_dueno` con `with_check ... tienda_ia_es_dueno((string_to_array(name,'/'))[1]::uuid)` → el tenant solo escribe bajo `<su_tienda_id>/`.

### 2. category/collection picker — Clase A
- **Widget:** modal que lista `categorias` (id, nombre, foto_url) de la tienda (async).
- **Valor:** `categoria_id` (uuid, idéntico) → cuadra con lo que el renderer ya fetchea (`eq categoria_id`). Reemplaza el `control:'text'` de `categoria_id`.
- **Impacto:** Zod/storefront/golden sin cambios. Es DISTINTO de `context` (página donde vive la sección), no confundir.
- **Decisión (b) — selección MANUAL de productos: DIFERIDA.** Es Clase B (campo nuevo `productos_ids: uuid[]` + capacidad de fetch-por-IDs en el renderer). Encaja en B-secciones ("productos destacados") o como adición Clase B puntual. Parqueada.

### 3. color — Clase A (wire-only)
- **Widget:** `colorPicker` que YA existe → agregar `case 'color'` en `renderCampo`. Valor: color CSS crudo (valida `CSS_COLOR_REGEX`).
- **Scope:** wire-only. NO se migra el bloque `fondo` al registry (es scope de otro refactor). Su payoff visible llega en B-tema/B-secciones cuando exista un campo de color real; en B-controles se cubre a nivel toolkit.

### 4. rich-text — Clase B — ÚLTIMO
- **Widget:** toolbar (negrita/itálica/link/lista) sobre `contenteditable`. **Formato:** HTML de subset restringido y sanitizado.
- **Sanitización (defensa en 3 capas):**
  1. Admin al editar (best-effort, UX).
  2. **EF al guardar = AUTORITATIVA** (`tienda-guardar-layout`): allowlist server-side → la BD NUNCA guarda HTML sucio.
  3. Storefront al renderear = defensa en profundidad (`isomorphic-dompurify`, ya dependencia) con allowlist estricta antes de `set:html`.
- **No-negociables:** (a) allowlist de la EF y config de DOMPurify **CONSISTENTES** (ninguno permite lo que el otro no contempla); (b) esquemas de href solo `https/mailto/tel` (NADA de `javascript:`/`data:`).
- **Impacto:** Zod (`texto.contenido` pasa a rich) + mirror EF + storefront (`set:html`) + **golden diff INTENCIONAL bendecido**.

## Tabla de impacto
| Control | Shape valor | Zod | Drift-guard | Storefront | Golden | Deploy |
|---|---|---|---|---|---|---|
| image-picker | URL https (igual) | — | verde | — | — | solo admin |
| category picker | uuid (igual) | — | verde | — | — | solo admin |
| color | color CSS crudo | — | verde | — | — | solo admin |
| rich-text | HTML sanitizado | cambia + mirror EF | actualizar ambos | cambia (set:html) | diff intencional | admin + storefront |

## Secuencia (riesgo creciente)
1. **image-picker** (piloto — async+modal+upload, Clase A) → fija el patrón.
2. **category picker** (replica directa, Clase A).
3. **color** (wire-only, trivial).
4. **rich-text** (Clase B, último, con review de sanitización).

## DoD (por control)
Renderea en inspector · round-trip guardar→recargar→idéntico · drift-guard verde · golden sin cambios (Clase A) o diff intencional (rich-text) · storefront ok (rich-text sin XSS) · agregar un control = render fn + case + 1 entry de campo.
