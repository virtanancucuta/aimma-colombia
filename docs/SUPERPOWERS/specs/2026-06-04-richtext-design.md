# RICH-TEXT (B-controles #4) — Diseño aprobado (Clase B, security-critical)

> Estado: APROBADO por Jorge 2026-06-04 (revisión con lupa) + **ajustado tras el spike empírico** (mismo día). Gate de deploy firme (ver final). NO implementar más allá del spike (ya hecho y verificado).

## Anclaje (verificado, file:line)
- Render hoy: `apps/storefront/src/components/blocks/texto/Texto.astro:48` renderiza `{p.contenido}` como **texto plano** (Astro escapa). Es **1 solo renderer** (unificado A.2). EM hace dropcap **cortando el primer char** (`:36-38`) → incompatible con HTML.
- Storefront DOMPurify **probado en CF Workers**: `apps/storefront/src/pages/legales/[tipo].astro:10,42` usa `DOMPurify.sanitize(...)` de `isomorphic-dompurify` en vivo.
- EF (Deno) `supabase/functions/tienda-guardar-layout/` **sin sanitización** (grep vacío) → capa nueva. Usa `import_map: true` (tiene `deno.json`) → agregar el import de sanitize-html ahí.
- Zod: `packages/database/src/editor-schema.ts:99` `contenido: z.string().max(5000)`.

## 0. Hallazgo del spike (por qué cambió la lib de la EF)
Spike en el **Deno real de Supabase** (EF descartable `spike-richtext-deno-throwaway`, ya borrada — DELETE 200/GET 404, 24 EFs reales intactas). Probé 5 enfoques:

| Enfoque | Bootea | Sanitiza | Veredicto |
|---|---|---|---|
| `npm:isomorphic-dompurify@2.36.0` (opción A original) | ❌ WORKER_ERROR | — | jsdom necesita built-ins de Node ausentes en el Edge Runtime |
| `esm.sh isomorphic-dompurify` | ✅ | ❌ | importa el factory sin DOM → no hay `.sanitize` |
| `dompurify@3.4.7 + linkedom` (opción B del spec) | ✅ | ❌ **PASSTHROUGH SILENCIOSO** | linkedom sin `document.implementation.createHTMLDocument` ni `NodeFilter` → DOMPurify se declara `isSupported=false` y **devuelve el HTML crudo sin filtrar** (`<script>`→`<script>`) |
| `dompurify@3.4.7 + happy-dom` | ❌ BOOT_ERROR | — | no carga en el runtime |
| **`sanitize-html@2.13.1`** | ✅ | ✅ **neutraliza los 11 payloads** | pure-JS (htmlparser2), sin DOM, sin built-ins de Node |

**Conclusión:** DOMPurify no corre confiable en el Edge Runtime (jsdom no bootea; los DOM ligeros fallan o hacen passthrough). La opción B del spec (dompurify+linkedom) era una **trampa**: compila, bootea, `ok:true`, y no sanitiza nada → habría sido un XSS abierto con todo en verde. `sanitize-html` es la única robusta en la EF.

## Mecanismo ajustado: paridad por POLÍTICA, no por lib
- **EF (capa autoritativa):** `sanitize-html` (pineado). Funciona en Deno, neutraliza todo. Sanitize-and-store.
- **Storefront (defensa en profundidad):** sigue `DOMPurify` (isomorphic-dompurify, probado en CF Workers).
- **Paridad:** un **allowlist canónico lib-agnóstico** (la política abstracta) + **un adaptador por lib** + **sync-test** que valida que ambos adaptadores derivan fielmente del canónico. Dos implementaciones independientes aplicando la misma política = **defensa en profundidad con diversidad** (un CVE en una lib no tumba las dos capas).

## 1. Alcance
**Solo `texto.contenido`** pasa a rich-text. Los demás campos de texto (botones.texto, formulario.label, banner.titulo, etc.) quedan **plain** — cada campo rich = más superficie XSS; ninguno necesita formato inline. 1 campo, 1 renderer, 1 punto de `set:html`.

