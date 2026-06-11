# F2 — Carrito + Checkout ×4 + esquema canónico + upsell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir `/carrito` y `/checkout` al nivel de las 4 plantillas, unificar el cart-item en un shape canónico con una sola fuente de verdad (`src/lib/cart.ts`), y agregar upsell en `/carrito` — sin tocar la EF de pedido, reserva, idempotencia ni email.

**Architecture:** Módulo cliente único `src/lib/cart.ts` (read/write/derive/totales) importado por el writer (VariantSelector) + ambos lectores (carrito/checkout) + el badge + el upsell. Scripts pasan de `is:inline` a `<script>` bundled (Vite empaqueta el import; datos del server por `<script type="application/json">`). Carrito y Checkout se dispatchean ×4 (patrón `ProductDetail.astro`): lógica compartida UNA vez, presentación por plantilla.

**Tech Stack:** Astro 5 SSR + Cloudflare Workers, vanilla TS, vitest + jsdom, golden snapshots (`toMatchFileSnapshot`), Tailwind + tokens `--ta-*`.

---

## CONTEXTO VERIFICADO (no re-derivar)

- **localStorage key:** `'aimma_cart_' + location.hostname`.
- **Writer hoy** (`components/VariantSelector.astro` `currentItem()` ~L306-326) escribe superset `{producto_id, variante_id, sku, nombre, color, talla, variante(string), cantidad, precio}`. Merge por `producto_id`+`variante_id`. Dispara `aimma:cart-add`.
- **`carrito.astro`** lee `nombre, variante(string), cantidad, precio`; quita por índice.
- **`checkout.astro`** resumen lee `color, talla, nombre, precio, cantidad`; POST EF por item = `{producto_id, variante_id, cantidad}` (CONTRATO INTACTO).
- **Dispatcher patrón:** `ProductDetail.astro` switch en `tienda.plantilla?.slug` (`fashion_bold`/`minimal_artesanal`/`editorial_magazine`/default IC).
- **Upsell pool:** `getProductosPorTienda(supabase, tienda.id, {limit})` → `ProductoListItem[]` (`{id,nombre,precio,precio_anterior,foto_principal,stock_disponible,slug,referencia}`), tenant-scoped, `estado='activo'`, NO trae `categoria_id`.
- **`/p/[slug].astro`** arma `pdp`; `pdp.producto.foto_principal_url`, `pdp.producto.slug`, `variantes[].foto_color_url` disponibles. VariantSelector `clientData` ya incluye `slug`.
- **GOTCHA bundling:** un `<script>` bundled corre UNA vez (no re-ejecuta por navegación ClientRouter). TODO script bundled que deba reaccionar a navegación debe suscribir `astro:page-load` + guard idempotente de binding (`el.dataset.xBound`). Los `is:inline` actuales se re-ejecutan por nav; al bundlear se PIERDE eso si no se suscribe.

## GUARDRAILS (NO tocar)

EF `tienda-crear-pedido`, `reservar_stock_variante`, tabla `pedidos`, `idempotency_key`/índice único, triggers pg_net email + EF `tienda-notif-pedido`. POST a la EF idéntico. Admin/hotfix-14 intactos. Deploy storefront-only (wrangler).

## FILE STRUCTURE

- **Create** `apps/storefront/src/lib/cart.ts` — fuente única del carrito (cliente).
- **Create** `apps/storefront/test/cart.test.ts` — unit del módulo (jsdom).
- **Modify** `apps/storefront/src/components/VariantSelector.astro` — writer al canónico + bundled.
- **Modify** `apps/storefront/src/components/CartBadge.astro` — bundled módulo (`count`).
- **Create** `apps/storefront/src/components/CartDispatcher.astro` + `templates/{industrial_clean,fashion_bold,minimal_artesanal,editorial_magazine}/Cart{IC,FB,MA,EM}.astro`.
- **Create** `apps/storefront/src/components/CartApp.astro` — script compartido del carrito (estado vía `~/lib/cart`).
- **Modify** `apps/storefront/src/pages/carrito.astro` — data layer + upsell SSR + `<CartDispatcher>`.
- **Create** `apps/storefront/src/components/CheckoutDispatcher.astro` + `Checkout{IC,FB,MA,EM}.astro` + `CheckoutApp.astro` (script compartido).
- **Modify** `apps/storefront/src/pages/checkout.astro` — data layer + `<CheckoutDispatcher>`.
- **Create** golden tests `test/carrito.golden.test.ts`, `test/checkout.golden.test.ts` (+ snapshots).

---

## Task 1: Módulo `src/lib/cart.ts` (fuente única) + unit tests

**Files:**
- Create: `apps/storefront/src/lib/cart.ts`
- Test: `apps/storefront/test/cart.test.ts`

- [ ] **Step 1: Escribir el test que falla** (`test/cart.test.ts`)

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as cart from '../src/lib/cart';

