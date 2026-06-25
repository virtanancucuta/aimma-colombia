# Ajuste de foto por tienda (Rellenar/Contener) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un ajuste global de tienda "Rellenar" (object-cover, default) / "Contener" (object-contain + p-2 + fondo neutro) para las fotos de producto, vía token de Tema, aplicando a las 4 plantillas y todas las superficies.

**Architecture:** `theme.foto_ajuste` (schema Zod, canonical + EF mirror) → el storefront lo emite como CSS vars `--ta-foto-fit`/`--ta-foto-pad` en `<html style>` (Layout.astro) → las imgs de las 4 cards usan esas vars en vez de `object-cover` hardcodeado → cubre home/búsqueda/categoría/PDP/carrito sin prop-threading. El editor añade un toggle en el panel de Tema con preview en vivo vía el bridge postMessage existente.

**Tech Stack:** Astro 5, Zod, Tailwind v4 (clases arbitrarias `[object-fit:var(...)]`), vitest 4, Deno (EF), Supabase CLI, wrangler, Playwright. Admin = JS vanilla (IIFE `window.TiendaIA.*`).

## Global Constraints

- **Modo TEST:** sin tiendas reales; sin backward-compat necesario. No se rompe producción.
- **Default = Rellenar.** `theme.foto_ajuste` ausente → vars `cover`/`0px` → render byte-idéntico a hoy (cero regresión).
- **Vars y valores EXACTOS:** `--ta-foto-fit` = `cover` (rellenar) | `contain` (contener); `--ta-foto-pad` = `0px` (rellenar) | `0.5rem` (contener).
- **Las imgs de producto usan:** `[object-fit:var(--ta-foto-fit,cover)] [padding:var(--ta-foto-pad,0px)]` (clases LITERALES para JIT v4). Reemplazan a `object-cover`. Se mantiene `absolute inset-0 w-full aspect-square` (patrón B) y las transiciones propias de cada plantilla.
- **EF mirror byte-idéntico:** tras tocar `packages/database/src/editor-schema.ts`, `cp` exacto al EF (sync-test 04).
- **Alcance:** las 4 cards (IC/FB/MA/EM). NO se toca el chrome (nombre/precio/badges). El fondo neutro lo aporta el wrapper existente de cada card.
- **Tokens/credenciales:** memoria `reference_accesos_aimma` (Management PAT, wrangler). Easypanel admin = Tipo B (Jorge).

## Comandos de referencia
- Tests storefront: `cd apps/storefront && npx vitest run` · puntual: `... test/<f>.test.ts` · regen goldens: `... -u`
- Sync-test EF: `cd tests/editor && node --import tsx --test 04-ef-schema-sync.test.mjs`
- Re-sync mirror: `cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts`
- Syntax check admin JS: `node --check iapanel/tienda/admin/views/editor/<f>.js`

---

## Task 1: Schema `theme.foto_ajuste` + mirror EF

**Files:**
- Modify: `packages/database/src/editor-schema.ts` (ThemeSchema)
- Modify: `supabase/functions/tienda-guardar-layout/editor-schema.ts` (mirror vía cp)
- Test: `tests/editor/04-ef-schema-sync.test.mjs` (existente)

**Interfaces:**
- Produces: `ThemeSchema` con campo opcional `foto_ajuste: 'rellenar' | 'contener'`.

- [ ] **Step 1: Añadir el campo a ThemeSchema**

En `packages/database/src/editor-schema.ts`, localizar `const ThemeSchema = z.object({` (tiene `colors`, `font_pairing`, `nav_text_size`). Añadir como último campo antes del cierre `})`:

```ts
  // Rediseño 2026-06-25: ajuste global de las fotos de producto. rellenar=object-cover (default),
  // contener=object-contain + padding + fondo neutro (rubros packshot). Ausente => rellenar.
  foto_ajuste: z.enum(['rellenar', 'contener']).optional(),
```

- [ ] **Step 2: Re-sincronizar el mirror EF**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts`

- [ ] **Step 3: Correr el sync-test**

Run: `cd tests/editor && node --import tsx --test 04-ef-schema-sync.test.mjs`
Expected: PASS (mirror byte-idéntico).

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts
git commit -m "feat(schema): theme.foto_ajuste (rellenar/contener)"
```