## 2. Allowlist canónico (lib-agnóstico) + 2 adaptadores
Política canónica en `packages/database/src/richtext-policy.ts` (datos puros, lib-agnóstica):
```js
export const RICHTEXT_POLICY = {
  tags: ['b','strong','i','em','a','ul','ol','li','p','br'],
  attrs: { a: ['href'] },                 // por-tag: href SOLO en <a>
  schemes: ['https','mailto','tel'],      // NO javascript:/data:/vbscript:/http:
  allowProtocolRelative: false,
};
```
Dos adaptadores derivados del canónico (mismo archivo o `richtext-adapters.ts`):
- **`toSanitizeHtml(POLICY)`** → `{ allowedTags: POLICY.tags, allowedAttributes: POLICY.attrs, allowedSchemes: POLICY.schemes, allowProtocolRelative: false, disallowedTagsMode: 'discard' }` + opciones de salida void-element alineadas a DOMPurify (ver §3 idempotencia).
- **`toDOMPurify(POLICY)`** → `{ ALLOWED_TAGS: POLICY.tags, ALLOWED_ATTR: [...uniq(flatten(POLICY.attrs))] (=['href']), ALLOWED_URI_REGEXP: new RegExp('^(' + POLICY.schemes.join(':|') + ':)', 'i'), FORBID_TAGS:['script','style','iframe','object','embed','form','input','svg','math'], FORBID_ATTR:['style','class','id','target'], ALLOW_DATA_ATTR:false }`.

**Mirror EF:** la política canónica + `toSanitizeHtml` se espejan byte-idéntico en `supabase/functions/tienda-guardar-layout/richtext-policy.ts` (igual que el mirror de editor-schema.ts de A.1). **Sync-test** (`tests/editor/`, modelado en 04-ef-schema-sync) valida: (a) EF policy == canónico byte-idéntico; (b) `toSanitizeHtml(canónico)` y `toDOMPurify(canónico)` derivan fielmente del canónico (mismos tags, attrs, schemes) → atrapa drift en CUALQUIERA de los dos adaptadores.

## 3. Sanitización en 3 capas
| Capa | Lib (pineada) | Rol |
|---|---|---|
| Admin (input/paste) | DOMPurify client-side + `toDOMPurify(POLICY)` | best-effort UX (pegar de Word queda limpio). NO autoritativo. |
| **EF al guardar** | `sanitize-html@2.13.1` + `toSanitizeHtml(POLICY)` | **AUTORITATIVA — sanitize-and-store**: limpia y guarda la versión LIMPIA. La BD NUNCA guarda HTML sucio. |
| Storefront al renderear | `isomorphic-dompurify` (DOMPurify, `dompurify@3.4.7`) + `toDOMPurify(POLICY)` | defensa en profundidad: `set:html={DOMPurify.sanitize(contenido, toDOMPurify(POLICY))}`. NUNCA set:html sobre crudo. |

**Idempotencia del caso positivo (condición de correctitud, Jorge):** el storefront aplica DOMPurify sobre HTML que la EF ya limpió con sanitize-html. Para que el formato que el usuario guardó (y vio guardado) no desaparezca al renderear, el HTML almacenado debe ser un **punto fijo de la DOMPurify del storefront**:
```
DOMPurify(sanitizeHtml(legit, toSanitizeHtml(POLICY)), toDOMPurify(POLICY)) === sanitizeHtml(legit, toSanitizeHtml(POLICY))
```
La asimetría ayuda: sanitize-html es más estricta por-tag (href solo en `<a>`) y corre PRIMERO; DOMPurify (que corre después) no recorta lo que sanitize-html ya dejó pasar. El riesgo residual es **formato de salida** (void elements: sanitize-html emite `<br />`, DOMPurify emite `<br>`). Se cierra configurando la salida de sanitize-html para emitir void-elements estilo DOMPurify (no auto-cerrados) → el stored es punto fijo. **Test de idempotencia obligatorio** sobre fixtures legítimos lo verifica; si aparece divergencia, se alinea la config de sanitize-html (NO se relaja la seguridad).

## 4. Zod + mirror — NO cambia
`contenido` sigue `z.string().max(5000)` (HTML es string ≤5000). La sanitización es un **transform de la EF**, NO una constraint del Zod. → **drift-guard + ef-schema-sync VERDES por construcción** (Zod intacto). Lo nuevo a sync-testear es la **política/adaptadores** (capa aparte).

## 5. Storefront render — 1 lugar
`Texto.astro`: `{p.contenido}` → `set:html={DOMPurify.sanitize(p.contenido, toDOMPurify(POLICY))}` (el único punto). **Dropcap EM (decisión Jorge): a CSS `::first-letter`** — elimina el slice JS (`firstLetter`/`rest`/`conDropcap`); el dropcap pasa a una regla CSS sobre `.em-texto.block-text--size-{sm,md}.block-text--align-left::first-letter`. Conserva el detalle editorial + compatible con HTML. Cambia el golden EM de texto (intencional, además del set:html).

