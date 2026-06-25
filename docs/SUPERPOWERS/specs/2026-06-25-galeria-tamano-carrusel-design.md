# Galería: Tamaño + Carrusel real manual — Diseño

**Fecha:** 2026-06-25
**Repo:** aimma-website · `main` (base `f9ae9db`)
**Estado:** Diseño APROBADO por Jorge. Pendiente review del spec.
**Contexto:** AIMMA multi-rubro tipo Shopify. El bloque **Galería** (`Galeria.astro`, 4 plantillas vía prefix) hoy: imágenes en grilla responsive con columnas FIJAS, `gap` (Espaciado) y un control `Disposición` (Grilla/Carrusel/Mosaico) que el storefront **IGNORA** (carrusel y mosaico colapsan a la misma grilla — opción que engaña). Continúa el hilo de productos (ver [[project_aimma_galeria_producto]] para la galería de PDP, que es OTRA cosa: esto es el bloque de sección). Todo TEST.

## Objetivo
Cerrar el bloque Galería con: (1) control **Tamaño** (P/M/G) como en productos, y (2) hacer que **Carrusel** sea un carrusel **real, manual** (desliza el usuario, sin auto-movimiento), eliminando del editor la opción Mosaico que no hace nada.

## Decisiones (cerradas con Jorge)

### 1. Tamaño (Pequeño / Mediano / Grande) — default Mediano
Default Mediano = comportamiento actual (cero regresión).
- **En Grilla:** nº de columnas en escritorio (móvil 2):
  - IC/FB: Grande 3 · Mediano 4 (actual) · Pequeño 5.
  - MA/EM: Grande 2 · Mediano 3 (actual) · Pequeño 4.
- **En Carrusel:** ancho de cada slide = cuántas fotos se ven a la vez, con "asomo" de la siguiente:
  - Escritorio: Grande ≈2 · Mediano ≈3 · Pequeño ≈4 visibles.
  - Móvil: Grande ≈1 · Mediano ≈1.5 · Pequeño ≈2 visibles (siempre con asomo).

### 2. Carrusel real manual
- Tira horizontal: `overflow-x:auto` + `scroll-snap-type:x mandatory`; cada foto `scroll-snap-align:start`. **Sin movimiento automático** (lo controla el usuario) → cero problema de `prefers-reduced-motion`.
- **Móvil:** swipe nativo con el dedo. **Sin flechas** (redundantes, tapan la foto).
- **Desktop:** flechas **‹ ›** (≥44px) que hacen `scrollBy` (un "página" de slides); también rueda/teclado (el contenedor es focusable). Las flechas se **ocultan en táctil/angosto** vía media query (`@media (pointer:fine) and (min-width:1024px)` o equivalente) y aparecen solo en escritorio.
- **"Asomo"** de la siguiente imagen en ambos (el ancho de slide < 100%/N) como afordancia de scroll.
- `Espaciado` (gap) = separación entre slides. Se respeta el **aspecto por plantilla** (IC 1:1, FB 3:4, MA/EM 4:5).
- **A11y:** contenedor `role="region"` `aria-label="Galería (carrusel)"`, `tabindex="0"` (scroll por teclado), flechas con `aria-label`. JS vanilla inline mínimo (solo para las flechas → scrollBy); el swipe/scroll es nativo del navegador.
- (Deferido: puntos de paginación.)

### 3. Disposición: Grilla / Carrusel (se retira Mosaico)
- El editor ofrece solo **Grilla** y **Carrusel** (se saca Mosaico, que hoy no hace nada).
- **Robustez:** el schema `layout` SIGUE tolerando `'mosaico'` (no se rompe data vieja); en el render, `mosaico` → grilla (fallback). Solo se quita de las **opciones del editor**.

## Arquitectura / cambios por archivo
- **Schema** `packages/database/src/editor-schema.ts` (+ EF mirror byte-idéntico): `GaleriaProps` gana `tamano: z.enum(['pequeno','mediano','grande']).default('mediano')`. `layout` se conserva igual (`grid|carrusel|mosaico`).
- **Render** `apps/storefront/src/components/blocks/galeria/Galeria.astro`:
  - Mapear `tamano` → clases de columnas (grid) LITERALES por plantilla (mediano = clases actuales).
  - Implementar `layout === 'carrusel'`: contenedor scroll-snap horizontal + items con ancho por `tamano` + asomo + flechas (desktop) + script inline de scrollBy. `layout` grid/mosaico → la grilla (con el tamaño aplicado).
  - Respetar `gap` y el aspecto por plantilla en ambos modos.
- **Editor** `iapanel/tienda/admin/views/editor/section-defs.js`: bloque galería → agregar control **Tamaño** (`select`, default mediano, opts `TAMANO_PROD`); cambiar opciones de Disposición a solo Grilla/Carrusel (nuevo OPTS, p.ej. `GALERIA_LAYOUT` sin mosaico, o un opts dedicado). Mantener el orden con `after_base` ya aplicado (Imágenes al final).
- **Cache-bust** admin (`index.html`) para section-defs.js.

## Testing
- **Unit** (`apps/storefront/test/galeria-tamano-carrusel.test.ts`, CREAR; usa `renderNormalized`/`makeSection('galeria', props)`):
  - Grilla: con `tamano` mediano/grande/pequeño la grilla incluye las clases `lg:grid-cols-*` esperadas por plantilla.
  - Carrusel: con `layout:'carrusel'` el HTML incluye el contenedor scroll-snap (clase/markers) + las flechas; con grilla NO.
  - `mosaico` (legacy) → renderiza como grilla (sin crash).
- **Goldens:** si el bloque galería tiene snapshots, regenerar y verificar que el diff sea el esperado (tamaño/carrusel), no daños colaterales.
- **Gate Playwright** en aimma-test (una página con bloque galería; crear/usar una de prueba):
  - Grilla + tamaño: nº de columnas correcto por tamaño en escritorio.
  - Carrusel desktop: las flechas hacen scroll (scrollLeft cambia); se ve el "asomo".
  - Carrusel móvil (viewport angosto): sin flechas visibles; el contenedor es scrolleable horizontalmente (scroll-snap).

## Verificación (gate empírico)
1. Playwright: medir columnas por tamaño (grilla); en carrusel, click de flecha → `scrollLeft` aumenta y vuelve; en viewport móvil las flechas están ocultas y el overflow-x es scrolleable.
2. Suite storefront verde + sync-test 04.
3. EF desplegado con `tamano` en GaleriaProps (MCP get_edge_function). Storefront wrangler. Admin Easypanel = Tipo B (Jorge).

## Fuera de alcance
- Mosaico real (varied-size masonry) — se retira la opción; no se implementa.
- Movimiento automático / marquee (descartado por Jorge).
- Puntos de paginación del carrusel.
- Lightbox/zoom en el bloque galería (eso vive en la galería de PDP, ya hecho).