---

## Task 2: Storefront render — vars en Layout + cards usan la var

**Files:**
- Modify: `apps/storefront/src/layouts/Layout.astro:82-97` (derivación + themeStyle)
- Modify: `apps/storefront/src/components/templates/industrial_clean/ProductCardIC.astro`
- Modify: `apps/storefront/src/components/templates/fashion_bold/ProductCardFB.astro`
- Modify: `apps/storefront/src/components/templates/minimal_artesanal/ProductCardMA.astro`
- Modify: `apps/storefront/src/components/templates/editorial_magazine/ProductCardEM.astro`
- Test: `apps/storefront/test/foto-ajuste.test.ts` (CREAR)

**Interfaces:**
- Consumes: `theme.foto_ajuste` (Task 1).
- Produces: CSS vars `--ta-foto-fit`/`--ta-foto-pad` en `<html>`; imgs de producto con `[object-fit:var(--ta-foto-fit,cover)] [padding:var(--ta-foto-pad,0px)]`.

- [ ] **Step 1: Layout.astro — derivar y emitir las vars**

En `apps/storefront/src/layouts/Layout.astro`, justo después del bloque `navScale` (línea ~83, antes de `const themeStyle =`), añadir:

```ts
// Ajuste de foto por tienda. Ausente => rellenar (cover, sin padding) = byte-identico a hoy.
const fotoFit = themeActivo.foto_ajuste === 'contener' ? 'contain' : 'cover';
const fotoPad = themeActivo.foto_ajuste === 'contener' ? '0.5rem' : '0px';
```

Y en el `const themeStyle =` (termina en la línea de `--nav-text-scale`), añadir las 2 vars al final. Reemplazar:

```ts
  (navScale ? `--nav-text-scale:${navScale};` : '');
```
por:
```ts
  (navScale ? `--nav-text-scale:${navScale};` : '') +
  `--ta-foto-fit:${fotoFit};--ta-foto-pad:${fotoPad};`;
```

- [ ] **Step 2: Cards — reemplazar `object-cover` por la var en las 4 plantillas**

En CADA uno de los 4 ProductCard ({IC,FB,MA,EM}.astro), reemplazar **todas** las apariciones de `object-cover` (son 2 por archivo: img principal + img de hover) por:

```
[object-fit:var(--ta-foto-fit,cover)] [padding:var(--ta-foto-pad,0px)]
```

> IMPORTANTE: se QUITA `object-cover` por completo (NO dejarlo como fallback). El `,cover` dentro de `var(--ta-foto-fit,cover)` ya es el fallback nativo cuando la var no está seteada → render = cover, idéntico a hoy. Dejar `object-cover` junto a la var crearía dos reglas `object-fit` en conflicto (el orden en el CSS generado no está garantizado y `object-cover` podría ganar, anulando la var). Mantener intactas las demás clases (`absolute inset-0 w-full aspect-square`, transiciones, opacity). NO tocar el placeholder (sin img) ni el chrome.

(Comando sugerido por archivo, p. ej. IC: `sed -i 's/ object-cover/ [object-fit:var(--ta-foto-fit,cover)] [padding:var(--ta-foto-pad,0px)]/g' apps/storefront/src/components/templates/industrial_clean/ProductCardIC.astro` — verificar luego que solo cambiaron las 2 imgs de producto y que NO quedó ningún `object-cover` suelto en ellas.)

- [ ] **Step 3: Escribir el test (cards consumen la var, 4 plantillas)**

Crear `apps/storefront/test/foto-ajuste.test.ts`:

```ts
// Ajuste de foto por tienda: las imgs de producto consumen --ta-foto-fit/--ta-foto-pad
// (la VALUE de la var la inyecta Layout.astro; aqui se prueba que las cards la USAN).
import { describe, test, expect } from 'vitest';
import { renderNormalized, makeProductosSection } from './helpers/render-harness.ts';
import Productos from '../src/components/blocks/productos/Productos.astro';

const ROW = [{
  id: 'p1', nombre: 'Zapato Alfa', slug: 'zapato-alfa', referencia: 'REF001',
  precio_venta: 120000, precio_promo: null, foto_principal_url: 'https://x/a.jpg',
  fotos_galeria: ['https://x/b.jpg'], estado: 'activo', producto_variantes: [{ stock: 5, reservado: 0 }],
}];
const tienda = (slug: string): any => ({ id: 'tienda-uuid', plantilla: { slug } });
const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

describe('Foto ajuste · cards usan var(--ta-foto-fit)', () => {
  for (const slug of TEMPLATES) {
    test(`${slug}: imgs de producto usan object-fit:var(--ta-foto-fit) + padding var`, async () => {
      const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true, hover: 'on' }), tienda(slug), ROW);
      const imgs = (html.match(/<img[^>]*>/g) || []).filter((t) => /a\.jpg|b\.jpg/.test(t));
      expect(imgs.length).toBeGreaterThanOrEqual(2);
      for (const t of imgs) {
        expect(t).toContain('object-fit:var(--ta-foto-fit,cover)');
        expect(t).toContain('padding:var(--ta-foto-pad,0px)');
        expect(t).toContain('aspect-square'); // patron B intacto
      }
    });
  }
});
```

- [ ] **Step 4: Correr el test (debe pasar tras los edits)**

Run: `cd apps/storefront && npx vitest run test/foto-ajuste.test.ts`
Expected: PASS (4/4). Si falla por la clase, revisar que el reemplazo de `object-cover` quedó en las imgs.

- [ ] **Step 5: Regenerar goldens + suite completa**

Run: `cd apps/storefront && npx vitest run -u`
Expected: PASS. Verificar el diff de goldens: en las imgs de producto (4 plantillas) `object-cover` se reemplazó por `[object-fit:var(--ta-foto-fit,cover)] [padding:var(--ta-foto-pad,0px)]`. Sin otros cambios (chrome/nombre/precio/badges intactos).

- [ ] **Step 6: Verificar JIT v4 genera las clases arbitrarias**

Run: `cd apps/storefront && npm run build >/dev/null 2>&1 && grep -rl "object-fit:var(--ta-foto-fit" dist/_astro/*.css && echo "JIT OK"`
Expected: imprime el CSS + `JIT OK`. (Si no aparece, las clases arbitrarias no se generaron — revisar sintaxis de los corchetes.)

- [ ] **Step 7: Commit**

```bash
git add apps/storefront/src/layouts/Layout.astro apps/storefront/src/components/templates/ apps/storefront/test/foto-ajuste.test.ts apps/storefront/test/__snapshots__/
git commit -m "feat(storefront): foto_ajuste via --ta-foto-fit/--ta-foto-pad en las 4 cards"
```

---

## Task 3: Editor — toggle en panel de Tema + preview en vivo

**Files:**
- Modify: `iapanel/tienda/admin/views/editor/editor-state.js` (setter + export)
- Modify: `iapanel/tienda/admin/views/editor/editor-theme-panel.js` (control + applyPreview)
- Modify: `iapanel/tienda/admin/views/editor/editor-canvas.js` (applyThemePreview param)
- Modify: `apps/storefront/src/components/EditorPreviewBridge.astro` (handler del mensaje)

**Interfaces:**
- Consumes: `theme.foto_ajuste`.
- Produces: `editorState.setThemeFotoAjuste(val)`; postMessage `{type:'theme', ..., foto_ajuste}`; el bridge setea `--ta-foto-fit`/`--ta-foto-pad` en el iframe.

- [ ] **Step 1: editor-state.js — setter `setThemeFotoAjuste`**

En `iapanel/tienda/admin/views/editor/editor-state.js`, después de `setThemeNavTextSize` (línea ~273), añadir:

```js
  function setThemeFotoAjuste(val) {
    if (val === 'contener') { state.theme.foto_ajuste = 'contener'; }
    else { delete state.theme.foto_ajuste; } // 'rellenar'/ausente = default, no se persiste
    pushSnapshot(); markDirty(); notify('theme');
  }
```

Y añadir `setThemeFotoAjuste` al objeto exportado (la línea ~674 que lista `...setThemeNavTextSize, addNavNode, ...`):

```js
    setThemeColors, setThemePalette, setThemeFontPairing, setThemeNavTextSize, setThemeFotoAjuste,
```

- [ ] **Step 2: editor-canvas.js — applyThemePreview acepta y envía foto_ajuste**