const base = { producto_id: 'p1', variante_id: 'v1', slug: 'prod-1', sku: 'SKU1', nombre: 'Prod 1', color: 'Rojo', talla: 'M', foto: 'http://x/f.jpg', cantidad: 1, precio: 1000 };

describe('lib/cart', () => {
  beforeEach(() => localStorage.clear());

  it('writeItem agrega y readCart devuelve el item', () => {
    cart.writeItem({ ...base });
    expect(cart.readCart()).toHaveLength(1);
    expect(cart.count()).toBe(1);
  });

  it('writeItem mergea por producto_id+variante_id (suma cantidad)', () => {
    cart.writeItem({ ...base, cantidad: 1 });
    cart.writeItem({ ...base, cantidad: 2 });
    expect(cart.readCart()).toHaveLength(1);
    expect(cart.count()).toBe(3);
  });

  it('variante distinta = línea distinta', () => {
    cart.writeItem({ ...base, variante_id: 'v1' });
    cart.writeItem({ ...base, variante_id: 'v2' });
    expect(cart.readCart()).toHaveLength(2);
  });

  it('removeAt quita por índice', () => {
    cart.writeItem({ ...base, variante_id: 'v1' });
    cart.writeItem({ ...base, variante_id: 'v2' });
    cart.removeAt(0);
    expect(cart.readCart()).toHaveLength(1);
    expect(cart.readCart()[0].variante_id).toBe('v2');
  });

  it('setQty clampa a >=1', () => {
    cart.writeItem({ ...base });
    cart.setQty(0, 5); expect(cart.readCart()[0].cantidad).toBe(5);
    cart.setQty(0, 0); expect(cart.readCart()[0].cantidad).toBe(1);
  });

  it('total = suma precio*cantidad', () => {
    cart.writeItem({ ...base, precio: 1000, cantidad: 2 });
    cart.writeItem({ ...base, variante_id: 'v2', precio: 500, cantidad: 1 });
    expect(cart.total()).toBe(2500);
  });

  it('varianteLabel deriva del color/talla (no se guarda string)', () => {
    expect(cart.varianteLabel('Rojo', 'M')).toBe('Rojo / M');
    expect(cart.varianteLabel('Rojo', null)).toBe('Rojo');
    expect(cart.varianteLabel(null, null)).toBe('');
  });

  it('readCart tolera JSON corrupto', () => {
    localStorage.setItem('aimma_cart_' + location.hostname, '{no-array');
    expect(cart.readCart()).toEqual([]);
  });

  it('writeItem dispara aimma:cart-changed', () => {
    let fired = 0;
    window.addEventListener('aimma:cart-changed', () => fired++);
    cart.writeItem({ ...base });
    expect(fired).toBe(1);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd apps/storefront && npx vitest run test/cart.test.ts`
Expected: FAIL (`Cannot find module '../src/lib/cart'`).

- [ ] **Step 3: Implementar `src/lib/cart.ts`**

```ts
// AIMMA Storefront · lib/cart.ts · F2 · fuente única del carrito (cliente).
// SOLO importar dentro de <script> bundled (usa localStorage/window). NUNCA en frontmatter Astro (SSR).
// Esquema canónico: color/talla son la verdad estructural; el string "variante" se DERIVA al render.

export interface CartItem {
  producto_id: string;
  variante_id: string | null;
  slug: string;
  sku: string | null;
  nombre: string;
  color: string | null;
  talla: string | null;
  foto: string | null;
  cantidad: number;
  precio: number;
}

const CHANGED_EVENT = 'aimma:cart-changed';
const ADD_EVENT = 'aimma:cart-add'; // compat: el badge hace pulse al agregar

export function cartKey(): string {
  return 'aimma_cart_' + location.hostname;
}

export function readCart(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(cartKey()) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function persist(items: CartItem[]): void {
  localStorage.setItem(cartKey(), JSON.stringify(items));
}

function sameLine(a: CartItem, b: { producto_id: string; variante_id: string | null }): boolean {
  return a.producto_id === b.producto_id && (a.variante_id || null) === (b.variante_id || null);
}

export function writeItem(item: CartItem): void {
  const items = readCart();
  const ex = items.find((c) => sameLine(c, item));
  if (ex) ex.cantidad = (ex.cantidad || 0) + item.cantidad;
  else items.push(item);
  persist(items);
  emit(true);
}

export function removeAt(index: number): void {
  const items = readCart();
  if (index < 0 || index >= items.length) return;
  items.splice(index, 1);
  persist(items);
  emit(false);
}

export function setQty(index: number, n: number): void {
  const items = readCart();
  if (index < 0 || index >= items.length) return;
  items[index].cantidad = Math.max(1, Math.floor(Number(n)) || 1);
  persist(items);
  emit(false);
}

export function clearCart(): void {
  try { localStorage.removeItem(cartKey()); } catch (_) {}
  emit(false);
}

export function count(): number {
  return readCart().reduce((a, it) => a + (it.cantidad || 0), 0);
}

export function total(): number {
  return readCart().reduce((a, it) => a + (it.precio || 0) * (it.cantidad || 0), 0);
}

export function varianteLabel(color: string | null, talla: string | null): string {
  return [color, talla].filter(Boolean).join(' / ');
}

export function fmtCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n || 0);
}

function emit(isAdd: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { count: count() } }));
    if (isAdd) window.dispatchEvent(new CustomEvent(ADD_EVENT, { detail: { count: count() } }));
  } catch (_) {}
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run test/cart.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/lib/cart.ts apps/storefront/test/cart.test.ts
git commit -m "feat(f2): modulo cart.ts fuente unica + unit tests"
```

---

## Task 2: VariantSelector → escritura canónica + bundled

**Files:**
- Modify: `apps/storefront/src/components/VariantSelector.astro`

- [ ] **Step 1: Agregar `foto_principal` a `clientData`** (frontmatter, dentro del objeto `clientData`, junto a `slug`)

```js
  sku_base: p.referencia ?? null,
  foto_principal: p.foto_principal_url ?? null,   // NUEVO: fallback de foto para el cart-item canónico
