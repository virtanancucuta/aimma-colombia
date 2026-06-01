# Editor PRO-MAX Plan 1: Foundation + Blocks Industrial Clean

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el storefront renderer + 8 blocks de Industrial Clean (1ª plantilla) para que una página `pages.home` con sections JSON en `tiendas.personalizaciones` se renderice LIVE con grid 24-col responsive.

**Architecture:** Section JSON con grid 24-col (Squarespace Fluid Engine pattern). BlockRenderer dispatcher en `apps/storefront/src/components/BlockRenderer.astro` itera `sections[]` y delega a 8 sub-componentes block. Cada block consume CSS vars `--ta-color-*` y `--ta-font-*` ya inyectadas por `Layout.astro`. Grid CSS responsive con `@container` queries para auto-collapse a 1-col en mobile.

**Tech Stack:** Astro 5 SSR + Tailwind 4 + Cloudflare Workers + Supabase. Zod compartido en `packages/database`. Plan **NO incluye** editor panel admin ni IA (eso es Plan 3/4 después).

**Spec referencia:** `docs/SUPERPOWERS/specs/2026-06-01-editor-pro-max-v2-design.md` secciones 4 (Data Model) y 6 (Catálogo).

**Out of scope (Plan 2/3/4):** Fashion Bold, Minimal Artesanal, Editorial Magazine blocks (Plan 2). Editor panel admin (Plan 3). IA Integration (Plan 4).

**Total estimado:** 2 semanas (1 dev) — 15 tasks self-contained.

---

## File structure

**Crear (16 archivos):**

| Path | Responsabilidad |
|---|---|
| `packages/database/src/editor-schema.ts` | Zod schemas compartidos (Element/Section/Page/Personalizaciones) |
| `apps/storefront/src/styles/blocks.css` | CSS grid 24-col base + Container Queries |
| `apps/storefront/src/components/BlockRenderer.astro` | Dispatcher por section.tipo + plantilla.slug |
| `apps/storefront/src/components/blocks/_BlockBase.astro` | Helper compartido: wrapper section con grid + fondo |
| `apps/storefront/src/components/blocks/hero/HeroIndustrialClean.astro` | Block Hero variant Industrial Clean |
| `apps/storefront/src/components/blocks/texto/TextoIndustrialClean.astro` | Block Texto Industrial Clean |
| `apps/storefront/src/components/blocks/imagen/ImagenIndustrialClean.astro` | Block Imagen banner Industrial Clean |
| `apps/storefront/src/components/blocks/botones/BotonesIndustrialClean.astro` | Block Botones Industrial Clean |
| `apps/storefront/src/components/blocks/productos/ProductosIndustrialClean.astro` | Block Grid productos Industrial Clean |
| `apps/storefront/src/components/blocks/galeria/GaleriaIndustrialClean.astro` | Block Galeria Industrial Clean |
| `apps/storefront/src/components/blocks/espaciador/Espaciador.astro` | Block Espaciador (sin variantes) |
| `apps/storefront/src/components/blocks/formulario/FormularioIndustrialClean.astro` | Block Formulario Industrial Clean |
| `apps/storefront/src/components/blocks/_ElementRenderer.astro` | Helper: renderiza un elemento dentro del grid (texto/imagen/boton/etc) |
| `docs/superpowers/plans/2026-06-01-editor-pro-max-plan1-foundation.md` | Este plan |

**Modificar (2 archivos):**

| Path | Cambio |
|---|---|
| `apps/storefront/src/pages/index.astro` | Branch if pages.home existe → BlockRenderer, else fallback actual |
| `apps/storefront/src/layouts/Layout.astro` | Import blocks.css |

---

## Task 1: Zod schemas compartidos

**Files:**
- Create: `packages/database/src/editor-schema.ts`
- Test: `npx astro check` desde `apps/storefront/`

- [ ] **Step 1.1: Crear el archivo con todos los schemas**

```typescript
// packages/database/src/editor-schema.ts
// AIMMA Editor PRO-MAX · Zod schemas compartidos
// Validado en: EF tienda-guardar-layout + Storefront BlockRenderer + Panel editor admin

import { z } from 'zod';

// ============================================================
// Element schemas (discriminated union)
// ============================================================

const GridPositionSchema = z.object({
  col_start: z.number().int().min(1).max(25),
  col_end: z.number().int().min(2).max(25),
  row_start: z.number().int().min(1).max(50),
  row_end: z.number().int().min(2).max(51),
});

const GridMobileSchema = z.object({
  orden: z.number().int().min(1).max(100).nullable(),
  col_start: z.number().int().min(1).max(25).optional(),
  col_end: z.number().int().min(2).max(25).optional(),
}).optional();

const EstiloSchema = z.object({
  color_texto: z.string().nullable().optional(),
  alineacion: z.enum(['left', 'center', 'right']).default('left'),
  tamaño: z.enum(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']).default('md'),
  peso: z.enum(['normal', 'medium', 'semibold', 'bold']).default('normal'),
});

const BaseElementSchema = z.object({
  id: z.string().regex(/^el_[a-z0-9]{4,}$/, 'id formato el_xxxx'),
  grid: GridPositionSchema,
  grid_mobile: GridMobileSchema,
  estilo: EstiloSchema,
  ai_generated: z.object({
    generated_at: z.string().datetime(),
    model: z.enum(['claude-haiku-4-5', 'claude-sonnet-4-6']),
    prompt: z.string().max(2000),
    tokens_consumidos: z.number().int().min(0),
  }).optional(),
});

export const TextoElementSchema = BaseElementSchema.extend({
  tipo: z.literal('texto'),
  props: z.object({
    contenido: z.string().max(5000),
  }),
});

export const ImagenElementSchema = BaseElementSchema.extend({
  tipo: z.literal('imagen'),
  props: z.object({
    src: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),
    alt: z.string().max(200),
    objeto: z.enum(['cover', 'contain']).default('cover'),
    link_url: z.string().url().optional(),
    aspect_ratio: z.enum(['16/9', '4/3', '1/1', '3/4', '4/5']).optional(),
  }),
});

export const BotonElementSchema = BaseElementSchema.extend({
  tipo: z.literal('boton'),
  props: z.object({
    texto: z.string().max(80),
    url: z.string().regex(
      /^(https:\/\/|mailto:|tel:|#|\/)/,
      'url debe ser https, mailto, tel, # o /'
    ),
    estilo_visual: z.enum(['primary', 'secondary', 'ghost', 'outline']).default('primary'),
    target: z.enum(['_self', '_blank']).default('_self'),
    icono: z.enum(['arrow', 'whatsapp', 'email', 'phone', 'location', 'link']).optional(),
  }),
});

export const ProductosElementSchema = BaseElementSchema.extend({
  tipo: z.literal('productos'),
  props: z.object({
    categoria_id: z.string().uuid().nullable(),
    limite: z.number().int().min(1).max(12).default(8),
    orden: z.enum(['recientes', 'precio_asc', 'precio_desc', 'manual']).default('recientes'),
    columnas: z.union([z.literal('auto'), z.literal(2), z.literal(3), z.literal(4)]).default('auto'),
    mostrar_precio: z.boolean().default(true),
  }),
});

export const GaleriaElementSchema = BaseElementSchema.extend({
  tipo: z.literal('galeria'),
  props: z.object({
    imagenes: z.array(z.object({
      src: z.string().url().regex(/^https:\/\//),
      alt: z.string().max(200),
    })).min(3).max(12),
    layout: z.enum(['grid', 'carrusel', 'mosaico']).default('grid'),
    gap: z.enum(['tight', 'normal', 'loose']).default('normal'),
  }),
});

export const FormFieldElementSchema = BaseElementSchema.extend({
  tipo: z.literal('form_field'),
  props: z.object({
    tipo_campo: z.enum(['text', 'email', 'tel', 'textarea', 'select', 'checkbox']),
    label: z.string().max(120),
    placeholder: z.string().max(200).optional(),
    requerido: z.boolean().default(false),
    opciones: z.array(z.string().max(100)).max(20).optional(),
  }),
});

export const EmbedElementSchema = BaseElementSchema.extend({
  tipo: z.literal('embed'),
  props: z.object({
    html: z.string().max(2000),
    aspect_ratio: z.enum(['16/9', '4/3', '1/1']).default('16/9'),
  }),
});

export const DivisorElementSchema = BaseElementSchema.extend({
  tipo: z.literal('divisor'),
  props: z.object({
    estilo: z.enum(['linea', 'punto', 'icono']).default('linea'),
    color: z.string().nullable().optional(),
  }),
});

export const ElementSchema = z.discriminatedUnion('tipo', [
  TextoElementSchema,
  ImagenElementSchema,
  BotonElementSchema,
  ProductosElementSchema,
  GaleriaElementSchema,
  FormFieldElementSchema,
  EmbedElementSchema,
  DivisorElementSchema,
]);

export type Element = z.infer<typeof ElementSchema>;

// ============================================================
// Section
// ============================================================

const FondoSchema = z.object({
  tipo: z.enum(['color', 'imagen', 'gradient', 'transparente']).default('transparente'),
  valor: z.string().max(500),
  overlay: z.object({
    color: z.string(),
    opacity: z.number().min(0).max(1),
  }).optional(),
});

export const SectionSchema = z.object({
  id: z.string().regex(/^sec_[a-z0-9]{4,}$/, 'id formato sec_xxxx'),
  tipo: z.enum(['hero', 'texto', 'imagen', 'botones', 'productos', 'galeria', 'espaciador', 'formulario']),
  altura_filas: z.number().int().min(1).max(50),
  fondo: FondoSchema,
  padding: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
  elementos: z.array(ElementSchema).max(30),
});

export type Section = z.infer<typeof SectionSchema>;

// ============================================================
// Page + Personalizaciones
// ============================================================

export const PageSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().datetime(),
  sections: z.array(SectionSchema).max(20),
});

export type Page = z.infer<typeof PageSchema>;

const ThemeSchema = z.object({
  color_primary: z.string().nullable().optional(),
  color_accent: z.string().nullable().optional(),
  font_display_url: z.string().url().nullable().optional(),
  font_body_url: z.string().url().nullable().optional(),
});

export const PersonalizacionesSchema = z.object({
  schema_version: z.literal(2),
  theme: ThemeSchema.optional(),
  pages: z.record(z.string(), PageSchema),
});

export type Personalizaciones = z.infer<typeof PersonalizacionesSchema>;

// ============================================================
// Helper: parse safe (devuelve null si invalido para fallback graceful)
// ============================================================

export function parsePersonalizaciones(raw: unknown): Personalizaciones | null {
  const result = PersonalizacionesSchema.safeParse(raw);
  return result.success ? result.data : null;
}
```