En `iapanel/tienda/admin/views/editor/editor-canvas.js`, reemplazar `applyThemePreview` (líneas 406-411) por:

```js
  function applyThemePreview(colors, fontPairingId, navTextSize, fotoAjuste) {
    if (!state.iframe || !state.tenantOrigin) return;
    try {
      state.iframe.contentWindow.postMessage({ type: 'theme', colors: colors, font_pairing: fontPairingId, nav_text_size: navTextSize, foto_ajuste: fotoAjuste }, state.tenantOrigin);
    } catch (e) { /* noop */ }
  }
```

- [ ] **Step 3: editor-theme-panel.js — pasar foto_ajuste al preview + control**

(a) En `applyPreview` (línea ~107-110), donde lee `pairing`/`navSize` y llama `applyThemePreview(...)`, añadir la lectura y el 4º argumento:

```js
    var navSize = theme.nav_text_size || null;
    var fotoAjuste = theme.foto_ajuste || 'rellenar';
    if (window.TiendaIA.editorCanvas && window.TiendaIA.editorCanvas.applyThemePreview) {
      window.TiendaIA.editorCanvas.applyThemePreview(buildColorsVars(r), pairing, navSize, fotoAjuste);
    }
```

(b) Añadir el control (segmented de 2, mismo patrón que nav_text_size). Después del bloque `navSec` (tras `body.appendChild(navSec);`, línea ~212), insertar:

```js
    // ---- Seccion: Ajuste de las fotos de producto (rellenar/contener) ----
    var fitSec = E('section', { class: 'ed-theme-sec' });
    fitSec.appendChild(E('p', { class: 'ed-theme-sec__label' }, 'Ajuste de las fotos de producto'));
    var fitOpts = [
      { id: 'rellenar', label: 'Rellenar' },
      { id: 'contener', label: 'Contener' },
    ];
    var selFit = (editorState.theme && editorState.theme.foto_ajuste) || 'rellenar';
    var fitRow = document.createElement('div');
    fitRow.className = 'ed-theme-navsize';
    fitRow.setAttribute('role', 'group');
    fitRow.setAttribute('aria-label', 'Ajuste de las fotos de producto');
    fitOpts.forEach(function(opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-theme-navsize__btn' + (opt.id === selFit ? ' is-sel' : '');
      b.setAttribute('aria-pressed', opt.id === selFit ? 'true' : 'false');
      b.textContent = opt.label;
      b.addEventListener('click', function() {
        editorState.setThemeFotoAjuste(opt.id);
        applyPreview();
        renderBody();
      });
      fitRow.appendChild(b);
    });
    fitSec.appendChild(fitRow);
    fitSec.appendChild(E('p', { class: 'ed-theme-hint' }, 'Rellenar recorta la foto para llenar el cuadro (ideal moda/calzado). Contener muestra el producto completo sin recortar (ideal ferreteria, supermercado, bisuteria).'));
    body.appendChild(fitSec);
```

- [ ] **Step 4: EditorPreviewBridge.astro — aplicar foto_ajuste en el iframe**

En `apps/storefront/src/components/EditorPreviewBridge.astro`, dentro del `if (msg.type === 'theme' ...)`, después del bloque de `--nav-text-scale` (línea ~73, antes del `}` que cierra el if del theme), añadir:

```js
      // Ajuste de foto: allowlist fijo -> sin eco del input. Ausente/rellenar = cover/0px.
      const FOTO_FIT = { rellenar: 'cover', contener: 'contain' };
      const fit = (typeof msg.foto_ajuste === 'string' && Object.prototype.hasOwnProperty.call(FOTO_FIT, msg.foto_ajuste)) ? FOTO_FIT[msg.foto_ajuste] : 'cover';
      document.documentElement.style.setProperty('--ta-foto-fit', fit);
      document.documentElement.style.setProperty('--ta-foto-pad', fit === 'contain' ? '0.5rem' : '0px');
```

- [ ] **Step 5: Verificar sintaxis de los 3 JS admin**

Run:
```bash
cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website
node --check iapanel/tienda/admin/views/editor/editor-state.js && \
node --check iapanel/tienda/admin/views/editor/editor-theme-panel.js && \
node --check iapanel/tienda/admin/views/editor/editor-canvas.js && echo "SINTAXIS_OK"
```
Expected: `SINTAXIS_OK`.

