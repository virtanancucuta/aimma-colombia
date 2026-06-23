# Inventario · Tab KARDEX · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps con checkbox.

**Goal:** Tab Kardex (master-detail): elegir una referencia y ver su movimiento-por-movimiento (entradas/ventas/ajustes/saldo) con filtro de variante + rango de fechas. Front-only, sin RPC nueva.

**Architecture:** `renderActiveTab` → `fetchAndRenderKardex`. Estado A (sin referencia): lista de referencias de `inventario_resumen` (reúsa filtros del shell). Estado B (referencia elegida): `inventario_variantes` (dropdown) + `inventario_kardex` (movimientos) con variante/fechas/paginación. Saldo SOLO con una variante (corre por variante).

**Tech Stack:** JS vanilla TiendaIA, tokens `--ta-*`, RPCs existentes.

## RESUELTO (Jorge, 2026-06-23) — 3 confirmaciones que ajustan el build
- **(R1) Orden de la tabla = más reciente ARRIBA, saldo correcto.** La RPC computa el saldo cronológico (viejo→nuevo) y devuelve asc (oldest-first) con `saldo_acumulado` correcto por fila. Para mostrar newest-first **se trae el kardex COMPLETO en páginas (loop offset hasta agotar) y se INVIERTE en cliente** (`rows.reverse()`), NO se usa "Ver más" oldest-first (daría el extremo equivocado al truncar). Así la fila de arriba es la más nueva y su `saldo_acumulado` == stock actual de esa variante. Kardex largos se acotan con el rango de fechas. `loadKardexRows`/"Ver más" del borrador se reemplazan por `loadKardexAll()` (loop páginas de 500, cap 20 págs/10k con nota) + reverse.
- **(R2) Filtro por fecha (no created_at).** Desde/Hasta → `p_desde/p_hasta` de `inventario_kardex` (filtra por `fecha`); el saldo corre sobre TODO el historial antes de filtrar → cada fila muestra su acumulado real (no se reinicia en el "Desde"). Verificar en Task 4 con un rango real.
- **(R3) Copy del ajuste con signo:** `tipoLabel(m)` recibe la fila; para `ajuste` devuelve "Ajuste (+)" si `cantidad>0`, "Ajuste (−)" si `<0` (audiencia no contable).

## Global Constraints
- Branch `feat/inv-1b-kardex`; merge a main + Implementa; deploy-to-prod OFF.
- SIN RPC nueva. Saldo solo cuando se filtra 1 variante (PASO 0: con "Todas" el saldo salta entre variantes). Default variante: 1→esa, varias→"Todas". Rango fechas default = todo. Paginación 200 + "Ver más". Tipos en humano. En kardex se ocultan período/Ordenar/Excel. Ancho desktop con `.ta-main--inv-wide` (excluir kardex del grid de GENERAL). Audit de columnas antes de avisar. /ui-ux-pro-max + /impeccable.

## File Structure
- Modify: `iapanel/tienda/admin/views/inventario.js` — estado, routing, shell (ocultar período en kardex + filtros card solo en estado A), picker + view + helpers.
- Modify: `iapanel/tienda/admin/admin.css` — `.ta-inv-kx*` (grid + ancho + mobile).
- Modify: `iapanel/tienda/admin/index.html` — bump.

---

### Task 1: Estado + routing + shell

- [ ] **Step 1: Estado** — `initState`: `kardex: null,`. (Holder: `{ productoId, ref, nombre, varianteId, desde, hasta, variantes, rows, offset, fin }`.)

- [ ] **Step 2: Shell — período solo en general/accion** (kardex y sin ventas no lo usan). Reemplazar la condición actual del bloque período:
```js
            ((invState.tab === 'general' || invState.tab === 'accion')
              ? ('<span style="color:var(--ta-text-soft);font-size:13px;">Ventas de los últimos</span>' + btn(30) + btn(60) + chip + '<span style="color:var(--ta-text-soft);font-size:13px;">días</span>')
              : '') +
```
y el helper de abajo igual: `((invState.tab === 'general' || invState.tab === 'accion') ? '<span ...>Elegí sobre...</span>' : '')`.

