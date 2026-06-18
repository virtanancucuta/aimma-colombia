# Migración Fotos IA → Tienda IA (PASO 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover las dos herramientas de IA (`fondo_estudio` + editar-con-prompt) desde el módulo standalone "Contenido IA" (`/iapanel/estudio/`) a una pestaña nativa "Fotos IA" dentro de Tienda IA, sin tocar el backend.

**Architecture:** Pestaña nativa de Tienda IA (`#/fotos-ia`) que embebe `/iapanel/estudio/?embed=tienda` en un `<iframe>` (mismo patrón que el canvas del editor, que es un iframe del storefront). `estudio.js` corre exacto dentro del iframe → mismas llamadas a `studio-enqueue`, mismo descuento de tokens (`reservar_tokens`), misma cola `image_jobs`, mismo Storage (`studio-inputs`/`studio-outputs`). Un chip de tokens nativo en Tienda IA (Inicio + pestaña) lee `profiles.token_balance` y se refresca por `postMessage` desde el iframe tras cada generación.

**Tech Stack:** Vanilla JS (admin de Tienda IA = IIFEs + `window.TiendaIA`), Supabase JS v2, sin build. Servido por Easypanel desde `main`. Sin tests jsdom para estas views (no hay harness general de admin) → verificación E2E en vivo (mandato de Jorge) + source-guards.

**Spec:** `docs/SUPERPOWERS/specs/2026-06-18-migracion-fotos-ia-design.md`

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `iapanel/tienda/admin/views/lib/token-chip.js` | CREAR | Helper compartido: HTML del chip de tokens + `refresh()` (re-consulta `profiles.token_balance` y actualiza todos los chips visibles). |
| `iapanel/tienda/admin/views/fotos-ia.js` | CREAR | View nativa `#/fotos-ia`: header con chip + `<iframe>` de estudio embed + listener `postMessage` para refrescar el chip + cleanup. |
| `iapanel/tienda/admin/views/inicio.js` | MODIFICAR | Mostrar el chip de tokens en el Inicio (siempre, no solo PRO-MAX). |
| `iapanel/tienda/admin/index.html` | MODIFICAR | Link de sidebar `#/fotos-ia` + `<script>` de `token-chip.js` y `fotos-ia.js` + bump cache-buster de `inicio.js`. |
| `iapanel/estudio/estudio.js` | MODIFICAR | Modo `embed=tienda` (oculta header propio) + parqueo global de 3 chips + notificar al padre por `postMessage` cuando refresca saldo. |
| `iapanel/estudio/index.html` | MODIFICAR | Bump cache-buster de `estudio.js`. |
| `iapanel/index.html` | MODIFICAR | Retiro reversible (comentar) del card "Contenido IA" + su JS. |

**NO se tocan:** la EF `studio-enqueue` (ni ninguna EF), `image_jobs`, los buckets, los RPCs de tokens, el storefront (wrangler), `recargas.html`, `admin.js`. `/iapanel/estudio/` NO se borra.

---

## Task 1: Helper compartido del chip de tokens

**Files:**
- Create: `iapanel/tienda/admin/views/lib/token-chip.js`

Las views acceden a `window.TiendaIA` (`T.state.profile.token_balance` ya viene cargado por `admin.js`; `T.supabase()` da el cliente; `T.state.profile.id` es el user id). El chip se renderiza como HTML string (las views usan `innerHTML`) y se refresca re-consultando la DB.

- [ ] **Step 1: Crear el helper**

