# Editor PRO-MAX Plan 2: 3 plantillas restantes (Fashion Bold + Minimal Artesanal + Editorial Magazine)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar las 21 variants de blocks restantes (7 tipos x 3 plantillas) y actualizar `BlockRenderer.astro` para dispatchar por `plantilla.slug` (no solo a Industrial Clean como Plan 1).

**Architecture:** Misma estructura que Plan 1. Cada plantilla tiene su propio estilo visual (font-display + tonos + microinteracciones) pero el contrato JSON (Section schema) y CSS grid 24-col son agnosticos. Reusa: `_ElementRenderer.astro`, `blocks.css`, schemas Zod. Cada block-{tipo}-{plantilla}.astro renderea el mismo Section data con scoped styles distintos. Reusa `ProductCardFB/MA/EM` existentes de Fase 9 en los blocks `productos`.

**Tech Stack:** Astro 5 SSR + Tailwind 4 + Cloudflare Workers. Sin nuevas dependencias.

**Spec referencia:** `docs/SUPERPOWERS/specs/2026-06-01-editor-pro-max-v2-design.md` §6 (Catalogo).

**Total estimado:** 1 semana (1 dev) — 8 tasks consolidadas.

---

## File structure

**Crear (21 archivos nuevos):**

Fashion Bold (7):
- `apps/storefront/src/components/blocks/hero/HeroFashionBold.astro`
- `apps/storefront/src/components/blocks/texto/TextoFashionBold.astro`
- `apps/storefront/src/components/blocks/imagen/ImagenFashionBold.astro`
- `apps/storefront/src/components/blocks/botones/BotonesFashionBold.astro`
- `apps/storefront/src/components/blocks/productos/ProductosFashionBold.astro`
- `apps/storefront/src/components/blocks/galeria/GaleriaFashionBold.astro`
- `apps/storefront/src/components/blocks/formulario/FormularioFashionBold.astro`

Minimal Artesanal (7):
- Idem con sufijo `MinimalArtesanal`

Editorial Magazine (7):
- Idem con sufijo `EditorialMagazine`

**Modificar (1 archivo):**
- `apps/storefront/src/components/BlockRenderer.astro` — dispatch por `plantilla.slug` con fallback a Industrial Clean

---

## Plantilla style guide

Para cada plantilla, los blocks heredan estos design tokens del Layout y los aplican con scoped styles:

### Fashion Bold
- **Font display:** Anton (uppercase, tight letter-spacing, edge-to-edge)
- **Font body:** Inter
- **Voz visual:** Edge-to-edge full bleed, hairlines `--ta-color-text-base`, NO border-radius
- **Tokens clave:** `padding 0` en sections lg, headers `font-display uppercase tracking-[-0.04em]`
- **Microinteracciones:** ninguna en hover (estatico bold)

### Minimal Artesanal
- **Font display:** Fraunces (variable, opsz 24-96)
- **Font body:** Inter
- **Voz visual:** Centered, generous whitespace, italic eyebrows, soft borders `--ta-color-text-base`/10
- **Tokens clave:** sections con `mx-auto max-w-screen-xl`, padding xl+
- **Microinteracciones:** opacity transitions softs, NO scale

### Editorial Magazine
- **Font display:** Fraunces (display)
- **Font body:** Inter
- **Voz visual:** Editorial revista (Vogue/Kinfolk), accent bars, italic span destacado, dropcaps
- **Tokens clave:** accent `--ta-color-accent` para spans + hairlines + numbered eyebrows
- **Microinteracciones:** none (estatico)

---

## Task 1: Fashion Bold blocks (7 archivos)

**Files:** crear todos los `*FashionBold.astro` listados arriba.

- [ ] **Step 1.1: Crear `HeroFashionBold.astro`**

```astro
---
// AIMMA Editor PRO-MAX · Hero · variant Fashion Bold · 2026-06-01
import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';

interface Props { section: Section; }
const { section } = Astro.props;

const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color'
  ? `background-color:${section.fondo.valor};`
  : section.fondo.tipo === 'imagen'
    ? `background-image:url(${section.fondo.valor});background-size:cover;background-position:center;`
    : section.fondo.tipo === 'gradient'
      ? `background-image:${section.fondo.valor};`
      : '';
---

<section
  class={`block-section ${padClass} fb-hero`}
  style={`${heightStyle}${bgStyle}`}
  data-section-id={section.id}
  data-section-tipo="hero"
  data-plantilla="fashion_bold"
>
  {section.elementos.map((el) => <ElementRenderer el={el} />)}
</section>

<style>
  /* Fashion Bold hero: tipografia anton uppercase edge-to-edge */
  .fb-hero :global(.block-text--size-3xl),
  .fb-hero :global(.block-text--size-2xl) {
    font-family: var(--ta-font-display);
    text-transform: uppercase;
    letter-spacing: -0.04em;
    line-height: 0.88;
    font-weight: 400;
  }
  .fb-hero :global(.block-text--size-xl) {
    font-family: var(--ta-font-display);
    text-transform: uppercase;
    letter-spacing: -0.03em;
  }
  .fb-hero :global(.block-button) {
    border-radius: 0;
    padding: 1rem 2.5rem;
    font-family: var(--ta-font-body);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.85rem;
  }
</style>
```

