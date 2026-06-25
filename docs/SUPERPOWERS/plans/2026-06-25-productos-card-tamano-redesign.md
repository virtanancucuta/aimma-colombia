# Rediseño Productos — Card limpia + Tamaño + grilla ancha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el control de imagen por-sección de la Fase 1a por una foto estándar 1:1 fija, un selector de Tamaño (3 columnas en escritorio según rubro), una card limpia (sin SKU/CTA, con badge de stock condicional) y una grilla alineada al header — solo en `industrial_clean`.

**Architecture:** El schema Zod (`ProductosProps`) es la fuente única; el EF tiene un mirror byte-idéntico (sync-test 04). El render unificado (`Productos.astro`) mapea `tamano`→columnas por plantilla y pasa el flag de hover a `ProductCardIC`, que ahora muestra foto 1:1 + badge condicional + nombre + precio. El editor (`section-defs.js`) genera los controles. Tests golden (snapshot) + unit (toContain) en vitest; sync-test en node:test.

**Tech Stack:** Astro 5 (Container API para tests), Zod, Tailwind v4 (JIT, clases literales), vitest 4, Deno (EF), Supabase CLI, wrangler (Cloudflare), Playwright (gate visual).

## Global Constraints

- **Modo TEST:** no hay tiendas reales (solo aimma-test/QA-VIS). Sin backward-compat; Zod stripea props obsoletas al guardar. No se rompe nada en producción.
- **Alcance de plantilla:** card 1:1 + cleanup = SOLO `industrial_clean`. FB/MA/EM solo cambian su mapeo de columnas (su card interna NO se toca).
- **Patrón B (no negociable):** el aspect va al wrapper Y a la `<img>` (`aspect-square` en ambos). **NUNCA `h-full`** en la img (causó el overflow histórico).
- **Tailwind v4 JIT:** las clases de grid y aspect deben ser **literales** en el código (no interpoladas), o no se generan.
- **EF mirror byte-idéntico:** tras tocar `packages/database/src/editor-schema.ts`, re-sincronizar con `cp` exacto a `supabase/functions/tienda-guardar-layout/editor-schema.ts`. El sync-test 04 lo verifica.
- **Default de tamaño = `mediano` (4 columnas).** Móvil sin cambios (`grid-cols-2`).
- **Tokens/credenciales:** Management PAT Supabase, wrangler, etc. están en la memoria `reference_accesos_aimma` (NO hardcodear en el repo).
- **Easypanel admin redeploy = Tipo B** (lo hace Jorge; no automatizable desde aquí).

### Mapeo `tamano` → columnas (literales, definitivo)

`industrial_clean` y `fashion_bold`:
| tamano | clase de columnas |
|---|---|
| grande | `grid-cols-2 md:grid-cols-3 lg:grid-cols-3` |
| mediano | `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` |
| pequeno | `grid-cols-2 md:grid-cols-4 lg:grid-cols-5` |

`minimal_artesanal` y `editorial_magazine` (editoriales, más espaciadas):
| tamano | clase de columnas |
|---|---|
| grande | `grid-cols-2 lg:grid-cols-2` |
| mediano | `grid-cols-2 lg:grid-cols-3` |
| pequeno | `grid-cols-2 lg:grid-cols-4` |

---

## Comandos de referencia

- Tests storefront (todos): `cd apps/storefront && npx vitest run`
- Test storefront puntual: `cd apps/storefront && npx vitest run test/<archivo>.test.ts`
- Regenerar snapshots golden: `cd apps/storefront && npx vitest run -u`
- Sync-test EF: `cd tests/editor && node --import tsx --test 04-ef-schema-sync.test.mjs`
- Re-sync mirror EF: `cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts`

---

## Task 1: Schema `tamano` + mirror EF

**Files:**
- Modify: `packages/database/src/editor-schema.ts:162-173` (ProductosProps)
- Modify: `supabase/functions/tienda-guardar-layout/editor-schema.ts` (mirror, vía cp)
- Test: `tests/editor/04-ef-schema-sync.test.mjs` (existente, no se edita)