- [ ] **Step 1.2: Verificar package.json del packages/database tiene zod**

Run: `cat packages/database/package.json | grep zod`

Si NO aparece zod, agregar:
```bash
cd packages/database && npm install zod@^3.23.0
```

- [ ] **Step 1.3: Exportar desde packages/database/src/index.ts**

Leer el archivo actual `packages/database/src/index.ts` y agregar:
```typescript
export * from './editor-schema';
```

- [ ] **Step 1.4: Verificar typecheck**

```bash
cd apps/storefront && npx astro check
```

Expected: 0 errors

- [ ] **Step 1.5: Commit**

```bash
git add packages/database/src/editor-schema.ts packages/database/src/index.ts packages/database/package.json packages/database/package-lock.json
git commit -m "feat(editor): Zod schemas compartidos para Editor PRO-MAX

ElementSchema discriminated union 8 tipos (texto/imagen/boton/productos/
galeria/form_field/embed/divisor). SectionSchema + PageSchema +
PersonalizacionesSchema con schema_version:2.

Helper parsePersonalizaciones() safe-parse para fallback graceful.
Validation usada en: EF tienda-guardar-layout (Plan 3) + Storefront
BlockRenderer + Panel editor admin (Plan 3).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: CSS grid 24-col base + Container Queries

**Files:**
- Create: `apps/storefront/src/styles/blocks.css`
- Modify: `apps/storefront/src/layouts/Layout.astro` (agregar import)

- [ ] **Step 2.1: Crear blocks.css**

```css
/* AIMMA Editor PRO-MAX · CSS Grid 24-col base + Container Queries */

/* Section es contenedor con grid 24-col en desktop, 1-col en mobile via container query */
.block-section {
  container-type: inline-size;
  container-name: block-section;
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  grid-auto-rows: 60px;
  gap: 0;
  position: relative;
  width: 100%;
}

/* Padding sizes — aplicado al section completo */
.block-section--pad-sm { padding-block: 1.5rem; padding-inline: 1rem; }
.block-section--pad-md { padding-block: 2.5rem; padding-inline: 1.5rem; }
.block-section--pad-lg { padding-block: 4rem;   padding-inline: 2rem; }
.block-section--pad-xl { padding-block: 6rem;   padding-inline: 2.5rem; }

@media (min-width: 1024px) {
  .block-section--pad-sm { padding-inline: 2rem; }
  .block-section--pad-md { padding-inline: 4rem; }
  .block-section--pad-lg { padding-inline: 5rem; }
  .block-section--pad-xl { padding-inline: 6rem; }
}

/* Element dentro del grid usa CSS vars seteadas inline */
.block-element {
  grid-column: var(--col-start) / var(--col-end);
  grid-row: var(--row-start) / var(--row-end);
  min-width: 0;
  display: flex;
}

/* Alineacion del contenido dentro del element */
.block-element--align-left   { justify-content: flex-start; }
.block-element--align-center { justify-content: center; }
.block-element--align-right  { justify-content: flex-end; }

/* Mobile auto-collapse via @container query.
   Cuando el section es <768px ancho, grid colapsa a 1-col y todos los
   elements ocupan full width en orden vertical. */
@container block-section (max-width: 767px) {
  .block-section {
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
  }
  .block-element {
    grid-column: 1 / -1 !important;
    grid-row: auto !important;
  }
  /* Si grid_mobile.orden esta seteado, respetar el orden custom */
  .block-element[style*="--mobile-orden"] {
    order: var(--mobile-orden);
  }
}

/* Tamano de texto utility-style (consumido via class por TextoBlock) */
.block-text--size-xs   { font-size: 0.75rem; }
.block-text--size-sm   { font-size: 0.875rem; }
.block-text--size-md   { font-size: 1rem; }
.block-text--size-lg   { font-size: 1.25rem; }
.block-text--size-xl   { font-size: 1.75rem; }
.block-text--size-2xl  { font-size: 2.25rem; }
.block-text--size-3xl  { font-size: clamp(2.5rem, 5vw, 4rem); }

.block-text--weight-normal     { font-weight: 400; }
.block-text--weight-medium     { font-weight: 500; }
.block-text--weight-semibold   { font-weight: 600; }
.block-text--weight-bold       { font-weight: 700; }

.block-text--align-left   { text-align: left; }
.block-text--align-center { text-align: center; }
.block-text--align-right  { text-align: right; }

/* Boton base — estilos visuales por estilo_visual */
.block-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 200ms ease-out;
}
.block-button:hover { opacity: 0.85; }

.block-button--primary {
  background: var(--ta-color-primary);
  color: var(--ta-color-on-primary);
}
.block-button--secondary {
  background: var(--ta-color-accent);
  color: var(--ta-color-on-accent);
}
.block-button--ghost {
  background: transparent;
  color: var(--ta-color-text-base);
}
.block-button--outline {
  background: transparent;
  color: var(--ta-color-text-base);
  border: 1.5px solid var(--ta-color-text-base);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .block-button { transition: none; }
}
```

- [ ] **Step 2.2: Importar blocks.css en Layout.astro**

Leer `apps/storefront/src/layouts/Layout.astro` y agregar después del import de `global.css`:

```astro
import '~/styles/global.css';
import '~/styles/blocks.css';  // ← agregar esta linea
```

- [ ] **Step 2.3: Verificar build**

```bash
cd apps/storefront && npm run build 2>&1 | tail -3
```

Expected: `Server built in Xs. Complete!`

- [ ] **Step 2.4: Commit**

```bash
git add apps/storefront/src/styles/blocks.css apps/storefront/src/layouts/Layout.astro
git commit -m "feat(editor): CSS grid 24-col + Container Queries para blocks