## 6. Tests
- **Sync-test política/adaptadores:** EF policy == canónico (byte-idéntico) + ambos adaptadores derivan fielmente del canónico.
- **TEST DE SEGURIDAD DUAL (obligatorio — sin esto no se mergea):** los payloads maliciosos neutralizados en **AMBAS capas por separado** (EF `sanitize-html` Y storefront `DOMPurify`), confirmando que ningún output retiene tag/attr/scheme prohibido:
  - `<script>alert(1)</script>`
  - `<a href="javascript:alert(1)">x</a>`
  - `<a href=" javascript:alert(1)">x</a>` (**href con espacio/control inicial** — normalización URI no se saltea)
  - `<img src=x onerror=alert(1)>`
  - `<iframe src="https://evil"></iframe>`
  - `<b onclick="alert(1)">x</b>`
  - `<a href="data:text/html,<script>alert(1)</script>">x</a>`
  - `<style>*{x}</style>`
  - `<svg><script>alert(1)</script></svg>` y `<svg onload=alert(1)>` (**vector SVG**)
  - Spike ya verificó los 11 en sanitize-html en el Deno real; el test los fija para siempre en CI en AMBAS capas. Es la red que probaría un passthrough como el de linkedom.
- **TEST DE IDEMPOTENCIA (correctitud, obligatorio):** `DOMPurify(sanitizeHtml(legit)) === sanitizeHtml(legit)` sobre fixtures de contenido legítimo (negrita, link https, listas, párrafos, br). Cierra el riesgo sutil de dos libs distintas.
- **Golden:** snapshot de `texto` cambia (plano→HTML sanitizado + dropcap EM→CSS), acotado al campo contenido/dropcap. Intencional, mostrar byte-a-byte.

## 7. Widget admin
Toolbar (negrita/itálica/link/lista) sobre `contenteditable`. Normalización a la política en `input`/`paste` → DOMPurify client-side con `toDOMPurify(POLICY)` (pegar de Word/web queda limpio antes de guardar). Botón de link: valida + fuerza `https/mailto/tel` al insertar (rechaza javascript:/data:). Patrón bendecido (sin sb en render; widget síncrono).

## 8. Pineo de versiones (condición Jorge)
- Storefront `apps/storefront/package.json`: `isomorphic-dompurify` `^2.20.0` → **exacto `2.36.0`** (descubierto en el spike: el caret resolvía a 2.36.0 → pinear para que no se mueva solo). dompurify queda transitivamente en 3.4.7 (lockfile).
- EF: `sanitize-html` **exacto `2.13.1`** (en el deno.json import map de la EF, vía `npm:sanitize-html@2.13.1`).
- El test de seguridad + idempotencia corren contra estas versiones exactas.

## Secuencia de implementación
1. ~~Spike EF~~ **HECHO** → sanitize-html@2.13.1 confirmado en Deno real; isomorphic-dompurify/linkedom/happy-dom descartados.
2. Política canónica (`packages/database/src/richtext-policy.ts`) + 2 adaptadores + mirror EF + sync-test.
3. Pineo de versiones (§8): storefront isomorphic-dompurify→2.36.0 exacto; EF deno.json sanitize-html@2.13.1.
4. EF `tienda-guardar-layout`: sanitize-and-store (recorre secciones, sanitiza `texto.contenido` con sanitize-html + toSanitizeHtml, salida punto-fijo de DOMPurify).
5. Storefront `Texto.astro`: set:html con DOMPurify+toDOMPurify + dropcap EM→CSS.
6. Admin: control rich-text (toolbar + contenteditable + paste sanitize + link fuerza scheme) + `case 'richtext'` en renderCampo + `texto.contenido` control 'textarea'→'richtext'.
7. Tests: sync-test política/adaptadores + test de seguridad DUAL (ambas capas, 11 payloads + las 2 adiciones) + test de idempotencia + golden intencional.

## Gate de deploy (FIRME — antes de tocar producción)
Traer a Jorge: (a) diff completo; (b) RESULTADOS del test de seguridad en AMBAS capas (cada payload neutralizado en EF y storefront); (c) chequeo de idempotencia en verde; (d) golden byte-a-byte (texto plano→HTML + dropcap EM→CSS). **El test de seguridad + idempotencia en verde es la condición para deployar.** Deploy: storefront (wrangler) + admin (Easypanel) + EF (MCP deploy verify_jwt=TRUE) — único control que toca las 3 piezas, cada uno con su gate.

## Backlog (no bloquea)
- Rotar el PAT de Supabase Management (texto plano en `aimma.md`, expuesto en output del spike) + el PAT de GitHub → backlog de secretos.
