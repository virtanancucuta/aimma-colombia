# Productos — Card limpia + selector de Tamaño + grilla más ancha (rediseño 1a)

**Fecha:** 2026-06-25
**Repo:** aimma-website · `main` (base `f2bd7d7`)
**Estado:** Diseño CERRADO con Jorge. Auditado con `/ui-ux-pro-max` + investigación de plataformas. Pendiente review del spec.
**Contexto de producto:** AIMMA es una plataforma **multi-rubro tipo Shopify** (ropa, calzado, bisutería, ferretería, supermercado, cualquier negocio). Las decisiones de diseño priorizan el **denominador común universal**, NO un solo rubro.
**Alcance de plantilla:** los cambios de card y foto 1:1 son **solo `industrial_clean`** (la activa en aimma-test). FB/MA/EM mantienen su diseño actual (Fase 1b futura).
**Modo:** TEST (sin tiendas reales). Deploy = merge a main + redeploys.

## Contexto

Evolución del repensar de la Fase 1a (ver memoria `project_aimma_fase1a_img_primitivo`). En 1a se agregaron controles de imagen **por sección** (forma/ajuste/hover). Jorge decidió que la foto de producto NO debe configurarse por sección (rompe la consistencia de la grilla): debe ser **estándar única**. El control de la sección pasa a ser el **tamaño del producto** (no de la foto). Además se detectó que en escritorio los productos se ven chicos y la grilla está más angosta que el header.

## Fundamento de la auditoría (datos)

- **1:1 cuadrada es el estándar de industria para grillas multi-categoría** (Amazon, Shopify, WooCommerce). La consistencia es crítica; la única excepción es moda pura (3:4). Como AIMMA es multi-rubro, **1:1 es la decisión correcta**.
- **Shopify Dawn (tema default de Shopify) usa 4 columnas en escritorio**, configurable. Valida tener selector y 4 como referencia universal.
- La densidad ideal **varía por rubro**: boutique/joyería = pocas columnas e imágenes grandes; ferretería/supermercado = grilla densa. Por eso el rango va de 3 (espacioso) a 5 (denso), con 4 como default universal.
- Quitar SKU y CTA: ok (estándar). Quitar **todo** el stock: riesgo de conversión → se conserva un badge mínimo solo cuando aplica.

## Decisiones (cerradas con Jorge)

1. **Foto estándar 1:1 (cuadrada)**, `object-cover` full-bleed, fija para toda la tienda. Se **retiran** los controles `forma` y `ajuste` por sección (añadidos en 1a). En `ProductCardIC` el aspect deja de leerse de `section.props` y queda constante `aspect-square`.
   - *Futuro (NO en v1):* un ajuste **por TIENDA** estilo Shopify "rellenar vs contener", útil para rubros de packshot sobre fondo blanco (ferretería/supermercado) donde `object-cover` recorta bordes. Anotado, fuera de alcance.

2. **Selector de Tamaño (3 opciones)** que reemplaza al control `columnas`. Mapea a columnas en **escritorio**; móvil sin cambios (`grid-cols-2`).

   | Tamaño | Columnas PC | Ancho aprox. (contenedor ensanchado) | Para quién |
   |---|---|---|---|
   | **Grande** | 3 | ~384px | boutique ropa/bisutería, look premium |
   | **Mediano** (DEFAULT) | 4 | ~292px | universal (default de Shopify) |
   | **Pequeño** | 5 | ~230px | ferretería/supermercado, catálogo denso |

   - **Default = Mediano (4 columnas).**
   - Móvil: se conserva el comportamiento actual (`grid-cols-2`). No se toca.

3. **Card limpia (`ProductCardIC`):**
   - **Quitar el SKU** (texto `SKU xxx` de la fila superior).
   - **Quitar el indicador de stock siempre-visible** ("En stock" + punto verde por defecto).
   - **CONSERVAR un badge de stock solo cuando aplica**, posicionado **sobre la foto** (no en una fila aparte): "Agotado" cuando `stock_disponible === 0`, y "Últimas X" cuando `stock_disponible > 0 && <= 5` (umbral actual `stockLow`). Estado normal (con stock) → **sin badge** (card limpia). Esto preserva escasez/urgencia y evita que el comprador haga click en un agotado y se entere recién en la PDP.
   - **Quitar el CTA "Ver producto"** (la card completa ya es un `<a>` que abre el producto; el click en la foto ya funciona). Mantener `cursor-pointer` (heredado del `<a>`) + `aria-label={nombre}`.
   - Queda: **foto 1:1** (clickeable) + badge condicional + **nombre** + **precio**.
   - **Hover (segunda foto) SE MANTIENE** (gateado por `hoverSegundaFoto && producto.foto_hover`, con `motion-reduce` igual que hoy).

4. **Grilla más ancha (alinear al header):**
   - Header IC: `max-w-7xl` (80rem) + `px-8` (32px/lado).
   - Sección productos hoy: `block-inner--contenido` (80rem) + `padding 3rem` (48px/lado).
   - Mismo ancho máximo, pero productos está 16px más adentro por lado → el carrito queda más a la derecha que el borde del producto.
   - **Fix:** la sección productos usa 32px/lado en escritorio (igual que el header). Alcance: **solo la sección productos** (blast radius mínimo), NO cambio global de `.block-inner`.