```

- [ ] **Step 2: Reescribir `currentItem()` al shape canónico** (reemplaza el `return {...}` del SUPERSET, ~L316-325)

```js
      // CANÓNICO: color/talla estructurales (el string "variante" se DERIVA al render, no se guarda).
      return {
        producto_id: D.producto_id,
        variante_id: noAxes ? null : v.id,
        slug: D.slug,
        sku: noAxes ? D.sku_base : (v.sku || null),
        nombre: D.nombre,
        color: color, talla: talla,
        foto: (noAxes ? null : (v.foto || null)) || D.foto_principal || null,
        cantidad: cant,
        precio: precio,
      };
```

- [ ] **Step 3: Bundlear el script + usar el módulo** (reemplaza el bloque `<script is:inline> ... </script>` completo, L186-379)

Cambios:
1. `<script is:inline>` → `<script>` (bundled).
2. Al inicio del script: `import { writeItem, fmtCOP } from '~/lib/cart';`
3. Borrar las funciones locales duplicadas: `fmt` (usar `fmtCOP`), `CART_KEY`, `readCart`, `cartCount`, `notifyAdd`, `writeItem` (usar el del módulo).
4. Reemplazar el cuerpo IIFE `(function(){...})()` por `function initVsel(){...}` con guard idempotente y suscripción a navegación:

```js
<script>
  import { writeItem, fmtCOP } from '~/lib/cart';

  function initVsel() {
    var root = document.querySelector('[data-vsel]');
    if (!root) return;
    if (root.dataset.vselBound) return;   // idempotente: no re-wirear el mismo nodo
    root.dataset.vselBound = '1';

    var dataEl = root.querySelector('[data-pdp-data]');
    var D;
    try { D = JSON.parse(dataEl.textContent || '{}'); } catch (_) { return; }

    var nojs = root.querySelector('[data-pdp-nojs]');
    var inter = root.querySelector('[data-pdp-interactive]');
    if (!inter) return;
    nojs && (nojs.hidden = true);
    inter.hidden = false;

    var fmt = fmtCOP;
    // ... (resto IDÉNTICO al actual: sel, hasColor/hasTalla, uniqueVals, auto-select,
    //      refs, matchVariant, optionHasStock, refresh, syncQtyBtns, stepQty, currentItem,
    //      showToast, addToCart/buyNow usando writeItem(it), listeners, refresh()) ...
    // ELIMINADO: readCart/cartCount/notifyAdd/CART_KEY locales y la def local de writeItem/fmt.
  }
  document.addEventListener('astro:page-load', initVsel);
  initVsel();
</script>
```

(El `addToCart`/`buyNow` quedan: `function addToCart(){ var it=currentItem(); if(!it) return; writeItem(it); showToast(); }` y `buyNow` igual + `location.href='/checkout'`. El evento al badge lo dispara `writeItem` internamente — borrar `notifyAdd`.)

- [ ] **Step 4: Verificar build + typecheck**

Run: `cd apps/storefront && npm run build`
Expected: build VERDE (sin errores de import `~/lib/cart`).

- [ ] **Step 5: Verificar runtime headless** (PDP de aimma-test, eje único)

Run (jsdom harness o Playwright contra `https://aimma-test.tienda.aimma.com.co/p/<slug>`): cargar PDP, click add, leer `localStorage['aimma_cart_'+hostname]` → el item tiene `slug`, `foto`, `color/talla`, y NO tiene `variante`. (Documentar resultado en el reporte; este paso es manual/headless.)

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/components/VariantSelector.astro
git commit -m "feat(f2): VariantSelector escribe canonico (+foto/slug, -variante string) + bundled via cart.ts"
```

---

## Task 3: CartBadge → bundled módulo

**Files:**
- Modify: `apps/storefront/src/components/CartBadge.astro`

- [ ] **Step 1: Bundlear + usar `count` del módulo** (reemplaza `<script is:inline>` por `<script>` importando `count`; conserva el guard `window.__aimmaCartBadge` y los listeners `astro:page-load`/`pageshow`/`storage`/`aimma:cart-add`)

```js
<script>
  import { count, cartKey } from '~/lib/cart';
  (function () {
    function paint(pulse) {
      var b = document.querySelector('[data-cart-badge]');
      if (!b) return;
      var n = count();
      if (n > 0) { b.textContent = n > 99 ? '99+' : String(n); b.hidden = false; }
      else { b.hidden = true; }
      if (pulse) {
        var icon = document.querySelector('[data-cart-icon]');
        if (icon) { icon.classList.remove('cart-pulse'); void icon.offsetWidth; icon.classList.add('cart-pulse'); }
      }
    }
    if (!window.__aimmaCartBadge) {
      window.__aimmaCartBadge = true;
      var KEY = cartKey();
      document.addEventListener('astro:page-load', function () { paint(false); });
      window.addEventListener('pageshow', function () { paint(false); });
      window.addEventListener('storage', function (e) { if (e.key === KEY) paint(false); });
      window.addEventListener('aimma:cart-add', function () { paint(true); });
      window.addEventListener('aimma:cart-changed', function () { paint(false); });
    }
    paint(false);
  })();
