# Ajuste de foto por tienda (Rellenar / Contener) — Diseño

**Fecha:** 2026-06-25
**Repo:** aimma-website · `main` (base `3916f4c`)
**Estado:** Diseño APROBADO por Jorge. Pendiente review del spec.
**Contexto de producto:** AIMMA multi-rubro tipo Shopify. Continuación del rediseño de productos ([[project_aimma_productos_rediseno_tamano]]) y Fase 1b (foto 1:1 en las 4 plantillas, commit 3916f4c). Todo TEST.

## Problema

La foto de producto es 1:1 con `object-cover` (recorta para llenar el cuadro). Ideal para moda/calzado/lifestyle, pero para rubros de **packshot sobre fondo** (ferretería, supermercado, bisutería) `object-cover` **recorta los bordes** del producto. Falta una forma de mostrar el producto completo sin recortar, manteniendo la consistencia de la grilla.

## Decisiones (cerradas con Jorge)

1. **Granularidad: por TIENDA (global).** Un solo ajuste para todos los productos de la tienda (coherente con el principio de consistencia; NO por sección ni por producto).
2. **Dos modos:**
   - **Rellenar** = `object-cover` (default, = comportamiento actual). Llena el cuadro 1:1, recorta lo que sobra.
   - **Contener** = `object-contain` + `p-2` + fondo neutro de la tienda (el que ya tiene el wrapper de cada card). Muestra el producto completo sin recortar.
3. **Default: Rellenar.** Tiendas sin el ajuste se ven idénticas a hoy (cero regresión).
4. **Fondo en Contener: theme-aware** — el fondo neutro suave que cada card ya tiene en su wrapper (respeta la paleta; NO blanco fijo). Padding `p-2` para que el producto no toque los bordes.
5. **Alcance: las 4 plantillas** (IC/FB/MA/EM) y, por la arquitectura, **todas las superficies** que renderizan cards (home/bloque productos, búsqueda, categoría, PDP-relacionados, cross-sell del carrito).
6. **Patrón B intacto:** la foto sigue 1:1 (`aspect-square` en wrapper Y en img, `absolute inset-0`, NUNCA `h-full`). Solo cambia `object-fit` (+ padding en contener).

## Arquitectura — token de Tema (no prop-threading)

El storefront ya inyecta los ajustes globales de tienda como **CSS vars en `<html style={themeStyle}>`** (`apps/storefront/src/layouts/Layout.astro`: `--ta-color-*`, `--ta-font-*`). Se extiende ese patrón:

- `themeStyle` agrega **`--ta-foto-fit`** (`cover`|`contain`) y **`--ta-foto-pad`** (`0px`|`0.5rem`) derivadas de `theme.foto_ajuste`.
- Las imgs de producto de las 4 cards usan esas vars en vez de `object-cover` hardcodeado: `[object-fit:var(--ta-foto-fit,cover)]` + `[padding:var(--ta-foto-pad,0px)]`.
- Defaults en la var (`cover`, `0px`) → tiendas sin el ajuste renderizan idéntico a hoy.

**Por qué token y no prop:** cubre las 4 plantillas Y todas las superficies (home/búsqueda/categoría/PDP/carrito) automáticamente, porque todas renderizan las mismas cards bajo el mismo `<html>` tematizado. Cero plomería por grid/card/página. DRY, matchea el patrón de theme-tokens ya existente ([[project_aimma_editor_b_tema_global]]).

## Cambios por archivo (alcance)

### Schema — `packages/database/src/editor-schema.ts` (+ mirror EF byte-idéntico)
`ThemeSchema`: agregar `foto_ajuste: z.enum(['rellenar', 'contener']).optional()`. Re-sync `cp` al EF (sync-test 04). Ausente → el render usa rellenar.

### Storefront render — `apps/storefront/src/layouts/Layout.astro`
- Derivar de `tienda.personalizaciones?.theme?.foto_ajuste`: `fotoFit = contener ? 'contain' : 'cover'`, `fotoPad = contener ? '0.5rem' : '0px'`.
- Agregar a `themeStyle`: `--ta-foto-fit:${fotoFit};--ta-foto-pad:${fotoPad};`.

### Cards (4) — ProductCard{IC,FB,MA,EM}.astro
- En la img principal y la de hover: reemplazar `object-cover` por `[object-fit:var(--ta-foto-fit,cover)] [padding:var(--ta-foto-pad,0px)]` (manteniendo `absolute inset-0 w-full aspect-square` y las transiciones propias). El wrapper ya aporta el fondo neutro.

### Preview del editor (parity)
- El bridge de preview de Tema (el que ya refleja color/tipografía/nav_text_size en vivo) debe setear también `--ta-foto-fit`/`--ta-foto-pad` al cambiar el toggle, para preview en vivo. (Detalle exacto en el plan.)

### Editor (admin) — `iapanel/tienda/admin/views/editor/editor-theme-panel.js`
- Agregar control "Ajuste de las fotos de producto" (2 opciones: Rellenar / Contener) que escribe `editorState.theme.foto_ajuste`, junto a tipografía/nav (mismo patrón que `nav_text_size`).

### Tests
- Unit (render-harness, vía Productos con tienda que trae `personalizaciones.theme.foto_ajuste`): contener → la img incluye `object-fit:var(--ta-foto-fit...` y el `<html>`/style trae `--ta-foto-fit:contain`; rellenar/ausente → `cover`/`0px`. Cubrir las 4 plantillas.
- Goldens: regenerar (cambia la clase de object-fit de las cards a la var-based). Verificar que el diff sea SOLO object-fit/padding.
- JIT v4: confirmar que las clases arbitrarias `[object-fit:var(--ta-foto-fit,cover)]` y `[padding:var(--ta-foto-pad,0px)]` se generan en dist.

### Deploy + gate
- EF `tienda-guardar-layout` (nueva versión, schema mirror).
- Storefront build + wrangler.
- Admin Easypanel redeploy (Tipo B — Jorge) para ver el toggle.
- Gate Playwright en aimma-test: con `theme.foto_ajuste='contener'`, la foto usa object-contain (el producto se ve completo, con fondo neutro y padding); con rellenar/ausente, object-cover full-bleed. Foto sigue 1:1.

## Verificación (gate empírico)
1. Setear `theme.foto_ajuste='contener'` en aimma-test → invalidar KV → Playwright: img con `object-fit:contain`, padding presente, wrapper sigue cuadrado, producto sin recorte. Volver a rellenar → `object-fit:cover`, sin padding.
2. Suite completa verde + sync-test 04.
3. EF en vivo (MCP get_edge_function) con `foto_ajuste` en ThemeSchema.

## Fuera de alcance
- Ajuste de foto por sección o por producto (descartado: rompe consistencia).
- Fondo blanco fijo / fondos personalizados para contener (se usa el neutro de la paleta).
- Cambios al chrome de las cards (nombre/precio/badges intactos).