## Cambios por archivo (alcance)

### Schema — `packages/database/src/editor-schema.ts` (+ mirror EF byte-idéntico `supabase/functions/tienda-guardar-layout/editor-schema.ts`)
`ProductosProps`:
- **Eliminar** `forma` y `ajuste` (añadidos en 1a).
- **Reemplazar** `columnas: union('auto'|2|3|4)` por `tamano: z.enum(['pequeno','mediano','grande']).default('mediano')`.
- **Conservar** `hover: z.enum(['heredar','on','off'])`, `categoria_id`, `limite`, `orden`, `mostrar_precio`.
- Mantener sync-test 04 (mirror byte-idéntico) verde.

> Compatibilidad (TEST): secciones guardadas con `columnas`/`forma`/`ajuste` quedan obsoletas; Zod las stripea al guardar. No hay tiendas reales, solo QA-VIS. Aceptable.

### Render columnas — `apps/storefront/src/components/blocks/productos/Productos.astro`
- `colsFor` mapea **por `tamano`** en `industrial_clean`: `grande→3`, `mediano→4`, `pequeno→5` columnas en `lg`; móvil `grid-cols-2`. (Clases literales para JIT v4: `lg:grid-cols-3/4/5`.)
- FB/MA/EM: mapear `tamano` a su comportamiento de columnas **actual** para que su salida visual NO cambie (goldens FB/MA/EM intactos). Mapear `tamano` → el column-count default previo de cada uno.
- Quitar el cálculo y paso de `forma`/`fit` (ya no existen). Mantener `hoverSegundaFoto`.
- Aplicar el **ensanchado** a la sección productos (32px/lado en escritorio, alineado al header). Mecanismo: clase modificadora en el wrapper de la sección productos; NO tocar `.block-inner` global.

### Card — `apps/storefront/src/components/templates/industrial_clean/ProductCardIC.astro`
- Quitar la fila superior (SKU + indicador de stock siempre-visible).
- Añadir **badge condicional sobre la foto**: "Agotado" (`sinStock`) / "Últimas X" (`stockLow`). Estilo discreto, legible, con contraste suficiente (regla a11y 4.5:1). Sin badge en estado normal.
- Quitar el bloque CTA "Ver producto".
- Aspect fijo `aspect-square` en wrapper Y en `<img>` (patrón B: nunca `h-full`). `object-cover` fijo.
- Quitar props `forma`/`fit`. Conservar `hoverSegundaFoto` + overlay de hover (mismo `aspect-square`).
- Conservar nombre (h3) + precio. Revisar que el CSS `mostrar_precio=false` (`.ic-productos--sin-precio .mt-2.items-baseline`) siga válido.

### Editor (admin) — controles de la sección productos
- Quitar selects de FORMA y AJUSTE (y la nota guía dinámica de 1a si aplica).
- Cambiar el control de `columnas` por **Tamaño** (Pequeño / Mediano / Grande), default Mediano.
- Conservar control de Hover.

### Tests
- Reescribir/ajustar `fase1a-img.test.ts` → cubrir: aspect fijo 1:1, ausencia de SKU/CTA/fila-stock, presencia del badge solo cuando `sinStock`/`stockLow`, mapeo tamano→columnas (3/4/5), hover intacto.
- Regenerar goldens IC afectados (card sin SKU/CTA, 1:1, badge condicional). **0 cambios** en goldens FB/MA/EM (verificar).
- Verificar JIT v4: que `aspect-square`, `lg:grid-cols-3/4/5` se generen en dist.

### Deploy
- EF `tienda-guardar-layout` (nueva versión) con el schema mirror actualizado (CLI `npx supabase functions deploy`, Management PAT como `SUPABASE_ACCESS_TOKEN`, `verify_jwt true`).
- Storefront: build + wrangler deploy.
- Admin (editor): redeploy Easypanel (Tipo B — requiere a Jorge).

## Verificación (gate empírico, antes de declarar listo)
1. Playwright en aimma-test (QA-VIS-1..4) en `industrial_clean`:
   - Foto cuadrada uniforme (imgBox cuadrado, igual en los 4 productos sin importar proporción original).
   - Sin SKU, sin fila de stock siempre-visible, sin "Ver producto".
   - Badge "Agotado" visible en un producto sin stock; "Últimas X" en uno con stock ≤5; nada en stock normal.
   - Hover cambia a 2ª foto donde existe.
   - Borde derecho de la grilla alineado con el carrito del header (mismo right edge, ±2px).
   - Tamaño Grande=3 / Mediano=4 / Pequeño=5 columnas en escritorio.
2. Suite de tests verde + sync-test 04 verde.
3. EF leído en vivo (MCP `get_edge_function`) confirma el schema desplegado.

## Fuera de alcance (después)
- Fase 1b: replicar foto estándar 1:1 a FB/MA/EM (hoy mantienen su diseño).
- Ajuste por TIENDA "rellenar vs contener" (para rubros packshot).
- producto_destacado + producto dentro de contenedor: confirmar en el plan si reusan ProductCardIC/hover; si NO, replicar la card limpia ahí.
- galería.
