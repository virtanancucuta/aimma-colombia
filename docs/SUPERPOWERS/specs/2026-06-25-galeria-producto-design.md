# Galería de producto (PDP) — mejora: foto_ajuste + lightbox + miniatura activa — Diseño

**Fecha:** 2026-06-25
**Repo:** aimma-website · `main` (base `80632bd`)
**Estado:** Diseño APROBADO por Jorge. Pendiente review del spec.
**Contexto:** AIMMA multi-rubro tipo Shopify. La PDP ya tiene una galería básica (`ProductGallery.astro`, compartida por las 4 plantillas vía prefix): imagen principal 1:1 + miniaturas; click en miniatura swapea la principal; el `VariantSelector` swapea la principal a `foto_color_url` al elegir color. Continúa el hilo de productos ([[project_aimma_foto_ajuste_tienda]], [[project_aimma_productos_rediseno_tamano]]). Todo TEST.

## Problema / objetivo

La galería actual: (a) usa `object-fit:cover` fijo → NO respeta el ajuste por-tienda Rellenar/Contener (la ficha recorta aunque la grilla esté en Contener); (b) no tiene zoom (estándar e-commerce para decidir compra); (c) tiene estilo de "miniatura activa" en CSS pero el JS no lo prende. Se mejora el componente compartido (aplica a las 4 plantillas).

## Decisiones (cerradas con Jorge)

### 1. Respetar foto_ajuste en la PDP (consistencia)
- `.pgal__main` y `.pgal__thumb img`: `object-fit:cover` → `object-fit:var(--ta-foto-fit,cover)` + `padding:var(--ta-foto-pad,0px)`.
- Las vars ya las emite `Layout.astro` en `<html>` (también en la PDP). Default ausente → cover/0px = byte-idéntico a hoy.
- El fondo neutro en modo contener lo aporta el `.pgal__main-wrap` (ya tiene `background: color-mix(... text-base 4% ...)`).

### 2. Lightbox (zoom)
- **Trigger:** click en la imagen principal. Affordance: `cursor:zoom-in` + un ícono SVG de lupa discreto (esquina). El thumb-swap (click en miniatura) NO abre el lightbox; solo la principal.
- **Overlay:** a pantalla completa, scrim oscuro (`rgba(0,0,0,~0.9)`), imagen grande centrada con **`object-fit:contain` SIEMPRE** (el zoom muestra el producto completo sin recortar, independiente del foto_ajuste de la tienda).
- **Navegación:** botones prev/siguiente (desktop) + swipe horizontal (móvil) que recorren `pdp.galeria`. Contador "N/total". El lightbox abre en la imagen **vigente** (lee el `src` actual de `[data-pdp-main-img]`, que el VariantSelector pudo cambiar) y ubica su índice en `galeria`; si el src no está en galeria (foto de color), abre esa imagen sola.
- **Cerrar:** botón X, tecla `Esc`, o click en el scrim (no en la imagen).
- **Pinch-to-zoom móvil:** nativo del navegador sobre la imagen (no se bloquea el gesto).
- **A11y:** overlay `role="dialog" aria-modal="true"` con `aria-label`; foco se mueve al overlay al abrir y queda **atrapado** (Tab cicla dentro); `Esc` cierra; flechas izquierda/derecha navegan; al cerrar, el foco vuelve al trigger. Todos los botones ≥44×44px, gap ≥8px. `prefers-reduced-motion` respetado en transiciones.
- **Markup:** un solo overlay renderizado por página (oculto con `hidden`/`display:none`), reutilizado para cualquier imagen. JS vanilla **inline** (sin dependencias nuevas, igual patrón que el resto).

### 3. Miniatura activa + teclado
- JS marca `aria-current="true"` en la miniatura activa: inicial = la primera; se actualiza al click de miniatura Y cuando el VariantSelector cambia la principal (si el nuevo src coincide con una miniatura). El CSS ya estiliza `[aria-current="true"]` (borde primary).
- Teclado: las miniaturas son `<button>` (ya lo son) → foco con Tab + activación con Enter/Espacio (nativo). Flechas ←/→ mueven entre miniaturas (opcional, roving tabindex) — incluir si es simple; si no, Tab basta.

### Alcance
- Las **4 plantillas** (componente compartido `ProductGallery.astro`). El lightbox usa tokens `--ta-color-*` para verse bien con cualquier paleta.
- Sin tocar `VariantSelector` salvo lo mínimo para que el cambio de color actualice la miniatura activa (si requiere un hook; preferible que ProductGallery observe el cambio de `src` del main vía MutationObserver para NO acoplar con VariantSelector).

## Fuera de alcance (deferido)
- Carrusel deslizable de miniaturas en móvil (hoy grid de 5).
- Reemplazar el placeholder emoji 🛍️ por uno sin emoji.
- Imágenes optimizadas (OptimizedImage) en la galería — sigue `<img>` plano para que el swap sea simple (decisión existente).
- Magnifier al hover / zoom inline (se eligió lightbox).

## Cambios por archivo
- `apps/storefront/src/components/ProductGallery.astro`:
  - CSS: `.pgal__main` y `.pgal__thumb img` → `object-fit:var(--ta-foto-fit,cover)` + `padding:var(--ta-foto-pad,0px)`.
  - Markup: agregar el ícono de zoom sobre la principal + el overlay del lightbox (oculto) con su estructura (scrim, img contain, botones prev/next/close, contador), todo con `--ta-*` y roles ARIA.
  - Script inline: wiring de (a) thumb-swap + aria-current (mejorado), (b) lightbox open/close/nav/teclado/focus-trap, (c) MutationObserver del `src` de la principal → actualizar miniatura activa.
- (Posible) ajuste menor de CSS de `.pgal__thumbs` para asegurar touch ≥44px en móvil — solo si el grid de 5 cae por debajo; verificar en el gate.

## Testing
- **Unit** (`apps/storefront/test/product-gallery.test.ts`, CREAR; usa `renderComponentNormalized(ProductGallery, { pdp }, tienda)`):
  - principal usa `object-fit:var(--ta-foto-fit,cover)`.
  - overlay del lightbox presente con `role="dialog"` y oculto por defecto (`hidden`).
  - miniaturas: `<button>` con `data-src` por cada imagen de `galeria`.
  - con 1 sola imagen: sin fila de miniaturas; con 0: placeholder.
- **Gate Playwright** en aimma-test (PDP de un producto con ≥2 fotos, p. ej. `/p/sandalia-prueba-1`):
  - Click en la principal → overlay visible, imagen `object-fit:contain`.
  - Flecha derecha → cambia a la 2ª imagen; contador actualiza.
  - `Esc` → cierra; foco vuelve a la principal.
  - Miniatura activa con `aria-current="true"` tras click.
  - Con foto_ajuste='contener' (set temporal): la principal de la PDP usa `object-fit:contain` (no recorta).

## Verificación (gate empírico)
1. Playwright: abrir/cerrar lightbox, navegar, medir object-fit del lightbox (contain) y de la principal (cover por defecto / contain si la tienda lo setea), aria-current de la miniatura, foco atrapado (Tab no escapa).
2. Suite storefront verde.
3. Sin deploy de EF (no hay cambio de schema). Storefront build + wrangler. Admin Easypanel NO aplica (es storefront, no editor).
