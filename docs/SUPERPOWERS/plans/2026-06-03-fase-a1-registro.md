# FASE A.1 — Registro único de secciones (sectionDefs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colapsar la definición dispersa de las 9 secciones del editor (defaults + inspector forms + catálogo) en UN registro `sectionDefs` admin-only que un generador consume, y deduplicar el Zod a una sola fuente — con CERO regresión visible.

**Architecture:** `section-defs.js` (IIFE, `window.TiendaIA.editorSectionDefs`) es la única fuente de metadata de UI para el admin. `editor-inspector.js` deja de tener 9 `renderXxxProps` hardcodeados y pasa a un generador que arma el form leyendo `defs[tipo].campos` y mapeando cada campo a un helper de `editor-controls.js`. `editor-state.js` (defaults) y `editor-modal-catalog.js` (catálogo) derivan del mismo registro. El Zod (`packages/database/src/editor-schema.ts`) queda como única fuente de validación; el EF Deno lo importa vía `import_map` en vez de inlinearlo. Un drift-guard test fuerza a sectionDefs y Zod a coincidir = efectivamente 1 fuente.

**Tech Stack:** JS browser (IIFE/`window.TiendaIA`), Zod 3.25.76 (npm) / esm.sh zod@3.25.76 (Deno EF), node:test (built-in, node>=20), jsdom + tsx (devDeps de test), Supabase Edge Functions (Deno) vía MCP deploy.

**Restricciones (de FASE A1 + FASE A1(2)):**
- Rama `fase-a1-registro`. NO push/merge/deploy sin OK de Jorge sobre: (a) diff completo, (b) 3 tests de identidad verdes para los 9 tipos, (c) drift-guard verde, (d) confirmación de versión zod.
- sectionDefs es **admin-only para siempre** — NO generador, NO promoción al paquete (el storefront renderiza desde `section.props`, no desde sectionDefs).
- Reusar `editor-controls.js`, `editor-state.js`, `editor-canvas.js`. Rehacer SOLO `editor-inspector.js`. Agregar `section-defs.js`.
- **RIESGO A VIGILAR:** los 2 controles compuestos (`list`, `toggle-object`) son lo único no trivial. El generador DEBE producir DOM byte-idéntico para los tipos que los usan (`list`: botones/galeria/formulario; `toggle-object`: banner). Si NO se logra salida idéntica → **PARAR y escalar a Jorge**, no workaround silencioso.
- Versión zod confirmada: **3.25.76** (instalada en `packages/database/node_modules/zod`, coincide con `package.json ^3.25.76`). Import map del EF: `https://esm.sh/zod@3.25.76`.

---

## File Structure

**Crear:**
- `iapanel/tienda/admin/views/editor/section-defs.js` — registro `window.TiendaIA.editorSectionDefs = { OPTS, defs }`. Única fuente de metadata UI (label, catalog, context, render_strategy, ancho/padding default, `campos[]`).
- `tests/editor/package.json` — `{"type":"module"}` + devDeps jsdom + tsx (aislado del runtime; no afecta a Easypanel ni al workspace storefront).
- `tests/editor/harness.mjs` — carga `editor-controls.js` + `section-defs.js` en un `window` jsdom y expone un `renderInspectorFor(tipo)`.
- `tests/editor/golden/` — snapshots dorados (capturados del comportamiento ACTUAL antes de refactorizar): `default-props.json` + `inspector-<tipo>.html` (9).
- `tests/editor/01-default-props.test.mjs` — identidad JSON de `createSectionDefault` (9 tipos).
- `tests/editor/02-inspector-dom.test.mjs` — identidad innerHTML del inspector (9 tipos, cubre list/toggle-object).
- `tests/editor/03-drift-guard.test.mjs` — sectionDefs.campos ↔ Zod fields por tipo (nombres + opcionalidad).
- `supabase/functions/_shared/deno.json` — import map `{ "imports": { "zod": "https://esm.sh/zod@3.25.76" } }` para el EF.

**Modificar:**
- `iapanel/tienda/admin/views/editor/editor-inspector.js` — REESCRIBIR: 9 `renderXxxProps` → 1 generador.
- `iapanel/tienda/admin/views/editor/editor-state.js:95-169` — `defaultProps()`/`createSectionDefault()` derivan de sectionDefs.
- `iapanel/tienda/admin/views/editor/editor-modal-catalog.js:10-33` — ESENCIALES/AVANZADOS derivan de sectionDefs.
- `iapanel/tienda/admin/index.html` — cargar `section-defs.js` antes de los demás editor JS + bump cache de los modificados.
- `packages/database/src/editor-schema.ts` — sin cambio de contenido salvo confirmar `import { z } from 'zod'` (bare) — ya lo es.
- `supabase/functions/tienda-guardar-layout/index.ts` y `supabase/functions/tienda-form-submit/index.ts` — quitar el Zod inline, `import` desde `./editor-schema.ts` (copiado al deploy via `files[]`).

**Borrar:**
- `supabase/functions/_shared/editor-schema.ts` (copia Deno hand-maintained — reemplazada por el import del canonical en el deploy).

---

## Task 0: Setup de rama y harness de test

**Files:**
- Create: `tests/editor/package.json`, `tests/editor/harness.mjs`

- [ ] **Step 1: Confirmar rama**

Run: `git branch --show-current`
Expected: `fase-a1-registro`

- [ ] **Step 2: Crear `tests/editor/package.json`**

```json
{
  "name": "aimma-editor-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --import tsx --test"
  },
  "devDependencies": {
    "jsdom": "^25.0.1",
    "tsx": "^4.19.2",
    "zod": "3.25.76"
  }
}
```

- [ ] **Step 3: Instalar deps de test**

Run: `cd tests/editor && npm install`
Expected: jsdom, tsx, zod instalados (sin tocar el workspace root ni storefront).

- [ ] **Step 4: Crear `tests/editor/harness.mjs`** (carga los IIFE del admin en jsdom)