- [ ] **Step 1.2: Crear `TextoFashionBold.astro`**

```astro
---
import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';
interface Props { section: Section; }
const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color' ? `background-color:${section.fondo.valor};`
  : section.fondo.tipo === 'imagen' ? `background-image:url(${section.fondo.valor});background-size:cover;background-position:center;`
  : section.fondo.tipo === 'gradient' ? `background-image:${section.fondo.valor};`
  : '';
---

<section class={`block-section ${padClass} fb-texto`} style={`${heightStyle}${bgStyle}`} data-section-id={section.id} data-section-tipo="texto" data-plantilla="fashion_bold">
  {section.elementos.map((el) => <ElementRenderer el={el} />)}
</section>

<style>
  .fb-texto :global(.block-text--size-3xl),
  .fb-texto :global(.block-text--size-2xl),
  .fb-texto :global(.block-text--size-xl) {
    font-family: var(--ta-font-display);
    text-transform: uppercase;
    letter-spacing: -0.035em;
    line-height: 0.92;
  }
  .fb-texto :global(.block-text--size-md),
  .fb-texto :global(.block-text--size-lg) {
    font-family: var(--ta-font-body);
    line-height: 1.55;
    max-width: 68ch;
  }
</style>
```

- [ ] **Step 1.3: Crear `ImagenFashionBold.astro`**

```astro
---
import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';
interface Props { section: Section; }
const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const primerImagen = section.elementos.find(el => el.tipo === 'imagen');
const bgStyle = primerImagen && primerImagen.tipo === 'imagen'
  ? `background-image:url(${primerImagen.props.src});background-size:${primerImagen.props.objeto};background-position:center;`
  : section.fondo.tipo === 'color' ? `background-color:${section.fondo.valor};`
  : '';
const overlayStyle = section.fondo.overlay ? `position:relative;` : '';
---

<section class={`block-section ${padClass} fb-imagen`} style={`${heightStyle}${bgStyle}${overlayStyle}`} data-section-id={section.id} data-section-tipo="imagen" data-plantilla="fashion_bold">
  {section.fondo.overlay && (
    <div class="block-imagen-overlay" style={`position:absolute;inset:0;background:${section.fondo.overlay.color};opacity:${section.fondo.overlay.opacity};pointer-events:none;`} />
  )}
  {section.elementos.filter(el => el.tipo !== 'imagen').map((el) => <ElementRenderer el={el} />)}
</section>

<style>
  /* Fashion Bold imagen: NO border, edge-to-edge */
  .fb-imagen { overflow: hidden; }
  .fb-imagen :global(.block-text--size-3xl),
  .fb-imagen :global(.block-text--size-2xl) {
    font-family: var(--ta-font-display);
    text-transform: uppercase;
    letter-spacing: -0.04em;
    line-height: 0.88;
    color: var(--ta-color-bg-base);
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  }
</style>
```

- [ ] **Step 1.4: Crear `BotonesFashionBold.astro`**

```astro
---
import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';
interface Props { section: Section; }
const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color' ? `background-color:${section.fondo.valor};` : '';
---

<section class={`block-section ${padClass} fb-botones`} style={`${heightStyle}${bgStyle}`} data-section-id={section.id} data-section-tipo="botones" data-plantilla="fashion_bold">
  {section.elementos.map((el) => <ElementRenderer el={el} />)}
</section>

<style>
  .fb-botones :global(.block-button) {
    border-radius: 0;
    padding: 1.125rem 2.75rem;
    font-family: var(--ta-font-body);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.875rem;
    font-weight: 600;
  }
</style>
```

- [ ] **Step 1.5: Crear `ProductosFashionBold.astro`**