```javascript
/* AIMMA · Tienda IA · views/lib/token-chip.js · v1 · 2026-06-18
   Chip de tokens compartido (Inicio + pestaña Fotos IA). Lee profiles.token_balance.
   .html() devuelve el markup (las views lo inyectan via innerHTML).
   .refresh() re-consulta la DB, actualiza T.state.profile.token_balance y TODOS los
   chips [data-token-chip] visibles (Inicio + Fotos IA se sincronizan juntos). */
(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[token-chip] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(function () { whenReady(cb, attempts + 1); }, 50);
  }

  function currentBalance() {
    var T = window.TiendaIA;
    var p = T && T.state && T.state.profile;
    return (p && typeof p.token_balance === 'number') ? p.token_balance : 0;
  }

  function html() {
    var bal = currentBalance();
    return '' +
      '<span class="ta-token-chip" data-token-chip>' +
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="flex:none;"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 12h6M12 9v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
        '<span class="ta-token-chip__val">' + bal + '</span> tokens' +
        '<a href="/iapanel/estudio/recargas.html" class="ta-token-chip__recargar">Recargar</a>' +
      '</span>';
  }

  async function refresh() {
    var T = window.TiendaIA;
    if (!T || !T.state || !T.state.profile) return;
    try {
      var res = await T.supabase()
        .from('profiles').select('token_balance').eq('id', T.state.profile.id).maybeSingle();
      var data = res && res.data;
      if (data && typeof data.token_balance === 'number') {
        T.state.profile.token_balance = data.token_balance;
        document.querySelectorAll('[data-token-chip] .ta-token-chip__val').forEach(function (el) {
          el.textContent = String(data.token_balance);
        });
      }
    } catch (e) { console.warn('[token-chip] refresh fallo', e); }
  }

  whenReady(function () {
    window.TiendaIA.tokenChip = { html: html, refresh: refresh };
  });
})();
```

- [ ] **Step 2: Agregar estilos del chip**

En `iapanel/tienda/admin/admin.css` (al final del archivo) agregar:

```css
/* Chip de tokens (Inicio + Fotos IA) — migracion PASO 1 */
.ta-token-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 999px;
  background: var(--ta-surface-2); border: 1px solid var(--ta-border);
  font-size: 13px; color: var(--ta-text); white-space: nowrap;
}
.ta-token-chip__val { font-weight: 700; }
.ta-token-chip__recargar { margin-left: 6px; font-size: 12px; color: var(--ta-primary, #006d8b); text-decoration: none; }
.ta-token-chip__recargar:hover, .ta-token-chip__recargar:focus-visible { text-decoration: underline; }
```

Nota: confirmar los nombres de las variables CSS (`--ta-surface-2`, `--ta-border`, `--ta-text`, `--ta-primary`) leyendo el `:root` de `admin.css`; usar las que existan (el chip usa el mismo sistema que `.ta-kpi`).

- [ ] **Step 3: Commit**

```bash
git add iapanel/tienda/admin/views/lib/token-chip.js iapanel/tienda/admin/admin.css
git commit -m "feat(fotos-ia): chip de tokens compartido (Inicio + pestana)"
```

---

## Task 2: estudio.js — modo embed + parqueo global + notificar al padre

**Files:**
- Modify: `iapanel/estudio/estudio.js` (init + `loadBalance`)
- Modify: `iapanel/estudio/index.html` (cache-buster)

`estudio.js` es un IIFE `(function () { ... })()`. Tiene una fase de init que cachea DOM y muestra `#state-editor`, y una función `loadBalance()` (~líneas 436-475) que lee `profiles.token_balance` y pinta `#saldo-value`. Los chips son `.quick-chip[data-quick]` (4: `quitar_fondo`, `fondo_estudio`, `mejorar_luz`, `fondo_lifestyle`). El header propio es `.estudio-header`.

- [ ] **Step 1: Agregar flags de migración cerca del top del IIFE**

Justo después de la apertura del IIFE / la zona de constantes (ej. cerca de `const BUCKET_IN = ...`), agregar:

```javascript
  // === Migracion PASO 1: embed dentro de Tienda IA + parqueo de herramientas ===
  const EMBED_TIENDA = new URLSearchParams(location.search).get('embed') === 'tienda';
  const TIENDA_ORIGIN = 'https://aimma.com.co';
  // Parqueo GLOBAL y reversible: estos 3 chips se ocultan en TODOS lados (standalone + embed +
  // flujo de productos). Para reactivarlos: vaciar el Set. NO se borra el codigo.
  const PARKED_QUICK = new Set(['quitar_fondo', 'mejorar_luz', 'fondo_lifestyle']);
  function applyMigrationUI() {
    document.querySelectorAll('.quick-chip').forEach(function (b) {
      if (PARKED_QUICK.has(b.dataset.quick)) b.hidden = true;
    });
    if (EMBED_TIENDA) {
      const h = document.querySelector('.estudio-header');
      if (h) h.hidden = true;
    }
  }
  function notifyParentBalance() {
    if (!EMBED_TIENDA) return;
    try { window.parent.postMessage({ type: 'fotos-ia:balance' }, TIENDA_ORIGIN); } catch (_) {}
  }
```

- [ ] **Step 2: Llamar `applyMigrationUI()` al mostrar el editor**

Localizar dónde se revela `#state-editor` (se le saca el atributo `hidden` tras el auth OK, dentro de `init()`). Inmediatamente después de mostrar el editor, agregar:

```javascript
    applyMigrationUI();
```

- [ ] **Step 3: Notificar al padre en cada refresco de saldo**

En `loadBalance()` (~líneas 436-475), al FINAL de la función (después de actualizar `state.tokenBalance` y pintar `#saldo-value`), agregar:

```javascript
    notifyParentBalance();
```

Esto cubre el refresco inicial y el de post-generación (estudio ya llama `loadBalance` tras un job cuando no es modo test). El padre re-consulta y baja el chip nativo.

- [ ] **Step 4: Bump cache-buster de estudio.js**

En `iapanel/estudio/index.html` línea 257: `estudio.js?v=13` → `estudio.js?v=14`.

- [ ] **Step 5: Verificar en vivo (standalone) que el parqueo aplica**

Abrir `https://aimma.com.co/iapanel/estudio/` (logueado). Esperado: solo se ve el chip **"Fondo estudio"** en "2. Elegi una accion rapida" (los otros 3 ocultos) + el textarea "3. O escribi lo que queres". El header propio SIGUE visible (no es embed).

- [ ] **Step 6: Verificar en vivo (embed) que el header se oculta**

Abrir `https://aimma.com.co/iapanel/estudio/?embed=tienda`. Esperado: el `.estudio-header` (brand + saldo) NO se ve; el resto sí; solo `fondo_estudio` + prompt.

- [ ] **Step 7: Commit**

```bash
git add iapanel/estudio/estudio.js iapanel/estudio/index.html
git commit -m "feat(estudio): modo embed=tienda + parqueo global de 3 chips + notify al padre"
```

---

## Task 3: View nativa Fotos IA + wiring en el admin

**Files:**
- Create: `iapanel/tienda/admin/views/fotos-ia.js`
- Modify: `iapanel/tienda/admin/index.html` (sidebar + scripts + cache-busters)

- [ ] **Step 1: Crear la view**