</script>
```

- [ ] **Step 2: Verificar build + sin-flash**

Run: `npm run build`. Luego en runtime: cargar home con carrito no vacío → el badge aparece con el número correcto **sin parpadeo perceptible** (bundled = defer; `paint` corre al cargar). Documentar.

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/components/CartBadge.astro
git commit -m "feat(f2): CartBadge bundled via cart.ts (count del modulo)"
```

---

## Task 4: Carrito ×4 — `CartApp` (script compartido) + dispatcher + shells

**Files:**
- Create: `apps/storefront/src/components/CartApp.astro` (markup base con hooks + script compartido)
- Create: `apps/storefront/src/components/CartDispatcher.astro`
- Create: `apps/storefront/src/components/templates/<t>/Cart{IC,FB,MA,EM}.astro`
- Modify: `apps/storefront/src/pages/carrito.astro`

**Decisión de arquitectura:** la presentación ×4 cambia el CHROME (encabezado, tokens, prefijo, estilo de botones), pero la LISTA de items, el total y el resumen se renderizan en cliente desde `~/lib/cart` sobre hooks `data-cart-*`. Para no duplicar el script 4 veces, cada `Cart{X}.astro` renderiza su chrome + incluye `<CartApp prefix="ic|fb|ma|em" upsell={upsell} hasWhatsApp={..}/>` que aporta los hooks compartidos (`#carrito-items`, `#carrito-total`, `#carrito-vacio`, `#carrito-checkout`, riel upsell) + el `<script>` bundled UNA vez.

- [ ] **Step 1: `CartApp.astro`** — hooks compartidos + script (estado vía módulo). Markup:

```astro
---
import ProductGrid from '~/components/ProductGrid.astro';
interface Props { prefix: string; hasWhatsApp: boolean; upsell: any[] }
const { prefix, hasWhatsApp, upsell } = Astro.props;
---
<div class={`cartapp cartapp--${prefix}`} data-cartapp>
  <p data-carrito-vacio class="cartapp__vacio">Tu carrito esta vacio. <a href="/" class="underline">Volver al inicio</a>.</p>
  <ul data-carrito-items class="cartapp__items" hidden></ul>
  <div data-carrito-resumen class="cartapp__resumen" hidden>
    <div class="cartapp__total-row"><span>Total</span><span data-carrito-total>$0</span></div>
    <a data-carrito-checkout href={hasWhatsApp ? '/checkout' : '#'} class="cartapp__cta">
      {hasWhatsApp ? 'Continuar al pedido' : 'WhatsApp no disponible'}
    </a>
    <p class="cartapp__nota">Coordinas pago y entrega directamente con la tienda.</p>
  </div>
</div>

{upsell.length > 0 && (
  <section class="cartapp__upsell" data-carrito-upsell hidden>
    <h2 class="cartapp__upsell-h2">Tambien te puede interesar</h2>
    <ProductGrid productos={upsell} />
  </section>
)}

<script>
  import { readCart, removeAt, setQty, total, count, varianteLabel, fmtCOP } from '~/lib/cart';

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]; }); }

  function initCart() {
    var root = document.querySelector('[data-cartapp]');
    if (!root) return;

    function render() {
      var items = readCart();
      var vacio = root.querySelector('[data-carrito-vacio]');
      var lista = root.querySelector('[data-carrito-items]');
      var resumen = root.querySelector('[data-carrito-resumen]');
      var totalEl = root.querySelector('[data-carrito-total]');
      if (items.length === 0) {
        vacio.hidden = false; lista.hidden = true; resumen.hidden = true;
        filterUpsell(items); return;
      }
      vacio.hidden = true; lista.hidden = false; resumen.hidden = false;
      lista.innerHTML = items.map(function (it, i) {
        var label = varianteLabel(it.color, it.talla);
        var foto = it.foto ? '<img src="' + esc(it.foto) + '" alt="" class="cartapp__thumb" loading="lazy" />' : '<span class="cartapp__thumb cartapp__thumb--ph"></span>';
        return '<li class="cartapp__item">' +
          '<a href="/p/' + esc(it.slug) + '" class="cartapp__item-media">' + foto + '</a>' +
          '<div class="cartapp__item-main">' +
            '<a href="/p/' + esc(it.slug) + '" class="cartapp__item-name">' + esc(it.nombre) + '</a>' +
            (label ? '<p class="cartapp__item-var">' + esc(label) + '</p>' : '') +
            '<div class="cartapp__qty">' +
              '<button type="button" data-dec="' + i + '" aria-label="Disminuir">&minus;</button>' +
              '<span data-qty="' + i + '">' + it.cantidad + '</span>' +
              '<button type="button" data-inc="' + i + '" aria-label="Aumentar">+</button>' +
            '</div>' +
          '</div>' +
          '<div class="cartapp__item-right">' +
            '<p class="cartapp__item-precio">' + fmtCOP(it.precio * it.cantidad) + '</p>' +
            '<button type="button" data-del="' + i + '" class="cartapp__del">Quitar</button>' +
          '</div>' +
        '</li>';
      }).join('');
      totalEl.textContent = fmtCOP(total());
      wire(lista);
      filterUpsell(items);
    }

    function wire(lista) {
      lista.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { removeAt(+b.getAttribute('data-del')); render(); }; });
      lista.querySelectorAll('[data-inc]').forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-inc'); var it = readCart()[i]; setQty(i, (it.cantidad||1)+1); render(); }; });
      lista.querySelectorAll('[data-dec]').forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-dec'); var it = readCart()[i]; setQty(i, (it.cantidad||1)-1); render(); }; });
    }

    function filterUpsell(items) {
      var up = root.parentElement ? root.parentElement.querySelector('[data-carrito-upsell]') : document.querySelector('[data-carrito-upsell]');
      if (!up) return;
      var inCart = {};
      items.forEach(function (it) { inCart[it.slug] = true; });
      var anyVisible = false;
      up.querySelectorAll('a[href^="/p/"]').forEach(function (a) {
        var card = a.closest('article, li, .pcard, [data-product-card]') || a;
        var slug = (a.getAttribute('href') || '').replace('/p/', '');
        var hide = !!inCart[slug];
        // ocultar el contenedor de card más cercano
        var host = a.closest('li') || a.closest('article') || card;
        if (host && host !== up) { host.style.display = hide ? 'none' : ''; if (!hide) anyVisible = true; }
      });
      up.hidden = !anyVisible;
    }

    render();
  }

  document.addEventListener('astro:page-load', initCart);
  initCart();
</script>

<style>
  /* base compartida; los acentos por plantilla salen del prefix .cartapp--{ic,fb,ma,em} en cada shell */
  .cartapp__items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1rem; }
  .cartapp__item { display: grid; grid-template-columns: 64px 1fr auto; gap: 1rem; align-items: center; border-bottom: 1px solid color-mix(in oklab, var(--ta-color-text-base) 10%, transparent); padding-bottom: 1rem; }
  .cartapp__thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; background: color-mix(in oklab, var(--ta-color-text-base) 6%, transparent); }
  .cartapp__thumb--ph { display: block; }
  .cartapp__item-name { font-weight: 600; color: var(--ta-color-text-base); }
  .cartapp__item-var { font-size: 0.85rem; color: color-mix(in oklab, var(--ta-color-text-base) 60%, transparent); }
  .cartapp__qty { display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 0.4rem; }
  .cartapp__qty button { width: 1.9rem; height: 1.9rem; border: 1px solid color-mix(in oklab, var(--ta-color-text-base) 20%, transparent); background: var(--ta-color-bg-base); border-radius: 6px; cursor: pointer; }
  .cartapp__item-precio { font-weight: 600; color: var(--ta-color-text-base); }
  .cartapp__del { font-size: 0.75rem; color: #dc2626; margin-top: 0.25rem; background: none; border: 0; cursor: pointer; }
  .cartapp__del:hover { text-decoration: underline; }
  .cartapp__resumen { margin-top: 1.5rem; border-top: 1px solid color-mix(in oklab, var(--ta-color-text-base) 12%, transparent); padding-top: 1rem; }
  .cartapp__total-row { display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 700; color: var(--ta-color-text-base); }
  .cartapp__cta { margin-top: 1rem; display: inline-flex; width: 100%; align-items: center; justify-content: center; gap: 0.5rem; border-radius: 6px; background: var(--ta-color-primary); color: var(--ta-color-on-primary); padding: 0.85rem 1.5rem; font-weight: 600; text-decoration: none; }
  .cartapp__cta:hover { opacity: 0.9; }
  .cartapp__nota { margin-top: 0.75rem; text-align: center; font-size: 0.75rem; color: color-mix(in oklab, var(--ta-color-text-base) 55%, transparent); }
  .cartapp__upsell { margin-top: 3rem; }
  .cartapp__upsell-h2 { font-family: var(--ta-font-display); font-size: 1.15rem; font-weight: 600; margin-bottom: 1.25rem; color: var(--ta-color-text-base); }
  /* prefijos por plantilla (acentos): FB cuadrado/upper, MA pill, EM upper-light */
  .cartapp--fb .cartapp__cta { border-radius: 0; text-transform: uppercase; letter-spacing: 0.06em; }
  .cartapp--ma .cartapp__cta { border-radius: 999px; }
  .cartapp--em .cartapp__cta { text-transform: uppercase; letter-spacing: 0.1em; font-weight: 400; }
</style>
```