- [ ] **Step 3: Shell — ocultar el card de filtros en kardex estado B** (referencia ya elegida): envolver el `<div class="ta-card" ...>` de filtros en:
```js
      ((invState.tab === 'kardex' && invState.kardex && invState.kardex.productoId) ? '' : ('<div class="ta-card" style="padding:14px 16px;margin-bottom:16px;">' + ...filtros... + '</div>')) +
```
(En estado A el picker usa los filtros; en estado B no aplican.)

- [ ] **Step 4: Routing** — `renderActiveTab`: `if (invState.tab === 'kardex') { fetchAndRenderKardex(cont); return; }`.

- [ ] **Step 5: Verificar** — `node --check`; el tab kardex aún cae en "En construcción" hasta Task 2.

- [ ] **Step 6: Commit** — `git commit -m "feat(inventario): routing kardex + shell (oculta periodo en kardex/sinventas, filtros solo en picker) (Kardex Task 1)"`

---

### Task 2: Picker + vista de kardex

- [ ] **Step 1: Helpers + funciones** (agregar tras `renderSinVentas`):
```js
  function tipoLabel(t) {
    return ({ venta: 'Venta', entrada: 'Entrada', saldo_inicial: 'Saldo inicial', ajuste: 'Ajuste', devolucion: 'Devolución' })[t] || t;
  }
  async function fetchAndRenderKardex(cont) {
    if (!invState.kardex || !invState.kardex.productoId) { renderKardexPicker(cont); return; }
    renderKardexView(cont);
  }
  async function renderKardexPicker(cont) {
    const T = window.TiendaIA, sb = T.supabase();
    cont.innerHTML = loadingCard();
    try {
      const { data, error } = await sb.rpc('inventario_resumen', {
        p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo, p_orden: 'referencia', p_clasificacion: null,
        p_proveedor_id: invState.filtros.proveedor_id || null, p_categoria_id: invState.filtros.categoria_id || null,
        p_buscar: invState.filtros.buscar || null, p_limit: 60, p_offset: 0,
      });
      if (error) { cont.innerHTML = errorCard(error.message); return; }
      const rows = data || [];
      const lista = rows.length
        ? rows.map(r => '<button type="button" class="ta-inv-kxpick" data-prod="' + T.escapeHtml(r.producto_id) + '" data-ref="' + T.escapeHtml(r.referencia) + '" data-nom="' + T.escapeHtml(r.nombre || '') + '"><strong>' + T.escapeHtml(r.referencia) + '</strong><span>' + T.escapeHtml(r.nombre || '') + '</span></button>').join('')
        : '<div class="ta-empty" style="padding:28px 16px;"><p class="ta-empty__text">No hay referencias con esos filtros.</p></div>';
      cont.innerHTML = '<p class="ta-inv-resumen__note" style="margin:0 2px 12px;">Elegí una referencia para ver su kardex (movimiento por movimiento).</p>' +
        '<div class="ta-card" style="padding:8px;"><div class="ta-inv-kxlist">' + lista + '</div></div>';
      cont.querySelectorAll('.ta-inv-kxpick').forEach(b => b.addEventListener('click', () => {
        enterKardex(b.getAttribute('data-prod'), b.getAttribute('data-ref'), b.getAttribute('data-nom'));
      }));
    } catch (e) { cont.innerHTML = errorCard(e.message || String(e)); }
  }
  async function enterKardex(productoId, ref, nombre) {
    const T = window.TiendaIA, sb = T.supabase();
    invState.kardex = { productoId, ref, nombre, varianteId: '', desde: '', hasta: '', variantes: [], rows: [], offset: 0, fin: false };
    // cargar variantes para el dropdown (no bloquea el render si falla)
    try {
      const { data } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: [productoId], p_periodo: invState.periodo });
      const vs = data || [];
      invState.kardex.variantes = vs;
      if (vs.length === 1) invState.kardex.varianteId = vs[0].variante_id; // 1 variante -> esa
    } catch (e) { /* dropdown queda solo con Todas */ }
    renderInventario(); // re-render (oculta el card de filtros) -> renderKardexView via routing
  }
  async function loadKardexRows(reset) {
    const T = window.TiendaIA, sb = T.supabase(), k = invState.kardex;
    if (reset) { k.offset = 0; k.rows = []; k.fin = false; }
    const { data, error } = await sb.rpc('inventario_kardex', {
      p_tienda_id: T.state.tienda.id, p_producto_id: k.productoId,
      p_variante_id: k.varianteId || null, p_desde: k.desde || null, p_hasta: k.hasta || null,
      p_limit: 200, p_offset: k.offset,
    });
    if (error) throw error;
    const rows = data || [];
    k.rows = k.rows.concat(rows); k.fin = rows.length < 200; k.offset += rows.length;
  }
  function renderKardexView(cont) {
    const T = window.TiendaIA, k = invState.kardex;
    const unaVar = !!k.varianteId; // saldo solo con 1 variante
    const verLabel = (v) => [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || 'variante');
    const varOpts = '<option value=""' + (k.varianteId ? '' : ' selected') + '>Todas las variantes</option>' +
      (k.variantes || []).map(v => '<option value="' + T.escapeHtml(v.variante_id) + '"' + (k.varianteId === v.variante_id ? ' selected' : '') + '>' + T.escapeHtml(verLabel(v)) + '</option>').join('');
    const head = '<div class="ta-inv-kxhead">' +
      '<button type="button" id="kx-back" class="ta-btn">← Cambiar referencia</button>' +
      '<h2 class="ta-inv-kxtitle">' + T.escapeHtml(k.ref) + ' <span>' + T.escapeHtml(k.nombre || '') + '</span></h2></div>';
    const controls = '<div class="ta-inv-kxctrls">' +
      '<select id="kx-var" class="ta-select" style="max-width:240px;">' + varOpts + '</select>' +
      '<label class="ta-inv-kxdate">Desde <input type="date" id="kx-desde" class="ta-input" value="' + (k.desde || '') + '"></label>' +
      '<label class="ta-inv-kxdate">Hasta <input type="date" id="kx-hasta" class="ta-input" value="' + (k.hasta || '') + '"></label>' +
      ((k.desde || k.hasta) ? '<button type="button" id="kx-limpiar" class="ta-btn">Limpiar fechas</button>' : '') +
    '</div>';
    let body;
    if (!k.rows.length) {
      body = '<div class="ta-card"><div class="ta-empty" style="padding:28px 16px;"><p class="ta-empty__text">Sin movimientos para esta referencia en ese rango.</p></div></div>';
    } else {
      const filas = k.rows.map(m => {
        const ent = m.entrada > 0 ? '<span class="ta-inv-kxin">+' + m.entrada + '</span>' : '';
        const sal = m.salida > 0 ? '<span class="ta-inv-kxout">-' + m.salida + '</span>' : '';
        return '<div class="ta-inv-kxrow' + (unaVar ? ' ta-inv-kxrow--saldo' : ' ta-inv-kxrow--var') + '">' +
          '<div class="ta-inv-kxcell"><span class="ta-inv-cell__label">Fecha</span>' + fmtFecha(m.fecha) + '</div>' +
          '<div class="ta-inv-kxcell"><span class="ta-inv-cell__label">Movimiento</span>' + tipoLabel(m.tipo) + '</div>' +
          '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Entrada</span>' + (ent || '—') + '</div>' +
          '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Salida</span>' + (sal || '—') + '</div>' +
          (unaVar ? '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Saldo</span>' + Number(m.saldo_acumulado) + '</div>'
                  : '<div class="ta-inv-kxcell"><span class="ta-inv-cell__label">Variante</span>' + T.escapeHtml([m.color, m.talla].filter(Boolean).join(' · ') || (m.sku || '—')) + '</div>') +
          '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Costo unit.</span>' + (m.costo_unitario != null ? fmtCOP(Number(m.costo_unitario)) : '—') + '</div>' +
        '</div>';
      }).join('');
      const headRow = '<div class="ta-inv-kxhrow ' + (unaVar ? 'ta-inv-kxrow--saldo' : 'ta-inv-kxrow--var') + '">' +
        '<span>Fecha</span><span>Movimiento</span><span style="text-align:right;">Entrada</span><span style="text-align:right;">Salida</span>' +
        (unaVar ? '<span style="text-align:right;">Saldo</span>' : '<span>Variante</span>') + '<span style="text-align:right;">Costo unit.</span></div>';
      body = '<div class="ta-card" style="padding:0;overflow:hidden;"><div class="ta-inv-kxtable">' + headRow + filas + '</div></div>' +
        (k.fin ? '' : '<div style="text-align:center;margin-top:12px;"><button type="button" id="kx-mas" class="ta-btn">Ver más movimientos</button></div>');
    }
    cont.innerHTML = head + controls + body;
    cont.querySelector('#kx-back').addEventListener('click', () => { invState.kardex = null; renderInventario(); });
    cont.querySelector('#kx-var').addEventListener('change', (e) => { k.varianteId = e.target.value; loadKardexRows(true).then(() => renderKardexView(cont)).catch(err => T.toast(err.message, 'error')); });
    const dDesde = cont.querySelector('#kx-desde'), dHasta = cont.querySelector('#kx-hasta');
    if (dDesde) dDesde.addEventListener('change', (e) => { k.desde = e.target.value; loadKardexRows(true).then(() => renderKardexView(cont)).catch(err => T.toast(err.message, 'error')); });
    if (dHasta) dHasta.addEventListener('change', (e) => { k.hasta = e.target.value; loadKardexRows(true).then(() => renderKardexView(cont)).catch(err => T.toast(err.message, 'error')); });
    const lim = cont.querySelector('#kx-limpiar'); if (lim) lim.addEventListener('click', () => { k.desde = ''; k.hasta = ''; loadKardexRows(true).then(() => renderKardexView(cont)); });
    const mas = cont.querySelector('#kx-mas'); if (mas) mas.addEventListener('click', () => { mas.disabled = true; loadKardexRows(false).then(() => renderKardexView(cont)).catch(err => T.toast(err.message, 'error')); });
    // primera carga (cuando rows vacío y no se cargó aún)
    if (!k.rows.length && !k._loaded) { k._loaded = true; loadKardexRows(true).then(() => renderKardexView(cont)).catch(err => { cont.innerHTML = errorCard(err.message); }); }
  }
```
**Nota de flujo:** `enterKardex` setea el estado + `renderInventario()` (que oculta el card de filtros y enruta a `renderKardexView`). La primera carga de filas la dispara `renderKardexView` (guard `_loaded`). En cambios de variante/fecha se hace `loadKardexRows(true)` (reset) + re-render.

