# B-TEMA GLOBAL — Spec de implementación (color + tipografía global)

> Estado: diseño A-E aprobado por Jorge + look del mockup aprobado (`Desktop/tema-global-mockup.html`). Gate antes de implementar. Branch `feat/b-tema-global` (desde main `8b796a2`). NO implementar hasta OK del spec.

## 0. Anclaje (verificado, file:line)
- **Theme hoy = vestigial.** `packages/database/src/editor-schema.ts:192` `ThemeSchema = {color_primary?, color_accent?, font_display_url?, font_body_url?}` (colores SIN regex; fonts = **URL libre** `z.string().url()`). El storefront **NO lo consume** (grep vacío). `PersonalizacionesSchema:199` lo tiene `theme: ThemeSchema.optional()`.
- **Color hoy = `tienda.paleta` (FK).** `apps/storefront/src/layouts/Layout.astro:49-78` lee `tienda.paleta.color_{primary,accent,text_base,bg_base}` → inyecta `--ta-color-*` + auto-contrast (`getContrastText` → `--ta-color-on-*`). Tabla `paletas`: 4 colores + `plantilla_id` (curadas por plantilla, ~20). Se elige en `configuracion.js` (`renderSwatchesHTML`/`refreshSwatchesBox`, líneas 182-198).
- **Tipografía hoy = fija por plantilla.** `apps/storefront/src/lib/template-styles.ts` `getTemplateStyle(slug).fonts` (display+body hardcoded, body siempre Inter, Google Fonts + `display=swap`) → `--ta-font-display/body`.
- **Tokenización YA hecha** (uso extenso de `--ta-*` en blocks vía Tailwind `text-[var(--ta-...)]`; 263 refs a text-base). El gap es la capa de OVERRIDE, no tokenizar.
- **editor-state.js**: `state.theme` existe (`:19`), se inicializa de `pers.theme` (`:78` — NO draft), se serializa (`:305`), entra a snapshots/undo (`:233,268`). **NO hay API de mutación de theme** (read-only hoy). serialize manda `theme: state.theme` + `pages.home`.
- **EF `tienda-guardar-layout/index.ts` paso 6**: `next.theme = body.personalizaciones.theme` en **CUALQUIER modo** (draft Y publish) → hoy guardar borrador YA escribe el theme publicado. **Falta el split draft/publicado.** Sections SÍ tienen split: draft→`pages.home_draft`, publish→`pages.home` + delete home_draft.
- **Canvas = iframe del storefront en preview** (`editor-canvas.js`, token efímero → `?preview=<token>`). Puente postMessage: admin→iframe `{type:'reload'}`; iframe→admin `{type:'select'/'preview-ready'}` (`index.astro:156-176`). Preview lee `home_draft` fresco (bypass KV).
- **Empírico:** 3 tiendas, **0 con theme no-vacío, 0 con theme_draft** → backward-compat trivial (nada que migrar), pero se bakea igual.

## 1. Alcance
SOLO tema **GLOBAL**: color (4 slots) + tipografía (pairing). NO toca secciones (eso es B-secciones). NO toca el layout/CSS de las plantillas. Meta paridad ~50%.

## 2. Schema (Zod) — `ThemeSchema` extendido + draft
```ts
// Reusa CSS_COLOR_REGEX ya existente (linea 14) para los colores.
const ColorsSchema = z.object({
  primary: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
  accent: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
  text_base: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
  bg_base: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
}).partial(); // cada slot opcional -> override parcial; lo ausente cae a paleta default

const FONT_PAIRING_IDS = ['industrial', 'moderno', 'geometrico', 'impacto', 'editorial', 'elegante'] as const;

const ThemeSchema = z.object({
  colors: ColorsSchema.optional(),
  font_pairing: z.enum(FONT_PAIRING_IDS).optional(),
}).strip(); // .strip() = DESCARTA claves desconocidas (el theme viejo color_*/font_*_url se elimina sin error)
```
- **Se ELIMINA** `color_primary/accent` (free) + `font_*_url` (URL libre = riesgo). Reemplazo: `colors` (regex) + `font_pairing` (enum). `.strip()` (default de z.object, explícito acá por claridad) tolera la forma vieja.
- `PersonalizacionesSchema` agrega `theme_draft: ThemeSchema.optional()` junto a `theme`.