**Interfaces:**
- Produces: `ProductosProps` con campos `{ categoria_id, limite, orden, tamano: 'pequeno'|'mediano'|'grande' (def 'mediano'), mostrar_precio, hover }`. Se eliminan `columnas`, `forma`, `ajuste`.

- [ ] **Step 1: Editar `ProductosProps` en el canonical**

En `packages/database/src/editor-schema.ts`, reemplazar el bloque actual (líneas 162-173) por:

```ts
const ProductosProps = z.object({
  categoria_id: z.string().uuid().nullable(),
  limite: z.number().int().min(1).max(12).default(8),
  orden: z.enum(['recientes', 'precio_asc', 'precio_desc', 'manual']).default('recientes'),
  // Rediseño 2026-06-25: el control de seccion es el TAMANO del producto (no la forma de la foto).
  // Mapea a columnas en escritorio segun el render (grande=3, mediano=4, pequeno=5 en IC/FB).
  tamano: z.enum(['pequeno', 'mediano', 'grande']).default('mediano'),
  mostrar_precio: z.boolean().default(true),
  // hover: override del flag de tienda hover_segunda_foto. Se conserva.
  hover: z.enum(['heredar', 'on', 'off']).default('heredar'),
});
```

(Se eliminan `columnas`, `forma`, `ajuste` y sus comentarios de Fase 1a.)

- [ ] **Step 2: Re-sincronizar el mirror EF**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts`

- [ ] **Step 3: Correr el sync-test (debe pasar)**

Run: `cd tests/editor && node --import tsx --test 04-ef-schema-sync.test.mjs`
Expected: PASS — "EF editor-schema.ts es mirror byte-identico del canonical" verde (y los otros 2 del archivo).

- [ ] **Step 4: Verificar que los campos viejos ya no están**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && grep -nE "forma:|ajuste:|columnas:" packages/database/src/editor-schema.ts | grep -i product`
Expected: sin resultados dentro de ProductosProps (el `columnas` del contenedor en otra línea es OK). Confirmar visualmente que ProductosProps tiene `tamano` y no `forma/ajuste/columnas`.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts
git commit -m "feat(schema): productos usa tamano en vez de columnas/forma/ajuste"
```

---

## Task 2: Render — `Productos.astro` (tamano→columnas, sin forma/fit, grilla ancha) + harness

**Files:**
- Modify: `apps/storefront/src/components/blocks/productos/Productos.astro:24-86` y `:107-124`
- Modify: `apps/storefront/test/helpers/render-harness.ts:45-71` y `:179-187`
- Test: `apps/storefront/test/productos-render.test.ts` (CREAR)

**Interfaces:**
- Consumes: `ProductosProps.tamano` (Task 1).
- Produces: `colsForTamano(plantilla, tamano)` interno; `makeProductosSection({ tamano, mostrar_precio, hover? })` y `COMBOS` con `tamano`.

- [ ] **Step 1: Actualizar el harness — `makeProductosSection` y `COMBOS`**

En `apps/storefront/test/helpers/render-harness.ts`, reemplazar `makeProductosSection` (líneas 45-71) por:

```ts
export function makeProductosSection(props: {
  tamano?: 'pequeno' | 'mediano' | 'grande';
  mostrar_precio: boolean;
  hover?: 'heredar' | 'on' | 'off';
}): any {
  return {
    id: 'sec_pilot01',
    tipo: 'productos',
    padding: 'md',
    ancho: 'completo',
    fondo: { tipo: 'color', valor: '#ffffff' },
    props: {
      categoria_id: null,
      limite: 24,
      orden: 'recientes',
      tamano: props.tamano ?? 'mediano',
      mostrar_precio: props.mostrar_precio,
      ...(props.hover ? { hover: props.hover } : {}),
    },
  };
}
```

Y reemplazar `COMBOS` (líneas 179-187) por:

```ts
export const COMBOS: Array<{ label: string; tamano: 'pequeno' | 'mediano' | 'grande'; mostrar_precio: boolean; empty: boolean }> = [
  { label: 'empty', tamano: 'mediano', mostrar_precio: true, empty: true },
  { label: 'mediano-precio', tamano: 'mediano', mostrar_precio: true, empty: false },
  { label: 'grande-precio', tamano: 'grande', mostrar_precio: true, empty: false },
  { label: 'pequeno-precio', tamano: 'pequeno', mostrar_precio: true, empty: false },
  { label: 'mediano-sinprecio', tamano: 'mediano', mostrar_precio: false, empty: false },
];
```

- [ ] **Step 2: Editar `Productos.astro` — quitar forma/fit, mapear tamano, ensanchar**

En `apps/storefront/src/components/blocks/productos/Productos.astro`:

(a) Reemplazar las líneas 24-33 (resolución de forma/fit/hover) por:

```astro
const plantilla = tienda.plantilla?.slug ?? 'industrial_clean';
// Rediseño 2026-06-25: el control de seccion es el TAMANO; la foto es 1:1 fija (la fija ProductCardIC).
// hover: heredar usa el flag de tienda; on/off lo overridean.
const tamano = ((p as any).tamano ?? 'mediano') as 'pequeno' | 'mediano' | 'grande';
const hoverCfg = (p as any).hover ?? 'heredar';
const hoverSegundaFoto = hoverCfg === 'off' ? false
  : hoverCfg === 'on' ? true
  : (tienda as any).hover_segunda_foto !== false;