- [ ] **Step 2: Verificar** — `node --check`.

- [ ] **Step 3: Commit** — `git commit -m "feat(inventario): tab Kardex — picker de referencia + vista movimiento-por-movimiento (variante/fechas/ver mas) (Kardex Task 2)"`

---

### Task 3: CSS + bump + merge

- [ ] **Step 1: CSS** (`admin.css`, zona inventario):
```css
/* Tab Kardex: picker de referencia + tabla de movimientos */
.ta-inv-kxlist { display:flex; flex-direction:column; }
.ta-inv-kxpick { display:flex; flex-direction:column; gap:1px; text-align:left; padding:10px 12px; border:none; background:transparent; border-bottom:1px solid var(--ta-border); cursor:pointer; }
.ta-inv-kxpick:last-child { border-bottom:none; } .ta-inv-kxpick:hover { background:var(--ta-bg-soft); }
.ta-inv-kxpick strong { font-size:14px; } .ta-inv-kxpick span { font-size:12px; color:var(--ta-text-soft); }
.ta-inv-kxhead { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:0 0 12px; }
.ta-inv-kxtitle { font-size:18px; font-weight:700; margin:0; color:var(--ta-text); } .ta-inv-kxtitle span { font-weight:400; color:var(--ta-text-soft); font-size:15px; }
.ta-inv-kxctrls { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:0 0 14px; }
.ta-inv-kxdate { font-size:13px; color:var(--ta-text-soft); display:inline-flex; gap:6px; align-items:center; }
.ta-inv-kxtable { display:flex; flex-direction:column; }
.ta-inv-kxhrow, .ta-inv-kxrow { display:grid; gap:0 12px; align-items:center; }
.ta-inv-kxrow--saldo { grid-template-columns: 110px minmax(110px,1fr) 80px 80px 90px minmax(110px,1fr); }
.ta-inv-kxrow--var   { grid-template-columns: 110px minmax(110px,1fr) 80px 80px minmax(120px,1.2fr) minmax(110px,1fr); }
.ta-inv-kxhrow { padding:0 12px 8px; font-size:11px; text-transform:uppercase; letter-spacing:.03em; font-weight:600; color:var(--ta-text-soft); border-bottom:1px solid var(--ta-border); }
.ta-inv-kxrow { padding:9px 12px; border-bottom:1px solid var(--ta-border); font-size:13px; }
.ta-inv-kxrow:last-child { border-bottom:none; }
.ta-inv-kxcell { min-width:0; } .ta-inv-kxcell.num { text-align:right; font-variant-numeric:tabular-nums; }
.ta-inv-kxin { color:#0f5132; font-weight:600; } .ta-inv-kxout { color:#8a5a00; font-weight:600; }
@media (min-width:1500px) {
  .ta-main--inv-wide .ta-inv-kxrow--saldo, .ta-main--inv-wide .ta-inv-kxhrow.ta-inv-kxrow--saldo { grid-template-columns: 130px minmax(160px,1.4fr) 100px 100px 120px minmax(160px,1.2fr); }
  .ta-main--inv-wide .ta-inv-kxrow--var, .ta-main--inv-wide .ta-inv-kxhrow.ta-inv-kxrow--var { grid-template-columns: 130px minmax(160px,1.4fr) 100px 100px minmax(180px,1.4fr) minmax(160px,1.2fr); }
}
@media (max-width:760px) {
  .ta-inv-kxhrow { display:none; }
  .ta-inv-kxrow { grid-template-columns:1fr 1fr !important; gap:6px 12px; padding:12px; }
  .ta-inv-kxrow .ta-inv-cell__label { display:block; font-size:10px; font-weight:600; text-transform:uppercase; color:var(--ta-text-mut); }
  .ta-inv-kxrow .ta-inv-kxcell.num { text-align:left; }
}
```
**OJO (lección S&R/Sin Ventas):** el grid ancho de GENERAL (`@media ≥1500 .ta-main--inv-wide .ta-inv-item:not(...)`) NO toca `.ta-inv-kxrow` (no es `.ta-inv-item`), así que NO hay que excluirlo. El kardex usa su propia clase de fila (`.ta-inv-kxrow`), no `.ta-inv-item`. Confirmar en el audit que ninguna regla de GENERAL lo pisa.