## 3. Draft/publicado del theme (replica home_draft→home)
- **personalizaciones** top-level: `theme` (publicado) + `theme_draft` (borrador).
- **EF `tienda-guardar-layout`** (paso 6, NUEVO): replicar la lógica de sections para el theme:
  - `if (mode === 'draft')` → `next.theme_draft = body.personalizaciones.theme;` (NO toca `next.theme`).
  - `else (publish)` → `next.theme = body.personalizaciones.theme; delete next.theme_draft;` (promueve).
  - (Hoy hace `next.theme = body.theme` siempre — se cambia por esto.) El cliente sigue mandando `theme: state.theme` + mode; la EF rutea (igual que home).
- **editor-state.init** (`:78`): `state.theme = structuredClone(pers.theme_draft || pers.theme || {})` (draft primero, igual que sections en `:76`).
- **editor.js syncTiendaCache** (post-save): setear `theme_draft` (draft) / `theme` + delete theme_draft (publish) en el cache de `state.tienda.personalizaciones` (igual que hace con home).
- **Storefront**: publicado lee `personalizaciones.theme`; preview (`?preview`) lee `theme_draft ?? theme` (igual que `home_draft ?? home`, `index.astro:48-50`).
- **Invariante UX (Jorge):** el usuario NUNCA publica para VER. Lo ve por (1) preview en vivo al click (§4) y (2) Vista previa = el borrador completo (theme_draft + home_draft).

## 4. PREVIEW EN VIVO AL CLICK (no negociable)
Click en preset/pairing/color → re-inyecta `--ta-*` en el canvas **al instante, sin guardar ni recargar**.
- **Admin → iframe** (nuevo en `editor-canvas.js`): `applyThemePreview(colors, fontPairingId)` → `iframe.contentWindow.postMessage({ type:'theme', colors, font_pairing }, tenantOrigin)`. `colors` = mapa `{'--ta-color-primary':'#..', ..., '--ta-color-on-primary':'#..' (auto-contrast calculado en el admin)}`. `font_pairing` = **el ID** del allowlist (NO una URL, NO font-family crudo).
- **Storefront preview bridge** (nuevo handler en el `<script is:inline>` de preview de `index.astro`, SOLO `isPreview`): dentro del listener `message` que YA valida origin, `if (msg.type === 'theme') { ... }`.
- El cálculo de los `--ta-color-on-*` (auto-contrast WCAG) se replica en el admin (port de `getContrastText`, o helper compartido mínimo) para que el preview sea fiel.
- El panel, ADEMÁS, marca dirty + guarda como borrador (autosave draft, debounced) para que Vista previa / re-entrada lo tengan. Pero el FEEDBACK visual es el postMessage (instantáneo), no el save.