- [ ] **Step 2: `Cart{IC,FB,MA,EM}.astro`** — chrome por plantilla. Cada uno: `<header>` con el título "Tu carrito" en los tokens/tipografía de su plantilla (espejo de `ProductDetail{X}` para tipografía: IC `--ta-font-display` 600; FB Anton uppercase; MA Fraunces italic/pill; EM Fraunces light upper) + `<CartApp prefix="..." hasWhatsApp={hasWhatsApp} upsell={upsell} />`. Reciben props `{ hasWhatsApp, upsell }`.

Ejemplo `CartIC.astro`:
```astro
---
import CartApp from '~/components/CartApp.astro';
interface Props { hasWhatsApp: boolean; upsell: any[] }
const { hasWhatsApp, upsell } = Astro.props;
---
<section class="ic-cart">
  <header class="ic-cart__head"><h1 class="ic-cart__title">Tu carrito</h1></header>
  <CartApp prefix="ic" hasWhatsApp={hasWhatsApp} upsell={upsell} />
</section>
<style>
  .ic-cart__title { font-family: var(--ta-font-display); font-size: clamp(1.6rem,3vw,2.25rem); font-weight: 600; letter-spacing: -0.02em; color: var(--ta-color-text-base); margin-bottom: 1.5rem; }
</style>
```
(FB/MA/EM: idéntica estructura, cambiando solo la clase/estilo del título para reflejar su plantilla — espejar el `__title` del `ProductDetail{X}` correspondiente.)

- [ ] **Step 3: `CartDispatcher.astro`** (patrón ProductGrid)
```astro
---
import CartIC from '~/components/templates/industrial_clean/CartIC.astro';
import CartFB from '~/components/templates/fashion_bold/CartFB.astro';
import CartMA from '~/components/templates/minimal_artesanal/CartMA.astro';
import CartEM from '~/components/templates/editorial_magazine/CartEM.astro';
interface Props { hasWhatsApp: boolean; upsell: any[] }
const { hasWhatsApp, upsell } = Astro.props;
const { tienda } = Astro.locals;
const slug = tienda.plantilla?.slug;
---
{slug === 'fashion_bold' && <CartFB hasWhatsApp={hasWhatsApp} upsell={upsell} />}
{slug === 'minimal_artesanal' && <CartMA hasWhatsApp={hasWhatsApp} upsell={upsell} />}
{slug === 'editorial_magazine' && <CartEM hasWhatsApp={hasWhatsApp} upsell={upsell} />}
{(slug === 'industrial_clean' || !slug || !['fashion_bold','minimal_artesanal','editorial_magazine'].includes(slug)) && (
  <CartIC hasWhatsApp={hasWhatsApp} upsell={upsell} />
)}
```

- [ ] **Step 4: Reescribir `pages/carrito.astro`** (data layer + upsell SSR; sin script propio)
```astro
---
import Layout from '~/layouts/Layout.astro';
import CartDispatcher from '~/components/CartDispatcher.astro';
import { getProductosPorTienda } from '~/lib/catalogo';

const { tienda, supabase } = Astro.locals;
const hasWhatsApp = (tienda.whatsapp_dueno || '').replace(/\D/g, '').length > 0;

// Upsell pool: tenant-scoped, recientes/destacados. El cliente oculta los que ya están en el carrito.
let upsell: Awaited<ReturnType<typeof getProductosPorTienda>> = [];
try { upsell = await getProductosPorTienda(supabase, tienda.id, { limit: 8 }); }
catch (e) { console.error('[carrito] upsell', e); upsell = []; }
---
<Layout title="Carrito" description={`Tu carrito de compras en ${tienda.nombre_negocio}.`} noindex>
  <CartDispatcher hasWhatsApp={hasWhatsApp} upsell={upsell} />
</Layout>
```

- [ ] **Step 5: Verificar build**

