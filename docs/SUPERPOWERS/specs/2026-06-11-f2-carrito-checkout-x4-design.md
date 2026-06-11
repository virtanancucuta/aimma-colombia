# F2 — Carrito + Checkout ×4 + esquema canónico + upsell (design)

Fecha: 2026-06-11
Rama: `feat/cart-checkout-f2` (apilada sobre `feat/email-transaccional` → merge email+F2 juntos a main al cierre)
Estado: aprobado por Jorge (diseño punto por punto). Fase TEST, sin usuarios reales con carritos.

## Objetivo

Subir `/carrito` y `/checkout` al nivel de las 4 plantillas (IC/FB/MA/EM), unificar el
esquema del cart-item en un shape canónico único con una sola fuente de verdad, y agregar
upsell de relacionados en `/carrito`. Sin tocar la EF de pedido, la reserva atómica, la
tabla pedidos, la idempotencia, ni los triggers pg_net de email.

## Contexto verificado (PASO 0 — leído del código real)

**Writer hoy** (`components/VariantSelector.astro` → `currentItem()`): escribe el SUPERSET a
`localStorage['aimma_cart_' + location.hostname]`, merge por `producto_id`+`variante_id`:
`{ producto_id, variante_id, sku, nombre, color, talla, variante(string), cantidad, precio }`.
No guarda `foto` ni `slug`. Dispara `aimma:cart-add` para el badge.

**Lector 1** (`pages/carrito.astro`): usa `nombre`, `variante`(string ya armado), `cantidad`, `precio`. Quita por índice.

**Lector 2** (`pages/checkout.astro`): resumen usa `color`+`talla` (los une él mismo), `nombre`, `precio`, `cantidad`.
POST a la EF por item = `{ producto_id, variante_id, cantidad }`. **Contrato guardrail — intacto.**

**Redundancia exacta a eliminar:** el writer guarda DOS representaciones de la variante —
`variante`(string, para carrito) Y `color`/`talla` separados (para checkout).

**Patrones reusables:** `ProductDetail.astro` (dispatcher ×4 switch en `tienda.plantilla?.slug`, default IC),
`ProductGrid.astro` (mismo patrón), `getProductosPorTienda(supabase, tienda.id, {categoriaId, limit})`
(pool tenant-scoped, shape de ProductGrid), `CartBadge.astro` (badge header, evento `aimma:cart-add`).
`/p/[slug].astro` arma `pdp` con `producto.slug`, `producto.foto_principal_url`, `producto.categoria_id`,
y `variantes[].foto_color_url`.

## Esquema canónico (decisión aprobada)

```ts
// src/lib/cart.ts — CartItem
{
  producto_id: string,
  variante_id: string | null,
  slug: string,            // NUEVO — link de vuelta al PDP + exclusión del upsell
  sku: string | null,
  nombre: string,
  color: string | null,    // verdad estructural
  talla: string | null,    // verdad estructural
  foto: string | null,     // NUEVO — miniatura en carrito (v.foto_color_url ?? producto.foto_principal_url)
  cantidad: number,
  precio: number,          // ya resuelto (override/promo), como F1
}
```

- El string `variante` se **DERIVA al render** vía `varianteLabel(color, talla)` (join `[color,talla].filter(Boolean).join(' / ')`). NO se guarda.
- Merge key = `producto_id` + `variante_id`.
- `tienda` NO se guarda por item (el namespace `aimma_cart_<hostname>` ya lo scopea — YAGNI).
- Sin normalizador legacy ni compatibilidad hacia atrás (fase TEST). Si el navegador de Jorge
  tiene items viejos en localStorage → **clear manual una vez** (documentado, no es código).

## Arquitectura — módulo compartido (fuente única)

`src/lib/cart.ts` (cliente, vanilla TS, solo importado en `<script>` bundled — usa `localStorage`/`window`):

```
CART_KEY()                       -> 'aimma_cart_' + location.hostname
readCart(): CartItem[]           -> parse seguro, [] en error
writeItem(item): void            -> merge por producto_id+variante_id (suma cantidad); persiste; dispara cart-changed
removeAt(index): void            -> splice; persiste; dispara cart-changed
setQty(index, n): void           -> clamp >=1; persiste; dispara cart-changed
count(): number                  -> suma cantidades
total(): number                  -> suma precio*cantidad
varianteLabel(color, talla)      -> string derivado (sin guardar)
fmtCOP(n)                        -> Intl es-CO COP (centralizado, hoy duplicado x3)
```

Evento unificado `aimma:cart-changed` (reemplaza/extiende `aimma:cart-add`); el badge y los lectores
re-renderizan al recibirlo. Mantener compat del nombre `aimma:cart-add` si algo externo lo escucha (alias).

**Implicación de bundling (aprobada):** los scripts `is:inline` no pueden importar módulos. Se pasan a
`<script>` **bundled** (Vite empaqueta el import de `~/lib/cart`). Datos del server → `<script type="application/json">`
(patrón existente `data-pdp-data`), NO `define:vars`. Afecta: VariantSelector, carrito, checkout, CartBadge, upsell.

**Verificaciones obligatorias del bundling (pedidas por Jorge):**
1. El badge se puebla sin flash/race al cargar (bundled = defer; pintar en `astro:page-load` + `pageshow`, idempotente como hoy `window.__aimmaCartBadge`).
2. El fallback no-JS sigue cubriendo: sin JS el script bundled NO corre → `/carrito` read-only y el fallback no-JS del PDP deben sostenerse.

