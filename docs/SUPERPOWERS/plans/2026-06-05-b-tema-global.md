# B-Tema Global — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps usan checkbox (`- [ ]`).

**Goal:** Tema GLOBAL editable (4 colores + tipografía) como capa de override sobre paleta/plantilla, con borrador/publicado + preview en vivo al click, sin tocar secciones.

**Architecture:** `personalizaciones.theme`/`theme_draft` (split como home/home_draft). Zod valida (colores `CSS_COLOR_REGEX`, fuentes enum). EF promueve theme_draft→theme en publish. Storefront Layout resuelve `theme.colors?.x ?? paleta.color_x` + pairing del allowlist. Panel admin consolidado con preview en vivo (postMessage validado).

**Tech Stack:** Zod, Astro 5 (Layout + preview bridge), CF Workers, admin JS plano (IIFE), Google Fonts.

**Branch:** `feat/b-tema-global` (desde main `8b796a2`). Spec: `docs/SUPERPOWERS/specs/2026-06-05-b-tema-global-design.md`.

**GATES POR SUPERFICIE (cada deploy = OK de Jorge con diff + verificación):**
- G1 (Task 1-2): schema + EF → deploy EF (MCP, verify_jwt=TRUE).
- G2 (Task 3): storefront Layout → `wrangler deploy` + verificación en vivo (render de theme + preview draft).
- G3 (Task 4-5): admin → merge `--no-ff` a main → Jorge redeploya Easypanel + prueba en vivo (preview-al-click + draft/publish).

---

## Task 1: Allowlist de fuentes + Zod ThemeSchema + mirror + validación

**Files:**
- Create: `packages/database/src/font-pairings.ts`
- Modify: `packages/database/src/editor-schema.ts` (ThemeSchema + theme_draft)
- Modify: `packages/database/src/index.ts` (export font-pairings)
- Sync: `supabase/functions/tienda-guardar-layout/editor-schema.ts` (mirror byte)
- Test: `tests/editor/12-tema-schema.test.mjs`

- [ ] **Step 1: Crear el allowlist de pairings**

Create `packages/database/src/font-pairings.ts` (datos puros, sin imports):
```ts
// AIMMA B-tema global · allowlist CURADO de pares de fuentes. Fuente de verdad para el storefront
// (carga + tokens) y el admin (preview + selector). El ID es el unico valor que cruza limites
// (postMessage / Zod enum); la URL/family se DERIVA de aca server-side -> sin URL libre.
export const FONT_PAIRINGS = {
  industrial: { display: '"IBM Plex Sans",system-ui,sans-serif', body: '"Inter",system-ui,sans-serif', url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap', label: 'Industrial', cat: 'Sans' },
  moderno:    { display: '"Inter",system-ui,sans-serif', body: '"Inter",system-ui,sans-serif', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', label: 'Moderno limpio', cat: 'Sans' },
  geometrico: { display: '"Poppins",system-ui,sans-serif', body: '"Inter",system-ui,sans-serif', url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap', label: 'Geométrico amigable', cat: 'Sans' },
  impacto:    { display: '"Anton",system-ui,sans-serif', body: '"Inter",system-ui,sans-serif', url: 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;900&display=swap', label: 'Impacto', cat: 'Display' },
  editorial:  { display: '"Fraunces","Playfair Display",Georgia,serif', body: '"Inter",system-ui,sans-serif', url: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap', label: 'Editorial cálido', cat: 'Serif' },
  elegante:   { display: '"Cormorant Garamond","Playfair Display",Georgia,serif', body: '"Inter",system-ui,sans-serif', url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap', label: 'Elegante clásico', cat: 'Serif' },
} as const;

export type FontPairingId = keyof typeof FONT_PAIRINGS;
export const FONT_PAIRING_IDS = Object.keys(FONT_PAIRINGS) as FontPairingId[];

// Default por plantilla (preserva el carácter actual sin override).
export const DEFAULT_PAIRING_BY_TEMPLATE: Record<string, FontPairingId> = {
  fashion_bold: 'impacto', industrial_clean: 'industrial',
  minimal_artesanal: 'editorial', editorial_magazine: 'elegante',
};
export function pairingForTemplate(slug: string | null | undefined): FontPairingId {
  return (slug && DEFAULT_PAIRING_BY_TEMPLATE[slug]) || 'industrial';
}
```

