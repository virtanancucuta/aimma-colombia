# Galería de producto (PDP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar la galería compartida de la PDP (`ProductGallery.astro`, 4 plantillas): respetar el ajuste Rellenar/Contener, agregar un lightbox accesible (zoom), y resaltar la miniatura activa.

**Architecture:** Un único componente `ProductGallery.astro` (markup + `<style>` + `<script is:inline>` vanilla). Las CSS vars `--ta-foto-fit`/`--ta-foto-pad` ya las emite `Layout.astro` en `<html>` (también en la PDP). El lightbox es markup oculto reutilizable + JS inline (open/close/nav/teclado/focus-trap/swipe). La miniatura activa se sincroniza con un MutationObserver del `src` de la principal (que el VariantSelector cambia), sin acoplar componentes.

**Tech Stack:** Astro 5 (Container API para tests), Tailwind v4, vitest 4, JS vanilla inline, wrangler, Playwright.

## Global Constraints

- **Modo TEST.** Storefront-only: SIN cambio de schema, SIN deploy de EF, SIN Easypanel (esto no es el editor).
- **foto_ajuste:** `.pgal__main` y `.pgal__thumb img` usan `object-fit:var(--ta-foto-fit,cover)` + `padding:var(--ta-foto-pad,0px)`. Default ausente → `cover`/`0px` = byte-idéntico a hoy.
- **Lightbox:** imagen grande SIEMPRE `object-fit:contain` (zoom = producto completo, sin recorte, independiente de foto_ajuste). `role="dialog" aria-modal="true"`, foco atrapado, `Esc` cierra, flechas ←/→ navegan, foco vuelve al trigger al cerrar. Botones ≥44px. Cierra por X / Esc / click en scrim. Abre en la imagen vigente del `[data-pdp-main-img]`.
- **Miniatura activa:** `aria-current="true"` en la activa; inicial = primera; se actualiza al click y cuando cambia el `src` de la principal (MutationObserver).
- **Sin dependencias nuevas** (JS vanilla inline, igual patrón que el resto).
- **Alcance:** las 4 plantillas (componente compartido). El lightbox usa tokens `--ta-color-*`.
- **Verificación del CSS:** el `<style>` NO aparece en el render del harness (Container API) → el cambio de object-fit se valida por grep de fuente + gate navegador, NO por unit test. El unit test cubre el MARKUP (overlay, miniaturas, trigger).
- Deferido: carrusel swipe de miniaturas en móvil, placeholder sin emoji, OptimizedImage en galería.

## Comandos de referencia
- Test storefront: `cd apps/storefront && npx vitest run test/product-gallery.test.ts` · suite: `npx vitest run`
- Build + deploy: `cd apps/storefront && npm run build && npx wrangler deploy`
- KV (gate): `npx wrangler kv key delete --namespace-id=99d06757be9f459883862cedec8683d2 --remote "tienda:aimma-test"` (usar `--remote`)

---

## Task 1: Upgrade `ProductGallery.astro` (foto_ajuste + lightbox + miniatura activa)

**Files:**
- Modify (reescritura completa): `apps/storefront/src/components/ProductGallery.astro`
- Test: `apps/storefront/test/product-gallery.test.ts` (CREAR)

**Interfaces:**
- Consumes: `pdp.galeria: string[]`, `pdp.producto.nombre`, `template?: string`; las CSS vars `--ta-foto-fit`/`--ta-foto-pad` de `Layout.astro`; el elemento `[data-pdp-main-img]` cuyo `src` cambia el VariantSelector.
- Produces: markup con `[data-pgal-lb]` (role=dialog, hidden), `[data-pgal-open]` (trigger zoom), `[data-pgal-thumb][data-src][aria-current]`, `[data-pgal-srcs]` (JSON de galeria).

- [ ] **Step 1: Escribir el test (markup del componente)**

Crear `apps/storefront/test/product-gallery.test.ts`:

```ts
// Galería PDP: markup del lightbox + miniaturas + trigger. (El CSS object-fit:var no aparece en
// renderToString — se valida por grep de fuente + gate navegador.)
import { describe, test, expect } from 'vitest';
import { renderComponentNormalized, makeTienda } from './helpers/render-harness.ts';
import ProductGallery from '../src/components/ProductGallery.astro';

const pdp = (galeria: string[]) => ({ galeria, producto: { nombre: 'Zapato Alfa' } });
const ic = makeTienda('industrial_clean');

describe('ProductGallery', () => {
  test('con >=2 fotos: overlay role=dialog oculto + trigger zoom + 1 miniatura por foto', async () => {
    const html = await renderComponentNormalized(ProductGallery, { pdp: pdp(['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg']) }, ic);
    expect(html).toContain('data-pgal-lb');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/data-pgal-lb[^>]*hidden/); // oculto por defecto
    expect(html).toContain('data-pgal-open');          // trigger de zoom
    expect((html.match(/data-pgal-thumb/g) || []).length).toBe(3);
    expect(html).toContain('aria-current="true"');     // primera miniatura activa
  });
  test('con 1 foto: sin miniaturas, pero con principal y lightbox', async () => {
    const html = await renderComponentNormalized(ProductGallery, { pdp: pdp(['https://x/a.jpg']) }, ic);
    expect(html).not.toContain('data-pgal-thumb');
    expect(html).toContain('data-pdp-main-img');
    expect(html).toContain('data-pgal-lb');
  });
  test('con 0 fotos: placeholder', async () => {
    const html = await renderComponentNormalized(ProductGallery, { pdp: pdp([]) }, ic);
    expect(html).toContain('pgal__placeholder');
  });
});
```

- [ ] **Step 2: Correr el test → FALLA**

Run: `cd apps/storefront && npx vitest run test/product-gallery.test.ts`
Expected: FAIL (no existen `data-pgal-lb`, `data-pgal-open`, etc. todavía).

- [ ] **Step 3: Reescribir `ProductGallery.astro` completo**

Reemplazar TODO el archivo `apps/storefront/src/components/ProductGallery.astro` por:

