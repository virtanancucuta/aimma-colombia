# Fase A — Segunda foto de producto al hover (toggle por tienda)

Fecha: 2026-06-24 · Branch: `feat/hover-segunda-foto` · Estado: diseño aprobado (arquitecto: Jorge)

## Objetivo

En la card de producto del storefront, al pasar el mouse hacer fade a la segunda foto
del producto. La segunda foto = primer elemento válido de `fotos_galeria` distinto de
`foto_principal`. Controlado por un toggle por tienda (`hover_segunda_foto`, default ON),
replicando el patrón end-to-end de `mostrar_buscador_header`. **Cero JavaScript** (solo CSS).

Contexto: no hay tiendas en vivo. No se preserva byte-identidad de producción, pero los
snapshots se actualizan deliberadamente.

## Evidencia verificada (discovery)

- `fotos_galeria` existe en `productos`, es `jsonb` array de strings (`DEFAULT '[]'`), ya
  usado en `pages/p/[slug].astro`.
- `getProductosPorTienda` (catalogo.ts) selecciona `foto_principal_url` y normaliza vía
  `normalizarProducto` (compartido).
- `normalizarProducto` es compartido por `getProductosPorTienda` Y `getProductoPorId`
  (producto_destacado). `buscarProductos` mapea inline aparte (RPC). `getProductoPorSlug`
  (PDP) usa `select('*')` pero NO pasa por `normalizarProducto`.
- Patrón `mostrar_buscador_header` mapeado end-to-end: columna en `tiendas`
  (`boolean DEFAULT true NOT NULL`), `admin.js` select explícito (no `*`),
  `configuracion.js` (render + read + patch), `Header.astro` lee `!== false` de
  `Astro.locals.tienda`, storefront recibe la tienda vía `select('*')` en `tenant.ts`
  (cache KV 60s TTL).
- Dos rutas instancian las cards: `Productos.astro` (bloque del editor, cubierto por el
  golden) y `ProductGrid.astro → ProductGrid{IC,FB,MA,EM}`. Ambas leen `tienda` de
  `Astro.locals`.
- Cards: IC usa `object-contain p-4`; FB/MA/EM usan `object-cover` (distintos aspect y
  duraciones; MA y EM ya traen hover propio en la imagen primaria). Las 4 cards son
  `<article class="group ...">`.
- Tailwind v4 (CSS-first, sin config file) → variants `group-hover`, `group-focus-within`,
  `motion-reduce` disponibles; se escanean desde clases literales.

## Decisiones de diseño (aprobadas)

### Decisión A — `foto_hover` en `normalizarProducto`, sin tocar producto_destacado
- Nuevo campo `foto_hover: string | null` en `ProductoListItem`.
- Se computa dentro de `normalizarProducto`: **guard `Array.isArray(p.fotos_galeria)`**
  antes de tomar `[0]` (en `getProductoPorId` el campo llega `undefined`, no `[]` → debe
  degradar limpio sin reventar). `foto_hover` = primer elemento de `fotos_galeria` distinto
  de `foto_principal`; si no hay, `null`.
- `fotos_galeria` se agrega al `.select(...)` **solo de `getProductosPorTienda`**.
- `getProductoPorId` (producto_destacado) NO se toca → `foto_hover` queda `null`.
- `buscarProductos` agrega `foto_hover: null` (cumple el tipo; el buscador no hace hover).

### Decisión B — leer el flag en los 2 dispatchers, prop opcional default false
- `hover_segunda_foto !== false` se lee en `Productos.astro` y en `ProductGrid.astro`
  (espeja cómo `Header.astro` lee `mostrar_buscador_header`).
- Se threadea como prop `hoverSegundaFoto: boolean` hacia `ProductGrid{X}` → `ProductCard{X}`.
- En `ProductCard{X}` es **prop OPCIONAL con default `false`** → cualquier caller no tocado
  (producto_destacado, ficha de producto, vista rápida, upsell) queda byte-idéntico.

## Render de la segunda imagen (×4)

`<OptimizedImage>` superpuesta (`absolute inset-0`), espejando el object-fit/padding de cada
plantilla. Solo se renderiza si `hoverSegundaFoto === true && producto.foto_hover`.

- `opacity-0` → `group-hover:opacity-100 group-focus-within:opacity-100`, con
  `motion-reduce:transition-none` (respeta `prefers-reduced-motion`). Cero JS.
- Va **antes** de los badges/overlays en el DOM (para que queden encima).
- **`alt=""`** (decorativa, mismo producto → no duplica anuncio del lector de pantalla).
- **`loading="lazy"`** (NO eager: no duplicar el payload inicial por una interacción que
  muchos no disparan).
- **Sin `transitionName`** (evita colisión de `view-transition-name` con la primaria).

Clases por plantilla (mirror de la primaria):
- IC: `object-contain p-4`, duración 300ms.
- FB: `object-cover`, 300ms.
- MA: `object-cover`, 700ms ease-out.
- EM: `object-cover`, 700ms cubic-bezier(0.22,1,0.36,1).

## Toggle por tienda

- **Migración nueva**: `ALTER TABLE public.tiendas ADD COLUMN hover_segunda_foto boolean DEFAULT true NOT NULL;`
- `configuracion.js`: nuevo `ta-field` checkbox `cfg-hover-segunda-foto` junto al del buscador
  (render + read + patch).
- `admin.js`: agregar `hover_segunda_foto` a la lista explícita de columnas del `.select`.
- Storefront: fluye solo por `select('*')` de `tenant.ts`.

## Tests

- `PRODUCTOS_FIXTURE` actual (sin galería) **queda igual** → los 24 snapshots existentes
  siguen byte-idénticos (sin galería ⇒ sin segunda imagen ⇒ markup sin cambios).
- Agregar: fixture de producto con `fotos_galeria`, parámetro de hover a `makeTienda`, y
  casos nuevos toggle ON (hace swap) y toggle OFF (no). Generar snapshots nuevos con `-u`.

## Protocolo de despliegue

- La migración se escribe como archivo (queda en repo siempre).
- **Aplicar al Supabase de test (`rsmxklkxqsaptchcjszd`) SOLO tras review de código + OK
  explícito de Jorge.** "Aplicar" es acción de deploy = decisión de Jorge, no de CC.
- **Recordatorio de merge**: el toggle vive en `iapanel` (Configuración). Easypanel sirve
  `main` → no aparece en el editor en vivo mientras sea branch-only. Tenerlo presente para
  el merge (los cambios de admin deben llegar a main).

## Archivos tocados (previsto)

1. `apps/storefront/src/lib/catalogo.ts` — tipo + `foto_hover` + select.
2. `supabase/migrations/<ts>_hover_segunda_foto.sql` — columna nueva.
3. `iapanel/tienda/admin/views/configuracion.js` — toggle (render/read/patch).
4. `iapanel/tienda/admin/admin.js` — columna en el select explícito.
5. `apps/storefront/src/components/blocks/productos/Productos.astro` — lee flag + prop.
6. `apps/storefront/src/components/ProductGrid.astro` — lee flag + prop.
7. `apps/storefront/src/components/templates/*/ProductGrid{IC,FB,MA,EM}.astro` — threadea prop.
8. `apps/storefront/src/components/templates/*/ProductCard{IC,FB,MA,EM}.astro` — segunda imagen.
9. `apps/storefront/test/helpers/render-harness.ts` — fixture + makeTienda param.
10. `apps/storefront/test/productos.golden.test.ts` — casos nuevos + snapshots.