- [ ] **Step 2: Extender ThemeSchema + theme_draft**

En `packages/database/src/editor-schema.ts`: agregar import al tope (junto a `import { z }`):
```ts
import { FONT_PAIRING_IDS } from './font-pairings';
```
Reemplazar el `ThemeSchema` actual (líneas ~192-197) por:
```ts
// Colores: reusa CSS_COLOR_REGEX (definido arriba) -> bloquea inyeccion CSS. partial = override parcial.
const ThemeColorsSchema = z.object({
  primary: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
  accent: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
  text_base: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
  bg_base: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
}).partial();

const ThemeSchema = z.object({
  colors: ThemeColorsSchema.optional(),
  font_pairing: z.enum(FONT_PAIRING_IDS as [string, ...string[]]).optional(),
});
// .strip() es el default de z.object -> claves viejas (color_primary/font_*_url) se descartan sin error.
```
En `PersonalizacionesSchema` (líneas ~199-203), agregar `theme_draft`:
```ts
export const PersonalizacionesSchema = z.object({
  schema_version: z.literal(3),
  theme: ThemeSchema.optional(),
  theme_draft: ThemeSchema.optional(),
  pages: z.record(z.string(), PageSchema),
});
```

- [ ] **Step 3: Exportar font-pairings del paquete**

En `packages/database/src/index.ts`, agregar al final:
```ts
export * from './font-pairings';
```

- [ ] **Step 4: Test de validación (TDD, falla primero)**

Create `tests/editor/12-tema-schema.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PersonalizacionesSchema } from '../../packages/database/src/editor-schema.ts';
import { FONT_PAIRING_IDS } from '../../packages/database/src/font-pairings.ts';

const base = { schema_version: 3, pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [] } } };

test('tema: acepta colores hex validos + font_pairing del allowlist', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base,
    theme: { colors: { primary: '#1B4965', bg_base: '#FFF' }, font_pairing: 'editorial' } });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test('tema: RECHAZA color con inyeccion CSS', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base,
    theme: { colors: { primary: 'red; } body { background: url(http://evil) }' } } });
  assert.equal(r.success, false);
});

test('tema: RECHAZA font_pairing fuera del allowlist', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base, theme: { font_pairing: 'evil' } });
  assert.equal(r.success, false);
});

test('tema: STRIPEA la forma vieja del theme (color_primary/font_*_url) sin romper', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base,
    theme: { color_primary: '#fff', color_accent: '#000', font_display_url: 'https://x', font_body_url: 'https://y' } });
  assert.ok(r.success, 'el theme viejo debe parsear (claves stripeadas)');
  assert.deepEqual(r.data.theme, {}, 'las claves viejas se descartan -> theme vacio');
});

test('tema: theme_draft acepta la misma forma', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base, theme_draft: { colors: { accent: '#5FA8D3' } } });
  assert.ok(r.success);
});
```

- [ ] **Step 5: Correr (falla: el schema viejo no valida regex/enum/theme_draft), luego implementar Steps 1-3, re-correr (pasa)**

Run (desde `tests/editor/`): `npm test`
Expected primero FAIL (theme viejo permite todo / no hay theme_draft), tras Steps 1-3 PASS los 5.

- [ ] **Step 6: Re-sincronizar mirror EF + sync-test**

Run (desde raíz): `cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts`
Y copiar el font-pairings al dir de la EF (la EF importará `./font-pairings.ts` para... NO — la EF solo necesita el enum, que ya está inline en el ThemeSchema vía import. PERO el mirror EF importa `./font-pairings`): `cp packages/database/src/font-pairings.ts supabase/functions/tienda-guardar-layout/font-pairings.ts`
Run (desde `tests/editor/`): `npm test` → `04-ef-schema-sync` verde (mirror byte). Agregar al `04` (o un test nuevo) el sync byte de `font-pairings.ts` EF==canónico.