```astro
---
// AIMMA Storefront · ProductGallery.astro · galeria compartida del PDP (4 plantillas).
// Principal (data-pdp-main-img: el VariantSelector la swapea a foto_color_url) + thumbs (swap principal)
// + lightbox (zoom) accesible. <img> plano para swap simple. object-fit por token de tienda (foto_ajuste).
// Estilo por prefix.
interface Props { pdp: any; template?: string }
const { pdp, template = 'industrial_clean' } = Astro.props;
const prefix = template === 'fashion_bold' ? 'fb' : template === 'minimal_artesanal' ? 'ma' : template === 'editorial_magazine' ? 'em' : 'ic';
const galeria = (pdp.galeria || []) as string[];
const nombre = pdp.producto?.nombre || '';
---

<div class={`pgal pgal--${prefix}`} data-pgal-srcs={JSON.stringify(galeria)}>
  {galeria.length > 0 ? (
    <>
      <div class="pgal__main-wrap">
        <img class="pgal__main" data-pdp-main-img src={galeria[0]} alt={nombre} loading="eager" />
        <button type="button" class="pgal__zoom" data-pgal-open aria-label="Ampliar imagen">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
      </div>
      {galeria.length > 1 && (
        <div class="pgal__thumbs">
          {galeria.map((src, i) => (
            <button type="button" class="pgal__thumb" data-pgal-thumb data-src={src} aria-current={i === 0 ? 'true' : 'false'} aria-label="Ver imagen">
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </>
  ) : (
    <div class="pgal__placeholder" aria-hidden="true">🛍️</div>
  )}

  <div class="pgal__lb" data-pgal-lb hidden role="dialog" aria-modal="true" aria-label="Galería de imágenes del producto">
    <button type="button" class="pgal__lb-close" data-pgal-close aria-label="Cerrar">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
    <button type="button" class="pgal__lb-nav pgal__lb-prev" data-pgal-prev aria-label="Imagen anterior">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    <img class="pgal__lb-img" data-pgal-lb-img src="" alt={nombre} />
    <button type="button" class="pgal__lb-nav pgal__lb-next" data-pgal-next aria-label="Imagen siguiente">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
    <span class="pgal__lb-counter" data-pgal-counter aria-live="polite"></span>
  </div>
</div>

<style>
  .pgal__main-wrap { position: relative; overflow: hidden; border-radius: 8px; background: color-mix(in oklab, var(--ta-color-text-base) 4%, transparent); aspect-ratio: 1; }
  .pgal__main { width: 100%; height: 100%; object-fit: var(--ta-foto-fit, cover); padding: var(--ta-foto-pad, 0px); display: block; cursor: zoom-in; }
  .pgal__zoom { position: absolute; right: 0.6rem; bottom: 0.6rem; width: 2.75rem; height: 2.75rem; display: inline-flex; align-items: center; justify-content: center; border: none; border-radius: 999px; background: color-mix(in oklab, var(--ta-color-bg-base) 78%, transparent); color: var(--ta-color-text-base); cursor: zoom-in; }
  .pgal__thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 0.5rem; margin-top: 0.75rem; }
  .pgal__thumb { overflow: hidden; border-radius: 6px; border: 1px solid color-mix(in oklab, var(--ta-color-text-base) 12%, transparent); background: none; padding: 0; cursor: pointer; aspect-ratio: 1; }
  .pgal__thumb[aria-current="true"] { border-color: var(--ta-color-primary); border-width: 2px; }
  .pgal__thumb img { width: 100%; height: 100%; object-fit: var(--ta-foto-fit, cover); padding: var(--ta-foto-pad, 0px); display: block; }
  .pgal__placeholder { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; border-radius: 8px; background: color-mix(in oklab, var(--ta-color-text-base) 5%, transparent); font-size: 3.5rem; }
  .pgal--fb .pgal__main-wrap, .pgal--fb .pgal__thumb { border-radius: 0; }
  .pgal--ma .pgal__main-wrap { border-radius: 12px; }

  /* Lightbox */
  .pgal__lb { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.9); }
  .pgal__lb[hidden] { display: none; }
  .pgal__lb-img { max-width: 92vw; max-height: 86vh; object-fit: contain; }
  .pgal__lb-close, .pgal__lb-nav { position: absolute; width: 2.75rem; height: 2.75rem; display: inline-flex; align-items: center; justify-content: center; border: none; border-radius: 999px; background: rgba(255,255,255,0.16); color: #fff; cursor: pointer; }
  .pgal__lb-close { top: 1rem; right: 1rem; }
  .pgal__lb-nav { top: 50%; transform: translateY(-50%); }
  .pgal__lb-prev { left: 1rem; }
  .pgal__lb-next { right: 1rem; }
  .pgal__lb-counter { position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%); color: #fff; font-size: 0.85rem; font-family: var(--ta-font-body, system-ui); }
</style>

<script is:inline>
  (function () {
    var root = document.querySelector('.pgal[data-pgal-srcs]');
    if (!root) return;
    var main = root.querySelector('[data-pdp-main-img]');
    var lb = root.querySelector('[data-pgal-lb]');
    var lbImg = root.querySelector('[data-pgal-lb-img]');
    var counter = root.querySelector('[data-pgal-counter]');
    var prevBtn = root.querySelector('[data-pgal-prev]');
    var nextBtn = root.querySelector('[data-pgal-next]');
    var srcs = [];
    try { srcs = JSON.parse(root.getAttribute('data-pgal-srcs') || '[]'); } catch (e) { srcs = []; }
    var idx = 0, lastFocus = null;

    function setActiveThumb(src) {
      root.querySelectorAll('[data-pgal-thumb]').forEach(function (t) {
        t.setAttribute('aria-current', t.getAttribute('data-src') === src ? 'true' : 'false');
      });
    }
    // Thumb click -> swap principal (la miniatura activa la actualiza el observer del src)
    root.querySelectorAll('[data-pgal-thumb]').forEach(function (t) {
      t.addEventListener('click', function () {
        var s = t.getAttribute('data-src');
        if (s && main) main.setAttribute('src', s);
      });
    });
    // El VariantSelector (u otro) cambia el src de la principal -> sincroniza la miniatura activa.
    if (main && 'MutationObserver' in window) {
      new MutationObserver(function () { setActiveThumb(main.getAttribute('src')); })
        .observe(main, { attributes: true, attributeFilter: ['src'] });
    }

    // ---- Lightbox ----
    if (!lb || !lbImg || !main) return;
    function render() {
      lbImg.setAttribute('src', srcs[idx] || '');
      if (counter) counter.textContent = (idx + 1) + ' / ' + srcs.length;
      var solo = srcs.length <= 1;
      if (prevBtn) prevBtn.hidden = solo;
      if (nextBtn) nextBtn.hidden = solo;
    }
    function open() {
      var cur = main.getAttribute('src');
      var list = srcs.slice();
      var i = list.indexOf(cur);
      if (i < 0) { list = [cur].concat(list); i = 0; } // foto de color no listada: mostrarla igual
      srcs = list; idx = i;
      lastFocus = document.activeElement;
      lb.hidden = false;
      render();
      var c = lb.querySelector('[data-pgal-close]');
      if (c) c.focus();
      document.addEventListener('keydown', onKey);
    }
    function close() {
      lb.hidden = true;
      document.removeEventListener('keydown', onKey);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function go(d) { idx = (idx + d + srcs.length) % srcs.length; render(); }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowRight') { go(1); return; }
      if (e.key === 'ArrowLeft') { go(-1); return; }
      if (e.key === 'Tab') {
        var f = Array.prototype.slice.call(lb.querySelectorAll('button')).filter(function (b) { return !b.hidden; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    main.addEventListener('click', open);
    var openBtn = root.querySelector('[data-pgal-open]');
    if (openBtn) openBtn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
    var closeBtn = root.querySelector('[data-pgal-close]'); if (closeBtn) closeBtn.addEventListener('click', close);
    if (prevBtn) prevBtn.addEventListener('click', function () { go(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { go(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    var sx = 0;
    lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();
</script>
```