```astro
---
import type { Section, Element } from '@aimma/database';
import ProductCard from '~/components/templates/fashion_bold/ProductCardFB.astro';
import { getProductosPorTienda } from '~/lib/catalogo';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';

interface Props { section: Section; }
const { section } = Astro.props;
const { tienda, supabase } = Astro.locals;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color' ? `background-color:${section.fondo.valor};` : '';

const prodEl = section.elementos.find(el => el.tipo === 'productos') as Extract<Element, { tipo: 'productos' }> | undefined;

let productos: Awaited<ReturnType<typeof getProductosPorTienda>> = [];
if (prodEl) {
  try {
    productos = await getProductosPorTienda(supabase, tienda.id, {
      limit: prodEl.props.limite,
      categoriaId: prodEl.props.categoria_id ?? undefined,
    });
  } catch (err) {
    console.error('[ProductosFB] getProductosPorTienda failed:', err);
    productos = [];
  }
}

const colsClass = !prodEl || prodEl.props.columnas === 'auto'
  ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
  : prodEl.props.columnas === 2 ? 'grid-cols-2'
  : prodEl.props.columnas === 3 ? 'grid-cols-3'
  : prodEl.props.columnas === 4 ? 'grid-cols-4'
  : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
---

<section class={`block-section ${padClass} fb-productos`} style={`${heightStyle}${bgStyle}`} data-section-id={section.id} data-section-tipo="productos" data-plantilla="fashion_bold">
  {section.elementos.filter(el => el.tipo !== 'productos').map((el) => <ElementRenderer el={el} />)}
  <div class="fb-productos-grid" style="grid-column:1 / -1;">
    {productos.length === 0 ? (
      <div class="fb-empty">Sin productos disponibles</div>
    ) : (
      <div class={`grid gap-x-4 gap-y-10 lg:gap-x-6 lg:gap-y-14 ${colsClass}`}>
        {productos.map((p) => <ProductCard producto={p} />)}
      </div>
    )}
  </div>
</section>

<style>
  .fb-productos-grid { display: block; width: 100%; margin-top: 1.5rem; }
  .fb-empty {
    padding: 3rem;
    text-align: center;
    color: var(--ta-color-text-base);
    opacity: 0.45;
    font-family: var(--ta-font-display);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.875rem;
    border-top: 1px solid var(--ta-color-text-base);
    border-bottom: 1px solid var(--ta-color-text-base);
  }
</style>
```

- [ ] **Step 1.6: Crear `GaleriaFashionBold.astro`**

```astro
---
import type { Section, Element } from '@aimma/database';
interface Props { section: Section; }
const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color' ? `background-color:${section.fondo.valor};` : '';
const galEl = section.elementos.find(el => el.tipo === 'galeria') as Extract<Element, { tipo: 'galeria' }> | undefined;
const gapClass = galEl?.props.gap === 'tight' ? 'gap-0'
  : galEl?.props.gap === 'loose' ? 'gap-8'
  : 'gap-2';
const colsClass = galEl?.props.layout === 'carrusel'
  ? 'flex overflow-x-auto snap-x snap-mandatory'
  : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
---

<section class={`block-section ${padClass} fb-galeria`} style={`${heightStyle}${bgStyle}`} data-section-id={section.id} data-section-tipo="galeria" data-plantilla="fashion_bold">
  <div class={`${colsClass} ${gapClass}`} style="grid-column:1 / -1;">
    {galEl?.props.imagenes.map((img) => (
      <div class="fb-galeria-item">
        <img src={img.src} alt={img.alt} loading="lazy" class="w-full h-full object-cover" />
      </div>
    ))}
  </div>
</section>

<style>
  /* Fashion Bold galeria: aspect 3/4 portrait, NO border, NO radius */
  .fb-galeria-item {
    aspect-ratio: 3 / 4;
    overflow: hidden;
  }
  .fb-galeria :global(.flex.overflow-x-auto) .fb-galeria-item {
    flex: 0 0 280px;
    scroll-snap-align: center;
  }
</style>
```

- [ ] **Step 1.7: Crear `FormularioFashionBold.astro`**