CSS base reutilizado por las 32 variantes de blocks (8 tipos x 4
plantillas). Grid 24-col responsive con @container (max-width: 767px)
para auto-collapse a 1-col en mobile sin rework manual del dueno.

Utilities adicionales: padding sizes (sm/md/lg/xl), text size/weight/
align, button styles (primary/secondary/ghost/outline).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: ElementRenderer helper (renderiza UN elemento dentro del grid)

**Files:**
- Create: `apps/storefront/src/components/blocks/_ElementRenderer.astro`

- [ ] **Step 3.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · ElementRenderer · 2026-06-01
// Helper compartido: renderiza UN elemento dentro del grid 24-col.
// Recibe Element del schema Zod + tipo de plantilla (para variants futuras).
//
// Tipos soportados: texto, imagen, boton, productos, galeria, form_field,
// embed, divisor.

import type { Element } from '@aimma/database';

interface Props {
  el: Element;
}

const { el } = Astro.props;

// Compose grid CSS vars desde el.grid
const gridStyle = [
  `--col-start:${el.grid.col_start}`,
  `--col-end:${el.grid.col_end}`,
  `--row-start:${el.grid.row_start}`,
  `--row-end:${el.grid.row_end}`,
  el.grid_mobile?.orden != null ? `--mobile-orden:${el.grid_mobile.orden}` : '',
].filter(Boolean).join(';') + ';';

// Estilos comunes desde el.estilo
const alignClass = `block-element--align-${el.estilo.alineacion}`;
const colorInline = el.estilo.color_texto
  ? `color:${el.estilo.color_texto};`
  : '';
---

<div class={`block-element ${alignClass}`} style={gridStyle}>
  {el.tipo === 'texto' && (
    <p
      class={[
        `block-text--size-${el.estilo.tamaño}`,
        `block-text--weight-${el.estilo.peso}`,
        `block-text--align-${el.estilo.alineacion}`,
      ].join(' ')}
      style={`font-family:var(--ta-font-body);${colorInline}`}
    >
      {el.props.contenido}
    </p>
  )}

  {el.tipo === 'imagen' && (
    el.props.link_url ? (
      <a href={el.props.link_url} class="block w-full h-full">
        <img
          src={el.props.src}
          alt={el.props.alt}
          loading="lazy"
          class="w-full h-full"
          style={`object-fit:${el.props.objeto};`}
        />
      </a>
    ) : (
      <img
        src={el.props.src}
        alt={el.props.alt}
        loading="lazy"
        class="w-full h-full"
        style={`object-fit:${el.props.objeto};`}
      />
    )
  )}

  {el.tipo === 'boton' && (
    <a
      href={el.props.url}
      class={`block-button block-button--${el.props.estilo_visual}`}
      target={el.props.target}
      rel={el.props.target === '_blank' ? 'noopener' : undefined}
      style={colorInline}
    >
      {el.props.texto}
    </a>
  )}

  {el.tipo === 'divisor' && (
    <hr
      class="w-full"
      style={`border-style:${el.props.estilo === 'linea' ? 'solid' : el.props.estilo === 'punto' ? 'dotted' : 'solid'};border-color:${el.props.color || 'var(--ta-color-text-base)'};opacity:0.15;`}
    />
  )}

  {/* Otros tipos (productos, galeria, form_field, embed) se delegan a
      los blocks especificos por plantilla en sus archivos correspondientes
      porque requieren queries Supabase o renderers complejos */}
</div>
```

- [ ] **Step 3.2: Verificar typecheck**

```bash
cd apps/storefront && npx astro check 2>&1 | tail -3
```

Expected: 0 errors

- [ ] **Step 3.3: Commit**

```bash
git add apps/storefront/src/components/blocks/_ElementRenderer.astro
git commit -m "feat(editor): ElementRenderer helper para elementos en grid

Renderiza Element del schema dentro del grid 24-col. Soporta inline
los tipos simples (texto, imagen, boton, divisor). Tipos complejos
(productos, galeria, form_field, embed) los renderean los blocks
especificos por plantilla porque requieren queries Supabase o
configs especificas.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Espaciador block (sin variantes — más simple)

**Files:**
- Create: `apps/storefront/src/components/blocks/espaciador/Espaciador.astro`

- [ ] **Step 4.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · Espaciador · 2026-06-01
// Section vacia con solo altura + fondo configurable. Sin variantes por
// plantilla (es agnostico). Util para crear respiro entre secciones.

import type { Section } from '@aimma/database';

interface Props {
  section: Section;
}

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
  class={`block-section ${padClass}`}
  style={`${heightStyle}${bgStyle}`}
  data-section-id={section.id}
  data-section-tipo="espaciador"
>
  {/* Espaciador no tiene elementos */}
</section>
```

- [ ] **Step 4.2: Verificar typecheck**

```bash
cd apps/storefront && npx astro check 2>&1 | tail -3
```

Expected: 0 errors

- [ ] **Step 4.3: Commit**

```bash
git add apps/storefront/src/components/blocks/espaciador/
git commit -m "feat(editor): Espaciador block (sin variantes)

Section vacia con altura + fondo configurable. Agnostico de plantilla.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: HeroIndustrialClean block

**Files:**
- Create: `apps/storefront/src/components/blocks/hero/HeroIndustrialClean.astro`

- [ ] **Step 5.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · Hero · variant Industrial Clean · 2026-06-01
// Hero section con grid 24-col. Tipografia IBM Plex Sans + Inter, layout
// preciso, accent en CTAs. Los elementos vienen del JSON con grid_position.

import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';

interface Props {
  section: Section;
}

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

// Industrial Clean: si fondo es transparente, agregar light-source overlay sutil
const overlayStyle = section.fondo.tipo === 'transparente'
  ? `background-image:radial-gradient(ellipse 70% 55% at 30% 25%, color-mix(in oklab, var(--ta-color-primary) 8%, transparent), transparent 70%);`
  : '';

// Aplicar font Industrial Clean (IBM Plex Sans display + Inter body)
const fontStyle = `font-family:var(--ta-font-body);`;
---

<section
  class={`block-section ${padClass} ic-hero`}
  style={`${heightStyle}${bgStyle}${overlayStyle}${fontStyle}`}
  data-section-id={section.id}
  data-section-tipo="hero"
  data-plantilla="industrial_clean"
>
  {section.elementos.map((el) => <ElementRenderer el={el} />)}
</section>

<style>
  /* Industrial Clean hero: precision tipografica */
  .ic-hero :global(.block-text--size-3xl) {
    font-family: var(--ta-font-display);
    font-weight: 600;
    letter-spacing: -0.038em;
    line-height: 1.04;
  }
  .ic-hero :global(.block-text--size-2xl),
  .ic-hero :global(.block-text--size-xl) {
    font-family: var(--ta-font-display);
    font-weight: 500;
    letter-spacing: -0.02em;
  }
</style>
```

- [ ] **Step 5.2: Verificar typecheck**

```bash
cd apps/storefront && npx astro check 2>&1 | tail -3
```

Expected: 0 errors

- [ ] **Step 5.3: Commit**

```bash
git add apps/storefront/src/components/blocks/hero/HeroIndustrialClean.astro
git commit -m "feat(editor): HeroIndustrialClean block

Section hero variant Industrial Clean. Itera section.elementos via
ElementRenderer + estilos tipograficos IBM Plex Sans (var ta-font-
display). Light-source overlay sutil si fondo transparente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: TextoIndustrialClean block

**Files:**
- Create: `apps/storefront/src/components/blocks/texto/TextoIndustrialClean.astro`

- [ ] **Step 6.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · Texto · variant Industrial Clean · 2026-06-01
import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';

