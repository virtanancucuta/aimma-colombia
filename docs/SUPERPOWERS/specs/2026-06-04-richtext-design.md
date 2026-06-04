# RICH-TEXT (B-controles #4) — Diseño aprobado (Clase B, security-critical)

> Estado: APROBADO por Jorge 2026-06-04 (revisión con lupa). Gate completo. NO implementar sin re-confirmar el spike de la EF.

## Anclaje (verificado, file:line)
- Render hoy: `apps/storefront/src/components/blocks/texto/Texto.astro:48` renderiza `{p.contenido}` como **texto plano** (Astro escapa). Es **1 solo renderer** (unificado A.2). EM hace dropcap **cortando el primer char** (`:36-38`) → incompatible con HTML.
- Storefront DOMPurify **probado en CF Workers**: `apps/storefront/src/pages/legales/[tipo].astro:10,42` usa `DOMPurify.sanitize(...)` de `isomorphic-dompurify` en vivo.
- EF (Deno) `supabase/functions/tienda-guardar-layout/` **sin sanitización** (grep vacío) → capa nueva.
- Zod: `packages/database/src/editor-schema.ts:99` `contenido: z.string().max(5000)`.

## 1. Alcance
**Solo `texto.contenido`** pasa a rich-text. Los demás campos de texto (botones.texto, formulario.label, banner.titulo, etc.) quedan **plain** — cada campo rich = más superficie XSS; ninguno necesita formato inline. 1 campo, 1 renderer, 1 punto de `set:html`.

## 2. Allowlist (fuente canónica única + mirror + sync-test)
Config canónica en `packages/database/src/richtext-allowlist.ts` (objeto de datos puro), **mirror byte-idéntico** en `supabase/functions/tienda-guardar-layout/richtext-allowlist.ts` (igual que el mirror de editor-schema.ts de A.1), **sync-test** modelado en `tests/editor/04-ef-schema-sync.test.mjs` → divergencia imposible sin romper el test.

```js
export const RICHTEXT_ALLOWLIST = {
  ALLOWED_TAGS: ['b','strong','i','em','a','ul','ol','li','p','br'],
  ALLOWED_ATTR: ['href'],                          // href solo (en <a>). NADA style/on*/class/id/data-*/target
  ALLOWED_URI_REGEXP: /^(https:|mailto:|tel:)/i,   // SOLO https/mailto/tel. NO javascript:/data:/vbscript:/http:
  FORBID_TAGS: ['script','style','iframe','object','embed','form','input','svg','math'],
  FORBID_ATTR: ['style','class','id','target'],
  ALLOW_DATA_ATTR: false,
};
```
(DOMPurify quita `on*` por default; el FORBID explícito de svg/math cubre vectores mXSS.)

## 3. Sanitización en 3 capas
| Capa | Lib | Rol |
|---|---|---|
| Admin (input/paste) | DOMPurify client-side + RICHTEXT_ALLOWLIST | best-effort UX (pegar de Word queda limpio). NO autoritativo. |
| **EF al guardar** | isomorphic-dompurify (Deno, vía esm.sh, **versión pineada**) + RICHTEXT_ALLOWLIST | **AUTORITATIVA — sanitize-and-store**: limpia y guarda la versión LIMPIA (no rechaza). La BD NUNCA guarda HTML sucio, aunque alguien pegue directo a la EF. |
| Storefront al renderear | isomorphic-dompurify (CF Workers, **misma versión**) + RICHTEXT_ALLOWLIST | defensa en profundidad: `set:html={DOMPurify.sanitize(contenido, ALLOWLIST)}`. NUNCA set:html sobre crudo. |

**Lib de la EF (decisión Jorge): opción A** — `isomorphic-dompurify` (misma lib que el storefront) vía esm.sh, **PINEAR la versión** = EF y storefront usan misma versión + mismo allowlist = paridad de comportamiento real. **Spike obligatorio antes de construir:** verificar que corre en el Deno de la EF (~5 líneas: import + sanitize un payload). Si NO corre en Deno → fallback B: `dompurify` + `linkedom` (DOM Deno-compatible) vía esm.sh, misma versión de dompurify pineada + mismo allowlist.