```astro
---
import type { Section, Element } from '@aimma/database';
interface Props { section: Section; }
const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color' ? `background-color:${section.fondo.valor};` : '';
const campos = section.elementos.filter(el => el.tipo === 'form_field') as Extract<Element, { tipo: 'form_field' }>[];
const titulo = section.elementos.find(el => el.tipo === 'texto');
const submitBtn = section.elementos.find(el => el.tipo === 'boton');
---

<section class={`block-section ${padClass} fb-form`} style={`${heightStyle}${bgStyle}`} data-section-id={section.id} data-section-tipo="formulario" data-plantilla="fashion_bold">
  <form class="fb-form-inner" style="grid-column:1 / -1;" method="POST" action="/internal/form-submit" data-form-id={section.id}>
    {titulo && titulo.tipo === 'texto' && (
      <h3 class="fb-form-title">{titulo.props.contenido}</h3>
    )}
    {campos.map((campo, idx) => {
      const fieldId = `${section.id}_field_${idx}`;
      if (campo.props.tipo_campo === 'textarea') {
        return (
          <div class="fb-form-field">
            <label for={fieldId}>{campo.props.label}{campo.props.requerido && <span class="fb-required">*</span>}</label>
            <textarea id={fieldId} name={`field_${idx}`} placeholder={campo.props.placeholder ?? ''} required={campo.props.requerido} rows={4}></textarea>
          </div>
        );
      }
      if (campo.props.tipo_campo === 'select') {
        return (
          <div class="fb-form-field">
            <label for={fieldId}>{campo.props.label}{campo.props.requerido && <span class="fb-required">*</span>}</label>
            <select id={fieldId} name={`field_${idx}`} required={campo.props.requerido}>
              <option value="">{campo.props.placeholder ?? 'Selecciona...'}</option>
              {(campo.props.opciones ?? []).map((opt) => <option value={opt}>{opt}</option>)}
            </select>
          </div>
        );
      }
      if (campo.props.tipo_campo === 'checkbox') {
        return (
          <div class="fb-form-field fb-form-field--check">
            <input id={fieldId} name={`field_${idx}`} type="checkbox" required={campo.props.requerido} />
            <label for={fieldId}>{campo.props.label}</label>
          </div>
        );
      }
      return (
        <div class="fb-form-field">
          <label for={fieldId}>{campo.props.label}{campo.props.requerido && <span class="fb-required">*</span>}</label>
          <input id={fieldId} name={`field_${idx}`} type={campo.props.tipo_campo} placeholder={campo.props.placeholder ?? ''} required={campo.props.requerido} />
        </div>
      );
    })}
    <div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;" aria-hidden="true">
      <label for={`${section.id}_hp`}>No llenar este campo</label>
      <input id={`${section.id}_hp`} name="website" type="text" tabindex="-1" autocomplete="off" />
    </div>
    <button type="submit" class="fb-form-submit">
      {submitBtn && submitBtn.tipo === 'boton' ? submitBtn.props.texto : 'Enviar'}
    </button>
  </form>
</section>

<style>
  .fb-form-inner {
    max-width: 580px;
    width: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    font-family: var(--ta-font-body);
  }
  .fb-form-title {
    font-family: var(--ta-font-display);
    text-transform: uppercase;
    letter-spacing: -0.035em;
    font-size: 2rem;
    font-weight: 400;
    line-height: 0.92;
    color: var(--ta-color-text-base);
    margin: 0 0 0.5rem 0;
  }
  .fb-form-field { display: flex; flex-direction: column; gap: 0.5rem; }
  .fb-form-field label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ta-color-text-base);
    font-weight: 600;
  }
  .fb-required { color: var(--ta-color-accent); margin-left: 4px; }
  .fb-form-field input,
  .fb-form-field textarea,
  .fb-form-field select {
    padding: 0.875rem 1rem;
    border: none;
    border-bottom: 2px solid var(--ta-color-text-base);
    border-radius: 0;
    background: transparent;
    color: var(--ta-color-text-base);
    font-family: inherit;
    font-size: 1rem;
  }
  .fb-form-field input:focus,
  .fb-form-field textarea:focus,
  .fb-form-field select:focus {
    outline: none;
    border-bottom-color: var(--ta-color-accent);
  }
  .fb-form-field--check { flex-direction: row; align-items: center; gap: 0.5rem; }
  .fb-form-field--check input { border: 2px solid var(--ta-color-text-base); padding: 0; height: 18px; width: 18px; }
  .fb-form-submit {
    padding: 1.125rem 2.75rem;
    background: var(--ta-color-text-base);
    color: var(--ta-color-bg-base);
    border: none;
    border-radius: 0;
    font-family: var(--ta-font-body);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    align-self: flex-start;
  }
  .fb-form-submit:hover { opacity: 0.85; }
</style>
```

- [ ] **Step 1.8: Verify typecheck + commit**

```bash
cd apps/storefront && npx astro check 2>&1 | tail -3
```

Expected: 0 errors. Hints preexistentes OK.

(El controller hace el commit despues del review pass.)

---

## Task 2: Minimal Artesanal blocks (7 archivos)

**Files:** crear todos los `*MinimalArtesanal.astro`.

Patron base IDENTICO a Fashion Bold pero con scoped styles distintos. Cada archivo MA replica la estructura del Industrial Clean / Fashion Bold equivalente, cambiando:
- class prefix: `ma-`
- data-plantilla="minimal_artesanal"
- `<style>` con tokens MA (Fraunces variable opsz, soft tracks, italic spans)

- [ ] **Step 2.1: Crear `HeroMinimalArtesanal.astro`**

```astro
---
import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';
interface Props { section: Section; }
const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color' ? `background-color:${section.fondo.valor};`
  : section.fondo.tipo === 'imagen' ? `background-image:url(${section.fondo.valor});background-size:cover;background-position:center;`
  : section.fondo.tipo === 'gradient' ? `background-image:${section.fondo.valor};`
  : '';
---

<section class={`block-section ${padClass} ma-hero`} style={`${heightStyle}${bgStyle}`} data-section-id={section.id} data-section-tipo="hero" data-plantilla="minimal_artesanal">
  {section.elementos.map((el) => <ElementRenderer el={el} />)}
</section>

<style>
  /* Minimal Artesanal hero: Fraunces variable opsz, generous tracking */
  .ma-hero :global(.block-text--size-3xl) {
    font-family: var(--ta-font-display);
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.05;
    font-variation-settings: 'opsz' 96;
  }
  .ma-hero :global(.block-text--size-2xl),
  .ma-hero :global(.block-text--size-xl) {
    font-family: var(--ta-font-display);
    font-weight: 400;
    font-variation-settings: 'opsz' 48;
    letter-spacing: -0.015em;
  }
  .ma-hero :global(.block-text--size-md),
  .ma-hero :global(.block-text--size-lg) {
    font-family: var(--ta-font-body);
    line-height: 1.65;
    max-width: 60ch;
    text-wrap: balance;
  }
  .ma-hero :global(.block-button) {
    border-radius: 999px;
    padding: 0.875rem 2.25rem;
    font-family: var(--ta-font-body);
    font-size: 0.875rem;
    font-weight: 500;
    transition: opacity 300ms ease-out;
  }
</style>
```