- [ ] **Step 2: Bump** — `index.html` css + inventario.js (siguiente número).

- [ ] **Step 3: Verificar** — `node --check`.

- [ ] **Step 4: Commit + merge**
```bash
git add -A && git commit -m "feat(inventario): estilos Kardex + bump (Kardex Task 3)"
git checkout main && git merge --no-ff feat/inv-1b-kardex -m "merge: Inventario tab Kardex" && git push origin main
```

---

### Task 4: Gate (con verificación de datos)
- [ ] Verificación BD (impersonando dueño): `inventario_kardex(QAINV-MV, talla S)` saldo limpio 19→5; "Todas" sin saldo (columna variante); rango de fechas filtra; última saldo_acumulado de una variante == su stock actual.
- [ ] Jorge Implementa; curl byte-idéntico. **Audit de columnas (head=filas, ninguna regla de GENERAL pisa el kardex) antes de avisar.**
- [ ] Funcional desktop+mobile (QAINV): picker (buscar/filtrar) → kardex; cambiar variante → saldo limpio; fechas; "Ver más"; tipos legibles; sin período/Ordenar/Excel; ancho desktop; mobile. **OK visual de Jorge.** → cierra Fase 1b (luego cleanup seed QAINV-*).

## Self-Review
- D1 picker/detail → renderKardexPicker/renderKardexView; D2 variante default → enterKardex (1→esa); D3 saldo solo 1 variante → `unaVar` (columna saldo vs variante); D4 fechas → kx-desde/hasta; D5 columnas/tipos → tipoLabel + headRow; D6 paginación → loadKardexRows + "Ver más"; D7 shell → Task 1 Step 2-3. ✓
- Tipos: `invState.kardex={productoId,ref,nombre,varianteId,desde,hasta,variantes,rows,offset,fin,_loaded}`; `inventario_kardex` params/returns == PASO 0; `loadKardexRows(reset)`; `tipoLabel`. ✓
- Riesgo: `renderKardexView` se llama varias veces (cambios de filtro) — el guard `_loaded` evita doble carga inicial; los handlers se re-agregan en cada render (innerHTML nuevo, sin listeners duplicados). ✓