### 4.1 SEGURIDAD DEL PATH DE PREVIEW (postMessage BYPASEA EF/Zod → validar en el render, lección rich-text)
El postMessage manda valores directo del admin al render (sin pasar por EF/Zod). El bridge VALIDA en cada superficie:
1. **Origin:** el handler `type:'theme'` vive DENTRO del listener `message` existente que YA hace `if (e.origin !== ADMIN_ORIGIN) return;` (`index.astro:169`, ADMIN_ORIGIN = `https://aimma.com.co`). Cualquier otro origin se rechaza. (Confirmado: el bridge actual ya valida origin; el nuevo handler lo hereda.) El lado admin (`editor-canvas.js`) ya valida origin de los mensajes entrantes contra `tenantOrigin` (`:129`) y postea con `targetOrigin = tenantOrigin` (no '*').
2. **Fuentes — NUNCA URL cruda por el límite:** el postMessage manda SOLO el `font_pairing` ID. El bridge **deriva** display/body/url del MISMO allowlist `FONT_PAIRINGS` que usa el storefront (inyectado server-side al inline script via `define:vars`). `const p = PAIRINGS[msg.font_pairing]; if (!p) return; setProperty('--ta-font-display', p.display); setProperty('--ta-font-body', p.body); ensureFontLink(p.url);`. Un `font_pairing` fuera del allowlist → ignorado. **Cero URL/font-family cruda cruzando el límite.** (Cierra el vector de URL de fuente que matamos en el schema.)
3. **Colores — regex antes del setProperty:** el bridge valida cada valor de `colors` contra `CSS_COLOR_REGEX` (inyectado via `define:vars`, MISMO que el Zod) ANTES de `setProperty`; valor inválido → se ignora. Evita trucos `url()`/inyección en el valor CSS + garantiza **preview == guardado** (misma regla que la EF). `ensureFontLink(url)` es idempotente por href.
- **Confirmado — reuse de la señal de modo-preview:** el storefront lee `theme_draft ?? theme` con la MISMA señal `isPreview` que ya usan las páginas (`index.astro:19,36` — `isPreview` true solo con token de preview válido). `theme = isPreview ? (pers.theme_draft ?? pers.theme) : pers.theme`, idéntico al patrón `home_draft ?? home`. NO se inventa mecanismo nuevo.

## 5. Color — 4 slots + presets + custom
- **Slots:** `primary, accent, text_base, bg_base` (los de paletas). Los `on-*` se DERIVAN (auto-contrast WCAG, ya existe) — no se editan.
- **Mapeo:** las 4 plantillas consumen los mismos `--ta-color-*` (su carácter está en layout/fonts) → el theme.colors aplica uniforme.
- **Presets:** las paletas curadas de la plantilla ACTUAL (filtradas por `plantilla_id`, misma curación que hoy). Elegir un preset = copiar sus 4 colores a `theme_draft.colors`.
- **Custom:** 4 colorPickers (reusa el control `colorPicker` ya cableado) editan `theme_draft.colors.*` individual.
- **Override en render:** `color_x = theme.colors?.x ?? paleta.color_x ?? fallback`. `theme.colors` NO se guarda en la columna `tienda.paleta_id` (esa queda como default legacy); el theme es self-contained (valores resueltos) → draftable + override limpio.
- **Selección mostrada (backward-compat a):** al abrir, si `theme.colors` vacío → marcar el preset que matchea `tienda.paleta_id`. Si `theme.colors` seteado → marcar el preset cuyos 4 colores matchean, si no, "Personalizado". NO resetea el look existente.

## 6. Tipografía — 6 pairings (allowlist, sin URL libre)
Allowlist fija en `packages/database/src/font-pairings.ts` (datos puros, bundleable + mirror EF si la EF lo necesita — la EF solo valida el enum, no la URL, así que NO necesita la tabla; el enum vive en el Zod):
```ts
export const FONT_PAIRINGS = {
  industrial: { display:'"IBM Plex Sans",system-ui,sans-serif', body:'"Inter",system-ui,sans-serif', url:'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap', label:'Industrial', cat:'Sans' },
  moderno:    { display:'"Inter",system-ui,sans-serif', body:'"Inter",system-ui,sans-serif', url:'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', label:'Moderno limpio', cat:'Sans' },
  geometrico: { display:'"Poppins",system-ui,sans-serif', body:'"Inter",system-ui,sans-serif', url:'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap', label:'Geométrico amigable', cat:'Sans' },
  impacto:    { display:'"Anton",system-ui,sans-serif', body:'"Inter",system-ui,sans-serif', url:'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;900&display=swap', label:'Impacto', cat:'Display' },
  editorial:  { display:'"Fraunces","Playfair Display",Georgia,serif', body:'"Inter",system-ui,sans-serif', url:'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap', label:'Editorial cálido', cat:'Serif' },
  elegante:   { display:'"Cormorant Garamond","Playfair Display",Georgia,serif', body:'"Inter",system-ui,sans-serif', url:'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap', label:'Elegante clásico', cat:'Serif' },
};
```
- **Body siempre Inter** (legibilidad + carga acotada). Display varía por pairing.
- **Default por plantilla:** un mapa `plantilla.slug → pairing id` (FB→impacto, IC→industrial, MA→editorial, EM→elegante). Sin `theme.font_pairing`, gana el default de la plantilla (carácter preservado).
- **Carga:** solo el pairing activo (1 `<link>` Google Fonts + `display=swap` + preconnect, ya existe). El `url` lo deriva el server del id (enum) → sin URL libre.