- [ ] **Step 2.2-2.7: Crear los 6 archivos restantes MA**

Para `TextoMA`, `ImagenMA`, `BotonesMA`, `ProductosMA`, `GaleriaMA`, `FormularioMA`: copiar estructura del equivalente Fashion Bold del Task 1 (Steps 1.2-1.7), cambiar:
1. clase prefix `fb-` → `ma-`
2. `data-plantilla="fashion_bold"` → `"minimal_artesanal"`
3. Import `ProductCardFB` → `ProductCardMA` (en archivo `Productos`)
4. `<style>` block reemplazado por tokens MA:

**TextoMA style:**
```css
.ma-texto :global(.block-text--size-2xl),
.ma-texto :global(.block-text--size-xl) {
  font-family: var(--ta-font-display);
  font-weight: 400;
  letter-spacing: -0.018em;
  line-height: 1.18;
  font-variation-settings: 'opsz' 48;
}
.ma-texto :global(.block-text--size-md),
.ma-texto :global(.block-text--size-lg) {
  font-family: var(--ta-font-body);
  line-height: 1.7;
  max-width: 58ch;
}
```

**ImagenMA style:**
```css
.ma-imagen { border-radius: 4px; overflow: hidden; }
.ma-imagen :global(.block-text--size-3xl),
.ma-imagen :global(.block-text--size-2xl) {
  font-family: var(--ta-font-display);
  font-variation-settings: 'opsz' 96;
  color: var(--ta-color-bg-base);
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
}
```

**BotonesMA style:**
```css
.ma-botones :global(.block-button) {
  border-radius: 999px;
  padding: 0.875rem 2.25rem;
  font-family: var(--ta-font-body);
  font-size: 0.875rem;
  font-weight: 500;
}
```

**ProductosMA:** import `ProductCardMA`; `.ma-productos-grid` con `margin-top: 2rem`; `.ma-empty` italic Fraunces opsz 24.

**GaleriaMA:** aspect-ratio `4 / 5`, `border-radius: 4px`.

**FormularioMA:** `.ma-form-title` Fraunces opsz 48 italic; inputs `border-radius: 4px` con border `--ta-color-text-base/15`; submit border-radius 999px.

- [ ] **Step 2.8: astro check + report**

---

## Task 3: Editorial Magazine blocks (7 archivos)

**Files:** crear todos los `*EditorialMagazine.astro`.

Patron base IDENTICO a Fashion Bold pero con scoped styles distintos:
- class prefix: `em-`
- data-plantilla="editorial_magazine"
- Acentos `--ta-color-accent` en spans y hairlines

- [ ] **Step 3.1: Crear `HeroEditorialMagazine.astro`**

```astro
---
import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';
interface Props { section: Section; }
const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color' ? `background-color:${section.fondo.valor};`
  : section.fondo.tipo === 'imagen' ? `background-image:url(${section.fondo.valor});background-size:cover;background-position:center;`
  : section.fondo.tipo === 'gradient' ? `background-image:${section.fondo.valor};`
  : '';
---

<section class={`block-section ${padClass} em-hero`} style={`${heightStyle}${bgStyle}`} data-section-id={section.id} data-section-tipo="hero" data-plantilla="editorial_magazine">
  {section.elementos.map((el) => <ElementRenderer el={el} />)}
</section>

<style>
  /* Editorial Magazine hero: Fraunces display + accent spans */
  .em-hero :global(.block-text--size-3xl) {
    font-family: var(--ta-font-display);
    font-weight: 300;
    letter-spacing: -0.012em;
    line-height: 1;
    text-wrap: balance;
  }
  .em-hero :global(.block-text--size-2xl) {
    font-family: var(--ta-font-display);
    font-weight: 400;
    font-style: italic;
    letter-spacing: -0.018em;
    color: var(--ta-color-accent);
  }
  .em-hero :global(.block-text--size-xl) {
    font-family: var(--ta-font-display);
    font-weight: 400;
    letter-spacing: -0.012em;
  }
  .em-hero :global(.block-text--size-md),
  .em-hero :global(.block-text--size-lg) {
    font-family: var(--ta-font-body);
    line-height: 1.6;
    max-width: 65ch;
  }
</style>
```

- [ ] **Step 3.2-3.7: Crear los 6 archivos restantes EM**

