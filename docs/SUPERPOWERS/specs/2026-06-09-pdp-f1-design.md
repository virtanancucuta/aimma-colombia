# F1 — PDP real ×4 (página de producto) · Design + Plan

**Fecha:** 2026-06-09 · **Fase F** (página de producto, target KAYBU). F1 = el PDP. F2 = pulir carrito/checkout ×4. F3 guía de tallas, F4 reseñas, F5 editorial del PDP (después).

## Objetivo
Subir `/p/[slug]` del **layout genérico actual** al estándar **×4 per-template** (ic/fb/ma/em), con la anatomía KAYBU + el **SELECTOR DE VARIANTE stock-aware** (la pieza nueva/interactiva, foco) + **add-to-cart** al carrito localStorage EXISTENTE. F1 SOLO: UI del PDP ×4 + selector + wiring add-to-cart. Pulir las páginas carrito/checkout ×4 = F2 (OK que se vean genéricas hasta entonces).

## Guardrails (proteger lo construido — NO tocar)
- **NO** toca la EF `tienda-crear-pedido`, NI la reserva atómica de stock (campo `reservado`), NI los pedidos por-confirmar.
- La **reserva/descuento de stock sigue en el CHECKOUT (la EF)**, no en add-to-cart. add-to-cart = solo carrito localStorage, cero impacto en stock.
- El PDP solo **LEE** disponibilidad (`stock − reservado`) para mostrar agotado/disponible; no cambia la lógica de reserva.
- add-to-cart escribe en el **MISMO esquema** del carrito que el checkout ya lee — NO cambiar el esquema.
- Si para F1 hiciera falta tocar EF / reserva / esquema del carrito → **PARAR y avisar**.

## Hallazgo (nunca-asumir) — esquema del carrito + inconsistencia entre readers
El ítem del carrito localStorage (`aimma_cart_<hostname>`) lo leen DOS lugares con campos DISTINTOS:
- **checkout.astro** (build del payload a la EF): `it.producto_id || it.id`, `it.variante_id || null`, `it.cantidad`; display `it.nombre`, `it.color`, `it.talla`, `it.precio`.
- **carrito.astro** (display): `it.nombre`, `it.variante` (string), `it.cantidad`, `it.precio`.

→ **add-to-cart escribe el SUPERSET** (satisface a ambos, sin tocar ningún reader):
```js
{
  producto_id,        // checkout: it.producto_id || it.id  (la EF reserva por este id)
  variante_id|null,   // checkout: it.variante_id || null
  sku,                // referencia (opcional, util)
  nombre,             // ambos display
  color|null, talla|null, // checkout display
  variante,           // carrito.astro display (ej. "Rojo / M")  -- string derivado
  cantidad, precio,   // ambos (precio = unitario, precio_override ?? base)
}
```
La inconsistencia carrito↔checkout (variante vs color/talla) se RESUELVE recién al pulir el carrito en **F2**; F1 solo garantiza que el ítem tenga lo que ambos leen.

## Arquitectura (mismo molde que Header/ProductGrid)
- **`/p/[slug].astro`**: data-fetch (`getProductoPorSlug` → producto + `producto_variantes(*)` + `categoria_id`) + relacionados (`getProductosPorTienda({categoriaId, limit})` − excluir el actual − ya tenant-scoped) + cálculo galería/precio/disponibilidad + **serializar variantes a JSON inline** para el cliente → dispatch a `<ProductDetail>`.
- **`ProductDetail.astro`** (dispatcher, como `Header.astro`) → **`ProductDetailIC/FB/MA/EM`** (4 nuevos). Cada uno = anatomía KAYBU en el tono de su plantilla.
- **VariantSelector**: JS de cliente COMPARTIDO (un `<script is:inline>`), opera sobre **data-hooks** que los 4 PDP emiten → comportamiento UNIFICADO; estilo (swatches/chips) per-template via clases `.{ic,fb,ma,em}-pdp-*`.
- **add-to-cart**: el mismo script escribe el ítem superset al carrito localStorage.
- **Relacionados**: `ProductGrid` reusado (per-template).

## Anatomía KAYBU (cada ProductDetailX)
- **Galería** (col. izq): imagen principal grande + thumbs (foto_principal + fotos_galeria); la principal **cambia a `foto_color_url`** al elegir color (JS).
- **Info** (col. der): breadcrumb, título, **precio** (+ promo tachado; `precio_override` por variante vía JS), **SELECTOR DE VARIANTE**, **cantidad** (respeta stock de la variante), **stock/sku**, **CTA add-to-cart** (primario) + **"Comprar ya por WhatsApp"** (secundario, 1 ítem = la variante elegida), descripción corta.
- **Abajo**: descripción completa (plana, como hoy, bien maquetada ×4) + **relacionados**.

