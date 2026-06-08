# B-secciones Lote 2 — Diseño (testimonios · faq · logos)

**Fecha:** 2026-06-08 · **Molde:** idéntico a Lote 1 (`2026-06-07-b-secciones-lote1-design.md`).

## Objetivo
Sumar 3 secciones al Editor PRO-MAX siguiendo el molde probado de Lote 1: schema Zod
discriminado + mirror EF byte-idéntico, section-defs co-autorada (drift 03/04 verde),
renderer unificado con `<style>` ×4 plantillas, golden ×4, deploy en 3 fases
(Fase 1 dormido storefront+EF → Fase 2 wake catálogo+merge → Fase 3 verificación).

## Decisiones (cerradas con Jorge)
- **Párrafos/respuestas = PLANO por inspector** (textarea), sin tocar sanitize. **Sin JS cliente. Sin control nuevo.**
- **Inline = solo single-line:** título de sección + autor/cargo (testimonios).
- **(a) testimonio.texto = inspector** (reseña = párrafo multi-línea, como `caracteristicas.items.texto`).
- **(rating) = `select` 1-5 opcional, control existente.** Renderer dibuja 5 estrellas SVG (`rating` llenas + resto vacías; `undefined` → sin estrellas). **No requiere control nuevo.**
- **(layout testimonios) = grilla responsiva de cards** (columnas 1/2/3), sin JS. Carrusel = follow-up futuro.
- **(layout logos) = enum `grilla`/`tira`** responsivo que envuelve (grid auto-fit / flex-wrap), sin JS.
- **FAQ acordeón = `<details>/<summary>` nativo** (cero JS).
- **FAQ pregunta = inspector** (no inline): el `<summary>` togglea al click; inline obligaría a suprimir el toggle nativo = caso especial fuera del molde. La pregunta se edita poco → inspector es más simple y predecible.
- **logos.link regex** excluye protocol-relative: `^(https:\/\/|\/(?!\/))` (https o ruta interna `/x`; rechaza `//evil`).

## Secciones

### 1. testimonios
```ts
const TestimonioItemSchema = z.object({
  texto: z.string().max(600),                              // inspector textarea plano
  autor: z.string().max(120),                              // inline
  cargo: z.string().max(120).optional(),                   // inline
  foto: z.string().url().regex(/^https:\/\//, 'imagen debe ser https').optional(), // inspector image
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(), // select
});
const TestimoniosProps = z.object({
  titulo: z.string().max(200).optional(),                  // inline
  columnas: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3), // select
  items: z.array(TestimonioItemSchema).min(1).max(9),
});
```
- **inline:** `titulo`, `items.*.autor`, `items.*.cargo`. **inspector:** texto, foto, rating, columnas.
- Renderer: grilla de cards (avatar opcional + estrellas SVG + texto + autor + cargo). 5 estrellas: `rating` llenas, resto vacías; sin `rating` → sin fila de estrellas.

### 2. faq
```ts
const FaqItemSchema = z.object({
  pregunta: z.string().max(300),     // inspector
  respuesta: z.string().max(1500),   // inspector textarea plano
});
const FaqProps = z.object({
  titulo: z.string().max(200).optional(),   // inline
  items: z.array(FaqItemSchema).min(1).max(12),
});
```
- Renderer: `<details><summary>{pregunta}</summary><div>{respuesta}</div></details>` por item. Cero JS.
- **inline:** `titulo`. **inspector:** pregunta, respuesta.

### 3. logos
```ts
const LogoItemSchema = z.object({
  logo: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),     // inspector image
  alt: z.string().max(200),                                                  // inspector text
  link: z.string().regex(/^(https:\/\/|\/(?!\/))/, 'link debe ser https o ruta interna').optional(), // inspector url
});
const LogosProps = z.object({
  titulo: z.string().max(200).optional(),                  // inline
  layout: z.enum(['grilla', 'tira']).default('grilla'),    // select
  items: z.array(LogoItemSchema).min(1).max(12),
});
```
- Renderer: `grilla` = grid auto-fit; `tira` = flex-wrap. `<img>` envuelto en `<a href=link>` si hay link. Cero JS.
- **inline:** `titulo`. **inspector:** logo, alt, link, layout.

## Registro inline (SIMPLE_TEXT_FIELDS, TS + mirror JS)
```
testimonios: ['titulo', 'items.*.autor', 'items.*.cargo']
faq:         ['titulo']
logos:       ['titulo']
```

## Catálogo (Fase 2 wake)
Los 3 → **AVANZADOS** (no recargar esenciales). Iconos: testimonios `★`, faq `?`, logos `▦`.

## Archivos (mismo set que Lote 1)
- `packages/database/src/editor-schema.ts` (+3 props +3 union) + cp mirror EF.
- `packages/database/src/inline-fields.ts` + mirror `iapanel/.../editor/inline-fields.js`.
- `iapanel/.../editor/section-defs.js` (3 defs co-autoradas, drift 03 verde).
- `apps/storefront/src/components/blocks/{testimonios,faq,logos}/*.astro` (3 renderers unificados).
- `apps/storefront/src/components/BlockRenderer.astro` (UNIFIED +3).
- `apps/storefront/test/{testimonios,faq,logos}.golden.test.ts` + snapshots ×4 plantillas.
- Tests de key-set: `apps/storefront/test/inline-fields.test.ts` + `tests/editor/18-inline-fields.test.mjs` (actualizar set esperado).
- **Fase 2:** `iapanel/.../editor/editor-modal-catalog.js` (+3 al array) + `iapanel/.../admin/index.html` (cache-busters).

## Plan por fases
- **Fase 1 (dormido):** todo lo de arriba menos catálogo. Suite completa verde (drift 03/04 incluidos). Deploy storefront wrangler + EF. **Gate A5 caracterizado** (ver abajo). Parar para revisión de Jorge.
- **Fase 2 (wake):** catálogo +3 + cache-busters → merge `--no-ff` a main → Jorge redeploya Easypanel.
- **Fase 3 (verif):** adversarial Zod TS+EF + E2E Playwright (harness probado en Lote 1) + hotfix intacto + restaurar aimma-test.

## Gate A5 (caracterizado, no asumido)
1. **CSS rule-set diff** (build old vs new, unión de bundles): el delta = SOLO reglas de las 3 secciones nuevas (prefijos `ic/fb/ma/em` de testimonios/faq/logos + utilidades Tailwind nuevas). `@layer` sin alterar reglas existentes; ningún selector existente cambiado/dropeado. Si aparece otra cosa → frenar y reportar.
2. **HTML de páginas existentes byte-idéntico** salvo el hash de cache-bust del `<link>` CSS (golden de Lote 1 + existentes intactos).
3. **DB: 0 tiendas usan los tipos nuevos.**
4. **Dormancy:** catálogo 0 refs + `main` section-defs 0 refs → nadie puede agregarlas.