interface Props {
  section: Section;
}

const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color'
  ? `background-color:${section.fondo.valor};`
  : '';
---

<section
  class={`block-section ${padClass} ic-texto`}
  style={`${heightStyle}${bgStyle}`}
  data-section-id={section.id}
  data-section-tipo="texto"
>
  {section.elementos.map((el) => <ElementRenderer el={el} />)}
</section>

<style>
  .ic-texto :global(.block-text--size-2xl),
  .ic-texto :global(.block-text--size-xl) {
    font-family: var(--ta-font-display);
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.15;
  }
  .ic-texto :global(.block-text--size-md),
  .ic-texto :global(.block-text--size-lg) {
    font-family: var(--ta-font-body);
    line-height: 1.6;
    max-width: 65ch;
  }
</style>
```

- [ ] **Step 6.2: Commit**

```bash
git add apps/storefront/src/components/blocks/texto/TextoIndustrialClean.astro
git commit -m "feat(editor): TextoIndustrialClean block

Section texto variant Industrial Clean. Headings IBM Plex Sans
semibold con letter-spacing tight. Body Inter con line-length 65ch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: ImagenIndustrialClean block

**Files:**
- Create: `apps/storefront/src/components/blocks/imagen/ImagenIndustrialClean.astro`

- [ ] **Step 7.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · Imagen banner · variant Industrial Clean
import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';

interface Props {
  section: Section;
}

const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;

// Industrial Clean: la imagen banner suele tener border 1px y aspect-ratio fijo.
// Si el primer elemento es imagen, lo trato como fondo full.
const primerImagen = section.elementos.find(el => el.tipo === 'imagen');
const bgStyle = primerImagen && primerImagen.tipo === 'imagen'
  ? `background-image:url(${primerImagen.props.src});background-size:${primerImagen.props.objeto};background-position:center;`
  : section.fondo.tipo === 'color'
    ? `background-color:${section.fondo.valor};`
    : '';

const overlayStyle = section.fondo.overlay
  ? `position:relative;`
  : '';
---

<section
  class={`block-section ${padClass} ic-imagen`}
  style={`${heightStyle}${bgStyle}${overlayStyle}`}
  data-section-id={section.id}
  data-section-tipo="imagen"
>
  {section.fondo.overlay && (
    <div
      class="block-imagen-overlay"
      style={`position:absolute;inset:0;background:${section.fondo.overlay.color};opacity:${section.fondo.overlay.opacity};pointer-events:none;`}
    />
  )}
  {/* Solo renderizo elementos NO-imagen (la imagen es el fondo) */}
  {section.elementos.filter(el => el.tipo !== 'imagen').map((el) => (
    <ElementRenderer el={el} />
  ))}
</section>

<style>
  .ic-imagen {
    border: 1px solid color-mix(in oklab, var(--ta-color-text-base) 8%, transparent);
    overflow: hidden;
  }
</style>
```

- [ ] **Step 7.2: Commit**

```bash
git add apps/storefront/src/components/blocks/imagen/ImagenIndustrialClean.astro
git commit -m "feat(editor): ImagenIndustrialClean block

Section imagen banner. Primera imagen del JSON se usa como background.
Border 1px sutil + overlay opcional. Otros elementos (texto/CTA)
flotan encima del fondo via grid 24-col.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: BotonesIndustrialClean block

**Files:**
- Create: `apps/storefront/src/components/blocks/botones/BotonesIndustrialClean.astro`

- [ ] **Step 8.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · Botones (fila CTAs) · variant Industrial Clean
import type { Section } from '@aimma/database';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';

interface Props {
  section: Section;
}

const { section } = Astro.props;
const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color'
  ? `background-color:${section.fondo.valor};`
  : '';
---

<section
  class={`block-section ${padClass} ic-botones`}
  style={`${heightStyle}${bgStyle}`}
  data-section-id={section.id}
  data-section-tipo="botones"
>
  {section.elementos.map((el) => <ElementRenderer el={el} />)}
</section>

<style>
  .ic-botones :global(.block-button) {
    border-radius: 2px;
    padding: 0.875rem 2rem;
    font-size: 0.95rem;
  }
</style>
```

- [ ] **Step 8.2: Commit**

```bash
git add apps/storefront/src/components/blocks/botones/BotonesIndustrialClean.astro
git commit -m "feat(editor): BotonesIndustrialClean block

Section botones (fila CTAs). Industrial Clean: border-radius 2px,
padding generoso, font medium. Itera elementos boton via ElementRenderer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: ProductosIndustrialClean block

**Files:**
- Create: `apps/storefront/src/components/blocks/productos/ProductosIndustrialClean.astro`

- [ ] **Step 9.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · Productos · variant Industrial Clean · 2026-06-01
// Section grid productos: query Supabase con filtros del elemento.
// Reusa ProductCardIC existente de Fase 9.

import type { Section, Element } from '@aimma/database';
import ProductCard from '~/components/templates/industrial_clean/ProductCardIC.astro';
import { getProductosPorTienda } from '~/lib/catalogo';
import ElementRenderer from '~/components/blocks/_ElementRenderer.astro';

interface Props {
  section: Section;
}

const { section } = Astro.props;
const { tienda, supabase } = Astro.locals;

const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color'
  ? `background-color:${section.fondo.valor};`
  : '';

// Encontrar primer elemento 'productos' del section (tipico: 1 por section)
const prodEl = section.elementos.find(el => el.tipo === 'productos') as
  Extract<Element, { tipo: 'productos' }> | undefined;

// Si no hay element productos, no rendereamos grid (caso defensivo)
let productos: Awaited<ReturnType<typeof getProductosPorTienda>> = [];
if (prodEl) {
  productos = await getProductosPorTienda(supabase, tienda.id, {
    limit: prodEl.props.limite,
    categoriaId: prodEl.props.categoria_id ?? undefined,
  });
}

const colsClass = prodEl?.props.columnas === 'auto' || !prodEl
  ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
  : `grid-cols-${prodEl.props.columnas}`;
---

<section
  class={`block-section ${padClass} ic-productos`}
  style={`${heightStyle}${bgStyle}`}
  data-section-id={section.id}
  data-section-tipo="productos"
>
  {/* Renderear primero elementos NO-productos (titulo opcional, separador, etc) */}
  {section.elementos.filter(el => el.tipo !== 'productos').map((el) => (
    <ElementRenderer el={el} />
  ))}

  {/* Grid productos: ocupa todo el ancho 24-col, fuera del grid normal */}
  <div class="ic-productos-grid" style="grid-column:1 / -1;">
    {productos.length === 0 ? (
      <div class="ic-empty">Sin productos disponibles</div>
    ) : (
      <div class={`grid gap-3 lg:gap-4 ${colsClass}`}>
        {productos.map((p) => <ProductCard producto={p} />)}
      </div>
    )}
  </div>
</section>

<style>
  .ic-productos-grid {
    display: block;
    width: 100%;
    margin-top: 1rem;
  }
  .ic-empty {
    padding: 3rem;
    text-align: center;
    color: color-mix(in oklab, var(--ta-color-text-base) 60%, transparent);
    font-family: var(--ta-font-body);
    font-size: 0.95rem;
    border: 1px solid color-mix(in oklab, var(--ta-color-text-base) 12%, transparent);
    border-radius: 2px;
  }
</style>
```

- [ ] **Step 9.2: Commit**

```bash
git add apps/storefront/src/components/blocks/productos/ProductosIndustrialClean.astro
git commit -m "feat(editor): ProductosIndustrialClean block

Section grid productos. Lee element productos del JSON con filtros
(categoria_id, limite, columnas). Query Supabase via
getProductosPorTienda existente. Reusa ProductCardIC de Fase 9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: GaleriaIndustrialClean block

**Files:**
- Create: `apps/storefront/src/components/blocks/galeria/GaleriaIndustrialClean.astro`

- [ ] **Step 10.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · Galeria · variant Industrial Clean
import type { Section, Element } from '@aimma/database';

