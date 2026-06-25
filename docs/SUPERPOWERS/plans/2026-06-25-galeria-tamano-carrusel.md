# Galería: Tamaño + Carrusel real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el bloque Galería: control **Tamaño** (P/M/G) + hacer que **Carrusel** sea un carrusel real manual (scroll-snap, swipe móvil, flechas desktop), retirando Mosaico del editor.

**Architecture:** `Galeria.astro` (4 plantillas vía prefix). `tamano` (schema + EF mirror) mapea a columnas (grilla) o ancho de slide (carrusel), clases Tailwind literales (mediano = clases actuales → cero regresión). Carrusel = flex + `overflow-x-auto` + `snap-x`, flechas con JS inline (scrollBy), ocultas en móvil por CSS. Mosaico se quita del editor; el schema lo tolera (render → grilla).

**Tech Stack:** Astro 5, Zod, Tailwind v4 (clases literales + arbitrary basis), vitest 4, Deno (EF), wrangler, Playwright. Admin JS vanilla.

## Global Constraints
- **Modo TEST.** Default Mediano + layout grid/mosaico → salida byte-idéntica a hoy (cero regresión); solo `layout:'carrusel'` cambia (antes era no-op grilla).
- **Tamaño** `tamano: z.enum(['pequeno','mediano','grande']).default('mediano')` en `GaleriaProps`. `layout` se conserva (`grid|carrusel|mosaico`).
- **Mapeo grilla (lg desktop, móvil 2 col), mediano = actual:**
  - IC/FB: grande `grid-cols-2 md:grid-cols-3 lg:grid-cols-3` · mediano `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` · pequeno `grid-cols-2 md:grid-cols-4 lg:grid-cols-5`
  - MA: grande `grid-cols-2 md:grid-cols-2` · mediano `grid-cols-2 md:grid-cols-3` · pequeno `grid-cols-2 md:grid-cols-4`
  - EM: grande `grid-cols-2 lg:grid-cols-2` · mediano `grid-cols-2 lg:grid-cols-3` · pequeno `grid-cols-2 lg:grid-cols-4`
- **Mapeo carrusel (ancho de slide con asomo):** grande `basis-[78%] md:basis-[48%]` · mediano `basis-[60%] md:basis-[31.5%]` · pequeno `basis-[45%] md:basis-[23.5%]`. Items `snap-start shrink-0`.
- **Carrusel:** `overflow-x-auto snap-x snap-mandatory` + `gap` (Espaciado). Móvil = swipe (sin flechas). Desktop = flechas ‹ › (≥44px) con scrollBy; ocultas vía `@media (pointer:fine) and (min-width:1024px)`. Sin auto-movimiento. Aspecto por plantilla intacto (IC 1:1, FB 3:4, MA/EM 4:5).
- **EF mirror byte-idéntico** (sync-test 04).
- **Mosaico:** retirar de las opciones del editor (`GALERIA_LAYOUT` sin mosaico); schema lo sigue aceptando; render `layout!=='carrusel'` → grilla.
- Sin dependencias nuevas (JS vanilla inline). 4 plantillas.

## Comandos
- Tests: `cd apps/storefront && npx vitest run test/galeria-tamano-carrusel.test.ts` · suite `npx vitest run` · goldens `npx vitest run -u`
- Sync-test: `cd tests/editor && node --import tsx --test 04-ef-schema-sync.test.mjs`
- Re-sync mirror: `cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts`

---

## Task 1: Schema `GaleriaProps.tamano` + mirror EF

**Files:**
- Modify: `packages/database/src/editor-schema.ts` (GaleriaProps)
- Modify: `supabase/functions/tienda-guardar-layout/editor-schema.ts` (cp)
- Test: `tests/editor/04-ef-schema-sync.test.mjs`

- [ ] **Step 1: Editar GaleriaProps**

En `packages/database/src/editor-schema.ts`, en `const GaleriaProps = z.object({ ... })` (tiene `imagenes`, `layout`, `gap`), añadir tras `gap`:

```ts
  // Rediseño 2026-06-25: tamano de las fotos de la galeria (columnas en grilla / ancho de slide
  // en carrusel). Default mediano = comportamiento actual.
  tamano: z.enum(['pequeno', 'mediano', 'grande']).default('mediano'),
```