```js
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN = resolve(HERE, '../../iapanel/tienda/admin/views/editor');

// Crea un window jsdom limpio y carga los IIFE del editor en orden.
// files: nombres relativos a /views/editor (ej. 'editor-controls.js').
export function bootWindow(files) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const { window } = dom;
  // Los IIFE usan `window` y `document`; los exponemos como globals para el eval.
  const sandboxEval = (code) => {
    // eslint-disable-next-line no-new-func
    const fn = new Function('window', 'document', 'setTimeout', 'clearTimeout', 'console', code);
    fn(window, window.document, window.setTimeout.bind(window), window.clearTimeout.bind(window), console);
  };
  for (const f of files) {
    sandboxEval(readFileSync(resolve(ADMIN, f), 'utf8'));
  }
  return window;
}
```

- [ ] **Step 5: Commit**

```bash
git add tests/editor/package.json tests/editor/harness.mjs
git commit -m "test(editor): harness jsdom para tests de identidad fase-a1"
```

---

## Task 1: Capturar GOLDEN del comportamiento ACTUAL (antes de refactorizar)

> Crítico: el golden = la verdad actual. Se captura ANTES de tocar inspector/state. Las pruebas de identidad de las Tasks 5/6 comparan el código nuevo contra estos golden.

**Files:**
- Create: `tests/editor/capture-golden.mjs`, `tests/editor/golden/default-props.json`, `tests/editor/golden/inspector-<tipo>.html` (9)

- [ ] **Step 1: Escribir `tests/editor/capture-golden.mjs`**

```js
// Captura el output ACTUAL de createSectionDefault (9 tipos) y del inspector (9 tipos).
// Corre con el editor-state.js y editor-inspector.js ACTUALES (pre-refactor).
import { bootWindow } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLD = resolve(HERE, 'golden');
mkdirSync(GOLD, { recursive: true });

const TIPOS = ['banner','texto','imagen','botones','productos','galeria','formulario','espacio','video'];

const win = bootWindow(['editor-controls.js', 'editor-state.js', 'editor-inspector.js']);
const T = win.TiendaIA;

// --- Golden A: createSectionDefault por tipo (id normalizado para diff estable) ---
T.editorState.init({}, 'tienda-test');
const defaults = {};
for (const tipo of TIPOS) {
  // addSection crea con createSectionDefault; leemos la última y normalizamos el id.
  const id = T.editorState.addSection(tipo);
  const sec = JSON.parse(JSON.stringify(T.editorState.findSection(id)));
  sec.id = 'sec_GOLDEN';
  defaults[tipo] = sec;
  T.editorState.removeSection(id);
}
writeFileSync(resolve(GOLD, 'default-props.json'), JSON.stringify(defaults, null, 2));

// --- Golden B: innerHTML del inspector por tipo ---
for (const tipo of TIPOS) {
  T.editorState.init({ pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z',
    sections: [ { ...defaults[tipo], id: 'sec_golden0' } ] } } }, 'tienda-test');
  const container = win.document.createElement('div');
  T.editorInspector.render(container, {});
  T.editorState.select('sec_golden0');
  // render() ya escuchó 'selection' -> rebuild; forzamos rebuild por las dudas.
  T.editorInspector.rebuild();
  writeFileSync(resolve(GOLD, `inspector-${tipo}.html`), normalizeHtml(container.innerHTML));
}

function normalizeHtml(html) {
  // Normaliza ids dinámicos sec_xxxx para diff estable.
  return html.replace(/sec_[a-z0-9]{4,}/g, 'sec_X').trim();
}
console.log('golden capturado:', TIPOS.length, 'tipos');
```

- [ ] **Step 2: Ejecutar la captura**

Run: `cd tests/editor && node --import tsx capture-golden.mjs`
Expected: imprime `golden capturado: 9 tipos`; crea `golden/default-props.json` + 9 `golden/inspector-*.html`.

- [ ] **Step 3: Inspeccionar 2 golden manualmente (sanity)**

Verificar que `golden/inspector-banner.html` contiene los 2 switch (imagen de fondo, boton) y que `golden/inspector-botones.html` contiene 2 `ed-list-item` (los 2 botones default). Si no, el harness no cargó bien — arreglar antes de seguir.

- [ ] **Step 4: Commit (congela la verdad actual)**

```bash
git add tests/editor/capture-golden.mjs tests/editor/golden/
git commit -m "test(editor): golden snapshots del comportamiento actual (pre-refactor)"
```

---

## Task 2: Crear `section-defs.js` con los 9 tipos

**Files:**
- Create: `iapanel/tienda/admin/views/editor/section-defs.js`

- [ ] **Step 1: Escribir el esqueleto + OPTS + banner + productos** (entries aprobadas en el gate)