## 7. Convivencia global ↔ per-template
- El theme **overridea por-token**; sin override gana el default de la plantilla (paleta default + pairing default). Carácter preservado.
- El theme **NUNCA toca** layout/CSS/`mainContainerClass`/`bodyClass` de la plantilla — solo los tokens `--ta-color-*`/`--ta-font-*`.
- *Tradeoff documentado:* un override de fuente puede chocar con una plantilla (serif sobre Fashion Bold); los 6 pairings curados lo mitigan; la elección es del dueño.

## 8. UI del admin — Panel "Tema global" CONSOLIDADO
- **Superficie nueva** (no el inspector de secciones): panel a la derecha del canvas, abierto por un botón/tab "Tema" en la toolbar del editor. Layout y look = el mockup aprobado.
- **Contenido:** sección Color (grid de presets de la plantilla actual + "Personalizar" con 4 colorPickers) + sección Tipografía (6 cards de pairing con "Aa" en la fuente real + chip). Preview en vivo al click (§4). Marca dirty + autosave draft.
- **CONSOLIDACIÓN:** se SACA el picker de paleta de `configuracion.js` (renderSwatchesHTML/refreshSwatchesBox + el select de paleta). Opción: dejar un link "Editar colores y fuentes →" que abre el editor/panel de Tema. La **plantilla** SIGUE en Configuración (es estructural, no theming).
- **Archivos admin:** nuevo `editor-theme-panel.js` (el panel) + `editor-state.js` (API mutación theme + notify 'theme') + `editor-canvas.js` (`applyThemePreview`) + `editor.js` (botón Tema + autosave draft del theme + syncTiendaCache theme) + `editor-styles.css` (estilos panel) + `index.html` (script + cache-busters) + `configuracion.js` (quitar paleta picker) + `font-pairings.ts` mirror/uso admin (JS).

## 9. Storefront rendering
- `Layout.astro`: leer `personalizaciones` (de `Astro.locals.tienda.personalizaciones`); resolver:
  - `theme = isPreview ? (pers.theme_draft ?? pers.theme) : pers.theme` (preview usa draft).
  - colores: `theme?.colors?.x ?? paleta.color_x ?? fallback`.
  - pairing: `FONT_PAIRINGS[theme?.font_pairing ?? DEFAULT_BY_TEMPLATE[slug]]` → `--ta-font-display/body` + el `<link>` de su `url` (en vez del `template.fonts.googleFontsUrl` fijo).
  - auto-contrast sigue derivando los `on-*` de los colores resueltos.
- **Refactor pequeño** (solo el Layout; los blocks ya usan tokens). NOTA: hoy el Layout NO recibe `personalizaciones` directo — viene en `tienda` (locals). Confirmar el acceso (tienda.personalizaciones) al implementar.

## 10. Seguridad/validación (lección rich-text)
- **Colores:** `CSS_COLOR_REGEX` en `ColorsSchema` → mata inyección CSS (hoy sin regex). El interpolado en `style={...}` queda constreñido (mismo patrón que fondo de sección).
- **Fuentes:** `font_pairing` enum (6 ids), NO URL libre. El server deriva la `url` del id → sin inyección de `<link>` arbitrario.
- **Autoritativa EF** (Zod extendido valida al guardar) + **mirror EF byte** (editor-schema.ts) + defensa storefront (valores regex/enum constreñidos). Las 3 capas, como rich-text.