- [ ] **Step 2: Re-sync mirror**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts`

- [ ] **Step 3: Sync-test**

Run: `cd tests/editor && node --import tsx --test 04-ef-schema-sync.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts
git commit -m "feat(schema): galeria.tamano (pequeno/mediano/grande)"
```

---

## Task 2: Render `Galeria.astro` (tamaño + carrusel real)

**Files:**
- Modify (reescritura): `apps/storefront/src/components/blocks/galeria/Galeria.astro`
- Test: `apps/storefront/test/galeria-tamano-carrusel.test.ts` (CREAR)

**Interfaces:**
- Consumes: `p.tamano`, `p.layout`, `p.gap`, `p.imagenes`.
- Produces: grilla con columnas por tamaño (mediano=actual) o carrusel scroll-snap (`data-gal-carrusel`, items `snap-start`, flechas `data-gal-prev/next`).

- [ ] **Step 1: Escribir el test (FALLA primero)**

Crear `apps/storefront/test/galeria-tamano-carrusel.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Galeria from '../src/components/blocks/galeria/Galeria.astro';

const imgs = [
  { src: 'https://x/1.jpg', alt: 'a' }, { src: 'https://x/2.jpg', alt: 'b' }, { src: 'https://x/3.jpg', alt: 'c' },
];
const sec = (props: any) => makeSection('galeria', { imagenes: imgs, layout: 'grid', gap: 'normal', ...props });
const render = (slug: string, props: any) => renderNormalized(Galeria, sec(props), makeTienda(slug), []);

describe('Galeria · tamano + carrusel', () => {
  test('grilla IC: mediano(default)=lg:grid-cols-4, grande=lg:grid-cols-3, pequeno=lg:grid-cols-5', async () => {
    expect(await render('industrial_clean', {})).toContain('lg:grid-cols-4');
    expect(await render('industrial_clean', { tamano: 'grande' })).toContain('lg:grid-cols-3');
    expect(await render('industrial_clean', { tamano: 'pequeno' })).toContain('lg:grid-cols-5');
  });
  test('grilla NO es carrusel', async () => {
    const html = await render('industrial_clean', {});
    expect(html).not.toContain('data-gal-carrusel');
  });
  test('carrusel: contenedor scroll-snap + items snap-start + flechas', async () => {
    const html = await render('industrial_clean', { layout: 'carrusel' });
    expect(html).toContain('data-gal-carrusel');
    expect(html).toContain('snap-x');
    expect(html).toContain('snap-start');
    expect(html).toContain('data-gal-prev');
    expect(html).toContain('data-gal-next');
  });
  test('carrusel grande: slide basis 48% en desktop', async () => {
    const html = await render('industrial_clean', { layout: 'carrusel', tamano: 'grande' });
    expect(html).toContain('md:basis-[48%]');
  });
  test('mosaico (legacy) renderiza como grilla (sin carrusel)', async () => {
    const html = await render('industrial_clean', { layout: 'mosaico' });
    expect(html).not.toContain('data-gal-carrusel');
    expect(html).toContain('lg:grid-cols-4');
  });
});
```

- [ ] **Step 2: Correr → FALLA**

Run: `cd apps/storefront && npx vitest run test/galeria-tamano-carrusel.test.ts`
Expected: FAIL (no existe carrusel ni tamano todavía).

- [ ] **Step 3: Reescribir `Galeria.astro`**

Reemplazar TODO `apps/storefront/src/components/blocks/galeria/Galeria.astro` por:

```astro
---
// AIMMA · Galeria · UNIFICADO. 4 plantillas. tamano (columnas/slide) + carrusel real manual.
// layout: 'carrusel' = tira scroll-snap (swipe movil, flechas desktop). grid/mosaico -> grilla.
// mediano + grilla = salida historica (cero regresion). Aspecto por plantilla en los <style>.
import type { Section } from '@aimma/database';
import SectionShell from '~/components/blocks/_SectionShell.astro';

interface Props { section: Section; }
const { section } = Astro.props;
const p = (section as Extract<Section, { tipo: 'galeria' }>).props;
const { tienda } = Astro.locals;
const isPreview = Astro.locals?.isPreview;
const plantilla = tienda.plantilla?.slug ?? 'industrial_clean';

const prefix = plantilla === 'fashion_bold' ? 'fb'
  : plantilla === 'minimal_artesanal' ? 'ma'
  : plantilla === 'editorial_magazine' ? 'em'
  : 'ic';

const gapClass = p.gap === 'tight' ? 'gap-2' : p.gap === 'loose' ? 'gap-8' : 'gap-4';
const tamano = ((p as any).tamano ?? 'mediano') as 'pequeno' | 'mediano' | 'grande';
const isCarrusel = p.layout === 'carrusel';