Para `TextoEM`, `ImagenEM`, `BotonesEM`, `ProductosEM`, `GaleriaEM`, `FormularioEM`: copiar estructura del equivalente Fashion Bold del Task 1 (Steps 1.2-1.7), cambiar:
1. clase prefix `fb-` → `em-`
2. `data-plantilla="fashion_bold"` → `"editorial_magazine"`
3. Import `ProductCardFB` → `ProductCardEM` (en archivo `Productos`)
4. `<style>` block reemplazado por tokens EM:

**TextoEM style:**
```css
.em-texto :global(.block-text--size-2xl),
.em-texto :global(.block-text--size-xl) {
  font-family: var(--ta-font-display);
  font-weight: 300;
  letter-spacing: -0.01em;
  line-height: 1.15;
}
.em-texto :global(.block-text--size-md),
.em-texto :global(.block-text--size-lg) {
  font-family: var(--ta-font-body);
  line-height: 1.65;
  max-width: 62ch;
}
.em-texto :global(.block-text--size-lg) {
  font-family: var(--ta-font-display);
  font-style: italic;
  font-weight: 400;
}
```

**ImagenEM style:**
```css
.em-imagen :global(.block-text--size-3xl),
.em-imagen :global(.block-text--size-2xl) {
  font-family: var(--ta-font-display);
  font-weight: 300;
  color: var(--ta-color-bg-base);
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.5);
}
```

**BotonesEM style:**
```css
.em-botones :global(.block-button) {
  border-radius: 0;
  padding: 1rem 2rem;
  font-family: var(--ta-font-body);
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.04em;
}
.em-botones :global(.block-button--outline) {
  border-color: var(--ta-color-accent);
  color: var(--ta-color-accent);
}
```

**ProductosEM:** import `ProductCardEM`; `.em-productos-grid` con accent bar antes del grid (border-top `--ta-color-accent` 2px).

**GaleriaEM:** aspect-ratio `4 / 5`, NO border.

**FormularioEM:** `.em-form-title` Fraunces display 300 weight con italic accent span; inputs `border-bottom: 1px solid --ta-color-text-base/25` no border-radius; submit con background `--ta-color-accent`.

- [ ] **Step 3.8: astro check + report**

---

## Task 4: Update BlockRenderer dispatcher para multi-plantilla

**Files:** modificar `apps/storefront/src/components/BlockRenderer.astro`.

- [ ] **Step 4.1: Reemplazar contenido completo**

```astro
---
// AIMMA Editor PRO-MAX · BlockRenderer dispatcher · v2 Plan 2
// Despacha por section.tipo + plantilla.slug.
// 4 plantillas implementadas: industrial_clean | fashion_bold |
// minimal_artesanal | editorial_magazine. Fallback a industrial_clean
// si la plantilla no se reconoce.

import type { Section } from '@aimma/database';

// Industrial Clean (Plan 1)
import HeroIC from '~/components/blocks/hero/HeroIndustrialClean.astro';
import TextoIC from '~/components/blocks/texto/TextoIndustrialClean.astro';
import ImagenIC from '~/components/blocks/imagen/ImagenIndustrialClean.astro';
import BotonesIC from '~/components/blocks/botones/BotonesIndustrialClean.astro';
import ProductosIC from '~/components/blocks/productos/ProductosIndustrialClean.astro';
import GaleriaIC from '~/components/blocks/galeria/GaleriaIndustrialClean.astro';
import FormularioIC from '~/components/blocks/formulario/FormularioIndustrialClean.astro';

// Fashion Bold
import HeroFB from '~/components/blocks/hero/HeroFashionBold.astro';
import TextoFB from '~/components/blocks/texto/TextoFashionBold.astro';
import ImagenFB from '~/components/blocks/imagen/ImagenFashionBold.astro';
import BotonesFB from '~/components/blocks/botones/BotonesFashionBold.astro';
import ProductosFB from '~/components/blocks/productos/ProductosFashionBold.astro';
import GaleriaFB from '~/components/blocks/galeria/GaleriaFashionBold.astro';
import FormularioFB from '~/components/blocks/formulario/FormularioFashionBold.astro';

// Minimal Artesanal
import HeroMA from '~/components/blocks/hero/HeroMinimalArtesanal.astro';
import TextoMA from '~/components/blocks/texto/TextoMinimalArtesanal.astro';
import ImagenMA from '~/components/blocks/imagen/ImagenMinimalArtesanal.astro';
import BotonesMA from '~/components/blocks/botones/BotonesMinimalArtesanal.astro';
import ProductosMA from '~/components/blocks/productos/ProductosMinimalArtesanal.astro';
import GaleriaMA from '~/components/blocks/galeria/GaleriaMinimalArtesanal.astro';
import FormularioMA from '~/components/blocks/formulario/FormularioMinimalArtesanal.astro';

// Editorial Magazine
import HeroEM from '~/components/blocks/hero/HeroEditorialMagazine.astro';
import TextoEM from '~/components/blocks/texto/TextoEditorialMagazine.astro';
import ImagenEM from '~/components/blocks/imagen/ImagenEditorialMagazine.astro';
import BotonesEM from '~/components/blocks/botones/BotonesEditorialMagazine.astro';
import ProductosEM from '~/components/blocks/productos/ProductosEditorialMagazine.astro';
import GaleriaEM from '~/components/blocks/galeria/GaleriaEditorialMagazine.astro';
import FormularioEM from '~/components/blocks/formulario/FormularioEditorialMagazine.astro';

// Espaciador (agnostico, sin variantes por plantilla)
import Espaciador from '~/components/blocks/espaciador/Espaciador.astro';

interface Props {
  sections: Section[];
}

const { sections } = Astro.props;
const { tienda } = Astro.locals;
const plantilla = tienda.plantilla?.slug ?? 'industrial_clean';

// Tabla de dispatch: [tipo][plantilla] -> componente.
const BLOCKS = {
  hero: { industrial_clean: HeroIC, fashion_bold: HeroFB, minimal_artesanal: HeroMA, editorial_magazine: HeroEM },
  texto: { industrial_clean: TextoIC, fashion_bold: TextoFB, minimal_artesanal: TextoMA, editorial_magazine: TextoEM },
  imagen: { industrial_clean: ImagenIC, fashion_bold: ImagenFB, minimal_artesanal: ImagenMA, editorial_magazine: ImagenEM },
  botones: { industrial_clean: BotonesIC, fashion_bold: BotonesFB, minimal_artesanal: BotonesMA, editorial_magazine: BotonesEM },
  productos: { industrial_clean: ProductosIC, fashion_bold: ProductosFB, minimal_artesanal: ProductosMA, editorial_magazine: ProductosEM },
  galeria: { industrial_clean: GaleriaIC, fashion_bold: GaleriaFB, minimal_artesanal: GaleriaMA, editorial_magazine: GaleriaEM },
  formulario: { industrial_clean: FormularioIC, fashion_bold: FormularioFB, minimal_artesanal: FormularioMA, editorial_magazine: FormularioEM },
} as const;

function pickBlock(tipo: Section['tipo'], plantillaSlug: string) {
  if (tipo === 'espaciador') return Espaciador;
  const byTipo = BLOCKS[tipo as keyof typeof BLOCKS];
  if (!byTipo) return null;
  return byTipo[plantillaSlug as keyof typeof byTipo] ?? byTipo.industrial_clean;
}
---

{sections.map((section) => {
  const Block = pickBlock(section.tipo, plantilla);
  if (!Block) return null;
  return <Block section={section} />;
})}
```