```js
/* AIMMA Tienda IA · Editor PRO-MAX · Fase A.1 · section-defs.js v1
 * Registro UNICO de metadata de UI de secciones (admin-only). Consumido por
 * editor-inspector (generador), editor-state (defaults) y editor-modal-catalog.
 * NO lo consume el storefront (renderiza desde section.props). Marker: editor-a1-sectiondefs.
 */
(function (window) {
  'use strict';

  // Listas de opciones compartidas (transcritas 1:1 de editor-inspector.js:18-49).
  const OPTS = {
    ALIGN: [{ v: 'left', l: 'Izquierda' }, { v: 'center', l: 'Centro' }, { v: 'right', l: 'Derecha' }],
    TAMANIO: [{ v: 'sm', l: 'Pequeno' }, { v: 'md', l: 'Mediano' }, { v: 'lg', l: 'Grande' }, { v: 'xl', l: 'Extra grande' }],
    PADDING: [{ v: 'sm', l: 'Pequeno' }, { v: 'md', l: 'Medio' }, { v: 'lg', l: 'Grande' }, { v: 'xl', l: 'Extra grande' }],
    ANCHO: [{ v: 'completo', l: 'Ancho completo (borde a borde)' }, { v: 'contenido', l: 'Centrado (con margenes)' }],
    ESTILO_VISUAL: [{ v: 'primary', l: 'Principal' }, { v: 'secondary', l: 'Secundario' }, { v: 'ghost', l: 'Fantasma' }, { v: 'outline', l: 'Borde' }],
    TARGET: [{ v: '_self', l: 'Misma pestana' }, { v: '_blank', l: 'Nueva pestana' }],
    ICONO: [{ v: '', l: 'Sin icono' }, { v: 'arrow', l: 'Flecha' }, { v: 'whatsapp', l: 'WhatsApp' }, { v: 'email', l: 'Email' }, { v: 'phone', l: 'Telefono' }, { v: 'location', l: 'Ubicacion' }, { v: 'link', l: 'Link' }],
    CAMPO_TIPO: [{ v: 'text', l: 'Texto corto' }, { v: 'email', l: 'Email' }, { v: 'tel', l: 'Telefono' }, { v: 'textarea', l: 'Texto largo' }, { v: 'select', l: 'Lista de opciones' }, { v: 'checkbox', l: 'Casilla de verificacion' }],
    OBJETO: [{ v: 'cover', l: 'Cubrir (recorta si hace falta)' }, { v: 'contain', l: 'Contener (sin recorte)' }],
    ASPECT_IMG: [{ v: '', l: 'Automatica' }, { v: '16/9', l: '16:9' }, { v: '4/3', l: '4:3' }, { v: '1/1', l: '1:1 (cuadrada)' }, { v: '3/4', l: '3:4 (vertical)' }, { v: '4/5', l: '4:5 (vertical)' }],
    ASPECT_VIDEO: [{ v: '16/9', l: '16:9 (video)' }, { v: '4/3', l: '4:3' }, { v: '1/1', l: '1:1 (cuadrado)' }],
    ORDEN: [{ v: 'recientes', l: 'Mas recientes' }, { v: 'precio_asc', l: 'Precio: menor a mayor' }, { v: 'precio_desc', l: 'Precio: mayor a menor' }, { v: 'manual', l: 'Manual' }],
    COLUMNAS: [{ v: 'auto', l: 'Automatico' }, { v: 2, l: '2 columnas' }, { v: 3, l: '3 columnas' }, { v: 4, l: '4 columnas' }],
    GALERIA_LAYOUT: [{ v: 'grid', l: 'Grilla uniforme' }, { v: 'carrusel', l: 'Carrusel horizontal' }, { v: 'mosaico', l: 'Mosaico' }],
    GALERIA_GAP: [{ v: 'tight', l: 'Compacto' }, { v: 'normal', l: 'Normal' }, { v: 'loose', l: 'Aireado' }],
    FONDO_TIPO: [{ v: 'transparente', l: 'Transparente' }, { v: 'color', l: 'Color' }, { v: 'imagen', l: 'Imagen' }, { v: 'gradient', l: 'Degradado CSS' }],
    BANNER_OBJETO: [{ v: 'cover', l: 'Cubrir' }, { v: 'contain', l: 'Contener' }],
  };

  const defs = {
    banner: {
      label: 'Banner principal',
      catalog: { group: 'esencial', icon: '★', desc: 'La foto grande y el titulo que ve el cliente al entrar.' },
      context: null, render_strategy: 'per-template',
      ancho_default: 'completo', padding_default: 'lg',
      campos: [
        { key: 'titulo', control: 'text', label: 'Titulo', default: 'Tu titulo aqui', opts: { maxLength: 200 } },
        { key: 'subtitulo', control: 'textarea', label: 'Subtitulo (opcional)', default: undefined, optional: true, opts: { maxLength: 500, rows: 3 } },
        { key: 'alineacion', control: 'select', label: 'Alineacion', default: 'left', opts: { options: 'ALIGN' } },
        { key: 'imagen_fondo', control: 'toggle-object', label: 'Usar imagen de fondo', default: undefined, optional: true,
          on_default: { src: 'https://placehold.co/1600x900', alt: '', objeto: 'cover' },
          subfields: [
            { key: 'src', control: 'url', label: 'URL imagen (https)' },
            { key: 'alt', control: 'text', label: 'Texto alternativo (alt)', opts: { maxLength: 200 } },
          ] },
        { key: 'boton', control: 'toggle-object', label: 'Mostrar boton', default: undefined, optional: true,
          on_default: { texto: 'Ver productos', url: '#productos', estilo_visual: 'primary', target: '_self', icono: 'arrow' },
          subfields: [
            { key: 'texto', control: 'text', label: 'Texto del boton', opts: { maxLength: 80 } },
            { key: 'url', control: 'url', label: 'URL (https / mailto / tel / # / /)' },
            { key: 'estilo_visual', control: 'select', label: 'Estilo del boton', opts: { options: 'ESTILO_VISUAL' } },
            { key: 'icono', control: 'select', label: 'Icono', opts: { options: 'ICONO' }, empty_to_undefined: true },
            { key: 'target', control: 'select', label: 'Abrir en', opts: { options: 'TARGET' } },
          ] },
      ],
    },
    productos: {
      label: 'Productos',
      catalog: { group: 'esencial', icon: '▦', desc: 'La grilla con los productos de tu tienda.' },
      context: 'product', render_strategy: 'unified',
      ancho_default: 'completo', padding_default: 'md',
      campos: [
        { key: 'categoria_id', control: 'text', label: 'ID de categoria (vacio = todas)', default: null, empty_to_null: true },
        { key: 'limite', control: 'slider', label: 'Cantidad de productos', default: 8, opts: { min: 1, max: 12, step: 1 } },
        { key: 'orden', control: 'select', label: 'Ordenar por', default: 'recientes', opts: { options: 'ORDEN' } },
        { key: 'columnas', control: 'select', label: 'Columnas', default: 'auto', opts: { options: 'COLUMNAS' } },
        { key: 'mostrar_precio', control: 'switch', label: 'Mostrar precio', default: true },
      ],
    },
    // texto, imagen, botones, galeria, formulario, espacio, video → Step 2
  };

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorSectionDefs = { OPTS, defs };
})(window);
```