// Columnas de grilla por plantilla y tamano (literales JIT; mediano = clases actuales).
function gridCols(plant: string, t: 'pequeno' | 'mediano' | 'grande'): string {
  if (plant === 'minimal_artesanal') {
    return t === 'grande' ? 'grid-cols-2 md:grid-cols-2'
      : t === 'pequeno' ? 'grid-cols-2 md:grid-cols-4'
      : 'grid-cols-2 md:grid-cols-3';
  }
  if (plant === 'editorial_magazine') {
    return t === 'grande' ? 'grid-cols-2 lg:grid-cols-2'
      : t === 'pequeno' ? 'grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-2 lg:grid-cols-3';
  }
  return t === 'grande' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-3'
    : t === 'pequeno' ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5'
    : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
}
// Ancho de slide en carrusel (asomo de la siguiente). Movil menos visibles. Literales JIT.
function carruselBasis(t: 'pequeno' | 'mediano' | 'grande'): string {
  return t === 'grande' ? 'basis-[78%] md:basis-[48%]'
    : t === 'pequeno' ? 'basis-[45%] md:basis-[23.5%]'
    : 'basis-[60%] md:basis-[31.5%]';
}

const gridPrefixClass = plantilla === 'fashion_bold' ? 'fb-galeria-grid '
  : plantilla === 'minimal_artesanal' ? 'ma-galeria '
  : plantilla === 'editorial_magazine' ? 'em-galeria-grid '
  : '';
const dataField = plantilla === 'industrial_clean' ? 'imagenes' : undefined;
const gridClass = `${gridPrefixClass}grid ${gridCols(plantilla, tamano)} ${gapClass}`;
const itemExtra = isCarrusel ? ` snap-start shrink-0 ${carruselBasis(tamano)}` : '';
---

<SectionShell section={section}>
  {isCarrusel ? (
    <div class="gal-carrusel-wrap relative">
      <div class={`gal-carrusel flex overflow-x-auto snap-x snap-mandatory ${gapClass}`} data-gal-carrusel tabindex="0" role="region" aria-label="Galeria (carrusel)" data-field={isPreview ? dataField : undefined}>
        {p.imagenes.map((img, i) => (
          plantilla === 'editorial_magazine' ? (
            <figure class={`em-galeria-item group${itemExtra}`}>
              <p class="font-body text-[11px] uppercase tracking-[0.18em] text-[var(--ta-color-accent)] font-medium mb-3 tabular-nums">Pieza {String(i + 1).padStart(2, '0')}</p>
              <div class="em-galeria-frame"><img src={img.src} alt={img.alt} loading="lazy" decoding="async" class="w-full h-full object-cover" /></div>
            </figure>
          ) : (
            <figure class={`${prefix}-galeria-item${itemExtra}`}>
              <img src={img.src} alt={img.alt} loading="lazy" decoding="async" class="w-full h-full object-cover" />
            </figure>
          )
        ))}
      </div>
      <button type="button" class="gal-carrusel-nav gal-carrusel-prev" data-gal-prev aria-label="Anterior">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <button type="button" class="gal-carrusel-nav gal-carrusel-next" data-gal-next aria-label="Siguiente">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>
  ) : (
    <div class={gridClass} data-field={isPreview ? dataField : undefined}>
      {p.imagenes.map((img, i) => (
        plantilla === 'editorial_magazine' ? (
          <figure class="em-galeria-item group">
            <p class="font-body text-[11px] uppercase tracking-[0.18em] text-[var(--ta-color-accent)] font-medium mb-3 tabular-nums">Pieza {String(i + 1).padStart(2, '0')}</p>
            <div class="em-galeria-frame"><img src={img.src} alt={img.alt} loading="lazy" decoding="async" class="w-full h-full object-cover" /></div>
          </figure>
        ) : (
          <figure class={`${prefix}-galeria-item`}>
            <img src={img.src} alt={img.alt} loading="lazy" decoding="async" class="w-full h-full object-cover" />
          </figure>
        )
      ))}
    </div>
  )}
</SectionShell>