## 4. Zod + mirror — NO cambia
`contenido` sigue `z.string().max(5000)` (HTML es string ≤5000). La sanitización es un **transform de la EF**, NO una constraint del Zod (un refine que rechazara rompería sanitize-and-store). → **drift-guard + ef-schema-sync VERDES por construcción** (Zod intacto). Lo nuevo a sync-testear es el **allowlist** (capa aparte).

## 5. Storefront render — 1 lugar
`Texto.astro`: `{p.contenido}` → `set:html={sanitize(p.contenido)}` (el único punto). **Dropcap EM (decisión Jorge): a CSS `::first-letter`** — elimina el slice JS (`firstLetter`/`rest`/`conDropcap`), el dropcap pasa a una regla CSS sobre `.em-texto.block-text--size-{sm,md}.block-text--align-left::first-letter` (la `.em-dropcap` styling se reubica). Conserva el detalle editorial + compatible con HTML. Cambia el golden EM de texto (intencional, además del set:html).

## 6. Tests
- **Golden:** snapshot de `texto` cambia (plano → HTML sanitizado + dropcap EM→CSS), acotado al campo contenido / dropcap. Intencional, mostrar byte-a-byte.
- **TEST DE SEGURIDAD (obligatorio — sin esto no se mergea):** payloads maliciosos neutralizados en **AMBAS capas** (sanitizer EF + DOMPurify storefront), confirmando que el output no tiene tag/attr/scheme prohibido:
  - `<script>alert(1)</script>`
  - `<a href="javascript:alert(1)">x</a>`
  - `<a href=" javascript:alert(1)">x</a>` (**href con espacio/control inicial** — normalización URI no se saltea)
  - `<img src=x onerror=alert(1)>`
  - `<iframe src="https://evil"></iframe>`
  - `<b onclick="alert(1)">x</b>`
  - `<a href="data:text/html,<script>alert(1)</script>">x</a>`
  - `<style>*{x}</style>`
  - `<svg><script>alert(1)</script></svg>` y `<svg onload=alert(1)>` (**vector SVG** — svg en FORBID, confirmar)
  - Caso positivo: `<b>hola</b> <a href="https://x.com">link</a> <ul><li>a</li></ul>` sobrevive intacto.
- **Sync-test del allowlist:** EF richtext-allowlist == canónico (byte-idéntico).

## 7. Widget admin
Toolbar (negrita/itálica/link/lista) sobre `contenteditable`. Normalización a la allowlist en `input`/`paste` → DOMPurify client-side con RICHTEXT_ALLOWLIST (pegar de Word/web queda limpio antes de guardar). Botón de link: valida + fuerza `https/mailto/tel` al insertar (rechaza javascript:/data:). Patrón bendecido (sin sb en render; widget síncrono).

## Secuencia de implementación
1. **Spike EF** (verificar isomorphic-dompurify en Deno; si no, B). PRIMERO.
2. Allowlist canónico (`packages/database/src/richtext-allowlist.ts`) + mirror EF + sync-test.
3. EF `tienda-guardar-layout`: sanitize-and-store (recorre secciones, sanitiza `texto.contenido`).
4. Storefront `Texto.astro`: set:html sanitizado + dropcap EM→CSS.
5. Admin: control rich-text (toolbar + contenteditable + paste sanitize + link fuerza scheme) + `case 'richtext'` en renderCampo + `texto.contenido` control 'textarea'→'richtext'.
6. Tests: golden intencional + test de seguridad (ambas capas + las 2 adiciones) + sync-test.

Deploy: storefront (wrangler) **+** admin (Easypanel) **+** EF (MCP deploy verify_jwt=TRUE) — es el único control que toca las 3 piezas. Cada uno con su gate.