- [ ] **Step 6: Bump cache-bust del JS en el admin index.html**

`iapanel/tienda/admin/index.html` referencia los scripts con `?v=N`. Subir el `?v=` de `section-defs.js` ya no aplica; subir el de `editor-state.js`, `editor-theme-panel.js` y `editor-canvas.js` (+1 cada uno) para que el navegador de Jorge no sirva cache viejo tras el redeploy. (Verificar los números actuales en el archivo y +1.)

- [ ] **Step 7: Commit**

```bash
git add iapanel/tienda/admin/views/editor/editor-state.js iapanel/tienda/admin/views/editor/editor-theme-panel.js iapanel/tienda/admin/views/editor/editor-canvas.js apps/storefront/src/components/EditorPreviewBridge.astro iapanel/tienda/admin/index.html
git commit -m "feat(editor): toggle Ajuste de fotos en panel de Tema + preview en vivo"
```

---

## Task 4: Deploy + gate empírico

**Files:** ninguno (deploy + verificación).

- [ ] **Step 1: Typecheck storefront (no nuevos errores de mis archivos)**

Run: `cd apps/storefront && npx astro check 2>&1 | grep -E "Layout.astro|ProductCard" || echo "sin errores nuevos en mis archivos"`
Expected: sin errores en Layout.astro ni en los ProductCard (el proyecto tiene errores pre-existentes en archivos .test.ts; ignorarlos).

- [ ] **Step 2: Desplegar EF (schema mirror)**

```bash
cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website
SUPABASE_ACCESS_TOKEN="<MANAGEMENT_PAT de reference_accesos_aimma>" npx --yes supabase functions deploy tienda-guardar-layout --project-ref rsmxklkxqsaptchcjszd
```
Expected: "Deployed Functions." Verificar con MCP `get_edge_function` que ThemeSchema embebido tiene `foto_ajuste`.

- [ ] **Step 3: Build + deploy storefront**

Run: `cd apps/storefront && npm run build && npx wrangler deploy`
Expected: "Current Version ID: ...". Capturar el Version.

- [ ] **Step 4: Gate empírico con Playwright en aimma-test**

1. Setear `theme.foto_ajuste='contener'` en aimma-test (execute_sql update a `personalizaciones->theme`), borrar KV `tienda:aimma-test` (wrangler kv key delete namespace 99d06757be9f459883862cedec8683d2) o esperar 60s.
2. Playwright (viewport 1440): medir una img de producto → `getComputedStyle(img).objectFit === 'contain'` y `paddingLeft !== '0px'`; el wrapper sigue cuadrado (w≈h); el producto se ve completo (no recortado).
3. Restaurar a `rellenar` (remover `foto_ajuste` del theme) → invalidar KV → confirmar `objectFit === 'cover'`, padding `0px`.

- [ ] **Step 5: Admin Easypanel redeploy (Tipo B — Jorge)**

Avisar a Jorge: redeploy del admin para que aparezca el toggle "Ajuste de las fotos de producto" en el panel de Tema.

- [ ] **Step 6: Commit de cierre (si el gate pidió ajustes)**

```bash
git add -A && git commit -m "fix(foto-ajuste): ajustes post-gate" || echo "sin cambios"
```

---

## Self-Review (cobertura del spec)
- foto_ajuste en theme (rellenar/contener) → Task 1 ✓
- Default rellenar (cero regresión) → vars cover/0px por ausencia (Task 1/2) ✓
- Contener = contain + p-2 + fondo neutro → Task 2 (vars) + el wrapper aporta fondo ✓
- 4 plantillas + todas las superficies (token) → Task 2 (vars en Layout, cards consumen) ✓
- Patrón B 1:1 intacto → Task 2 conserva aspect-square (test lo asienta) ✓
- Toggle en panel de Tema + preview en vivo → Task 3 ✓
- EF mirror byte-idéntico + sync-test → Task 1 ✓
- Deploy + gate (contain sin recorte, fondo) → Task 4 ✓

**Fuera de alcance (del spec):** ajuste por sección/producto; fondo blanco fijo; cambios al chrome.