```javascript
/* AIMMA · Tienda IA · views/fotos-ia.js · v1 · 2026-06-18 · Pestana Fotos IA
   Embebe /iapanel/estudio/?embed=tienda en un iframe (mismo patron que el canvas del editor).
   Gate: vive dentro del admin (has-tienda => PRO) + generacion gateada server-side por tokens (EF).
   El chip de tokens se refresca por postMessage del iframe tras cada generacion. */
(function () {
  'use strict';

  var ESTUDIO_ORIGIN = 'https://aimma.com.co'; // mismo origen que el iframe

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[fotos-ia] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(function () { whenReady(cb, attempts + 1); }, 50);
  }

  function renderFotosIA() {
    var T = window.TiendaIA;
    // Enforce-en-route (defensivo): sin tienda no se monta (ya garantizado por el gate del admin).
    if (!T.state || !T.state.tienda) {
      T.dom.mainView.innerHTML = '<div class="ta-card"><p class="ta-section-sub">Esta seccion requiere una tienda activa.</p></div>';
      return;
    }
    var chip = (T.tokenChip && typeof T.tokenChip.html === 'function') ? T.tokenChip.html() : '';
    T.dom.mainView.innerHTML = '' +
      '<header class="ta-fotos-ia-head">' +
        '<div>' +
          '<h1 class="ta-section-title">Fotos IA</h1>' +
          '<p class="ta-section-sub">Subi una foto, elegi fondo estudio o describi el cambio, y la IA la genera.</p>' +
        '</div>' +
        chip +
      '</header>' +
      '<div class="ta-fotos-ia-frame">' +
        '<iframe src="/iapanel/estudio/?embed=tienda" title="Fotos IA" class="ta-fotos-ia-iframe" loading="lazy"></iframe>' +
      '</div>';

    // Sync del chip: el iframe avisa cuando refresca su saldo (post-generacion).
    var onMsg = function (e) {
      if (e.origin !== ESTUDIO_ORIGIN) return;
      var d = e.data || {};
      if (d.type === 'fotos-ia:balance' || d.type === 'fotos-ia:job-done') {
        if (T.tokenChip) T.tokenChip.refresh();
      }
    };
    window.addEventListener('message', onMsg);
    // Fallback: al recuperar foco de la pestana.
    var onVis = function () { if (!document.hidden && T.tokenChip) T.tokenChip.refresh(); };
    document.addEventListener('visibilitychange', onVis);

    // Cleanup al cambiar de route (evita listeners colgados). API real: T.registerCleanup (admin.js:399).
    if (typeof T.registerCleanup === 'function') {
      T.registerCleanup(function () {
        window.removeEventListener('message', onMsg);
        document.removeEventListener('visibilitychange', onVis);
      });
    }
  }

  whenReady(function () {
    window.TiendaIA.registerView('fotos-ia', renderFotosIA);
  });
})();
```

`window.TiendaIA` expone (verificado en `admin.js:393-400`): `state`, `supabase`, `dom`, `escapeHtml`, `registerCleanup`, `registerView`. La view agrega su consumo de `tokenChip` (Task 1).

- [ ] **Step 2: Estilos de la view**

En `admin.css` (al final) agregar:

```css
/* Pestana Fotos IA — migracion PASO 1 */
.ta-fotos-ia-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.ta-fotos-ia-frame { border: 1px solid var(--ta-border); border-radius: var(--ta-radius, 8px); overflow: hidden; background: var(--ta-surface, #fff); }
.ta-fotos-ia-iframe { display: block; width: 100%; height: calc(100vh - 180px); min-height: 600px; border: 0; }
```

- [ ] **Step 3: Sidebar link en `admin/index.html`**

Agregar la entrada DESPUÉS del link de "Vista previa" (o donde encaje), copiando el patrón `.ta-nav-link[data-route]`:

```html
          <a href="#/fotos-ia" class="ta-nav-link" data-route="fotos-ia">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="9" cy="11" r="1.6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 17l5-4 3 2 4-3 4 3" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            <span>Fotos IA</span>
          </a>
```

- [ ] **Step 4: Script includes + cache-busters en `admin/index.html`**

Cerca de los demás `views/*.js` (después de `views/inicio.js`), agregar (token-chip ANTES de fotos-ia e inicio para que `T.tokenChip` exista):

```html
  <script src="views/lib/token-chip.js?v=1"></script>
  <script src="views/fotos-ia.js?v=1"></script>
```

Y bump del cache-buster de `views/inicio.js` (lo modificamos en Task 4): `views/inicio.js?v=3` → `?v=4`.

- [ ] **Step 5: Verificar en vivo**

Easypanel se redeploya (Jorge) tras el gate; para verificación local previa, abrir el admin con sesión inyectada o esperar al gate. En vivo: la pestaña "Fotos IA" aparece en el sidebar; al entrar, se ve el chip de tokens + el iframe con la herramienta (solo `fondo_estudio` + prompt, sin el header de estudio).