- [ ] **Step 4: Correr el test → PASA**

Run: `cd apps/storefront && npx vitest run test/product-gallery.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Verificar el CSS object-fit por var (grep de fuente; el <style> no está en el render)**

Run: `cd /c/Users/Usuario/Desktop/proyecto_aimma/aimma-website && grep -c "object-fit: var(--ta-foto-fit, cover)" apps/storefront/src/components/ProductGallery.astro`
Expected: `2` (`.pgal__main` y `.pgal__thumb img`).

- [ ] **Step 6: Suite completa (no romper nada)**

Run: `cd apps/storefront && npx vitest run`
Expected: PASS total (incluye product-gallery + el resto intacto; ProductGallery no tiene golden propio, así que no hay snapshots que regenerar).

- [ ] **Step 7: Commit**

```bash
git add apps/storefront/src/components/ProductGallery.astro apps/storefront/test/product-gallery.test.ts
git commit -m "feat(pdp): galeria respeta foto_ajuste + lightbox accesible + miniatura activa"
```

---

## Task 2: Deploy + gate empírico (Playwright)

**Files:** ninguno (deploy + verificación).

- [ ] **Step 1: Typecheck (sin errores nuevos en el componente)**

Run: `cd apps/storefront && npx astro check 2>&1 | grep -E "ProductGallery" || echo "sin errores en ProductGallery"`
Expected: sin errores en ProductGallery (los errores pre-existentes en .test.ts se ignoran).

- [ ] **Step 2: Build + deploy storefront**

Run: `cd apps/storefront && npm run build && npx wrangler deploy`
Expected: "Current Version ID: ...". Capturar el Version.

- [ ] **Step 3: Gate Playwright en una PDP de aimma-test (producto con ≥2 fotos)**

Usar `https://aimma-test.tienda.aimma.com.co/p/sandalia-prueba-1` (tiene foto principal + 2ª). Viewport 1440. Verificar empíricamente:
1. **foto_ajuste:** la principal `getComputedStyle(mainImg).objectFit` = `cover` (default tienda). (Opcional: setear `theme.foto_ajuste='contener'` por SQL + `wrangler kv ... --remote delete` → `contain`; restaurar.)
2. **Lightbox abre:** click en `.pgal__main` → `[data-pgal-lb]` visible (`hidden`==false); `getComputedStyle(lbImg).objectFit` = `contain`.
3. **Navegación:** click `[data-pgal-next]` (o flecha derecha) → `lbImg.src` cambia; el contador muestra "2 / N".
4. **Cerrar:** `Escape` → `[data-pgal-lb]` `hidden`==true; el foco vuelve a la principal.
5. **Miniatura activa:** click en una miniatura → esa `[data-pgal-thumb]` tiene `aria-current="true"` y la principal cambió a su `data-src`.
6. **Touch targets:** los botones del lightbox (close/prev/next) miden ≥44px.

- [ ] **Step 4: Commit de cierre (si el gate pidió ajustes)**

```bash
git add -A && git commit -m "fix(pdp galeria): ajustes post-gate" || echo "sin cambios"
```

---

## Self-Review (cobertura del spec)
- foto_ajuste en principal + miniaturas → Task 1 (CSS var) + Task 2 gate (objectFit). ✓
- Lightbox: contain siempre, trigger en principal, nav flechas+swipe, contador, Esc/X/scrim, role=dialog+aria-modal, focus-trap, foco vuelve, ≥44px, abre en imagen vigente → Task 1 (markup+JS) + Task 2 gate. ✓
- Miniatura activa: aria-current inicial + click + MutationObserver del src → Task 1. ✓
- 4 plantillas (componente compartido) → Task 1 (un solo archivo, prefix). ✓
- Sin deps nuevas, JS vanilla inline → Task 1. ✓
- Storefront-only (sin EF/Easypanel) → Task 2. ✓

**Fuera de alcance (del spec):** carrusel swipe de miniaturas en móvil, placeholder sin emoji, OptimizedImage en galería, magnifier al hover.