```

(b) Reemplazar `colsFor` (líneas 47-62) por mapeo de tamano (clases LITERALES):

```astro
// cols por plantilla y tamano (Tailwind JIT: strings literales). IC/FB usan md+lg; MA/EM solo lg.
function colsForTamano(plant: string, t: 'pequeno' | 'mediano' | 'grande'): string {
  if (plant === 'minimal_artesanal' || plant === 'editorial_magazine') {
    return t === 'grande' ? 'grid-cols-2 lg:grid-cols-2'
      : t === 'pequeno' ? 'grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-2 lg:grid-cols-3';
  }
  return t === 'grande' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-3'
    : t === 'pequeno' ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5'
    : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
}
const colsClass = colsForTamano(plantilla, tamano);
```

(c) En el branch `else` (industrial_clean) del gridClass (línea 84), añadir el ensanchado `lg:-mx-4` (compensa los 48px de padding del block-inner para alinear con el header `px-8`=32px):

```astro
} else {
    ProductCard = ProductCardIC;
    gridClass = `grid gap-3 lg:gap-4 lg:-mx-4 ${colsClass}${p.mostrar_precio ? '' : ' ic-productos--sin-precio'}`;
    dataField = 'productos';
  }
```

(d) En los 3 sitios donde se renderiza `<ProductCard ... {...({ forma, fit } as any)} />` (líneas 111, 118, 121), **quitar** el spread `{...({ forma, fit } as any)}`. Quedan: `<ProductCard producto={prod} hoverSegundaFoto={hoverSegundaFoto} />`.

- [ ] **Step 3: Escribir los tests de render (fallan primero)**

Crear `apps/storefront/test/productos-render.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { renderNormalized, makeProductosSection } from './helpers/render-harness.ts';
import Productos from '../src/components/blocks/productos/Productos.astro';

const ROW = [{
  id: 'ph', nombre: 'Con Galeria', slug: 'con-galeria', referencia: 'RG',
  precio_venta: 100000, precio_promo: null,
  foto_principal_url: 'https://h/main.jpg', fotos_galeria: ['https://h/hover.jpg'],
  estado: 'activo', producto_variantes: [{ stock: 5, reservado: 0 }],
}];
const ic = (extra: any = {}): any => ({ id: 'tienda-uuid', plantilla: { slug: 'industrial_clean' }, ...extra });