## SELECTOR DE VARIANTE (foco del diseño)
**Datos al cliente** (JSON inline, tenant = el producto): por variante `{id, color, talla, sku, stock, reservado, foto_color_url, precio_override}`; `disponible = max(0, stock − reservado)`. Ejes: `producto.variante_tipo_1/2` (ej. "Color"/"Talla").
**Render** (SSR, por eje):
- Color → **swatches** (botón con `foto_color_url` de fondo, o chip con el nombre si no hay foto; `aria-pressed`).
- Talla → **chips** (botón con la talla).
- 1 solo eje → solo ese. 0 variantes / sin axes → producto simple (sin selector, add-to-cart directo).
**Interacción (JS)**:
1. Estado `{colorSel, tallaSel}`. Al cambiar → resolver la fila variante que matchea (`color===colorSel && talla===tallaSel`, contemplando ejes ausentes).
2. Mostrar: disponibilidad de esa variante (disponible/agotado), **precio** (`precio_override ?? precioBase`), y **swap de la imagen principal** a `foto_color_url` (si el color tiene).
3. **Stock-aware**: combinación con `disponible===0` o inexistente → swatch/chip **deshabilitado/tachado**; add-to-cart **disabled** hasta combinación válida con stock.
4. **Cantidad**: input/stepper, `max = disponible` de la variante elegida; clamp.
5. **add-to-cart**: escribe el ítem superset → confirmación (toast/"agregado") → opción ir al carrito.
**DEGRADACIÓN sin-JS** (la página sigue vendiendo): el SSR renderiza la **lista read-only de variantes** (como hoy: "S — 2 disponibles…") + el **botón WhatsApp-directo** (funciona sin JS). El selector interactivo + add-to-cart los **activa el JS**; sin JS el add-to-cart queda oculto y WhatsApp es el camino. (Progressive enhancement: SSR = baseline funcional, JS = upgrade.)

## Galería
`foto_principal_url` + `fotos_galeria` (thumbs), como hoy. JS: al elegir color con `foto_color_url`, swap del `src` de la principal. Zoom/carrusel = pulido opcional, fuera de F1.

## Relacionados
`getProductosPorTienda(supabase, tienda.id, { categoriaId: producto.categoria_id, limit: 8 })` − filtrar el producto actual − ya tenant-scoped. Render con `ProductGrid` (per-template). 0 resultados → ocultar la sección.

## Estilo per-template
Cada `ProductDetailX` sigue el tono de su Header/Card: IC swiss limpio, FB streetwear uppercase/edge, MA editorial serif italic, EM magazine. El VariantSelector: comportamiento unificado (data-hooks) + estilo por prefijo. data-field NO aplica (el PDP no es editable en F1; editorial = F5).

## Gate F1 (tras tu OK del plan; build → este gate)
- **byte-compare CARACTERIZADO del PDP ×4**: delta = solo reglas nuevas (`.{ic,fb,ma,em}-pdp-*` / `.pdp-*`), **0 reglas existentes tocadas**. `/p/[slug]` es **ruta VIVA** → importa (+ chequeo visual).
- El **JS del selector no rompe SSR** ni otras páginas (script scoped al PDP; el resto del sitio no cambia).
- **no-JS degrada** bien (lista read-only + WhatsApp venden).
- **hotfix (14) intacto**; **tenant-scoping** (relacionados + variantes propias); suites/guards verdes (+ test del selector en jsdom).
- deploy storefront + **chequeo VISUAL de Jorge** (×4) — /p es viva.

## Plan por tareas (build tras aprobación)
- **T1 — data + dispatcher**: `/p/[slug]` fetch (producto + variantes + categoria_id + relacionados) + serializar variantes + `<ProductDetail>` dispatcher.
- **T2 — 4 `ProductDetailX`**: anatomía KAYBU, estilo per-template, data-hooks para el selector; **SSR baseline** = lista read-only de variantes + WhatsApp (degradación).
- **T3 — VariantSelector JS compartido**: resolución stock-aware, swap de imagen, precio (override), disabled/tachado, cantidad clamp. Test jsdom de la resolución.
- **T4 — add-to-cart**: escribe el ítem superset al carrito localStorage existente + "Comprar ya WhatsApp" (1 ítem) + toast. (NO toca carrito.astro/checkout.astro/EF.)
- **T5 — relacionados**: ProductGrid por categoría (excluir self).
- **T6 — golden ×4 (SSR baseline) + test selector + byte-compare A5 + suites**.
- **T7 — build + deploy storefront + visual de Jorge** (×4, /p viva).

## Decisiones a confirmar (review)
1. **Esquema superset del carrito** (incluye `variante` string para carrito.astro + `color`/`talla` para checkout): confirmás que F1 NO toca los readers (la inconsistencia se limpia en F2). ✔/cambios.
2. **Producto sin variantes** (axes vacíos) → sin selector, add-to-cart directo (qty + `producto_id`, `variante_id: null`). OK.
3. **"Comprar ya por WhatsApp"** = 1 ítem (la variante elegida), prefill wa.me como hoy pero con la variante. OK.
4. **Producto simple sin variantes**: ¿se puede add-to-cart con `variante_id: null`? (la EF acepta `variante_id || null`). Asumo sí.