- [ ] **Step 2: Completar los 7 tipos restantes** transcribiendo 1:1 de las fuentes actuales. Para cada tipo, los campos deben tener EXACTAMENTE el mismo `label`, `default`, `opts` y ORDEN que hoy producen `editor-state.js defaultProps()` (`:95-144`) y `editor-inspector.js renderXxxProps()`:

  - **texto** (`renderTextoProps :218-226`, default `:104-105`): `[ {contenido, textarea, opts:{maxLength:5000,rows:5}, default:'Escribi aqui tu texto.'}, {alineacion, select, ALIGN, default:'left'}, {tamanio, select, TAMANIO, default:'md'} ]`. context:null, render_strategy:'unified', padding 'md', ancho 'contenido'.
  - **imagen** (`renderImagenProps :228-245`, default `:106-107`): `[ {src,url,opts:{placeholder:'https://...'},default:'https://placehold.co/1200x600'}, {alt,text,opts:{maxLength:200},default:'Imagen'}, {objeto,select,OBJETO,default:'cover'}, {aspect_ratio,select,ASPECT_IMG,default:undefined,empty_to_undefined:true}, {link_url,url,default:undefined,empty_to_undefined:true} ]`. ancho 'completo'.
  - **botones** (`renderBotonesProps :285-322`, default `:108-114`): `[ {items, list, min:1, max:6, add_label:'+ Agregar boton', item_label:'Boton', add_default:{texto:'Nuevo boton',url:'#',estilo_visual:'secondary',target:'_self'}, item:[ {texto,text,opts:{maxLength:80}}, {url,url}, {estilo_visual,select,ESTILO_VISUAL}, {icono,select,ICONO,empty_to_undefined:true}, {target,select,TARGET} ] } ]`. default items = los 2 de `:110-113`. ancho 'contenido'.
  - **galeria** (`renderGaleriaProps :325-369`, default `:117-126`): `[ {layout,select,GALERIA_LAYOUT,default:'grid'}, {gap,select,GALERIA_GAP,default:'normal'}, {imagenes, list, min:3, max:12, add_label:'+ Agregar imagen', item_label:'Imagen', min_note:'La galeria necesita al menos 3 imagenes para verse bien.', add_default_fn:'galeria_img', item:[ {src,url}, {alt,text,opts:{maxLength:200}} ] } ]`. default imagenes = las 3 de `:119-123`. ancho 'completo'.
  - **formulario** (`renderFormularioProps :372-419`, default `:127-136`): `[ {titulo,text,opts:{maxLength:200},default:'Escribinos',empty_to_undefined:true}, {boton_texto,text,opts:{maxLength:80},default:'Enviar'}, {campos, list, min:1, max:8, add_label:'+ Agregar campo', item_label:'Campo', add_default:{tipo_campo:'text',label:'Nuevo campo',requerido:false}, item:[ {label,text,opts:{maxLength:120}}, {tipo_campo,select,CAMPO_TIPO,rebuild_on_change:true}, {placeholder,text,opts:{maxLength:200},empty_to_undefined:true}, {opciones,textarea,opts:{rows:3,placeholder:'Opcion 1\\nOpcion 2'},when:{field:'tipo_campo',eq:'select'},transform:'lines'}, {requerido,switch} ] } ]`. default campos = los 3 de `:130-134`. ancho 'contenido'.
  - **espacio** (`renderEspacioProps :267-271`, default `:137-138`): `[ {altura,select,TAMANIO,default:'md'} ]`. padding 'sm', ancho 'contenido'.
  - **video** (`renderVideoProps :273-282`, default `:139-140`): `[ {html,textarea,opts:{maxLength:2000,rows:6,placeholder:'<iframe src="https://www.youtube.com/embed/..."></iframe>'},default:''}, {__info:'Solo se permiten videos o mapas de: YouTube, Vimeo, CodePen, CodeSandbox, Google Maps o Spotify.'}, {aspect_ratio,select,ASPECT_VIDEO,default:'16/9'} ]`. ancho 'completo'.

  Nota `default` por campo: el valor que hoy pone `defaultProps(tipo)`. `ancho_default`/`padding_default` salen de `defaultAncho()/defaultPadding()` (`editor-state.js:146-158`).

- [ ] **Step 3: Cargar section-defs.js en index.html ANTES de los demás editor JS**

En `iapanel/tienda/admin/index.html`, agregar antes de `editor-state.js` (línea 160):
```html
  <script src="views/editor/section-defs.js?v=1"></script>
```

- [ ] **Step 4: node --check**

Run: `node --check iapanel/tienda/admin/views/editor/section-defs.js`
Expected: sin salida (OK).

- [ ] **Step 5: Commit**

```bash
git add iapanel/tienda/admin/views/editor/section-defs.js iapanel/tienda/admin/index.html
git commit -m "feat(editor): section-defs.js - registro unico de metadata de 9 secciones"
```

---

## Task 3: Reescribir `editor-inspector.js` como generador

**Files:**
- Modify: `iapanel/tienda/admin/views/editor/editor-inspector.js` (reemplaza los 9 renderXxxProps por el generador)

> El generador llama a los MISMOS helpers de `editor-controls.js` con los MISMOS args/orden que el código actual → innerHTML idéntico por construcción. Los sub-generadores `renderList` y `renderToggleObject` replican exactamente `listItemCard`/switch+rebuild actuales. NO cambiar `editor-controls.js`. NO cambiar el bloque "Apariencia" (`buildBaseControls`) ni las acciones (Duplicar/Eliminar).

- [ ] **Step 1: Reemplazar el bloque "Renderers de props por tipo" + `tipoRenderer`** por el dispatcher genérico

Mantener `render`, `rebuild`, `renderEmpty`, `buildBaseControls`, `moveItem`, `listItemCard`, `closeDrawer`, `bindStateListeners`, `SECTION_LABEL` (o derivar label de `defs[tipo].label`). Reemplazar `renderForSection` y eliminar los 9 `renderXxxProps`:

```js
  function controlsLib() { return window.TiendaIA.editorControls; }
  function defsFor(tipo) { return window.TiendaIA.editorSectionDefs.defs[tipo]; }
  function optList(ref) { return Array.isArray(ref) ? ref : window.TiendaIA.editorSectionDefs.OPTS[ref]; }

  function renderForSection(sec) {
    const C = controlsLib();
    const ES = window.TiendaIA.editorState;
    const def = defsFor(sec.tipo);
    const wrap = C.el('div', { class: 'ed-inspector__body' });

    const header = C.el('div', { class: 'ed-inspector__head' }, [
      C.el('h4', { class: 'ed-inspector__header' }, 'Seccion: ' + (def ? def.label : sec.tipo)),
      C.el('button', { type: 'button', class: 'ed-inspector__close', 'aria-label': 'Cerrar panel', onClick: () => closeDrawer() }, '×'),
    ]);
    wrap.appendChild(header);

    if (def) def.campos.forEach((campo) => renderCampo(wrap, sec, campo, C, ES));

    wrap.appendChild(C.collapsibleSection('Apariencia de la seccion', buildBaseControls(sec, C, ES)));
    wrap.appendChild(C.primaryButton('Duplicar seccion', () => ES.duplicateSection(sec.id)));
    wrap.appendChild(C.dangerButton('Eliminar seccion', () => { if (confirm('Eliminar esta seccion?')) ES.removeSection(sec.id); }));
    return wrap;
  }
```

- [ ] **Step 2: `renderCampo` (dispatch por control, escribe en props)** — replica el binding actual

```js
  // Aplica el valor a props respetando empty_to_undefined / empty_to_null.
  function setProp(ES, sec, key, value, campo) {
    if (campo && campo.empty_to_undefined && !value) value = undefined;
    if (campo && campo.empty_to_null && !value) value = null;
    ES.updateSectionProps(sec.id, { [key]: value });
  }

  function renderCampo(wrap, sec, campo, C, ES) {
    if (campo.__info) { wrap.appendChild(C.infoBox(campo.__info)); return; }
    const p = sec.props || {};
    switch (campo.control) {
      case 'text':
        wrap.appendChild(C.textInput(campo.label, p[campo.key] || '', v => setProp(ES, sec, campo.key, v, campo), campo.opts || {})); break;
      case 'textarea':
        wrap.appendChild(C.textarea(campo.label, p[campo.key] || '', v => setProp(ES, sec, campo.key, v, campo), campo.opts || {})); break;
      case 'url':
        wrap.appendChild(C.urlInput(campo.label, p[campo.key] || '', v => setProp(ES, sec, campo.key, v, campo), campo.opts || {})); break;
      case 'select': {
        const cur = p[campo.key] == null ? (campo.key === 'columnas' ? 'auto' : (campo.default ?? '')) : p[campo.key];
        wrap.appendChild(C.select(campo.label, cur, optList(campo.opts.options),
          v => setProp(ES, sec, campo.key, campo.empty_to_undefined ? (v || undefined) : v, campo))); break;
      }
      case 'switch':
        wrap.appendChild(C.switch(campo.label, p[campo.key] !== false && (p[campo.key] === undefined ? campo.default !== false : !!p[campo.key]),
          v => setProp(ES, sec, campo.key, v, campo))); break;
      case 'slider':
        wrap.appendChild(C.slider(campo.label, p[campo.key] || campo.default, campo.opts.min, campo.opts.max, campo.opts.step,
          v => setProp(ES, sec, campo.key, v, campo))); break;
      case 'toggle-object':
        renderToggleObject(wrap, sec, campo, C, ES); break;
      case 'list':
        renderList(wrap, sec, campo, C, ES); break;
      default: break;
    }
  }
```

> **AJUSTE OBLIGATORIO:** el `switch` de `mostrar_precio` hoy es `p.mostrar_precio !== false` (`editor-inspector.js:263`). Verificar contra el golden; si el ternario de arriba no reproduce exactamente ese valor inicial, ajustarlo a `p[campo.key] !== false`. El golden manda. Igual para `columnas` (`:259` usa `p.columnas == null ? 'auto' : p.columnas`).

- [ ] **Step 3: `renderToggleObject`** (replica banner imagen_fondo/boton, `:174-215`)

```js
  function renderToggleObject(wrap, sec, campo, C, ES) {
    const p = sec.props || {};
    const obj = p[campo.key];
    const tiene = !!obj;
    wrap.appendChild(C.switch(campo.label, tiene, on => {
      ES.updateSectionProps(sec.id, { [campo.key]: on ? campo.on_default : undefined });
      window.TiendaIA.editorInspector.rebuild();
    }));
    if (!tiene) return;
    const upd = (patch) => ES.updateSectionProps(sec.id, { [campo.key]: { ...obj, ...patch } });
    campo.subfields.forEach((sf) => {
      const val = obj[sf.key] || '';
      if (sf.control === 'url') wrap.appendChild(C.urlInput(sf.label, val, v => upd({ [sf.key]: v }), sf.opts || {}));
      else if (sf.control === 'text') wrap.appendChild(C.textInput(sf.label, val, v => upd({ [sf.key]: v }), sf.opts || {}));
      else if (sf.control === 'select') wrap.appendChild(C.select(sf.label, obj[sf.key] || '', optList(sf.opts.options),
        v => upd({ [sf.key]: sf.empty_to_undefined ? (v || undefined) : v })));
    });
  }
```

- [ ] **Step 4: `renderList`** (replica botones/galeria/formulario, reusa `listItemCard`+`moveItem`)