describe('Productos · tamano -> columnas (IC)', () => {
  test('mediano (default) -> lg:grid-cols-4', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true }), ic(), ROW);
    expect(html).toContain('lg:grid-cols-4');
  });
  test('grande -> lg:grid-cols-3', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ tamano: 'grande', mostrar_precio: true }), ic(), ROW);
    expect(html).toContain('lg:grid-cols-3');
  });
  test('pequeno -> lg:grid-cols-5', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ tamano: 'pequeno', mostrar_precio: true }), ic(), ROW);
    expect(html).toContain('lg:grid-cols-5');
  });
  test('grilla IC ensanchada con lg:-mx-4 (alinea al header)', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true }), ic(), ROW);
    expect(html).toContain('lg:-mx-4');
  });
  test('hover on + flag OFF -> SI 2a imagen (override se mantiene)', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true, hover: 'on' }), ic({ hover_segunda_foto: false }), ROW);
    expect(html).toContain('https://h/hover.jpg');
  });
  test('hover off + flag ON -> sin 2a imagen', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true, hover: 'off' }), ic(), ROW);
    expect(html).not.toContain('https://h/hover.jpg');
  });
});
```

- [ ] **Step 4: Correr y ver que fallan, luego pasan**

Run: `cd apps/storefront && npx vitest run test/productos-render.test.ts`
Expected: tras los edits del Step 2, PASS (6/6). Si algún `lg:grid-cols-*` no aparece, revisar que la clase sea literal en `colsForTamano`.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/components/blocks/productos/Productos.astro apps/storefront/test/helpers/render-harness.ts apps/storefront/test/productos-render.test.ts
git commit -m "feat(productos): render mapea tamano->columnas + grilla ancha (IC), sin forma/fit"
```

---

## Task 3: Card `ProductCardIC` — foto 1:1, sin SKU/CTA, badge de stock condicional

**Files:**
- Modify: `apps/storefront/src/components/templates/industrial_clean/ProductCardIC.astro`
- Test: `apps/storefront/test/productcard-ic.test.ts` (CREAR)

**Interfaces:**
- Consumes: `producto` (con `stock_disponible`, `nombre`, `precio`, `slug`, `foto_principal`, `foto_hover`), `hoverSegundaFoto`.
- Produces: card con `aspect-square` fijo, badge "Agotado"/"Últimas X", sin SKU/stock-row/CTA. Ya NO acepta props `forma`/`fit`.

- [ ] **Step 1: Reescribir `ProductCardIC.astro`**

Reemplazar el archivo completo por:

```astro
---
// Industrial Clean · ProductCard · Rediseño 2026-06-25
// Foto 1:1 fija (estandar multi-rubro). Card limpia: foto + nombre + precio. Sin SKU/stock-row/CTA.
// Badge de stock SOLO cuando aplica (Agotado / Ultimas X). Card completa clickeable. Hover 2a foto.
// Patron B: aspect-square en wrapper Y en la img. NUNCA h-full.

import OptimizedImage from '~/components/OptimizedImage.astro';

interface Props {
  producto: {
    id: string;
    nombre: string;
    slug: string;
    precio: number;
    precio_anterior?: number | null;
    foto_principal?: string | null;
    foto_hover?: string | null;
    stock_disponible?: number | null;
    referencia?: string | null;
  };
  hoverSegundaFoto?: boolean;
}

const { producto, hoverSegundaFoto = false } = Astro.props;
const mostrarHover = hoverSegundaFoto && !!producto.foto_hover;

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const precioStr = fmt(producto.precio);
const precioAnteriorStr = producto.precio_anterior ? fmt(producto.precio_anterior) : null;
const enDescuento = producto.precio_anterior !== null && producto.precio_anterior !== undefined && producto.precio_anterior > producto.precio;
const sinStock = producto.stock_disponible === 0;
const stockLow = producto.stock_disponible !== null && producto.stock_disponible !== undefined && producto.stock_disponible > 0 && producto.stock_disponible <= 5;
---

<article class="group border border-[var(--ta-color-text-base)]/10 bg-[var(--ta-color-bg-base)] transition-colors duration-200 hover:bg-[var(--ta-color-text-base)]/[0.02]">
  <a href={`/p/${producto.slug}`} class="block p-4 lg:p-5" aria-label={producto.nombre}>
    {/* Imagen 1:1 (aspect-square en wrapper Y en img — patron B) */}
    <div class="relative aspect-square overflow-hidden bg-[var(--ta-color-text-base)]/5 mb-4">
      {/* Badge de stock condicional sobre la foto */}
      {sinStock ? (
        <span class="absolute left-2 top-2 z-10 rounded-sm bg-[var(--ta-color-text-base)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ta-color-bg-base)]">
          Agotado
        </span>
      ) : stockLow ? (
        <span class="absolute left-2 top-2 z-10 rounded-sm bg-amber-500 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-950">
          Últimas {producto.stock_disponible}
        </span>
      ) : null}

      {producto.foto_principal ? (
        <OptimizedImage
          src={producto.foto_principal}
          alt={producto.nombre}
          width={400}
          height={400}
          loading="lazy"
          class={`absolute inset-0 w-full aspect-square object-cover${mostrarHover ? ' transition-opacity duration-300 group-hover:opacity-0 group-focus-within:opacity-0 motion-reduce:transition-none' : ''}`}
          transitionName={`producto-${producto.id}`}
        />
      ) : (
        <div class="relative flex h-full items-end justify-start p-4">
          <svg class="absolute inset-0 w-full h-full opacity-30" aria-hidden="true">
            <defs>
              <pattern id={`ic-card-grid-${producto.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0L0 0 0 20" fill="none" stroke="currentColor" stroke-width="0.4" class="text-[var(--ta-color-text-base)]" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#ic-card-grid-${producto.id})`} />
          </svg>
          <span class="relative font-display text-[11px] font-medium tabular-nums tracking-wide text-[var(--ta-color-text-base)]/55">
            {producto.referencia ? `REF · ${producto.referencia}` : 'IMAGEN PENDIENTE'}
          </span>
        </div>
      )}

      {mostrarHover && (
        <OptimizedImage
          src={producto.foto_hover}
          alt=""
          width={400}
          height={400}
          loading="lazy"
          class="absolute inset-0 w-full aspect-square object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
        />
      )}
    </div>

    {/* Nombre */}
    <h3 class="font-display text-base font-semibold leading-tight text-[var(--ta-color-text-base)] line-clamp-2">
      {producto.nombre}
    </h3>

    {/* Precio mono tabular-nums */}
    <div class="mt-2 flex items-baseline gap-2">
      <span class="font-mono font-medium tabular-nums text-[var(--ta-color-text-base)]">
        {precioStr}
      </span>
      {precioAnteriorStr && enDescuento && (
        <span class="font-mono text-xs tabular-nums text-[var(--ta-color-text-base)]/50 line-through">
          {precioAnteriorStr}
        </span>
      )}
    </div>
  </a>
</article>
```

- [ ] **Step 2: Escribir tests de la card (fallan primero)**

Crear `apps/storefront/test/productcard-ic.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { renderNormalized, makeProductosSection } from './helpers/render-harness.ts';
import Productos from '../src/components/blocks/productos/Productos.astro';

const ic = (): any => ({ id: 'tienda-uuid', plantilla: { slug: 'industrial_clean' } });
const rows = (stock: number) => [{
  id: 'p1', nombre: 'Zapato Alfa', slug: 'zapato-alfa', referencia: 'REF001',
  precio_venta: 120000, precio_promo: null, foto_principal_url: 'https://x/a.jpg',
  fotos_galeria: [], estado: 'activo', producto_variantes: [{ stock, reservado: 0 }],
}];
const render = (stock: number) => renderNormalized(Productos, makeProductosSection({ mostrar_precio: true }), ic(), rows(stock));