<style>
  /* ===== industrial_clean ===== */
  .ic-galeria-item { margin: 0; aspect-ratio: 1 / 1; overflow: hidden; border: 1px solid color-mix(in oklab, var(--ta-color-text-base) 8%, transparent); border-radius: 2px; background: color-mix(in oklab, var(--ta-color-text-base) 4%, transparent); }
  .ic-galeria-item img { display: block; transition: transform 300ms ease-out; }
  .ic-galeria-item:hover img { transform: scale(1.04); }
  @media (prefers-reduced-motion: reduce) { .ic-galeria-item img { transition: none; } .ic-galeria-item:hover img { transform: none; } }

  /* ===== fashion_bold ===== */
  .fb-galeria-item { margin: 0; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 0; background: color-mix(in oklab, var(--ta-color-text-base) 6%, transparent); }

  /* ===== minimal_artesanal ===== */
  .ma-galeria-item { margin: 0; aspect-ratio: 4 / 5; overflow: hidden; border-radius: 4px; background: color-mix(in oklab, var(--ta-color-text-base) 4%, transparent); }
  .ma-galeria-item img { display: block; }

  /* ===== editorial_magazine ===== */
  .em-galeria-item { margin: 0; }
  .em-galeria-frame { aspect-ratio: 4 / 5; overflow: hidden; background: color-mix(in oklab, var(--ta-color-text-base) 4%, transparent); }
  .em-galeria-frame img { display: block; transition: transform 700ms cubic-bezier(0.22, 1, 0.36, 1); will-change: transform; }
  .em-galeria-item:hover .em-galeria-frame img { transform: scale(1.04); }
  @media (prefers-reduced-motion: reduce) { .em-galeria-frame img { transition: none; } .em-galeria-item:hover .em-galeria-frame img { transform: none; } }

  /* ===== carrusel (todas las plantillas) ===== */
  .gal-carrusel { scroll-snap-type: x mandatory; scroll-padding-left: 0; -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
  .gal-carrusel > * { scroll-snap-align: start; }
  .gal-carrusel-nav {
    display: none; position: absolute; top: 50%; transform: translateY(-50%);
    width: 2.75rem; height: 2.75rem; align-items: center; justify-content: center;
    border: none; border-radius: 999px; cursor: pointer; z-index: 2;
    background: color-mix(in oklab, var(--ta-color-bg-base) 82%, transparent); color: var(--ta-color-text-base);
    box-shadow: 0 1px 6px rgba(0,0,0,0.15);
  }
  .gal-carrusel-prev { left: 0.5rem; } .gal-carrusel-next { right: 0.5rem; }
  /* Flechas solo en escritorio con puntero fino (en movil = swipe) */
  @media (pointer: fine) and (min-width: 1024px) { .gal-carrusel-nav { display: inline-flex; } }
</style>

<script is:inline>
  (function () {
    document.querySelectorAll('[data-gal-carrusel]').forEach(function (track) {
      var wrap = track.closest('.gal-carrusel-wrap');
      if (!wrap) return;
      function step() { return Math.max(track.clientWidth * 0.8, 120); }
      var prev = wrap.querySelector('[data-gal-prev]');
      var next = wrap.querySelector('[data-gal-next]');
      if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
      if (next) next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
    });
  })();
</script>
```

- [ ] **Step 4: Correr el test → PASA**

Run: `cd apps/storefront && npx vitest run test/galeria-tamano-carrusel.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Regenerar goldens + revisar diff + suite**

Run: `cd apps/storefront && npx vitest run -u`
Expected: PASS. Revisar el diff de `test/__snapshots__/galeria/*` (si existen): los combos de **grilla con tamaño mediano** deben quedar IGUAL (cero cambio); cambian solo (a) combos con tamaño no-mediano (clases de columnas) y (b) combos con `layout:'carrusel'` (ahora estructura de carrusel en vez de grilla). Sin daños fuera de la galería.

- [ ] **Step 6: JIT v4 (clases arbitrarias del carrusel)**

Run: `cd apps/storefront && npm run build >/dev/null 2>&1 && grep -rl "basis-\[48%\]" dist/_astro/*.css >/dev/null && echo "JIT OK basis" ; grep -rl "snap-mandatory" dist/_astro/*.css >/dev/null && echo "JIT OK snap"`
Expected: ambos `JIT OK` (si no aparecen, las clases del carrusel no se generaron).

- [ ] **Step 7: Commit**

```bash
git add apps/storefront/src/components/blocks/galeria/Galeria.astro apps/storefront/test/galeria-tamano-carrusel.test.ts apps/storefront/test/__snapshots__/
git commit -m "feat(galeria): tamano (columnas/slide) + carrusel real manual (scroll-snap)"
```

---

## Task 3: Editor — control Tamaño + Disposición sin Mosaico

**Files:**
- Modify: `iapanel/tienda/admin/views/editor/section-defs.js` (OPTS GALERIA_LAYOUT + bloque galeria)
- Modify: `iapanel/tienda/admin/index.html` (cache-bust section-defs)

- [ ] **Step 1: GALERIA_LAYOUT sin Mosaico**

En `iapanel/tienda/admin/views/editor/section-defs.js`, OPTS: cambiar `GALERIA_LAYOUT` de 3 a 2 opciones:

```js
    GALERIA_LAYOUT: [{ v: 'grid', l: 'Grilla uniforme' }, { v: 'carrusel', l: 'Carrusel horizontal' }],
```

(Se quita `{ v: 'mosaico', l: 'Mosaico' }`. El schema lo sigue aceptando; el render cae a grilla.)

- [ ] **Step 2: Añadir control Tamaño al bloque galeria**

En el bloque `galeria.campos`, tras el campo `layout` (Disposición), insertar:

```js
        { key: 'tamano', control: 'select', label: 'Tamano de las fotos', default: 'mediano', opts: { options: 'TAMANO_PROD' } },
```

(Orden resultante: Disposición, Tamaño, Espaciado, [Apariencia de la sección], Imágenes — `imagenes` ya tiene `after_base:true`.)

- [ ] **Step 3: Cache-bust de section-defs.js en index.html**

En `iapanel/tienda/admin/index.html`, subir `section-defs.js?v=N` en +1 (verificar el N actual y reemplazar).

- [ ] **Step 4: Verificar sintaxis**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && node --check iapanel/tienda/admin/views/editor/section-defs.js && echo SINTAXIS_OK`
Expected: `SINTAXIS_OK`.

- [ ] **Step 5: Commit**

```bash
git add iapanel/tienda/admin/views/editor/section-defs.js iapanel/tienda/admin/index.html
git commit -m "feat(editor): galeria — control Tamano + Disposicion sin Mosaico"
```

---

## Task 4: Deploy + gate empírico

**Files:** ninguno.

- [ ] **Step 1: Typecheck**

Run: `cd apps/storefront && npx astro check 2>&1 | grep -E "Galeria.astro" || echo "sin errores en Galeria.astro"`
Expected: sin errores en Galeria.astro.

- [ ] **Step 2: Deploy EF**

```bash
cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website
SUPABASE_ACCESS_TOKEN="<MANAGEMENT_PAT de reference_accesos_aimma>" npx --yes supabase functions deploy tienda-guardar-layout --project-ref rsmxklkxqsaptchcjszd
```
Expected: "Deployed Functions." Verificar con MCP `get_edge_function` que `GaleriaProps` tiene `tamano`.

- [ ] **Step 3: Build + deploy storefront**

Run: `cd apps/storefront && npm run build && npx wrangler deploy`
Expected: "Current Version ID: ...".

- [ ] **Step 4: Gate Playwright**

Necesita una página de aimma-test con un bloque galería. Si no existe, crearla por SQL (insertar una sección `galeria` con ≥4 imágenes QA-VIS en `personalizaciones.pages.home.sections`) o usar una existente; invalidar KV con `--remote`. Verificar (viewport desktop 1440 y móvil 390):
1. **Grilla + tamaño:** con `tamano` mediano → 4 columnas (IC); cambiar a grande → 3; pequeño → 5 (contar items por fila).
2. **Carrusel desktop:** `layout:'carrusel'` → existe `[data-gal-carrusel]`, las flechas son visibles; click en `[data-gal-next]` → `scrollLeft` aumenta; se ve el "asomo" (un item parcialmente visible al borde).
3. **Carrusel móvil (390px):** las flechas están OCULTAS (`getComputedStyle(nav).display === 'none'`); el track tiene `overflow-x` scrolleable (scrollWidth > clientWidth).
4. Restaurar el estado de aimma-test si se modificó para el gate.

- [ ] **Step 5: Admin Easypanel (Tipo B — Jorge)**

Avisar a Jorge: redeploy del admin para ver el control Tamaño + Disposición sin Mosaico.

- [ ] **Step 6: Commit de cierre (si el gate pidió ajustes)**

```bash
git add -A && git commit -m "fix(galeria): ajustes post-gate" || echo "sin cambios"
```

---

## Self-Review (cobertura del spec)
- Tamaño P/M/G (grilla columnas + carrusel slide), default mediano cero-regresión → Task 1 (schema) + Task 2 (render) + Task 3 (editor). ✓
- Carrusel real: scroll-snap, swipe móvil, flechas desktop (≥44px, ocultas móvil), asomo, sin auto-motion, aspecto por plantilla → Task 2. ✓
- Disposición Grilla/Carrusel; Mosaico fuera del editor, tolerado en schema, render→grilla → Task 2 (render) + Task 3 (opts). ✓
- EF mirror byte-idéntico → Task 1. ✓
- 4 plantillas, sin deps → Task 2. ✓
- Móvil swipe / desktop flechas → Task 2 (CSS media query) + Task 4 gate. ✓

**Fuera de alcance (del spec):** mosaico real, movimiento automático, puntos de paginación, lightbox en el bloque galería.