```js
  function renderList(wrap, sec, campo, C, ES) {
    const arr = Array.isArray(sec.props && sec.props[campo.key]) ? sec.props[campo.key] : [];
    const replace = (next) => ES.updateSectionProps(sec.id, { [campo.key]: next });

    arr.forEach((it, idx) => {
      const card = listItemCard(C, campo.item_label + ' ' + (idx + 1), {
        idx, total: arr.length,
        onUp: () => { replace(moveItem(arr, idx, idx - 1)); window.TiendaIA.editorInspector.rebuild(); },
        onDown: () => { replace(moveItem(arr, idx, idx + 1)); window.TiendaIA.editorInspector.rebuild(); },
        onRemove: arr.length > campo.min ? () => { replace(arr.filter((_, i) => i !== idx)); window.TiendaIA.editorInspector.rebuild(); } : null,
      });
      const upd = (patch) => replace(arr.map((x, i) => i === idx ? { ...x, ...patch } : x));
      campo.item.forEach((sf) => {
        if (sf.when && it[sf.when.field] !== sf.when.eq) return;
        if (sf.control === 'text') card.body.appendChild(C.textInput(sf.label, it[sf.key] || '', v => upd({ [sf.key]: sf.empty_to_undefined ? (v || undefined) : v }), sf.opts || {}));
        else if (sf.control === 'url') card.body.appendChild(C.urlInput(sf.label, it[sf.key] || '', v => upd({ [sf.key]: v }), sf.opts || {}));
        else if (sf.control === 'textarea' && sf.transform === 'lines') card.body.appendChild(C.textarea(sf.label, (Array.isArray(it[sf.key]) ? it[sf.key] : []).join('\n'), v => upd({ [sf.key]: v.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20) }), sf.opts || {}));
        else if (sf.control === 'select') card.body.appendChild(C.select(sf.label, it[sf.key] || '', optList(sf.opts.options), v => { upd({ [sf.key]: v }); if (sf.rebuild_on_change) window.TiendaIA.editorInspector.rebuild(); }));
        else if (sf.control === 'switch') card.body.appendChild(C.switch(sf.label, !!it[sf.key], v => upd({ [sf.key]: v })));
      });
      wrap.appendChild(card.root);
    });

    if (arr.length < campo.max) {
      wrap.appendChild(C.primaryButton(campo.add_label, () => {
        const item = campo.add_default_fn === 'galeria_img'
          ? { src: 'https://placehold.co/800x800/eee/666?text=' + (arr.length + 1), alt: '' }
          : campo.add_default;
        replace(arr.concat([item]));
        window.TiendaIA.editorInspector.rebuild();
      }));
    } else {
      wrap.appendChild(C.infoBox('Maximo ' + campo.max + ' ' + campo.item_label.toLowerCase() + (campo.key === 'imagenes' ? 's en la galeria.' : (campo.key === 'campos' ? 's en el formulario.' : 's por seccion.'))));
    }
    if (campo.min_note && arr.length < campo.min) wrap.appendChild(C.infoBox(campo.min_note));
  }
```

> **NOTA list:** los textos de "Maximo N ..." e "info" deben quedar BYTE-idénticos a `:319-321`, `:363-368`, `:416-418`. Si el armado de arriba no los reproduce, hardcodear el texto por `campo.max_note` en sectionDefs en vez de construirlo. El golden manda.

- [ ] **Step 5: node --check**

Run: `node --check iapanel/tienda/admin/views/editor/editor-inspector.js`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add iapanel/tienda/admin/views/editor/editor-inspector.js
git commit -m "refactor(editor): inspector schema-driven (generador desde section-defs)"
```

---

## Task 4: Derivar defaults (editor-state) y catálogo (editor-modal-catalog) del registro

**Files:**
- Modify: `editor-state.js:95-169`, `editor-modal-catalog.js:10-75`

- [ ] **Step 1: `editor-state.js` — `defaultProps`/`defaultAncho`/`defaultPadding`/`createSectionDefault` derivan de sectionDefs**

Reemplazar `defaultProps(tipo)` (`:95-144`), `defaultPadding` (`:146-150`), `defaultAncho` (`:152-158`) por lectura de `window.TiendaIA.editorSectionDefs`:

```js
  function sectionDef(tipo) { return window.TiendaIA.editorSectionDefs.defs[tipo]; }

  function defaultProps(tipo) {
    const def = sectionDef(tipo);
    if (!def) return {};
    const props = {};
    def.campos.forEach((c) => {
      if (c.__info) return;
      if (c.default !== undefined) props[c.key] = structuredClone(c.default);
    });
    return props;
  }
  function defaultPadding(tipo) { const d = sectionDef(tipo); return d ? d.padding_default : 'md'; }
  function defaultAncho(tipo) { const d = sectionDef(tipo); return d ? d.ancho_default : 'completo'; }
```

> Verificar contra `golden/default-props.json`: si algún tipo tenía un campo con `default: undefined` que igual aparecía en el JSON (no debería — `undefined` no serializa), el golden lo confirma. El test de la Task 5 es el árbitro.

- [ ] **Step 2: `editor-modal-catalog.js` — ESENCIALES/AVANZADOS derivan de sectionDefs**

Reemplazar los arrays hardcodeados (`:10-33`) por derivación:

```js
  const D = window.TiendaIA.editorSectionDefs.defs;
  const ORDER = ['banner', 'productos', 'botones', 'texto', 'galeria', 'imagen', 'espacio', 'formulario', 'video'];
  const cards = ORDER.map(tipo => ({ tipo, icon: D[tipo].catalog.icon, title: D[tipo].label, desc: D[tipo].catalog.desc, group: D[tipo].catalog.group }));
  const ESENCIALES = cards.filter(c => c.group === 'esencial');
  const AVANZADOS = cards.filter(c => c.group === 'avanzado');