describe('ProductCardIC · card limpia', () => {
  test('foto usa aspect-square en wrapper y en img, sin h-full', async () => {
    const html = await render(10);
    expect(html).toContain('relative aspect-square overflow-hidden');
    expect(html).toContain('w-full aspect-square object-cover');
    expect(html).not.toContain('h-full w-full object-cover');
  });
  test('sin SKU (no aparece "SKU ")', async () => {
    const html = await render(10);
    expect(html).not.toContain('SKU ');
  });
  test('sin CTA "Ver producto"', async () => {
    const html = await render(10);
    expect(html).not.toContain('Ver producto');
  });
  test('stock normal (10) -> sin badge Agotado ni Ultimas', async () => {
    const html = await render(10);
    expect(html).not.toContain('Agotado');
    expect(html).not.toContain('Últimas');
  });
  test('stock 0 -> badge Agotado', async () => {
    const html = await render(0);
    expect(html).toContain('Agotado');
  });
  test('stock bajo (3) -> badge Últimas 3', async () => {
    const html = await render(3);
    expect(html).toContain('Últimas 3');
  });
  test('precio sigue visible', async () => {
    const html = await render(10);
    expect(html).toContain('120.000');
  });
});
```

> Nota: el stock efectivo lo calcula `getProductosPorTienda` desde `producto_variantes` (stock - reservado). El fixture usa `reservado: 0` para que `stock_disponible` == `stock`.

- [ ] **Step 3: Correr (fallan → pasan)**

Run: `cd apps/storefront && npx vitest run test/productcard-ic.test.ts`
Expected: tras el rewrite, PASS (7/7).

- [ ] **Step 4: Borrar el test obsoleto de Fase 1a**

El archivo `apps/storefront/test/fase1a-img.test.ts` prueba forma/ajuste (ya no existen). Eliminarlo:

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && git rm apps/storefront/test/fase1a-img.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/components/templates/industrial_clean/ProductCardIC.astro apps/storefront/test/productcard-ic.test.ts
git commit -m "feat(productcard-ic): foto 1:1, card sin SKU/CTA, badge stock condicional"
```

---

## Task 4: Regenerar goldens + revisar diff

**Files:**
- Modify: `apps/storefront/test/__snapshots__/productos/*.html` (regeneración)
- Test: `apps/storefront/test/productos.golden.test.ts` (ya consume el nuevo COMBOS; no se edita salvo labels)

**Interfaces:**
- Consumes: `COMBOS` con `tamano` (Task 2). El golden test usa `combo.columnas` → ahora `combo.tamano`.

- [ ] **Step 1: Ajustar el golden test al nuevo COMBOS**

En `apps/storefront/test/productos.golden.test.ts:23`, cambiar:

```ts
const section = makeProductosSection({ columnas: combo.columnas, mostrar_precio: combo.mostrar_precio });
```
por:
```ts
const section = makeProductosSection({ tamano: combo.tamano, mostrar_precio: combo.mostrar_precio });
```

Y en la línea 47 (sección de hover), cambiar `{ columnas: 'auto', mostrar_precio: true }` por `{ tamano: 'mediano', mostrar_precio: true }`.