- [ ] **Step 7: Commit**
```bash
git add packages/database/src/font-pairings.ts packages/database/src/editor-schema.ts packages/database/src/index.ts supabase/functions/tienda-guardar-layout/editor-schema.ts supabase/functions/tienda-guardar-layout/font-pairings.ts tests/editor/12-tema-schema.test.mjs tests/editor/04-ef-schema-sync.test.mjs
git commit -m "feat(tema): ThemeSchema colors(regex)+font_pairing(enum)+theme_draft + font-pairings allowlist + mirror"
```

---

## Task 2: EF — promote theme_draft→theme (replica home_draft→home)  · GATE G1

**Files:** Modify `supabase/functions/tienda-guardar-layout/index.ts`

- [ ] **Step 1: Cambiar el manejo de theme en el paso 6**

En `index.ts` paso 6 (líneas ~155-167), HOY:
```ts
  next.schema_version = 3;
  if (body.personalizaciones.theme) { next.theme = body.personalizaciones.theme; }
  const homeFromClient = body.personalizaciones.pages.home;
  if (body.mode === 'draft') { next.pages.home_draft = { ...homeFromClient, updated_at: now }; }
  else { next.pages.home = { ...homeFromClient, updated_at: now }; delete next.pages.home_draft; }
```
Cambiar el bloque del theme por (replica de home):
```ts
  next.schema_version = 3;
  const themeFromClient = body.personalizaciones.theme;
  if (body.mode === 'draft') {
    if (themeFromClient !== undefined) next.theme_draft = themeFromClient;
  } else {
    // publish: promueve el theme + limpia el borrador
    if (themeFromClient !== undefined) next.theme = themeFromClient;
    delete next.theme_draft;
  }
  const homeFromClient = body.personalizaciones.pages.home;
  if (body.mode === 'draft') { next.pages.home_draft = { ...homeFromClient, updated_at: now }; }
  else { next.pages.home = { ...homeFromClient, updated_at: now }; delete next.pages.home_draft; }
```
(El cliente sigue mandando `theme: state.theme`; la EF rutea a theme_draft/theme según mode.)

- [ ] **Step 2: Devolver el theme en la respuesta (para syncTiendaCache)**

En el `return json({...})` final, agregar `theme_draft: next.theme_draft, theme: next.theme`:
```ts
  return json({ success: true, mode: body.mode, updated_at: now,
    home: body.mode === 'publish' ? next.pages.home : next.pages.home_draft,
    theme: next.theme, theme_draft: next.theme_draft });
```

- [ ] **Step 3: Verificación local del módulo (Deno-only no se corre acá)**