## Dispatchers ×4 (patrón ProductDetail)

- `pages/carrito.astro`: resuelve `tienda` + **pool de upsell SSR** (server) → renderiza `<CartDispatcher items-hooks upsell={...}/>`.
- `components/CartDispatcher.astro`: switch slug → `Cart{IC,FB,MA,EM}.astro` (presentación: markup + hooks `data-cart-*` + tokens/prefix) + **script compartido UNA vez** (estado vía `~/lib/cart`, render de items, total, quitar, stepper qty, wiring del upsell).
- `pages/checkout.astro`: resuelve `tienda` + `EF_URL`/`ANON_KEY` → `<CheckoutDispatcher/>`.
- `components/CheckoutDispatcher.astro`: switch slug → `Checkout{IC,FB,MA,EM}.astro` (presentación del form + resumen) + **script compartido UNA vez** (renderResumen, validación, submit, fetch EF, idempotency_key por page-view, guard `ckBound` anti doble-submit, manejo de errores, limpieza de carrito + redirect wa.me).

La lógica (estado carrito, llamada EF, reserva, idempotencia) es **idéntica** entre plantillas; solo cambia
la presentación. El email REQUERIDO (heredado de la rama email) se preserva en las 4 plantillas de checkout.

## Upsell "También te puede interesar" (/carrito) — decisión aprobada

- **Opción 1: SSR pool + filtro cliente.** `getProductosPorTienda(supabase, tienda.id, {limit: ~12})`
  tenant-scoped (destacados/recientes). Render vía `ProductGrid` (cards linkean al PDP → variant-safe, NO add-to-cart directo).
  El cliente oculta los productos cuyo `slug`/`producto_id` ya está en el carrito.
- **Refinamiento barato si el helper expone `categoria_id` por producto:** taggear cada card SSR con
  `data-categoria`; el cliente prioriza (ordena primero) las del mismo `categoria_id` que los items del carrito,
  desde ESE mismo pool — sin endpoint nuevo. Si no es trivial, Opción 1 plana.
- Diferido: fetch por categoría con endpoint nuevo (no paga el round-trip ahora).

## Degradación sin-JS

- `/carrito` sin JS: read-only (lista desde… — sin JS no hay localStorage render; el carrito vive en cliente,
  así que sin-JS muestra el estado vacío/instrucción coherente con F1; el badge no aparece). Mantener el
  comportamiento F1 (no romper, no pantalla en blanco).
- `/checkout` sin JS: el form existe; sin JS no hay resumen ni submit-fetch → mantener aviso/degradación de F1.
- El fallback no-JS del PDP (VariantSelector: lista read-only + WhatsApp directo) se mantiene intacto.

## GATE (gate honesto de 3 niveles — aprobado)

1. **byte-compare:**
   - `home` + `/buscar`: delta EXCLUSIVO al wiring del módulo/CartBadge (inline→bundled), behavior-idéntico, caracterizado + revisado; todo lo demás byte-idéntico.
   - `/p/[slug]`: lo anterior + delta EXCLUSIVO al payload de escritura del VariantSelector (+foto/slug, −string variante). Caracterizado + revisado.
   - `/carrito`, `/checkout`: reconstruidas ×4 — baselines nuevos (golden ×4).
   - El guard prueba: "nada cambió más allá de estos deltas caracterizados".
2. **E2E live (tienda real):** add-to-cart → `/carrito` (upsell visible, link a PDP) → `/checkout` → EF → 1 pedido, stock reservado, **email enviado**. Doble-submit (secuencial + concurrente) → 1 pedido (idempotencia intacta).
3. **Sin-JS:** `/carrito` read-only + `/checkout` degradado, sin pantalla en blanco.
4. **Suites:** storefront ≥232 verde (golden `productos` sin drift salvo lo caracterizado; nuevos golden carrito/checkout ×4); admin sin cambios.
5. **Capturas ×4** de `/carrito` y `/checkout` para OK visual de Jorge.

## Guardrails (NO tocar)

EF `tienda-crear-pedido`, reserva atómica (`reservar_stock_variante`), tabla `pedidos`,
`idempotency_key`/índice único, triggers pg_net de email + EF `tienda-notif-pedido`. El contrato del
POST a la EF se mantiene IDÉNTICO (`{producto_id, variante_id, cantidad}` + `comprador` + `metodo_envio` + `idempotency_key`).
Hotfix 14-autosave-robusto intacto (admin, no se toca). Deploy storefront-only (wrangler, Tipo A) — sin Easypanel.

## Orden de implementación

A. `src/lib/cart.ts` (módulo + tipos) + migrar VariantSelector al canónico (escribe solo canónico, +foto/slug, bundled).
B. CartDispatcher + Cart{IC,FB,MA,EM} (lógica compartida vía módulo) — reemplaza el body de `carrito.astro`.
C. CheckoutDispatcher + Checkout{IC,FB,MA,EM} (lógica compartida) — reemplaza el body de `checkout.astro`.
D. Upsell en `/carrito` (SSR pool + ProductGrid + filtro/priorización cliente).
E. CartBadge → bundled módulo. Sin-JS pass ×4.
F. Golden baselines carrito/checkout ×4 + byte-compare caracterizado + E2E live + capturas.

No mergear a main hasta OK visual de Jorge. byte-0 + rollback listo (rama descartable).