- [ ] **Step 2: Borrar los snapshots viejos (labels cambiaron: col2/col3/col4/auto → tamano)**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && git rm apps/storefront/test/__snapshots__/productos/*__col2-precio.html apps/storefront/test/__snapshots__/productos/*__col3-precio.html apps/storefront/test/__snapshots__/productos/*__col4-precio.html apps/storefront/test/__snapshots__/productos/*__auto-precio.html apps/storefront/test/__snapshots__/productos/*__auto-sinprecio.html`

(Los `*__empty.html`, `*__hover-on.html`, `*__hover-off.html` se conservan; se regeneran igual.)

- [ ] **Step 3: Regenerar todos los snapshots**

Run: `cd apps/storefront && npx vitest run test/productos.golden.test.ts -u`
Expected: PASS; crea los nuevos snapshots (`*__mediano-precio.html`, `*__grande-precio.html`, `*__pequeno-precio.html`, `*__mediano-sinprecio.html`) y actualiza empty/hover.

- [ ] **Step 4: Revisar el diff (gate manual)**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && git status --short apps/storefront/test/__snapshots__/productos/`

Verificar a ojo en 2-3 snapshots:
- **industrial_clean**: la card NO tiene fila SKU/stock ni "Ver producto"; img con `aspect-square object-cover`; grid con `lg:grid-cols-3/4/5` según tamano y `lg:-mx-4`.
- **fashion_bold / minimal_artesanal / editorial_magazine**: la card interna IGUAL que antes (mismos elementos), SOLO cambió la clase de columnas del grid. Si cambió algo dentro de la card de FB/MA/EM, es un bug — investigar.

- [ ] **Step 5: Correr toda la suite storefront**

Run: `cd apps/storefront && npx vitest run`
Expected: PASS total (productos-render, productcard-ic, golden, y el resto de la suite intactos). 0 referencias a `fase1a-img`.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/test/productos.golden.test.ts apps/storefront/test/__snapshots__/productos/
git commit -m "test(productos): regenerar goldens (card limpia IC + tamano por plantilla)"
```

---

## Task 5: Editor — controles de la sección productos

**Files:**
- Modify: `iapanel/tienda/admin/views/editor/section-defs.js:10-27` (OPTS) y `:163-174` (campos productos)

**Interfaces:**
- Produces: control "Tamaño" (select, default 'mediano') en lugar de Columnas/Forma/Ajuste; control Hover conservado.

- [ ] **Step 1: Añadir OPTS `TAMANO_PROD`**

En `iapanel/tienda/admin/views/editor/section-defs.js`, dentro de `OPTS` (después de la línea 23 `COLUMNAS:`), añadir:

```js
    TAMANO_PROD: [{ v: 'pequeno', l: 'Pequeno' }, { v: 'mediano', l: 'Mediano' }, { v: 'grande', l: 'Grande' }],
```

(Dejar `FORMA`/`AJUSTE` en OPTS por ahora es inocuo, pero para limpieza se pueden borrar las líneas 24-26. `HOVER` y `COLUMNAS` se mantienen — `COLUMNAS` lo usan otros bloques: NO borrar.)

- [ ] **Step 2: Reemplazar los campos de productos**

En el bloque `productos.campos` (líneas 164-173), reemplazar las líneas 167 y 169-173 de forma que quede:

```js
      campos: [
        { key: 'categoria_id', control: 'category', label: 'Categoria de productos', default: null, nullable: true, empty_to_null: true },
        { key: 'limite', control: 'slider', label: 'Cantidad de productos', default: 8, opts: { min: 1, max: 12, step: 1 } },
        { key: 'orden', control: 'select', label: 'Ordenar por', default: 'recientes', opts: { options: 'ORDEN' } },
        { key: 'tamano', control: 'select', label: 'Tamano de los productos', default: 'mediano', opts: { options: 'TAMANO_PROD' } },
        { key: 'mostrar_precio', control: 'switch', label: 'Mostrar precio', default: true },
        { key: 'hover', control: 'select', label: 'Segunda foto al pasar el mouse', default: 'heredar', opts: { options: 'HOVER' } },
      ],
```

(Se eliminan los campos `columnas`, `forma` —con su `note`/`rebuild_on_change`— y `ajuste`.)

- [ ] **Step 3: Verificar sintaxis JS**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && node -e "require('./iapanel/tienda/admin/views/editor/section-defs.js')" 2>&1 | head` 
Expected: sin SyntaxError (puede quejarse de `window` no definido — eso es OK, es un IIFE de browser; lo que importa es que NO haya error de parseo. Alternativa: `node --check iapanel/tienda/admin/views/editor/section-defs.js` → "OK"/sin salida).

Run preferido: `node --check iapanel/tienda/admin/views/editor/section-defs.js && echo SINTAXIS_OK`
Expected: `SINTAXIS_OK`.

- [ ] **Step 4: Commit**

```bash
git add iapanel/tienda/admin/views/editor/section-defs.js
git commit -m "feat(editor): control Tamano en productos (reemplaza Columnas/Forma/Ajuste)"
```

---

## Task 6: Deploy + gate empírico (Playwright)

**Files:** ninguno (deploy + verificación).

**Interfaces:** Consumes todo lo anterior. Credenciales desde memoria `reference_accesos_aimma`.

- [ ] **Step 1: Typecheck storefront (no romper tipos)**

Run: `cd apps/storefront && npx astro check 2>&1 | tail -20`
Expected: 0 errors (o solo warnings preexistentes no relacionados). Si hay error por `p.columnas`/`forma`/`fit`, corregir el residuo en `Productos.astro`.

- [ ] **Step 2: Merge a main (ya estamos en main, modo TEST) — confirmar limpio**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && git log --oneline -6 && git status --short`
Expected: los 5 commits de las Tasks 1-5 presentes; working tree limpio.

- [ ] **Step 3: Desplegar el EF `tienda-guardar-layout`**

Con el Management PAT (de `reference_accesos_aimma`) como `SUPABASE_ACCESS_TOKEN`:

```bash
cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website
SUPABASE_ACCESS_TOKEN="<MANAGEMENT_PAT>" npx supabase functions deploy tienda-guardar-layout --project-ref rsmxklkxqsaptchcjszd
```
Expected: deploy OK. NO pasar `--no-verify-jwt` (verify_jwt true se preserva).

- [ ] **Step 4: Verificar el schema desplegado en vivo (MCP)**

Usar MCP Supabase `get_edge_function` para `tienda-guardar-layout` y confirmar que el `editor-schema.ts` embebido tiene `tamano` y NO `forma/ajuste/columnas` en ProductosProps.

- [ ] **Step 5: Build + deploy del storefront**

```bash
cd apps/storefront && npm run build
```
Luego desplegar a Cloudflare Workers con wrangler (config del repo; token de `reference_accesos_aimma`). Capturar el `Version` del deploy.

- [ ] **Step 6: Gate visual con Playwright en aimma-test (industrial_clean)**

Navegar a la storefront de aimma-test (subdominio en `*.tienda.aimma.com.co`) en una página con bloque `productos`, viewport desktop (1440×900). Verificar empíricamente con `getBoundingClientRect` + screenshot (ver `feedback_verificar_layout_navegador`):

1. **Foto cuadrada:** para cada card, `imgBox.width ≈ imgBox.height` (±2px), uniforme entre cards.
2. **Card limpia:** no aparece texto "SKU", ni la fila de stock siempre-visible, ni "Ver producto".
3. **Badge:** en un producto con stock 0 → "Agotado" visible sobre la foto; en uno con stock ≤5 → "Últimas X"; en stock normal → sin badge.
4. **Alineación al header:** el borde derecho de la grilla de productos coincide (±2px) con el borde derecho del cluster del carrito en el header.
5. **Columnas según tamano:** cambiar el tamano en el editor (o data) y confirmar 3/4/5 columnas en escritorio para grande/mediano/pequeno.
6. **Hover:** al pasar el mouse sobre una card con 2ª foto, hace crossfade a la segunda.

- [ ] **Step 7: Redeploy del admin (Easypanel) — Tipo B (Jorge)**

Avisar a Jorge que haga el redeploy del admin en Easypanel para que el control "Tamaño" aparezca en el editor. (No automatizable desde aquí.)

- [ ] **Step 8: Commit de cierre (si quedó algún ajuste del gate)**

```bash
git add -A && git commit -m "fix(productos): ajustes post-gate visual" || echo "sin cambios"
```

---

## Self-Review (cobertura del spec)

- Foto 1:1 fija → Task 3 (aspect-square constante) + tests. ✓
- Selector Tamaño 3/4/5 default mediano → Task 1 (schema) + Task 2 (mapeo) + Task 5 (editor). ✓
- Card sin SKU/CTA → Task 3. ✓
- Badge stock condicional (Agotado/Últimas X, sin "En stock") → Task 3. ✓
- Grilla alineada al header → Task 2 (lg:-mx-4) + Task 6 gate. ✓
- Quitar forma/ajuste por sección → Task 1 (schema) + Task 2 (render) + Task 5 (editor). ✓
- Hover se mantiene → Task 2 (tests) + Task 3 (markup). ✓
- FB/MA/EM card intacta, solo columnas → Task 2 (mapeo) + Task 4 (diff review). ✓
- EF mirror byte-idéntico + sync-test → Task 1. ✓
- Deploy EF + storefront, admin Tipo B → Task 6. ✓
- Gate empírico Playwright → Task 6. ✓

**Fuera de alcance (confirmado en spec):** Fase 1b (foto 1:1 a FB/MA/EM), ajuste por-tienda rellenar/contener, producto_destacado/contenedor (verificar a futuro si reusan ProductCardIC), galería.
```