- [ ] **Step 4.2: Verify build verde**

```bash
cd apps/storefront && npm run build 2>&1 | tail -5
```

Expected: `Server built in Xs. Complete!`

- [ ] **Step 4.3: Verify typecheck**

```bash
cd apps/storefront && npx astro check 2>&1 | tail -3
```

Expected: 0 errors.

---

## Task 5: Test E2E LIVE — Fashion Bold

**Files:** UPDATE BD aimma-test + verify LIVE.

- [ ] **Step 5.1: Switch aimma-test a Fashion Bold + paleta noir**

```sql
UPDATE tiendas SET 
  plantilla_id = (SELECT id FROM plantillas WHERE slug='fashion_bold'),
  paleta_id = (SELECT id FROM paletas WHERE slug='noir' AND plantilla_id=(SELECT id FROM plantillas WHERE slug='fashion_bold'))
WHERE slug='aimma-test';
```

(Mantener el fixture pages.home — no hay que cambiarlo, solo cambia la plantilla; el JSON es agnostico.)

- [ ] **Step 5.2: Build + deploy CF Worker**

```bash
cd apps/storefront && npm run build && echo "_worker.js" > "dist/.assetsignore" && CLOUDFLARE_API_TOKEN=$CF_TOKEN npx wrangler deploy 2>&1 | grep -E "Uploaded|Worker Startup"
```

- [ ] **Step 5.3: Invalidate KV + verify**

```bash
curl -X POST "https://aimma-test.tienda.aimma.com.co/internal/invalidate-kv" \
  -H "Authorization: Bearer $INVALIDATE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"slug":"aimma-test"}'

sleep 5
curl -s -H "Cache-Control: no-cache" "https://aimma-test.tienda.aimma.com.co/?cb=$(date +%s%N)" -o /tmp/fb.html
echo "data-plantilla expected fashion_bold:"
grep -oE 'data-plantilla="[a-z_]+"' /tmp/fb.html | sort -u
echo "fb-hero scoped class present:"
grep -c "fb-hero\|fb-productos" /tmp/fb.html
echo "Texto fixture LIVE:"
grep -o "Tienda construida con el Editor PRO-MAX" /tmp/fb.html
```

Expected:
- data-plantilla="fashion_bold" presente
- `fb-hero` y `fb-productos` clases scoped en HTML
- Texto fixture renderea

---

## Task 6: Test E2E LIVE — Minimal Artesanal

- [ ] **Step 6.1: Switch a Minimal Artesanal + paleta cream**