```

> `ORDER` reproduce el orden actual del catálogo (`editor-modal-catalog.js:10-33`): esenciales [banner, productos, botones, texto], avanzados [galeria, imagen, espacio, formulario, video]. El `title` del catálogo hoy es 'Banner principal', 'Productos', 'Botones', 'Texto' etc. — confirmar que `def.label` coincide (banner.label='Banner principal' ✓). Para 'espacio' el catálogo dice 'Espacio en blanco' pero el inspector SECTION_LABEL dice 'Espacio en blanco' — usar `def.label` y poner `label:'Espacio en blanco'` en sectionDefs (no 'Espacio'). Para 'video' label='Video o mapa'. **Confirmar cada title contra `:11-32`.**

- [ ] **Step 3: node --check de ambos**

Run: `node --check iapanel/tienda/admin/views/editor/editor-state.js && node --check iapanel/tienda/admin/views/editor/editor-modal-catalog.js`
Expected: OK.

- [ ] **Step 4: Bump cache en index.html** de los modificados: `editor-state.js?v=4→5`, `editor-inspector.js?v=4→5`, `editor-modal-catalog.js?v=4→5`.

- [ ] **Step 5: Commit**

```bash
git add iapanel/tienda/admin/views/editor/editor-state.js iapanel/tienda/admin/views/editor/editor-modal-catalog.js iapanel/tienda/admin/index.html
git commit -m "refactor(editor): defaults y catalogo derivan de section-defs"
```

---

## Task 5: Tests de identidad (createSectionDefault + inspector DOM) verdes para los 9 tipos

**Files:**
- Create: `tests/editor/01-default-props.test.mjs`, `tests/editor/02-inspector-dom.test.mjs`

- [ ] **Step 1: `01-default-props.test.mjs`** (compara contra golden)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootWindow } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(HERE, 'golden/default-props.json'), 'utf8'));
const TIPOS = Object.keys(golden);

test('createSectionDefault identico al golden (9 tipos)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  const T = win.TiendaIA;
  T.editorState.init({}, 'tienda-test');
  for (const tipo of TIPOS) {
    const id = T.editorState.addSection(tipo);
    const sec = JSON.parse(JSON.stringify(T.editorState.findSection(id)));
    sec.id = 'sec_GOLDEN';
    assert.deepEqual(sec, golden[tipo], `defaultProps drift en tipo ${tipo}`);
    T.editorState.removeSection(id);
  }
});
```

- [ ] **Step 2: `02-inspector-dom.test.mjs`** (compara innerHTML contra golden; cubre list/toggle-object)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootWindow } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(HERE, 'golden/default-props.json'), 'utf8'));
const TIPOS = Object.keys(golden);
const norm = (h) => h.replace(/sec_[a-z0-9]{4,}/g, 'sec_X').trim();

for (const tipo of TIPOS) {
  test(`inspector DOM identico al golden — ${tipo}`, () => {
    const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
    const T = win.TiendaIA;
    T.editorState.init({ pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z',
      sections: [ { ...golden[tipo], id: 'sec_golden0' } ] } } }, 'tienda-test');
    const container = win.document.createElement('div');
    T.editorInspector.render(container, {});
    T.editorState.select('sec_golden0');
    T.editorInspector.rebuild();
    const expected = norm(readFileSync(resolve(HERE, `golden/inspector-${tipo}.html`), 'utf8'));
    assert.equal(norm(container.innerHTML), expected, `inspector DOM drift en ${tipo}`);
  });
}
```

- [ ] **Step 3: Ejecutar los 2 tests**

Run: `cd tests/editor && npm test`
Expected: 10 tests PASS (1 default-props + 9 inspector-dom).

- [ ] **Step 4: SI FALLA list o toggle-object (botones/galeria/formulario/banner)** — diff el innerHTML esperado vs actual, ajustar el sub-generador hasta byte-identidad. **Si tras un intento serio no se logra identidad → PARAR y escalar a Jorge** (no workaround silencioso, regla explícita).

- [ ] **Step 5: Commit**

```bash
git add tests/editor/01-default-props.test.mjs tests/editor/02-inspector-dom.test.mjs
git commit -m "test(editor): identidad createSectionDefault + inspector DOM (9 tipos) verde"
```

---

## Task 6: Drift-guard test (sectionDefs ↔ Zod)

**Files:**
- Create: `tests/editor/03-drift-guard.test.mjs`

- [ ] **Step 1: Escribir el drift-guard** (importa el Zod canonical vía tsx, compara campos por tipo)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootWindow } from './harness.mjs';
// Import del Zod canonical (TS) via tsx loader.
import { SectionSchema } from '../../packages/database/src/editor-schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

// Campos del Zod por tipo: discriminatedUnion -> opciones -> shape de props.
function zodFieldsByTipo() {
  const out = {};
  for (const opt of SectionSchema._def.options) {
    const tipo = opt.shape.tipo._def.value;          // z.literal('banner') -> 'banner'
    const propsShape = opt.shape.props._def.shape();  // ZodObject de props
    const fields = {};
    for (const [k, v] of Object.entries(propsShape)) fields[k] = v.isOptional();
    out[tipo] = fields;
  }
  return out;
}

// Campos del registro admin por tipo: key -> esOpcional (optional || empty_to_undefined || nullable).
function defsFieldsByTipo(win) {
  const D = win.TiendaIA.editorSectionDefs.defs;
  const out = {};
  for (const [tipo, def] of Object.entries(D)) {
    const fields = {};
    for (const c of def.campos) {
      if (c.__info) continue;
      fields[c.key] = !!(c.optional || c.empty_to_undefined);
    }
    out[tipo] = fields;
  }
  return out;
}

test('sectionDefs y Zod coinciden en campos por tipo (nombres + opcionalidad)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js']);
  const zod = zodFieldsByTipo();
  const defs = defsFieldsByTipo(win);
  assert.deepEqual(Object.keys(defs).sort(), Object.keys(zod).sort(), 'set de tipos difiere');
  for (const tipo of Object.keys(zod)) {
    assert.deepEqual(Object.keys(defs[tipo]).sort(), Object.keys(zod[tipo]).sort(), `campos difieren en ${tipo}`);
    for (const k of Object.keys(zod[tipo])) {
      assert.equal(defs[tipo][k], zod[tipo][k], `opcionalidad difiere en ${tipo}.${k} (defs=${defs[tipo][k]} zod=${zod[tipo][k]})`);
    }
  }
});
```

> **Nota de opcionalidad:** en Zod, los campos con `.default()` NO son `isOptional()` (tienen valor por defecto, no son omisibles en el output) — son requeridos en el tipo de salida. Verificar empíricamente con un tipo (ej. `texto.alineacion` tiene `.default('left')` → `isOptional()` = ? ). Si Zod los marca opcionales-en-input, ajustar el criterio del lado defs a `optional || empty_to_undefined || has_default`. El primer run del test revela el criterio exacto; alinear ambos lados a la misma definición de "opcional" y documentarlo en el test.