interface Props {
  section: Section;
}

const { section } = Astro.props;

const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color'
  ? `background-color:${section.fondo.valor};`
  : '';

const galEl = section.elementos.find(el => el.tipo === 'galeria') as
  Extract<Element, { tipo: 'galeria' }> | undefined;

const gapClass = galEl?.props.gap === 'tight' ? 'gap-2'
  : galEl?.props.gap === 'loose' ? 'gap-8'
  : 'gap-4';

const colsClass = galEl?.props.layout === 'carrusel'
  ? 'flex overflow-x-auto snap-x snap-mandatory'
  : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
---

<section
  class={`block-section ${padClass} ic-galeria`}
  style={`${heightStyle}${bgStyle}`}
  data-section-id={section.id}
  data-section-tipo="galeria"
>
  <div class={`${colsClass} ${gapClass}`} style="grid-column:1 / -1;">
    {galEl?.props.imagenes.map((img) => (
      <div class="ic-galeria-item">
        <img
          src={img.src}
          alt={img.alt}
          loading="lazy"
          class="w-full h-full object-cover"
        />
      </div>
    ))}
  </div>
</section>

<style>
  .ic-galeria-item {
    aspect-ratio: 1 / 1;
    overflow: hidden;
    border: 1px solid color-mix(in oklab, var(--ta-color-text-base) 8%, transparent);
  }
  .ic-galeria :global(.flex.overflow-x-auto) .ic-galeria-item {
    flex: 0 0 280px;
    scroll-snap-align: center;
  }
</style>
```

- [ ] **Step 10.2: Commit**

```bash
git add apps/storefront/src/components/blocks/galeria/GaleriaIndustrialClean.astro
git commit -m "feat(editor): GaleriaIndustrialClean block

Section galeria con 3 layouts (grid/carrusel/mosaico). Industrial Clean:
border 1px sutil, aspect-square uniforme, hairline divider sobrio.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: FormularioIndustrialClean block

**Files:**
- Create: `apps/storefront/src/components/blocks/formulario/FormularioIndustrialClean.astro`

- [ ] **Step 11.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · Formulario · variant Industrial Clean
// NOTA: el handler de submit es Plan 3 (necesita EF tienda-form-submit).
// Por ahora el form renderea pero submit hace POST a /internal/form-submit
// que devuelve 404 — eso es OK para Plan 1.

import type { Section, Element } from '@aimma/database';

interface Props {
  section: Section;
}

const { section } = Astro.props;

const padClass = `block-section--pad-${section.padding}`;
const heightStyle = `min-height:${section.altura_filas * 60}px;`;
const bgStyle = section.fondo.tipo === 'color'
  ? `background-color:${section.fondo.valor};`
  : '';

// Filtrar elementos form_field
const campos = section.elementos.filter(el => el.tipo === 'form_field') as
  Extract<Element, { tipo: 'form_field' }>[];

// Buscar opcional titulo (elemento texto)
const titulo = section.elementos.find(el => el.tipo === 'texto');

// Buscar boton submit (elemento boton)
const submitBtn = section.elementos.find(el => el.tipo === 'boton');
---

<section
  class={`block-section ${padClass} ic-form`}
  style={`${heightStyle}${bgStyle}`}
  data-section-id={section.id}
  data-section-tipo="formulario"