```sql
UPDATE tiendas SET 
  plantilla_id = (SELECT id FROM plantillas WHERE slug='minimal_artesanal'),
  paleta_id = (SELECT id FROM paletas WHERE slug='cream' AND plantilla_id=(SELECT id FROM plantillas WHERE slug='minimal_artesanal'))
WHERE slug='aimma-test';
```

- [ ] **Step 6.2: Invalidate + verify**

```bash
curl -X POST "https://aimma-test.tienda.aimma.com.co/internal/invalidate-kv" -H "Authorization: Bearer $INVALIDATE_SECRET" -H "Content-Type: application/json" -d '{"slug":"aimma-test"}'
sleep 5
curl -s -H "Cache-Control: no-cache" "https://aimma-test.tienda.aimma.com.co/?cb=$(date +%s%N)" -o /tmp/ma.html
echo "data-plantilla expected minimal_artesanal:"
grep -oE 'data-plantilla="[a-z_]+"' /tmp/ma.html | sort -u
echo "ma-hero scoped class present:"
grep -c "ma-hero\|ma-productos" /tmp/ma.html
```

---

## Task 7: Test E2E LIVE — Editorial Magazine

- [ ] **Step 7.1: Switch a Editorial Magazine + paleta sequoia**

```sql
UPDATE tiendas SET 
  plantilla_id = (SELECT id FROM plantillas WHERE slug='editorial_magazine'),
  paleta_id = (SELECT id FROM paletas WHERE slug='sequoia' AND plantilla_id=(SELECT id FROM plantillas WHERE slug='editorial_magazine'))
WHERE slug='aimma-test';
```

- [ ] **Step 7.2: Invalidate + verify**

```bash
curl -X POST "https://aimma-test.tienda.aimma.com.co/internal/invalidate-kv" -H "Authorization: Bearer $INVALIDATE_SECRET" -H "Content-Type: application/json" -d '{"slug":"aimma-test"}'
sleep 5
curl -s -H "Cache-Control: no-cache" "https://aimma-test.tienda.aimma.com.co/?cb=$(date +%s%N)" -o /tmp/em.html
echo "data-plantilla expected editorial_magazine:"
grep -oE 'data-plantilla="[a-z_]+"' /tmp/em.html | sort -u
echo "em-hero scoped class present:"
grep -c "em-hero\|em-productos" /tmp/em.html
```

---

## Task 8: Final audit + push + memoria Plan 2 cerrado

- [ ] **Step 8.1: Restaurar aimma-test a Industrial Clean para preservar la demo de Plan 1**

```sql
UPDATE tiendas SET 
  plantilla_id = (SELECT id FROM plantillas WHERE slug='industrial_clean'),
  paleta_id = (SELECT id FROM paletas WHERE slug='corporate' AND plantilla_id=(SELECT id FROM plantillas WHERE slug='industrial_clean'))
WHERE slug='aimma-test';
```

- [ ] **Step 8.2: Audit final code-reviewer**

Spawn code-reviewer agent con base SHA del Plan 1 (`349cef7`) y HEAD actual. Focus en:
- 21 archivos siguen el mismo patron — no copy-paste bugs (clases mal scoped, imports mal hechos)
- No regression en Plan 1 (Industrial Clean sigue funcionando)
- BlockRenderer dispatcher correcto

- [ ] **Step 8.3: Commit + push**

```bash
git push origin main
```

- [ ] **Step 8.4: Update memoria — escribir `project_aimma_editor_plan2.md`**

Documentar:
- HEAD final
- 21 archivos creados + BlockRenderer v2
- E2E LIVE verificado en 3 plantillas
- Pendiente Plan 3-5

---

## Definition of done — Plan 2

- [x] 7 blocks Fashion Bold creados
- [x] 7 blocks Minimal Artesanal creados
- [x] 7 blocks Editorial Magazine creados
- [x] BlockRenderer dispatcher actualizado con dispatch por plantilla
- [x] E2E LIVE verificado: aimma-test renderea correctamente en las 3 plantillas (data-plantilla attribute + clases scoped)
- [x] Plan 1 sigue funcional (Industrial Clean E2E con fixture original)
- [x] 0 errors astro check
- [x] Build verde
- [x] Commit + push
- [x] Memoria actualizada

## Tasks NO en Plan 2

❌ Editor UI admin (SortableJS + GridStack) — Plan 3
❌ EF tienda-guardar-layout — Plan 3
❌ IA Integration — Plan 4
❌ Modal "Generar con IA" — Plan 4

---

## Spec coverage check

| Spec section | Tasks |
|---|---|
| §6 Fashion Bold blocks | Task 1 |
| §6 Minimal Artesanal blocks | Task 2 |
| §6 Editorial Magazine blocks | Task 3 |
| §8 Fase 12.C.3 Multi-plantilla | Task 4 |
| Test E2E global | Tasks 5/6/7 |
| Cierre Plan 2 | Task 8 |

Plan 2 cubre Fase 12.C.3 del spec.