Run: `cd apps/storefront && npm run build`
Expected: VERDE.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/components/CartApp.astro apps/storefront/src/components/CartDispatcher.astro apps/storefront/src/components/templates/*/Cart*.astro apps/storefront/src/pages/carrito.astro
git commit -m "feat(f2): carrito x4 (CartApp compartido + dispatcher + shells) + upsell SSR"
```

---

## Task 5: Checkout ×4 — `CheckoutApp` (script compartido) + dispatcher + shells

**Files:**
- Create: `apps/storefront/src/components/CheckoutApp.astro` (form + resumen + script; contrato EF intacto)
- Create: `apps/storefront/src/components/CheckoutDispatcher.astro`
- Create: `apps/storefront/src/components/templates/<t>/Checkout{IC,FB,MA,EM}.astro`
- Modify: `apps/storefront/src/pages/checkout.astro`

**Clave:** `CheckoutApp.astro` contiene el form COMPLETO (con `email required`, heredado de la rama email), el resumen (`data-ck-items`/`data-ck-total`) y el `<script>` bundled compartido (renderResumen vía `readCart`/`total`/`varianteLabel`/`fmtCOP`, submit, fetch EF con payload `{producto_id, variante_id, cantidad}` IDÉNTICO, idempotency_key por page-view, guard `ckBound`, `clearCart()` + redirect wa.me). Los shells ×4 aportan el chrome (header/título/tokens) y envuelven `<CheckoutApp .../>`.

- [ ] **Step 1: `CheckoutApp.astro`** — portar el form actual de `checkout.astro` (L64-211) + el script (L216-398) con estos cambios:
  1. `<script is:inline define:vars={{EF_URL,ANON_KEY,tiendaSlug,tiendaNombre}}>` → datos por `<script type="application/json" data-ck-cfg>{JSON.stringify({EF_URL,ANON_KEY,tiendaSlug})}</script>` + `<script>` bundled que los lee.
  2. `import { readCart, total, varianteLabel, fmtCOP, clearCart } from '~/lib/cart';`
  3. `renderResumen` usa `varianteLabel(it.color, it.talla)` (en vez de armar el string inline) y `fmtCOP`/`total()` del módulo.
  4. El payload de `submitPedido` queda EXACTO: `items: items.map(it => ({ producto_id: it.producto_id, variante_id: it.variante_id || null, cantidad: it.cantidad }))`.
  5. Éxito: `clearCart()` (en vez de `localStorage.removeItem`) + `window.location.href = result.wa_url`.
  6. `init()` suscrito a `astro:page-load` + llamada inicial; guard `form.dataset.ckBound` SE MANTIENE.
  Props: `{ hasWhatsApp, efUrl, anonKey, tiendaSlug, tiendaNombre }`.

- [ ] **Step 2: `Checkout{IC,FB,MA,EM}.astro`** — chrome por plantilla (header "Finalizar pedido" + breadcrumb "Volver al carrito", tipografía de la plantilla espejando `ProductDetail{X}`) envolviendo `<CheckoutApp ...props />`. El bloque `!hasWhatsApp` (aviso amber) vive en el shell o en CheckoutApp (mantener el de hoy).

- [ ] **Step 3: `CheckoutDispatcher.astro`** (patrón idéntico a CartDispatcher; props `{ hasWhatsApp, efUrl, anonKey, tiendaSlug, tiendaNombre }`).

- [ ] **Step 4: Reescribir `pages/checkout.astro`** (data layer + dispatcher)
```astro
---
import Layout from '~/layouts/Layout.astro';
import CheckoutDispatcher from '~/components/CheckoutDispatcher.astro';
const { tienda } = Astro.locals;
const hasWhatsApp = !!(tienda.whatsapp_dueno || '').replace(/\D/g, '');
const efUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/tienda-crear-pedido`;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
---
<Layout title="Finalizar pedido" description={`Completa tus datos para realizar el pedido en ${tienda.nombre_negocio}.`} noindex>
  <CheckoutDispatcher hasWhatsApp={hasWhatsApp} efUrl={efUrl} anonKey={anonKey} tiendaSlug={tienda.slug} tiendaNombre={tienda.nombre_negocio} />
</Layout>
```

- [ ] **Step 5: Build verde**

Run: `npm run build` → VERDE.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/components/CheckoutApp.astro apps/storefront/src/components/CheckoutDispatcher.astro apps/storefront/src/components/templates/*/Checkout*.astro apps/storefront/src/pages/checkout.astro
git commit -m "feat(f2): checkout x4 (CheckoutApp compartido + dispatcher + shells), contrato EF intacto"
```

---

## Task 6: Golden baselines carrito/checkout ×4

**Files:**
- Create: `apps/storefront/test/carrito.golden.test.ts`, `apps/storefront/test/checkout.golden.test.ts`
- Inspect: `apps/storefront/test/helpers/render-harness.ts` (usar el mismo harness que los golden existentes)

- [ ] **Step 1: Leer `test/helpers/render-harness.ts` y un golden existente** (`test/productos.golden.test.ts`) para replicar el patrón (render del componente ×4 plantillas → `toMatchFileSnapshot('__snapshots__/<sec>/<plantilla>__<caso>.html')`).

- [ ] **Step 2: Escribir golden carrito** (4 plantillas × casos: vacío-base render del chrome + upsell con N cards). Como el contenido de items es client-side, el golden captura el CHROME SSR + hooks + upsell SSR (no el estado JS). Verifica que el HTML público NO tenga `data-pdp-data` ajeno ni scripts inline duplicados.

- [ ] **Step 3: Correr para generar snapshots + revisarlos** (`npx vitest run test/carrito.golden.test.ts test/checkout.golden.test.ts`). Inspeccionar los `.html` generados: 0 secretos, 0 `define:vars` leakeado, email `required` presente en checkout.

- [ ] **Step 4: Commit**
```bash
git add apps/storefront/test/carrito.golden.test.ts apps/storefront/test/checkout.golden.test.ts apps/storefront/test/__snapshots__/carrito apps/storefront/test/__snapshots__/checkout
git commit -m "test(f2): golden baselines carrito/checkout x4"
```

---

## Task 7: Gate — suites + byte-compare caracterizado + sin-JS

- [ ] **Step 1: Suite completa**

Run: `cd apps/storefront && npx vitest run`
Expected: ≥232 + nuevos (cart unit + golden carrito/checkout) VERDE. Golden `productos` SIN cambios.

- [ ] **Step 2: byte-compare caracterizado** (build base vs HEAD)

Reconstruir dist de la base (`feat/email-transaccional`, antes de F2) y de HEAD; comparar el HTML SSR de:
- `home` + `/buscar`: el ÚNICO delta debe ser el wiring del header CartBadge (`is:inline`→bundled: el `<script>` inline desaparece y aparece la referencia al chunk hoisted). Behavior-idéntico. Caracterizar el diff (debe ser SOLO eso).
- `/p/[slug]`: lo anterior (CartBadge) + VariantSelector `is:inline`→bundled + el payload canónico (el JSON `data-pdp-data` no cambia en SSR; el cambio de `currentItem` es JS de cliente). Caracterizar.
- `/carrito`, `/checkout`: baselines nuevos (cubiertos por golden).

Documentar cada diff como "EXCLUSIVO + caracterizado". Si aparece CUALQUIER otro delta no listado → investigar antes de avanzar.

- [ ] **Step 3: Sin-JS** (curl o browser con JS off): `/carrito` muestra estado coherente (no pantalla en blanco; sin items render porque el carrito vive en cliente — mostrar "carrito vacío"/instrucción); `/checkout` form presente + degradación de F1; fallback no-JS del PDP intacto. Documentar.

- [ ] **Step 4: Commit (si hubo ajustes)** — si no, seguir.

---

## Task 8: Deploy storefront + E2E live + capturas (cierre)

- [ ] **Step 1: Build + wrangler deploy** (Tipo A; `public/.assetsignore` obligatorio; token CF guardado)

Run: `cd apps/storefront && npm run build && npx wrangler deploy`
Verificar versión publicada (curl marker) y que sirve HEAD (rebuild de HEAD antes de deploy — lección F1).

- [ ] **Step 2: E2E live** (Playwright contra `aimma-test.tienda.aimma.com.co`):
  - add-to-cart desde PDP → `/carrito` (item con foto + variante derivada + qty stepper + quitar) → upsell visible (cards linkean al PDP, sin el producto ya en carrito) → `/checkout` (resumen correcto, email required) → submit → EF → 1 pedido, stock reservado, **email enviado** (verificar `pedido_notificaciones` vía Supabase MCP).
  - Doble-submit secuencial + concurrente con misma idempotency_key → 1 pedido.
  - Limpiar el pedido de prueba al cerrar.

- [ ] **Step 3: Capturas ×4** de `/carrito` y `/checkout` (las 4 plantillas) para OK visual de Jorge.

- [ ] **Step 4: NO merge a main.** Esperar OK visual de Jorge. Al OK: merge `feat/email-transaccional` + `feat/cart-checkout-f2` → main, actualizar memoria.

---

## Self-review (hecho)

- **Cobertura spec:** esquema canónico (T1+T2), módulo compartido (T1, usado en T2-T5), bundled+gotcha navegación (T2,T3, scripts T4/T5 con `astro:page-load`), dispatchers ×4 (T4,T5), upsell SSR+filtro cliente (T4 + carrito.astro), sin-JS (T7), gate 3 niveles (T6,T7), guardrails EF/email (T5 contrato intacto), deploy+E2E+capturas (T8). ✓
- **Upsell categoría:** decisión = Opción 1 plana (cart-item no guarda categoria_id; matching no trivial → diferido). ✓
- **Tipos consistentes:** `CartItem` (T1) usado igual en writer (T2) y lectores (T4,T5). Funciones del módulo (`readCart/writeItem/removeAt/setQty/total/count/varianteLabel/fmtCOP/clearCart/cartKey`) referenciadas con esos nombres exactos en T2-T5. ✓
- **Sin placeholders de lógica:** cart.ts y CartApp con código completo; los 8 shells ×4 son chrome presentacional que espeja `ProductDetail{X}` (patrón establecido del repo). ✓