- [ ] **Step 6: Commit**

```bash
git add iapanel/tienda/admin/views/fotos-ia.js iapanel/tienda/admin/index.html iapanel/tienda/admin/admin.css
git commit -m "feat(fotos-ia): view nativa con iframe de estudio embed + sidebar + sync de chip"
```

---

## Task 4: Chip de tokens en el Inicio

**Files:**
- Modify: `iapanel/tienda/admin/views/inicio.js`

El Inicio ya muestra un KPI "Tokens IA disponibles" SOLO en PRO-MAX (línea ~204). Jorge quiere los tokens visibles SIEMPRE. Agregamos el chip nativo al header del Inicio (independiente del KPI PRO-MAX, que se deja como está).

- [ ] **Step 1: Inyectar el chip en `renderHeader`**

En `inicio.js`, dentro de `renderHeader(tienda)` (línea ~152-171), agregar el chip dentro del `<header>`. Reemplazar el `return` de `renderHeader` para incluir el chip a la derecha del título:

```javascript
  function renderHeader(tienda) {
    const T = window.TiendaIA;
    const nombre = T.escapeHtml(tienda.nombre_negocio || 'Tu tienda');
    const slug = T.escapeHtml(tienda.slug || '');
    const estadoLabel = ({
      'publicada': '<span class="ta-pill ta-pill--ok">Publicada</span>',
      'pausada':   '<span class="ta-pill ta-pill--warn">Pausada</span>',
      'borrador':  '<span class="ta-pill ta-pill--info">En borrador</span>',
    })[tienda.estado] || '';
    const chip = (T.tokenChip && typeof T.tokenChip.html === 'function') ? T.tokenChip.html() : '';

    return '' +
      '<header style="margin-bottom: 24px; display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">' +
        '<div>' +
          '<h1 class="ta-section-title">Bienvenido, ' + nombre + ' ' + estadoLabel + '</h1>' +
          '<p class="ta-section-sub">' +
            'Este es el panel de control del <strong>modulo Tienda IA</strong>. ' +
            'Aqui veras como va tu catalogo y tus pedidos. ' +
            'Tu slug es <code style="background:var(--ta-surface-2);color:var(--ta-text);padding:2px 6px;border-radius:4px;border:1px solid var(--ta-border);">' + slug + '.tienda.aimma.com.co</code>' +
          '</p>' +
        '</div>' +
        chip +
      '</header>';
  }
```

- [ ] **Step 2: Bump version del archivo**

Actualizar el comentario de cabecera (`v3` → `v4`) y confirmar que el cache-buster en `admin/index.html` quedó en `?v=4` (Task 3 Step 4).

- [ ] **Step 3: Verificar en vivo**

En el Inicio de Tienda IA se ve el chip "{N} tokens · Recargar" (para cualquier plan, no solo PRO-MAX).

- [ ] **Step 4: Commit**

```bash
git add iapanel/tienda/admin/views/inicio.js
git commit -m "feat(fotos-ia): chip de tokens en el Inicio de Tienda IA"
```

---

## Task 5: Retiro reversible del card "Contenido IA" del panel

**Files:**
- Modify: `iapanel/index.html`

Retirar el punto de entrada del panel SIN borrar `/iapanel/estudio/` (lo usan la pestaña Fotos IA y `productos.js:1025`). Reversible: comentar, no borrar.

- [ ] **Step 1: Comentar el card**

En `iapanel/index.html`, envolver el `<article class="panel-card" id="cardContenidoIA">...</article>` (líneas ~247-265) en un comentario HTML:

```html
        <!-- MIGRACION PASO 1 (2026-06-18): Contenido IA se movio a Tienda IA > Fotos IA.
             Card retirado del panel (reversible: descomentar para revertir).
        <article class="panel-card" id="cardContenidoIA">
          ... (todo el contenido original del card, intacto) ...
        </article>
        -->
```

- [ ] **Step 2: Neutralizar el JS del card**