- [ ] **Step 2: Ejecutar**

Run: `cd tests/editor && npm test`
Expected: el drift-guard PASS (junto a los 10 de la Task 5).

- [ ] **Step 3: Commit**

```bash
git add tests/editor/03-drift-guard.test.mjs
git commit -m "test(editor): drift-guard sectionDefs<->Zod por tipo (cierra Pilar 2)"
```

---

## Task 7: Dedupe del Zod (paquete único + EF importa, sin inline)

**Files:**
- Confirm: `packages/database/src/editor-schema.ts` usa `import { z } from 'zod'` (ya lo hace, `:7`)
- Create: `supabase/functions/_shared/deno.json`
- Modify (en repo): `supabase/functions/tienda-guardar-layout/index.ts`, `supabase/functions/tienda-form-submit/index.ts`
- Delete: `supabase/functions/_shared/editor-schema.ts`

> El deploy real de las EFs es **GATED** (solo tras OK de Jorge). En esta Task se preparan los archivos del repo y el plan de deploy; el `deploy_edge_function` se ejecuta en la Task 9 tras la aprobación.

- [ ] **Step 1: Crear `supabase/functions/_shared/deno.json`**

```json
{ "imports": { "zod": "https://esm.sh/zod@3.25.76" } }
```

- [ ] **Step 2: Preparar `tienda-guardar-layout/index.ts`** — quitar el Zod inline (`:15-203` del bloque inlineado) y reemplazar por:

```ts
import { PersonalizacionesSchema } from './editor-schema.ts';
```
(El resto del handler usa `PersonalizacionesSchema` igual que hoy. El `BodySchema` que envuelve queda en el index, importando lo necesario.)

- [ ] **Step 3: Preparar `tienda-form-submit/index.ts`** — idéntico criterio: importar del `./editor-schema.ts` lo que use (revisar qué del schema consume; si solo valida `campos`, importar `CampoSchema`/lo que aplique). Anclar a lo que el archivo realmente usa.

- [ ] **Step 4: Definir el set de `files[]` del deploy** (documentar para la Task 9). Cada EF se deployará con: `index.ts` + `editor-schema.ts` (copia EXACTA de `packages/database/src/editor-schema.ts` al momento del deploy) + `deno.json` como import_map. Comando MCP: `deploy_edge_function({ name, entrypoint_path:'index.ts', verify_jwt:false, import_map_path:'deno.json', files:[index.ts, editor-schema.ts, deno.json] })`.

- [ ] **Step 5: Borrar la copia Deno hand-maintained**

Run: `git rm supabase/functions/_shared/editor-schema.ts`

- [ ] **Step 6: Commit (solo repo, sin deploy)**

```bash
git add supabase/functions/_shared/deno.json supabase/functions/tienda-guardar-layout/index.ts supabase/functions/tienda-form-submit/index.ts
git commit -m "refactor(ef): EFs importan editor-schema canonical (dedupe zod via import_map)"
```

---

## Task 8: Confirmación de versión de zod (gate (d))

- [ ] **Step 1: Confirmar versión instalada**

Run: `node -e "console.log(require('./packages/database/node_modules/zod/package.json').version)"`
Expected: `3.25.76`

- [ ] **Step 2: Confirmar coincidencia con el import_map**

`supabase/functions/_shared/deno.json` apunta a `https://esm.sh/zod@3.25.76` = misma versión exacta. Documentar en el reporte del gate: npm 3.25.76 == Deno esm.sh 3.25.76 → validan idéntico.

---

## Task 9: Verificación final + GATE de merge/deploy (requiere OK de Jorge)

- [ ] **Step 1: Correr toda la suite**

Run: `cd tests/editor && npm test`
Expected: 11 tests PASS (1 default-props + 9 inspector-dom + 1 drift-guard).

- [ ] **Step 2: node --check de todos los JS admin tocados**

Run: `for f in section-defs editor-inspector editor-state editor-modal-catalog; do node --check iapanel/tienda/admin/views/editor/$f.js && echo "OK $f"; done`
Expected: OK los 4.

- [ ] **Step 3: Preparar el paquete del gate para Jorge:** (a) `git --no-pager diff main...fase-a1-registro` completo, (b) salida verde de los 11 tests, (c) salida verde del drift-guard, (d) confirmación zod 3.25.76. **PARAR aquí y mostrar a Jorge. No merge, no push, no deploy de EFs sin su OK.**

- [ ] **Step 4 (SOLO tras OK de Jorge): Deploy EFs** via MCP con `import_map` + `files[]` (guardar-layout v6, form-submit vN). Smoke: las 9 secciones validan igual; payload inválido sigue 400; `tienda-form-submit` sigue 403 sin auth. Redeploy = único punto que toca producción.

- [ ] **Step 5 (tras deploy): E2E aimma-test (Jorge, navegador):** las 9 secciones se editan/guardan/renderean idéntico. Confirmar DoD.

---

## Self-Review

- **Cobertura del spec:** sectionDefs (T2) ✓; inspector generador (T3) ✓; defaults+catálogo derivados (T4) ✓; dedupe Zod (T7) ✓; drift-guard (T6, adición de Jorge) ✓; versión zod (T8, adición de Jorge) ✓; 3 tests de identidad (T1 golden + T5) ✓; list/toggle-object byte-idéntico con regla de PARAR (T5 step 4) ✓; gate de merge/deploy (T9) ✓; sectionDefs admin-only sin generador ✓.
- **Riesgo declarado:** la identidad DOM de list/toggle-object es el punto frágil; T5 lo aísla y obliga a escalar si no se logra.
- **No-asunción pendiente de verificar en ejecución:** (1) criterio exacto de "opcional" en Zod con `.default()` (T6 step 1 nota); (2) textos "Maximo N…" del list (T3 step 4 nota); (3) valor inicial de `mostrar_precio`/`columnas` en el select/switch (T3 step 2 ajuste). En los 3, **el golden es el árbitro**, no la suposición.