>
  <form
    class="ic-form-inner"
    style="grid-column:1 / -1;"
    method="POST"
    action="/internal/form-submit"
    data-form-id={section.id}
  >
    {titulo && titulo.tipo === 'texto' && (
      <h3 class="ic-form-title">{titulo.props.contenido}</h3>
    )}

    {campos.map((campo, idx) => {
      const fieldId = `${section.id}_field_${idx}`;
      if (campo.props.tipo_campo === 'textarea') {
        return (
          <div class="ic-form-field">
            <label for={fieldId}>
              {campo.props.label}
              {campo.props.requerido && <span class="ic-required">*</span>}
            </label>
            <textarea
              id={fieldId}
              name={`field_${idx}`}
              placeholder={campo.props.placeholder ?? ''}
              required={campo.props.requerido}
              rows={4}
            ></textarea>
          </div>
        );
      }
      if (campo.props.tipo_campo === 'select') {
        return (
          <div class="ic-form-field">
            <label for={fieldId}>
              {campo.props.label}
              {campo.props.requerido && <span class="ic-required">*</span>}
            </label>
            <select id={fieldId} name={`field_${idx}`} required={campo.props.requerido}>
              <option value="">{campo.props.placeholder ?? 'Selecciona...'}</option>
              {(campo.props.opciones ?? []).map((opt) => (
                <option value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        );
      }
      if (campo.props.tipo_campo === 'checkbox') {
        return (
          <div class="ic-form-field ic-form-field--check">
            <input id={fieldId} name={`field_${idx}`} type="checkbox" required={campo.props.requerido} />
            <label for={fieldId}>{campo.props.label}</label>
          </div>
        );
      }
      return (
        <div class="ic-form-field">
          <label for={fieldId}>
            {campo.props.label}
            {campo.props.requerido && <span class="ic-required">*</span>}
          </label>
          <input
            id={fieldId}
            name={`field_${idx}`}
            type={campo.props.tipo_campo}
            placeholder={campo.props.placeholder ?? ''}
            required={campo.props.requerido}
          />
        </div>
      );
    })}

    {/* Honeypot anti-spam */}
    <div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;" aria-hidden="true">
      <label for={`${section.id}_hp`}>No llenar este campo</label>
      <input id={`${section.id}_hp`} name="website" type="text" tabindex="-1" autocomplete="off" />
    </div>

    <button type="submit" class="ic-form-submit">
      {submitBtn && submitBtn.tipo === 'boton' ? submitBtn.props.texto : 'Enviar'}
    </button>
  </form>
</section>

<style>
  .ic-form-inner {
    max-width: 580px;
    width: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    font-family: var(--ta-font-body);
  }
  .ic-form-title {
    font-family: var(--ta-font-display);
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--ta-color-text-base);
    margin: 0 0 0.5rem 0;
    letter-spacing: -0.02em;
  }
  .ic-form-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .ic-form-field label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--ta-color-text-base);
  }
  .ic-required {
    color: #d72c0d;
    margin-left: 4px;
  }
  .ic-form-field input,
  .ic-form-field textarea,
  .ic-form-field select {
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in oklab, var(--ta-color-text-base) 18%, transparent);
    border-radius: 2px;
    background: var(--ta-color-bg-base);
    color: var(--ta-color-text-base);
    font-family: inherit;
    font-size: 0.95rem;
    transition: border-color 200ms;
  }
  .ic-form-field input:focus,
  .ic-form-field textarea:focus,
  .ic-form-field select:focus {
    outline: none;
    border-color: var(--ta-color-primary);
  }
  .ic-form-field--check {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
  .ic-form-submit {
    padding: 0.875rem 2rem;
    background: var(--ta-color-primary);
    color: var(--ta-color-on-primary);
    border: none;
    border-radius: 2px;
    font-family: inherit;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 200ms;
  }
  .ic-form-submit:hover { opacity: 0.85; }
</style>
```

- [ ] **Step 11.2: Commit**

```bash
git add apps/storefront/src/components/blocks/formulario/FormularioIndustrialClean.astro
git commit -m "feat(editor): FormularioIndustrialClean block

Section formulario con builder de campos (text/email/tel/textarea/
select/checkbox). Honeypot anti-spam. Submit POST a /internal/
form-submit (handler en Plan 3). Industrial Clean: inputs border 1px,
focus accent primary, font Inter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: BlockRenderer dispatcher

**Files:**
- Create: `apps/storefront/src/components/BlockRenderer.astro`

- [ ] **Step 12.1: Crear el archivo**

```astro
---
// AIMMA Editor PRO-MAX · BlockRenderer dispatcher · 2026-06-01
// Recibe un array de Section y los renderea con el block correcto segun
// section.tipo + plantilla activa de la tienda.
//
// En Plan 1: solo Industrial Clean implementado. Otras plantillas caen
// al fallback Industrial Clean hasta Plan 2.

import type { Section } from '@aimma/database';
import HeroIndustrialClean from '~/components/blocks/hero/HeroIndustrialClean.astro';
import TextoIndustrialClean from '~/components/blocks/texto/TextoIndustrialClean.astro';
import ImagenIndustrialClean from '~/components/blocks/imagen/ImagenIndustrialClean.astro';
import BotonesIndustrialClean from '~/components/blocks/botones/BotonesIndustrialClean.astro';
import ProductosIndustrialClean from '~/components/blocks/productos/ProductosIndustrialClean.astro';
import GaleriaIndustrialClean from '~/components/blocks/galeria/GaleriaIndustrialClean.astro';
import Espaciador from '~/components/blocks/espaciador/Espaciador.astro';
import FormularioIndustrialClean from '~/components/blocks/formulario/FormularioIndustrialClean.astro';

interface Props {
  sections: Section[];
}

const { sections } = Astro.props;
const { tienda } = Astro.locals;

// En Plan 1 todos van a Industrial Clean. Plan 2 dispatcheara por
// tienda.plantilla?.slug a Fashion Bold / Minimal Artesanal /
// Editorial Magazine.
const plantilla = tienda.plantilla?.slug ?? 'industrial_clean';
---

{sections.map((section) => {
  if (section.tipo === 'hero') return <HeroIndustrialClean section={section} />;
  if (section.tipo === 'texto') return <TextoIndustrialClean section={section} />;
  if (section.tipo === 'imagen') return <ImagenIndustrialClean section={section} />;
  if (section.tipo === 'botones') return <BotonesIndustrialClean section={section} />;
  if (section.tipo === 'productos') return <ProductosIndustrialClean section={section} />;
  if (section.tipo === 'galeria') return <GaleriaIndustrialClean section={section} />;
  if (section.tipo === 'espaciador') return <Espaciador section={section} />;
  if (section.tipo === 'formulario') return <FormularioIndustrialClean section={section} />;
  return null;
})}
```

- [ ] **Step 12.2: Verificar typecheck**

```bash
cd apps/storefront && npx astro check 2>&1 | tail -3
```

Expected: 0 errors

- [ ] **Step 12.3: Commit**

```bash
git add apps/storefront/src/components/BlockRenderer.astro
git commit -m "feat(editor): BlockRenderer dispatcher Plan 1

Itera sections y delega a 8 blocks de Industrial Clean (Plan 1).
Plan 2 ampliara para dispatch por plantilla.slug.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Modificar index.astro para usar BlockRenderer

**Files:**
- Modify: `apps/storefront/src/pages/index.astro`

- [ ] **Step 13.1: Leer el archivo actual y entender**

```bash
cat apps/storefront/src/pages/index.astro
```

- [ ] **Step 13.2: Modificar para branch if/else**

Reemplazar el contenido entre `<Layout ...>` y `</Layout>` con un dispatcher. Concretamente, el bloque del frontmatter cambiar a:

```astro
---
import Layout from '~/layouts/Layout.astro';
import Hero from '~/components/Hero.astro';
import ProductGrid from '~/components/ProductGrid.astro';
import BlockRenderer from '~/components/BlockRenderer.astro';
import { getProductosPorTienda } from '~/lib/catalogo';
import { parsePersonalizaciones } from '@aimma/database';

const { tienda, supabase } = Astro.locals;
const plantillaSlug = tienda.plantilla?.slug;

// Plan 1: Check si hay personalizaciones.pages.home valido → BlockRenderer.
// Else → fallback al render actual (Hero + ProductGrid).
const pers = parsePersonalizaciones(tienda.personalizaciones);
const homeSections = pers?.pages?.home?.sections ?? null;

// Solo cargar productos para fallback (BlockRenderer maneja sus productos internos)
let productos: Awaited<ReturnType<typeof getProductosPorTienda>> = [];
if (!homeSections) {
  productos = await getProductosPorTienda(supabase, tienda.id, { limit: 12 });
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: tienda.nombre_negocio,
  ...(tienda.email_contacto && { email: tienda.email_contacto }),
  ...(tienda.telefono_contacto && { telephone: tienda.telefono_contacto }),
  ...(tienda.direccion && {
    address: {
      '@type': 'PostalAddress',
      streetAddress: tienda.direccion,
      ...(tienda.ciudad_negocio && { addressLocality: tienda.ciudad_negocio }),
      addressCountry: 'CO',
    },
  }),
  url: Astro.url.toString(),
  ...(tienda.logo_url && { logo: tienda.logo_url, image: tienda.logo_url }),
};
---

<Layout
  title={undefined}
  description={`Compra en ${tienda.nombre_negocio}. Tienda online con envios a Colombia. Pedidos faciles por WhatsApp.`}
  jsonLd={jsonLd}
>
  {homeSections ? (
    <BlockRenderer sections={homeSections} />
  ) : (
    <>
      <Hero />
      {/* Section header diferenciado por plantilla — mantener logica existente Fase 9 */}
      {plantillaSlug === 'fashion_bold' && (
        <section id="productos" class="pt-20 lg:pt-28 pb-24 lg:pb-32 px-6 md:px-12 lg:px-20">
          <header class="mb-10 lg:mb-14 flex items-end justify-between gap-6 border-b border-[var(--ta-color-text-base)] pb-4">
            <h2 class="font-display uppercase leading-none tracking-[-0.04em] text-[var(--ta-color-text-base)]" style="font-size:clamp(2rem, 5vw, 3.5rem);">
              Coleccion
            </h2>
          </header>
          <ProductGrid productos={productos} />
        </section>
      )}
      {plantillaSlug === 'minimal_artesanal' && (
        <section id="productos" class="pt-28 lg:pt-40 pb-32 lg:pb-48 px-8 lg:px-16 mx-auto max-w-screen-2xl">
          <header class="mb-16 lg:mb-24 text-center">
            <p class="font-display italic text-[var(--ta-color-text-base)]/55 mb-3" style="font-size:0.95rem;">
              La coleccion
            </p>
            <h2 class="font-display text-[var(--ta-color-text-base)]" style="font-size:clamp(2rem, 4.5vw, 3.5rem);font-weight:400;">
              Piezas en edicion
            </h2>
          </header>
          <ProductGrid productos={productos} />
        </section>
      )}
      {plantillaSlug === 'editorial_magazine' && (
        <section id="productos" class="pt-24 lg:pt-36 pb-28 lg:pb-40">
          <header class="mb-12 lg:mb-20">
            <h2 class="font-display text-[var(--ta-color-text-base)]" style="font-size:clamp(2.25rem, 5.5vw, 4.5rem);font-weight:300;">
              La <span class="italic" style="color:var(--ta-color-accent);">coleccion</span> impresa
            </h2>
          </header>
          <ProductGrid productos={productos} />
        </section>
      )}
      {(plantillaSlug === 'industrial_clean' || !plantillaSlug || !['fashion_bold', 'minimal_artesanal', 'editorial_magazine'].includes(plantillaSlug)) && (
        <section id="productos" class="py-12 lg:py-16">
          <header class="mb-8 flex items-end justify-between">
            <div>
              <h2 class="font-display text-[var(--ta-color-text-base)]" style="font-size:1.85rem;font-weight:600;">
                Catalogo
              </h2>
              <p class="mt-1 font-body text-[13px] text-[var(--ta-color-text-base)]/60 tabular-nums">
                {productos.length} referencias activas
              </p>
            </div>
          </header>
          <ProductGrid productos={productos} />
        </section>
      )}
    </>
  )}
</Layout>

<script is:inline>
  // Tracking placeholder
</script>
```

- [ ] **Step 13.3: Verificar build + typecheck**

```bash
cd apps/storefront && npm run build 2>&1 | tail -5
```

Expected: `Server built in Xs. Complete!` sin errores.

- [ ] **Step 13.4: Commit**

```bash
git add apps/storefront/src/pages/index.astro
git commit -m "feat(editor): index.astro con branch if pages.home -> BlockRenderer

Si tienda.personalizaciones.pages.home es valido (Zod parse OK),
renderea via BlockRenderer (Plan 1: Industrial Clean blocks).
Else fallback al render actual de Fase 9 (Hero + ProductGrid con
4 variantes plantilla).

Garantiza compatibilidad con tiendas existentes (Maraldo, Dimac,
aimma-test que NO tienen pages.home).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Test E2E con fixture JSON en aimma-test

**Files:**
- Modify: BD `tiendas` row aimma-test (UPDATE personalizaciones)

- [ ] **Step 14.1: Asegurar que aimma-test está en Industrial Clean (necesario para Plan 1)**

```sql
UPDATE tiendas SET 
  plantilla_id = (SELECT id FROM plantillas WHERE slug='industrial_clean'),
  paleta_id = (SELECT id FROM paletas WHERE slug='corporate' AND plantilla_id=(SELECT id FROM plantillas WHERE slug='industrial_clean'))
WHERE slug='aimma-test';
```

- [ ] **Step 14.2: UPDATE BD aimma-test con pages.home fixture**

```sql
UPDATE tiendas SET personalizaciones = jsonb_build_object(
  'schema_version', 2,
  'pages', jsonb_build_object(
    'home', jsonb_build_object(
      'version', 1,
      'updated_at', '2026-06-01T16:00:00Z',
      'sections', jsonb_build_array(
        jsonb_build_object(
          'id', 'sec_hero1',
          'tipo', 'hero',
          'altura_filas', 10,
          'fondo', jsonb_build_object('tipo', 'transparente', 'valor', ''),
          'padding', 'lg',
          'elementos', jsonb_build_array(
            jsonb_build_object(
              'id', 'el_t1',
              'tipo', 'texto',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 14, 'row_start', 2, 'row_end', 7),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamaño', '3xl', 'peso', 'bold', 'color_texto', null),
              'props', jsonb_build_object('contenido', 'Tienda construida con el Editor PRO-MAX')
            ),
            jsonb_build_object(
              'id', 'el_t2',
              'tipo', 'texto',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 13, 'row_start', 7, 'row_end', 9),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamaño', 'lg', 'peso', 'normal', 'color_texto', null),
              'props', jsonb_build_object('contenido', 'Probamos el render del nuevo dispatcher.')
            ),
            jsonb_build_object(
              'id', 'el_b1',
              'tipo', 'boton',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 7, 'row_start', 9, 'row_end', 11),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamaño', 'md', 'peso', 'semibold'),
              'props', jsonb_build_object('texto', 'Ver productos', 'url', '#productos', 'estilo_visual', 'primary', 'target', '_self')
            )
          )
        ),
        jsonb_build_object(
          'id', 'sec_prods',
          'tipo', 'productos',
          'altura_filas', 10,
          'fondo', jsonb_build_object('tipo', 'transparente', 'valor', ''),
          'padding', 'lg',
          'elementos', jsonb_build_array(
            jsonb_build_object(
              'id', 'el_p1',
              'tipo', 'productos',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 25, 'row_start', 1, 'row_end', 10),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamaño', 'md', 'peso', 'normal'),
              'props', jsonb_build_object(
                'categoria_id', null,
                'limite', 4,
                'orden', 'recientes',
                'columnas', 'auto',
                'mostrar_precio', true
              )
            )
          )
        )
      )
    )
  )
) WHERE slug='aimma-test';
```

- [ ] **Step 14.3: Verify SELECT**

```sql
SELECT personalizaciones->'pages'->'home'->'sections' AS sections
FROM tiendas WHERE slug='aimma-test';
```

Expected: array de 2 sections (hero + productos).

- [ ] **Step 14.4: Build + deploy CF Worker**

```bash
# Exportar token CF antes de correr (NO commitear inline):
# export CLOUDFLARE_API_TOKEN="$(cat ~/.cf_token)"  # o desde CLAUDE.md global
cd apps/storefront && npm run build && echo "_worker.js" > "dist/.assetsignore" && npx wrangler deploy 2>&1 | grep -E "Uploaded|Worker Startup"
```

Expected: `Uploaded aimma-storefront`

- [ ] **Step 14.5: Invalidate KV**

```bash
# INVALIDATE_SECRET viene de Worker env (NO commitear inline):
# export INVALIDATE_SECRET="$(cat ~/.invalidate_secret)"  # o desde CLAUDE.md global
curl -X POST "https://aimma-test.tienda.aimma.com.co/internal/invalidate-kv" \
  -H "Authorization: Bearer $INVALIDATE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"slug":"aimma-test"}'
```

Expected: `{"success":true,...}`

- [ ] **Step 14.6: Verify LIVE con curl + grep markers**

```bash
sleep 5
curl -s "https://aimma-test.tienda.aimma.com.co/?cb=$(date +%s%N)" -o /tmp/v.html
echo "block-section count:"
grep -c "block-section" /tmp/v.html
echo "data-section-tipo:"
grep -oE 'data-section-tipo="[a-z]+"' /tmp/v.html | sort -u
echo "data-section-id:"
grep -oE 'data-section-id="sec_[a-z0-9]+"' /tmp/v.html | sort -u
echo "Hero content:"
grep -o "Tienda construida con el Editor PRO-MAX" /tmp/v.html
```

Expected:
- block-section count: 2+
- data-section-tipo: hero + productos
- data-section-id: sec_hero1 + sec_prods
- Hero content match

- [ ] **Step 14.7: Test fallback (sin pages.home)**

Probar que las otras tiendas SIGUEN funcionando con fallback:

```sql
-- Verify aimma-test sigue siendo unica con pages.home
SELECT slug, personalizaciones ? 'pages' AS tiene_pages
FROM tiendas WHERE estado='publicada';
```

- [ ] **Step 14.8: Restaurar aimma-test sin pages.home si querés volver al estado anterior (OPCIONAL)**

```sql
-- Comentado: solo correr si querés borrar el fixture
-- UPDATE tiendas SET personalizaciones = '{}'::jsonb WHERE slug='aimma-test';
```

Dejarlo con el fixture es útil para tener una demo visual del Editor PRO-MAX funcionando.

- [ ] **Step 14.9: Audit con code-reviewer agent (opcional)**

Si querés audit pre-merge, ejecutar agente:

```
Agent task: code-reviewer
prompt: "Review commits Plan 1 Editor PRO-MAX Foundation en aimma-website
HEAD ultimos 13 commits. Foco: Zod schema completeness, XSS en
ElementRenderer (texto/imagen/boton props), CSS scope bugs (lecciones
del fix Fashion Bold), accessibility blocks. Max 300 palabras."
```

- [ ] **Step 14.10: Commit final del SQL fixture**

```bash
# Documentar el fixture en un archivo SQL para referencia futura
mkdir -p docs/superpowers/fixtures
cat > docs/superpowers/fixtures/2026-06-01-aimma-test-home-plan1.sql <<'EOF'
-- AIMMA Editor PRO-MAX · Fixture aimma-test home con BlockRenderer
-- Aplicado durante Task 14 del Plan 1 (Foundation).
-- Tiene 2 sections (hero + productos) para validar render end-to-end.

UPDATE tiendas SET personalizaciones = jsonb_build_object(
  'schema_version', 2,
  'pages', jsonb_build_object(
    'home', jsonb_build_object(
      'version', 1,
      'updated_at', '2026-06-01T16:00:00Z',
      'sections', jsonb_build_array(
        -- Hero section
        jsonb_build_object(
          'id', 'sec_hero1',
          'tipo', 'hero',
          'altura_filas', 10,
          'fondo', jsonb_build_object('tipo', 'transparente', 'valor', ''),
          'padding', 'lg',
          'elementos', jsonb_build_array(
            jsonb_build_object(
              'id', 'el_t1', 'tipo', 'texto',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 14, 'row_start', 2, 'row_end', 7),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamaño', '3xl', 'peso', 'bold', 'color_texto', null),
              'props', jsonb_build_object('contenido', 'Tienda construida con el Editor PRO-MAX')
            ),
            jsonb_build_object(
              'id', 'el_t2', 'tipo', 'texto',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 13, 'row_start', 7, 'row_end', 9),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamaño', 'lg', 'peso', 'normal', 'color_texto', null),
              'props', jsonb_build_object('contenido', 'Probamos el render del nuevo dispatcher.')
            ),
            jsonb_build_object(
              'id', 'el_b1', 'tipo', 'boton',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 7, 'row_start', 9, 'row_end', 11),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamaño', 'md', 'peso', 'semibold'),
              'props', jsonb_build_object('texto', 'Ver productos', 'url', '#productos', 'estilo_visual', 'primary', 'target', '_self')
            )
          )
        ),
        -- Productos section
        jsonb_build_object(
          'id', 'sec_prods', 'tipo', 'productos',
          'altura_filas', 10,
          'fondo', jsonb_build_object('tipo', 'transparente', 'valor', ''),
          'padding', 'lg',
          'elementos', jsonb_build_array(
            jsonb_build_object(
              'id', 'el_p1', 'tipo', 'productos',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 25, 'row_start', 1, 'row_end', 10),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamaño', 'md', 'peso', 'normal'),
              'props', jsonb_build_object('categoria_id', null, 'limite', 4, 'orden', 'recientes', 'columnas', 'auto', 'mostrar_precio', true)
            )
          )
        )
      )
    )
  )
) WHERE slug='aimma-test';

-- Para revertir:
-- UPDATE tiendas SET personalizaciones = '{}'::jsonb WHERE slug='aimma-test';
EOF

git add docs/superpowers/fixtures/2026-06-01-aimma-test-home-plan1.sql
git commit -m "docs(editor): SQL fixture aimma-test home para Plan 1 testing

Fixture con 2 sections (hero + productos) usado para validar
BlockRenderer LIVE end-to-end. Permite que cualquier dev replique
el test del Plan 1 facilmente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Final audit + push + documentar Plan 1 cerrado

- [ ] **Step 15.1: Verificar todas las commits estan pusheadas**

```bash
git log --oneline -15
git push origin main 2>&1 | tail -3
```

Expected: branch al dia con remote.

- [ ] **Step 15.2: Actualizar memoria con Plan 1 cerrado**

Crear/actualizar memory file:

```bash
cat > "C:\Users\Usuario\.claude\projects\C--Users-Usuario\memory\project_aimma_editor_plan1.md" <<'EOF'
---
name: project-aimma-editor-plan1
description: AIMMA Editor PRO-MAX Plan 1 (Foundation + Industrial Clean blocks) cerrado LIVE
metadata:
  type: project
---

# AIMMA Editor PRO-MAX Plan 1 — CERRADO LIVE

## Estado al cierre

**HEAD main:** ver `git log --oneline -15`. Plan 1 deja LIVE:

- `packages/database/src/editor-schema.ts` — Zod schemas (Element/Section/Page/Personalizaciones)
- `apps/storefront/src/styles/blocks.css` — CSS grid 24-col + Container Queries
- `apps/storefront/src/components/BlockRenderer.astro` — Dispatcher
- `apps/storefront/src/components/blocks/_ElementRenderer.astro` — Helper
- `apps/storefront/src/components/blocks/{hero,texto,imagen,botones,productos,galeria,espaciador,formulario}/*IndustrialClean.astro` — 7 blocks variant + Espaciador.astro sin variantes
- `apps/storefront/src/pages/index.astro` — Branch if pages.home → BlockRenderer

## Verificacion LIVE

aimma-test con fixture `pages.home` (2 sections: hero + productos):
- HTTP 200, HTML con `data-section-tipo="hero"` y `data-section-tipo="productos"`
- Hero renderea texto "Tienda construida con el Editor PRO-MAX"
- Grid productos con 4 productos via ProductosIndustrialClean → ProductCardIC

Tiendas SIN pages.home (Maraldo, Dimac) siguen funcionando con fallback render actual de Fase 9.

## Pendiente Plans siguientes

**Plan 2:** 21 blocks restantes (8 secciones x 3 plantillas: Fashion Bold + Minimal Artesanal + Editorial Magazine, menos Espaciador). Estimado ~1 semana.

**Plan 3:** Editor UI panel admin (sidebar + canvas + inspector + SortableJS + GridStack). Estimado ~2 semanas.

**Plan 4:** IA Integration (EF editor-ai-generate + Claude Haiku/Sonnet + modal). Estimado ~1-1.5 semanas.

**Plan 5:** Test E2E global + audit code-reviewer + Polish + deploy publico.

## Schema clave

`tiendas.personalizaciones jsonb` con:
```json
{
  "schema_version": 2,
  "theme": {...},
  "pages": { "home": { "version": 1, "sections": [...] } }
}
```

`parsePersonalizaciones()` helper en `@aimma/database` para safe-parse con fallback.

## Decisiones aprobadas Jorge

1. Fluid Engine pattern (grid 24-col responsive)
2. Sub-paginas reales Fase 2 post-MVP
3. Hibrido plantilla=SKIN
4. Pack basico + IA generativa MVP
5. Drag libre dentro del grid (snap a celdas)
6. IA: Default Haiku + Upgrade Sonnet
7. SortableJS + GridStack (Plan 3)
EOF

# Editar MEMORY.md index (si la skill usa indice)
```

- [ ] **Step 15.3: Hacer último push del fixture + memoria**

```bash
git status --short
# Si hay cambios:
git add -A
git commit -m "docs(editor): Plan 1 cerrado LIVE - memoria + fixture documentados"
git push origin main 2>&1 | tail -3
```

---

## Definition of done — Plan 1

- [x] 8 blocks Industrial Clean creados (7 variants + Espaciador)
- [x] BlockRenderer dispatcher funcional
- [x] index.astro branch if/else robusto
- [x] CSS grid 24-col responsive con auto-collapse mobile
- [x] Zod schemas compartidos en packages/database
- [x] LIVE verificado: aimma-test renderea fixture con BlockRenderer
- [x] Fallback verificado: tiendas sin pages.home siguen funcionando
- [x] 0 errors `astro check`
- [x] Build verde + CF Worker deployed
- [x] Memoria actualizada

## Tasks NO en Plan 1 (recordatorio explicito)

❌ Fashion Bold + Minimal Artesanal + Editorial Magazine blocks (Plan 2)
❌ Editor UI panel admin con SortableJS/GridStack (Plan 3)
❌ EF tienda-guardar-layout (Plan 3)
❌ IA Integration Claude Haiku/Sonnet (Plan 4)
❌ EF editor-ai-generate (Plan 4)
❌ Modal "Generar con IA" (Plan 4)
❌ Sub-paginas (Fase 2 post-MVP general)
❌ Uploader Supabase Storage (Fase 13)
❌ EF tienda-form-submit handler de formularios (Plan 3)

---

## Spec coverage check (self-review)

| Spec section | Tareas que la cubren |
|---|---|
| §4 Data Model (Zod schemas) | Task 1 |
| §4 Política fallback graceful | Task 13 (branch if pages.home), Task 1 (parsePersonalizaciones) |
| §6 Hero | Task 5 |
| §6 Texto | Task 6 |
| §6 Imagen banner | Task 7 |
| §6 Botones | Task 8 |
| §6 Productos | Task 9 |
| §6 Galeria | Task 10 |
| §6 Espaciador | Task 4 |
| §6 Formulario | Task 11 |
| §6 BlockRenderer dispatcher | Task 12 |
| §8 Fase 12.C.1 Foundation | Tasks 1-3 + Task 13 |
| §8 Fase 12.C.2 Blocks Industrial Clean | Tasks 4-11 |
| §8 Test E2E + deploy | Task 14 |
| Audit + memoria final | Task 15 |

Plan 1 cubre completamente las Fases 12.C.1 + 12.C.2 del spec.

Fases 12.C.3 (otras plantillas), 12.C.4 (editor admin), 12.C.5 (IA) y 12.C.6 (test global) son Plans 2-5.