En el `<script>` inline, comentar la llamada `configurarContenidoIA();` (línea ~531) y la definición de `configurarContenidoIA()` (líneas ~421-462). Dejar las referencias `cardContenidoIA`/`badgeContenidoIA` (líneas 314-315) no rompen nada si el elemento no existe (los `if (!cardContenidoIA) return;` ya degradan), pero para limpieza, comentar también la llamada. Verificar que NINGÚN otro código del script dependa de `configurarContenidoIA`.

```javascript
      // MIGRACION PASO 1: Contenido IA movido a Tienda IA. (reversible: descomentar)
      // configurarContenidoIA();
```

- [ ] **Step 3: Verificar en vivo**

Abrir `https://aimma.com.co/iapanel/` (logueado, PRO). Esperado: solo 2 cards (Dashboard, Tienda IA). Sin errores en consola. Sin link muerto. `/iapanel/estudio/` sigue accesible por URL directa (no se borró).

- [ ] **Step 4: Commit**

```bash
git add iapanel/index.html
git commit -m "feat(fotos-ia): retiro reversible del card Contenido IA del panel"
```

---

## Task 6: Gate E2E en vivo (las DOS herramientas + los 3 checks)

**Sin código.** Verificación end-to-end real tras el deploy de Easypanel (lo hace Jorge). NO asumir ninguna de las dos herramientas — probar las dos.

- [ ] **Step 1: E2E herramienta "fondo estudio"**

En Tienda IA → pestaña Fotos IA: subir una imagen → elegir "Fondo estudio" → Generar → esperar el resultado. Confirmar: (a) aparece el resultado, (b) `profiles.token_balance` bajó 1 (verificar por SQL antes/después), (c) hay un row nuevo en `image_jobs` con `output_url` en bucket `studio-outputs`.

- [ ] **Step 2: E2E herramienta "editar con prompt"**

Misma pestaña: subir imagen → escribir una instrucción en el textarea → Generar → resultado. Confirmar (a)/(b)/(c) igual que Step 1.

- [ ] **Step 3: Check #1 — gate (server-side)**

Verificar que `studio-enqueue` rechaza con 402 a un usuario 0-token (o confirmar el camino: la herramienta muestra "0 tokens · Recargar" y Generar da error de saldo). La pestaña Fotos IA NO monta el iframe si `state.tienda` falta (defensivo).

- [ ] **Step 4: Check #2 — chip nativo sincroniza**

Tras una generación real (Step 1 o 2): el **chip de tokens NATIVO** (header de Fotos IA) bajó su número, no solo el saldo de adentro del iframe. (Llega por el `postMessage` `fotos-ia:balance`.)

- [ ] **Step 5: Check #3 — iframe autenticado**

El iframe de estudio carga SIN pedir re-login (sesión compartida por same-origin). Si pidiera login, pasar la sesión (no esperado).

- [ ] **Step 6: Nav sin links muertos + suites verdes**

Panel con 2 cards, sin errores de consola. Sidebar de Tienda IA con "Fotos IA" funcionando. `productos.js:1025` (editar foto de producto) sigue abriendo estudio OK. Correr la suite del editor (`cd tests/editor && npm test`) → verde (no se rompió nada de Tienda IA).

- [ ] **Step 7: Reporte**

Reportar a Jorge: qué se movió, qué se parqueó, y el resultado de las DOS pruebas E2E + los 3 checks. Deploy admin → Easypanel (lo redeploya Jorge).

---

## Notas de deploy

- TODO es admin (servido por Easypanel desde `main`). Jorge redeploya Easypanel tras el gate.
- NO se toca storefront (wrangler) ni EFs. La EF `studio-enqueue` no se mueve.
- Cache-busters bumpeados: `estudio.js` (v13→v14), `inicio.js` (v3→v4), nuevos `token-chip.js?v=1` + `fotos-ia.js?v=1`. El panel (`iapanel/index.html`) no necesita cache-buster (es el HTML mismo).