## 11. Backward-compat
- **(a)** Panel lee `tienda.paleta_id` → muestra ese preset seleccionado al abrir (si theme.colors vacío). No resetea.
- **(b)** Zod `.strip()` descarta `color_*`/`font_*_url` viejos sin error. + **normalize en editor-state.init**: si `pers.theme`/`theme_draft` trae claves viejas, se construye `state.theme` solo con `{colors?, font_pairing?}` (ignora el resto) → serialize no re-emite muertas. **Empírico: 0 tiendas con theme no-vacío** → riesgo nulo, pero robusto a futuro.

## 12. Tests
- **Zod/schema:** mirror EF byte (`04-ef-schema-sync` ya cubre editor-schema.ts; al extender ThemeSchema se re-sincroniza). Test de validación: ColorsSchema rechaza color inválido (`'red; }body{...'`), acepta hex/rgb; font_pairing rechaza id fuera del enum.
- **Golden NUEVO de Layout** (`apps/storefront/test/`): renderiza el `<html style>` con un theme (colores + pairing) y asserta los `--ta-*` inyectados + el `<link>` de fuente. **Scoped al Layout** → los **goldens de BLOCKS NO cambian** (renderean nombres de token, no valores; sin derrame a contenido de secciones). Cubrir: sin theme (paleta default), con theme.colors override, con font_pairing override, preview (theme_draft).
- **Draft/promote:** test de la lógica EF (draft → theme_draft; publish → theme + delete theme_draft). Modelado como el de sections si existe; si no, unidad sobre la función.
- **Admin (jsdom):** el panel renderea presets + pairings + colorPickers; click setea el state.theme (mutación) + marca dirty. El postMessage de preview NO testeable en jsdom (igual que execCommand) → validación en vivo.
- tests/editor + storefront verdes.

## 13. Invariantes (confirmadas)
- **Zod:** extiende ThemeSchema (+colors regex, +font_pairing enum, −font_*_url) + theme_draft. → mirror EF byte re-sync. theme NO es tipo de sección → drift-guard sectionDefs↔Zod no aplica; sí ef-schema-sync.
- **Golden:** blocks NO cambian (sin derrame a secciones); golden nuevo de Layout scoped a `--ta-*`. Cambio intencional y acotado.
- **theme NO toca** layout/CSS de plantilla — solo tokens color/font.
- **Runtime:** B-tema NO agrega lib no-Node (fuentes = `<link>` declarativo; auto-contrast = JS puro que ya corre en workerd). **Nada que spikear** (a diferencia de DOMPurify). Se confirma al implementar (sin lib runtime-frágil).

## 14. Rama + deploy
Branch `feat/b-tema-global` (desde main `8b796a2`). Admin (panel) + storefront (Layout) + EF (theme_draft promote) + Zod cambian.
- **Storefront:** `wrangler deploy` (yo) — validado en prod (re-verificar el render de theme en vivo, sin spike de lib).
- **EF:** MCP deploy verify_jwt=TRUE (el promote del theme_draft).
- **Admin:** merge `--no-ff` a main → Jorge redeploya Easypanel.
- Rollback por superficie: storefront `wrangler rollback`; EF redeploy previo; admin `git revert -m 1` del merge + Easypanel redeploy.

## Gate de deploy (firme, antes de producción)
Diff + tests (schema validación + golden Layout byte-a-byte scoped + draft/promote) + verificación en vivo del preview-al-click + del draft/publicado (guardar borrador NO cambia la tienda publicada; publicar promueve). Nada a producción sin OK de Jorge.

## Secuencia de implementación (para el plan, post-OK)
1. Zod ThemeSchema (colors regex + font_pairing enum + theme_draft) + mirror EF + font-pairings.ts + tests validación/sync.
2. EF: draft→theme_draft / publish→promote + delete. (deploy gate)
3. Storefront Layout: override theme + preview theme_draft + pairing load + golden nuevo. (re-verificar en vivo)
4. Admin: editor-state API theme + canvas applyThemePreview + storefront preview bridge type:'theme' + panel Tema + botón + autosave draft + syncTiendaCache theme.
5. Consolidación: quitar paleta picker de Configuración (+ link al panel).
6. Backward-compat normalize + verificación.