Run (desde raíz): `npx --yes tsx --eval "import('./supabase/functions/tienda-guardar-layout/font-pairings.ts').then(m=>console.log('pairings', m.FONT_PAIRING_IDS.length))"`
Expected: `pairings 6`.

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/tienda-guardar-layout/index.ts
git commit -m "feat(tema): EF promueve theme_draft->theme en publish (draft no toca theme publicado)"
```

- [ ] **Step 5: GATE G1 — deploy EF (OK de Jorge).** Deploy via MCP `deploy_edge_function` verify_jwt=TRUE (incluir index.ts + editor-schema.ts + font-pairings.ts + deno.json). Verificar fidelidad (get_edge_function) + boot (OPTIONS 204). **No avanzar sin OK.**

---

## Task 3: Storefront Layout — override + preview draft + pairing + golden  · GATE G2

**Files:**
- Modify: `apps/storefront/src/layouts/Layout.astro`
- Modify: `apps/storefront/src/pages/index.astro` (pasar isPreview-aware theme — ver nota)
- Create: `apps/storefront/test/theme.golden.test.ts` + `__snapshots__/theme/*.html`

- [ ] **Step 1: Layout resuelve theme override + pairing**

En `Layout.astro` frontmatter: importar `{ FONT_PAIRINGS, pairingForTemplate }` de `@aimma/database`. Resolver:
```ts
const pers: any = (tienda as any).personalizaciones;
// MISMA señal de preview que las paginas. Layout no conoce isPreview directo -> recibirlo por prop
// (index.astro lo pasa) con default false. theme publicado salvo en preview.
const themeActivo = (Astro.props.isPreview ? (pers?.theme_draft ?? pers?.theme) : pers?.theme) || {};
const tc = themeActivo.colors || {};
const primary = tc.primary || p?.color_primary || '#1a1a1a';
const accent = tc.accent || p?.color_accent || '#ff6b35';
const textBase = tc.text_base || p?.color_text_base || '#1a1a1a';
const bgBase = tc.bg_base || p?.color_bg_base || '#ffffff';
const pairing = FONT_PAIRINGS[themeActivo.font_pairing] || FONT_PAIRINGS[pairingForTemplate(tienda.plantilla?.slug)];
```
Cambiar `--ta-font-display/body` a `pairing.display/pairing.body` y el `<link rel=stylesheet href={template.fonts.googleFontsUrl}>` a `href={pairing.url}`. (auto-contrast `on-*` sigue derivando de primary/accent/bgBase.)

Agregar `isPreview` a `interface Props` (boolean, default false).

- [ ] **Step 2: index.astro pasa isPreview al Layout**

En `index.astro` el `<Layout ...>` (línea ~77), agregar `isPreview={isPreview}` (la var ya existe, `:19,36`). (Las otras páginas que usan Layout — legales — pasan isPreview=false por default, sin cambio.)

- [ ] **Step 3: Golden NUEVO del Layout (scoped a --ta-*)**

Create `apps/storefront/test/theme.golden.test.ts`: renderiza `Layout` (o un wrapper) con `renderToString` y un `tienda.personalizaciones` con/sin theme, asserta el `style` del `<html>` (los `--ta-*`) + el `<link>` de fuente. Casos: (a) sin theme → paleta default + pairing default por plantilla; (b) theme.colors override; (c) font_pairing override; (d) isPreview con theme_draft. Snapshot scoped al `<html style>` + el font `<link>` (NO el body/secciones). **Confirmar: los goldens de BLOCKS no cambian** (`git status apps/storefront/test/__snapshots__/` solo agrega `theme/`).

- [ ] **Step 4: Suite storefront + build**

Run (desde `apps/storefront/`): `npx vitest run` (verde, incluye theme.golden) + `npm run build` (compila).

- [ ] **Step 5: Commit**
```bash
git add apps/storefront/src/layouts/Layout.astro apps/storefront/src/pages/index.astro apps/storefront/test/theme.golden.test.ts apps/storefront/test/__snapshots__/theme
git commit -m "feat(tema): storefront Layout aplica theme override (colores+pairing) + preview lee theme_draft + golden"
```

- [ ] **Step 6: GATE G2 — `wrangler deploy` (OK de Jorge) + verificación en vivo.** Inyectar (SQL temporal en aimma-test) un `theme`/`theme_draft` → curl prod → confirmar `--ta-*` cambian + fuente carga + NADA roto. Restaurar. **No avanzar sin OK.** (Runtime: sin lib no-Node — confirmar el render real igual.)

---

## Task 4: Admin — editor-state theme API + canvas preview + bridge seguro + panel + consolidación  · (parte de G3)

**Files:**
- Modify: `iapanel/tienda/admin/views/editor/editor-state.js` (API mutación theme + notify 'theme' + init theme_draft + normalize)
- Modify: `apps/storefront/src/pages/index.astro` (preview bridge handler `type:'theme'` SEGURO)
- Modify: `iapanel/tienda/admin/views/editor/editor-canvas.js` (`applyThemePreview`)
- Create: `iapanel/tienda/admin/views/editor/editor-theme-panel.js` + `font-pairings.js` (mirror JS)
- Modify: `editor.js` (botón Tema + syncTiendaCache theme), `editor-styles.css` (panel), `index.html` (scripts + busters)
- Modify: `iapanel/tienda/admin/views/configuracion.js` (quitar paleta picker + link al panel)
- Test: `tests/editor/13-tema-panel.test.mjs`

- [ ] **Step 1: editor-state — API de mutación + init draft + normalize**

`editor-state.js`: en `init` (`:78`) cambiar a `state.theme = normalizeTheme(pers.theme_draft || pers.theme)`. Agregar:
```js
function normalizeTheme(t) {
  // Backward-compat: solo conservar la forma nueva (colors/font_pairing); descartar claves viejas.
  if (!t || typeof t !== 'object') return {};
  const out = {};
  if (t.colors && typeof t.colors === 'object') out.colors = structuredClone(t.colors);
  if (typeof t.font_pairing === 'string') out.font_pairing = t.font_pairing;
  return out;
}
function setThemeColors(partial) { state.theme.colors = { ...(state.theme.colors||{}), ...partial }; pushSnapshot(); markDirty(); notify('theme'); }
function setThemePalette(colors4) { state.theme.colors = { ...colors4 }; pushSnapshot(); markDirty(); notify('theme'); }
function setThemeFontPairing(id) { state.theme.font_pairing = id; pushSnapshot(); markDirty(); notify('theme'); }
```
Agregar `'theme'` a `_listeners` (`:28`). Exportar `setThemeColors, setThemePalette, setThemeFontPairing`. (serialize ya manda `theme: state.theme` — sin cambio; el autosave por markDirty ya dispara draft.)

- [ ] **Step 2: Preview bridge SEGURO en el storefront (§4.1)**

En `index.astro` el `<script is:inline define:vars={{ ADMIN_ORIGIN }}>` de preview: pasar también `define:vars={{ ADMIN_ORIGIN, PAIRINGS: FONT_PAIRINGS, COLOR_RE: CSS_COLOR_REGEX.source }}`. Dentro del listener `message` (que YA valida `e.origin !== ADMIN_ORIGIN`), agregar:
```js
if (msg.type === 'theme' && msg.colors) {
  const re = new RegExp(COLOR_RE);
  for (const [k, v] of Object.entries(msg.colors)) {
    if (typeof v === 'string' && re.test(v)) document.documentElement.style.setProperty(k, v);
  }
  const p = PAIRINGS[msg.font_pairing];           // ID del allowlist; deriva url/family server-injected
  if (p) {
    document.documentElement.style.setProperty('--ta-font-display', p.display);
    document.documentElement.style.setProperty('--ta-font-body', p.body);
    if (!document.querySelector('link[data-theme-font="'+msg.font_pairing+'"]')) {
      const l = document.createElement('link'); l.rel='stylesheet'; l.href=p.url; l.setAttribute('data-theme-font', msg.font_pairing);
      document.head.appendChild(l);
    }
  }
}
```
(CSS_COLOR_REGEX hay que exponerlo desde `@aimma/database` o redefinir su `.source` en index.astro. Preferir importar el regex del schema si está exportado; si no, exportarlo.)

- [ ] **Step 3: canvas applyThemePreview**

`editor-canvas.js`: agregar a la API:
```js
function applyThemePreview(colors, fontPairingId) {
  if (!state.iframe || !state.tenantOrigin) return;
  try { state.iframe.contentWindow.postMessage({ type:'theme', colors, font_pairing: fontPairingId }, state.tenantOrigin); } catch (e) {}
}
```
Exportar `applyThemePreview`.

- [ ] **Step 4: font-pairings.js (mirror JS browser) + el panel**

Create `iapanel/tienda/admin/views/editor/font-pairings.js` (IIFE: `window.TiendaIA.fontPairings = {PAIRINGS, IDS, defaultForTemplate}` — mismos datos que el canónico; value-synceable). Create `editor-theme-panel.js`: renderiza el panel del mockup (presets de la plantilla actual via supabase paletas, custom 4 colorPickers, 6 cards de pairing); cada click: muta el state (setThemePalette/setThemeColors/setThemeFontPairing) + computa los `--ta-*` (incl. auto-contrast, port mínimo de getContrastText) + llama `editorCanvas.applyThemePreview(...)`. Marca dirty (lo hace el setter) → autosave draft.

- [ ] **Step 5: editor.js — botón Tema + syncTiendaCache theme**

`editor.js`: agregar botón "Tema" en la toolbar que abre el panel. En `syncTiendaCache` (`:258-262`) manejar theme como home: draft → `next.theme_draft = r.theme_draft` (o ES.serialize().theme); publish → `next.theme = r.theme; delete next.theme_draft`. (Usar `r.theme/r.theme_draft` de la respuesta EF, Task 2 Step 2.)

- [ ] **Step 6: Consolidación — quitar paleta de Configuración**

`configuracion.js`: quitar el select de paleta + `renderSwatchesHTML`/`refreshSwatchesBox` (o dejarlos solo-lectura con un link "Editar colores y fuentes →" que abre el editor/panel Tema). La plantilla SIGUE.

- [ ] **Step 7: index.html + CSS + test**

`index.html`: agregar `<script src=".../font-pairings.js?v=1">` + `editor-theme-panel.js?v=1` + bump editor-state/editor-canvas/editor/configuracion/editor-styles busters. `editor-styles.css`: estilos del panel (del mockup). Create `tests/editor/13-tema-panel.test.mjs` (jsdom): el panel renderea presets + 6 pairings + 4 colorPickers; click en pairing → `editorState.theme.font_pairing` seteado + dirty. (El postMessage NO testeable en jsdom → validación en vivo.)

- [ ] **Step 8: node --check + suite**

Run: `node --check` de los JS admin nuevos/tocados. `cd tests/editor && npm test` (verde, incluye 13). Regenerar golden inspector si aplica (no debería — el panel es superficie nueva, no el inspector de secciones).

- [ ] **Step 9: Commit**
```bash
git add iapanel/tienda/admin/ apps/storefront/src/pages/index.astro tests/editor/13-tema-panel.test.mjs
git commit -m "feat(tema): panel Tema admin + preview en vivo (bridge seguro) + consolidacion Configuracion"
```

---

## Task 5: Backward-compat + verificación + GATE G3

- [ ] **Step 1: Verificación de carga del editor** (empírico: 0 tiendas con theme viejo, pero confirmar el normalize): abrir el editor de aimma-test (tras deploy admin) NO debe romper; el panel muestra la paleta_id actual seleccionada.

- [ ] **Step 2: Suite completa** `tests/editor` + `apps/storefront` verdes.

- [ ] **Step 3: GATE G3 — merge `--no-ff` a main + Easypanel (OK de Jorge).** Diff completo + tests + golden. Jorge redeploya Easypanel. **Prueba en vivo:** (a) click en preset/pairing → canvas cambia AL INSTANTE sin guardar; (b) guardar borrador → la tienda publicada NO cambia; (c) Publicar → la tienda publicada toma el theme; (d) un texto plano / look existente intactos. Rollback = `git revert -m 1` + Easypanel redeploy.

---

## Self-Review (hecho)
- **Cobertura spec:** §2 schema (T1) ✓; §3 draft/promote (T1 schema, T2 EF, T4 syncTiendaCache) ✓; §4+§4.1 preview seguro (T4 bridge: origin heredado + font_pairing ID + color regex) ✓; §5 color (T3 Layout, T4 panel) ✓; §6 tipografía (T1 allowlist, T3 load) ✓; §7 convivencia (T3 default por plantilla) ✓; §8 UI+consolidación (T4) ✓; §9 render (T3) ✓; §10 seguridad (T1 regex/enum + T4 bridge) ✓; §11 backward-compat (T1 strip + T4 normalize) ✓; §12 tests ✓.
- **Placeholders:** 1 punto a confirmar en impl (exportar CSS_COLOR_REGEX de @aimma/database para el bridge — si no está exportado, exportarlo en T4 Step 2). Resto con código.
- **Gates por superficie:** G1 EF, G2 storefront, G3 admin — cada uno con OK de Jorge + verificación en vivo.

## Execution Handoff
Plan en `docs/SUPERPOWERS/plans/2026-06-05-b-tema-global.md`. Opciones: (1) Subagent-Driven (recomendada, subagente por task + review) o (2) Inline. Gates por superficie = checkpoints de Jorge obligatorios.
