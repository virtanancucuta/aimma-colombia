/* AIMMA · Tienda IA · views/ventas.js · v1 · Fase 3a · Venta por articulo
   La cara de la capa de calculo de Ventas (RPCs ventas_resumen / ventas_variantes / ventas_totales).
   3a: header de totales + tabla por referencia + rango de fechas (default mes en curso, lo manda la RPC)
   + drill a variantes. 3b suma: ordenamientos, filtros (proveedor/categoria), buscador y Excel.
   Patrones reusados de inventario.js (registerView, tabla densa, drill quirurgico, cell+label responsive). */
(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[ventas.js] TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }
  whenReady(() => { window.TiendaIA.registerView('ventas', renderVentas); });

  // ============================================================
  // Estado de modulo
  // ============================================================
  let vtaState = null;
  function initState() {
    vtaState = {
      desde: null,            // resueltos por la RPC (fuente de verdad server, tz Bogota). null = mes en curso.
      hasta: null,
      orden: 'ingreso',       // 3a: fijo (el selector llega en 3b)
      totales: null,
      page: { limit: 25, offset: 0 },
      resumen: null,          // { rows, total }
      drillCache: {},         // producto_id -> [variantes]
      drillOpen: {},          // producto_id -> bool
    };
  }

  function renderVentas() {
    const T = window.TiendaIA;
    if (!vtaState) initState();
    T.dom.mainView.innerHTML = renderShell();
    // Ventas usa tabla ancha: reusa el cap ancho de inventario (.ta-main--inv-wide; cleanupCurrentView lo quita al salir).
    T.dom.mainView.classList.add('ta-main--inv-wide');
    wireShell();
    fetchAndRender();
  }

  function renderShell() {
    const d = vtaState.desde || '', h = vtaState.hasta || '';
    return '' +
      '<header style="display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:16px;flex-wrap:wrap;">' +
        '<div style="max-width:560px;">' +
          '<h1 class="ta-section-title">Ventas por artículo</h1>' +
          '<p class="ta-section-sub">Lo que vendiste en el período, por referencia. La venta neta es sin IVA; la rentabilidad se calcula sobre la neta.</p>' +
        '</div>' +
        '<div class="ta-vta-daterange">' +
          '<label class="ta-vta-date">Desde <input type="date" id="vta-desde" class="ta-input" value="' + d + '"></label>' +
          '<label class="ta-vta-date">Hasta <input type="date" id="vta-hasta" class="ta-input" value="' + h + '"></label>' +
        '</div>' +
      '</header>' +
      '<div id="vta-kpis"></div>' +
      '<div id="vta-content"></div>';
  }

  function wireShell() {
    const view = window.TiendaIA.dom.mainView;
    const dD = view.querySelector('#vta-desde'), dH = view.querySelector('#vta-hasta');
    if (dD) dD.addEventListener('change', (e) => { vtaState.desde = e.target.value || null; onRangeChange(); });
    if (dH) dH.addEventListener('change', (e) => { vtaState.hasta = e.target.value || null; onRangeChange(); });
  }
  function onRangeChange() {
    vtaState.page.offset = 0;
    vtaState.totales = null; vtaState.resumen = null;
    vtaState.drillCache = {}; vtaState.drillOpen = {}; // el costo/agregado por variante depende del rango
    fetchAndRender();
  }

  function syncDateInputs() {
    const v = window.TiendaIA.dom.mainView;
    const dD = v.querySelector('#vta-desde'), dH = v.querySelector('#vta-hasta');
    if (dD && vtaState.desde) dD.value = vtaState.desde;
    if (dH && vtaState.hasta) dH.value = vtaState.hasta;
  }

  // ============================================================
  // Fetch + render
  // ============================================================
  async function fetchAndRender() {
    const T = window.TiendaIA, sb = T.supabase();
    const cont = T.dom.mainView.querySelector('#vta-content');
    if (cont) cont.innerHTML = loadingCard();
    try {
      // 1) Totales PRIMERO: la RPC es la fuente de verdad del rango (mes en curso en tz Bogota server-side).
      const { data: tdata, error: terr } = await sb.rpc('ventas_totales', {
        p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta,
        p_proveedor_id: null, p_categoria_id: null, p_buscar: null,
      });
      if (terr) { if (cont) cont.innerHTML = errorCard(terr.message); return; }
      const tot = (tdata && tdata[0]) || null;
      vtaState.totales = tot;
      if (tot) { vtaState.desde = String(tot.desde); vtaState.hasta = String(tot.hasta); syncDateInputs(); }
      pintarKpis(tot);
      // 2) Resumen con el rango ya resuelto (mismas fechas que el header).
      await fetchResumen(cont);
    } catch (e) { if (cont) cont.innerHTML = errorCard(e.message || String(e)); }
  }

  async function fetchResumen(cont) {
    const T = window.TiendaIA, sb = T.supabase();
    const { data, error } = await sb.rpc('ventas_resumen', {
      p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta,
      p_orden: vtaState.orden, p_proveedor_id: null, p_categoria_id: null, p_buscar: null,
      p_limit: vtaState.page.limit, p_offset: vtaState.page.offset,
    });
    if (error) { if (cont) cont.innerHTML = errorCard(error.message); return; }
    const rows = data || [];
    vtaState.resumen = { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
    renderResumen(cont);
  }

  function pintarKpis(t) {
    const host = window.TiendaIA.dom.mainView.querySelector('#vta-kpis');
    if (!host) return;
    if (!t) { host.innerHTML = ''; return; }
    const margen = (t.margen == null) ? '—' : fmtPct(t.margen);
    host.innerHTML =
      '<div class="ta-vta-kpis">' +
        kpi(fmtNum(t.unidades), 'unidades') +
        kpi(fmtCOP(num(t.ingreso)), 'ingreso (con IVA)') +
        kpi(fmtCOP(num(t.neta)), 'venta neta') +
        kpi(fmtCOP(num(t.iva)), 'IVA') +
        kpi(fmtCOP(num(t.costo)), 'costo') +
        kpi(fmtCOP(num(t.utilidad)), 'utilidad') +
        kpi(margen, 'margen') +
      '</div>' +
      '<p class="ta-vta-kpis__note">' + fmtNum(t.pedidos) + ' pedido(s) · ' + (t.desde || '') + ' a ' + (t.hasta || '') +
        (t.costo_estimado_parcial ? ' · incluye costos aprox.' : '') + '</p>';
  }
  function kpi(val, lbl) {
    return '<div class="ta-vta-kpi"><span class="ta-vta-kpi__val">' + val + '</span><span class="ta-vta-kpi__lbl">' + lbl + '</span></div>';
  }

  function renderResumen(cont) {
    if (!cont) return;
    const { rows, total } = vtaState.resumen;
    if (!rows.length) {
      cont.innerHTML = '<div class="ta-card"><div class="ta-empty" style="padding:32px 16px;">' +
        '<h2 class="ta-empty__title">Sin ventas</h2>' +
        '<p class="ta-empty__text">No hubo ventas cerradas en este período.</p></div></div>';
      return;
    }
    let html = '';
    rows.forEach(r => {
      html += filaVenta(r);
      if (r.producto_id && vtaState.drillOpen[r.producto_id]) html += filaDrillVenta(r.producto_id);
    });
    const desde = vtaState.page.offset + 1;
    const hasta = vtaState.page.offset + rows.length;
    cont.innerHTML =
      '<div class="ta-card" style="padding:0;overflow:hidden;">' +
        '<div class="ta-vta-list">' +
          '<div class="ta-vta-list__head">' +
            '<span></span><span></span><span>Referencia</span>' +
            '<span style="text-align:right;">Unidades</span>' +
            '<span style="text-align:right;">Ingreso</span>' +
            '<span style="text-align:right;">Venta neta</span>' +
            '<span style="text-align:right;">Costo</span>' +
            '<span style="text-align:right;">Utilidad</span>' +
            '<span style="text-align:right;">Rentab.</span>' +
          '</div>' + html +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:12px;flex-wrap:wrap;">' +
        '<span style="color:var(--ta-text-mut);font-size:13px;">' + total + ' referencia(s) · mostrando ' + desde + '–' + hasta + '</span>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="vta-prev" class="ta-btn" ' + (vtaState.page.offset <= 0 ? 'disabled' : '') + ' style="padding:6px 12px;">← Anterior</button>' +
          '<button id="vta-next" class="ta-btn" ' + (hasta >= total ? 'disabled' : '') + ' style="padding:6px 12px;">Siguiente →</button>' +
        '</div>' +
      '</div>';
    wireList(cont);
  }

  // cell helper: una celda del grid con su label (visible solo en mobile)
  function cell(cls, label, val) {
    return '<div class="ta-vta-cell ' + cls + '"><span class="ta-vta-cell__label">' + label + '</span>' + val + '</div>';
  }
  // Badge "costo aprox." (copy plano, no tecnico) cuando el costo es estimado (sin movimiento de kardex).
  function aproxBadge(estimado) {
    return estimado ? ' <span class="ta-vta-aprox" title="Costo estimado: esta venta no tiene movimiento de inventario registrado.">aprox.</span>' : '';
  }
  function rentabTxt(x) { return (x == null) ? '—' : fmtPct(x); }

  function filaVenta(r) {
    const T = window.TiendaIA;
    const drillable = !!r.producto_id;
    const abierto = drillable && !!vtaState.drillOpen[r.producto_id];
    const foto = r.foto_principal_url
      ? '<img class="ta-vta-thumb" src="' + T.escapeHtml(r.foto_principal_url) + '" alt="">'
      : '<div class="ta-vta-thumb ta-vta-thumb--empty">📦</div>';
    const costoCell = fmtCOP(num(r.costo)) + aproxBadge(r.costo_estimado);
    return '<div class="ta-vta-item' + (drillable ? '' : ' ta-vta-item--nodrill') + '" data-prod="' + T.escapeHtml(r.producto_id || '') + '" data-open="' + (abierto ? '1' : '0') + '">' +
      '<span class="ta-vta-chevron" aria-hidden="true"' + (drillable ? '' : ' style="visibility:hidden;"') + '>▸</span>' +
      foto +
      '<div class="ta-vta-ref"><strong>' + T.escapeHtml(r.referencia) + '</strong><span>' + T.escapeHtml(r.nombre || '') + '</span></div>' +
      cell('num', 'Unidades', fmtNum(r.unidades)) +
      cell('num', 'Ingreso', fmtCOP(num(r.ingreso))) +
      cell('num', 'Venta neta', fmtCOP(num(r.neta))) +
      cell('num', 'Costo', costoCell) +
      cell('num', 'Utilidad', fmtCOP(num(r.utilidad))) +
      cell('num', 'Rentab.', rentabTxt(r.rentabilidad)) +
    '</div>';
  }

  function filaDrillVenta(productoId) {
    const T = window.TiendaIA;
    const vs = vtaState.drillCache[productoId];
    if (!vs) return vrowMsg('Cargando variantes…');
    if (!vs.length) return vrowMsg('Sin variantes.');
    return vs.map(v => {
      const etiqueta = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '—');
      const costoCell = fmtCOP(num(v.costo)) + aproxBadge(v.costo_estimado);
      return '<div class="ta-vta-vrow">' +
        '<span class="ta-vta-vmark" aria-hidden="true"></span>' +
        '<div class="ta-vta-vref"><strong>' + T.escapeHtml(etiqueta) + '</strong> <code>' + T.escapeHtml(v.sku || '') + '</code></div>' +
        cell('num', 'Unidades', fmtNum(v.unidades)) +
        cell('num', 'Ingreso', fmtCOP(num(v.ingreso))) +
        cell('num', 'Venta neta', fmtCOP(num(v.neta))) +
        cell('num', 'Costo', costoCell) +
        cell('num', 'Utilidad', fmtCOP(num(v.utilidad))) +
        cell('num', 'Rentab.', rentabTxt(v.rentabilidad)) +
      '</div>';
    }).join('');
  }
  function vrowMsg(txt) {
    return '<div class="ta-vta-vrow ta-vta-vrow--msg"><span class="ta-vta-vmark"></span>' +
      '<div class="ta-vta-vref" style="color:var(--ta-text-mut);font-size:12px;">' + window.TiendaIA.escapeHtml(txt) + '</div></div>';
  }

  function wireList(cont) {
    cont.querySelectorAll('.ta-vta-item').forEach(it => it.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('button')) return;
      if (window.getSelection && String(window.getSelection()).length > 0) return;
      const pid = it.getAttribute('data-prod');
      if (pid) toggleDrill(pid);
    }));
    const prev = cont.querySelector('#vta-prev'), next = cont.querySelector('#vta-next');
    if (prev) prev.addEventListener('click', () => { if (vtaState.page.offset <= 0) return; vtaState.page.offset -= vtaState.page.limit; fetchResumen(window.TiendaIA.dom.mainView.querySelector('#vta-content')); });
    if (next) next.addEventListener('click', () => { vtaState.page.offset += vtaState.page.limit; fetchResumen(window.TiendaIA.dom.mainView.querySelector('#vta-content')); });
  }

  // Drill quirurgico: inserta/quita filas de variante en su lugar, sin re-render de la tabla.
  async function toggleDrill(productoId) {
    const T = window.TiendaIA, sb = T.supabase();
    const cont = T.dom.mainView.querySelector('#vta-content');
    if (!cont) return;
    const item = cont.querySelector('.ta-vta-item[data-prod="' + cssEsc(productoId) + '"]');
    if (!item) return;
    if (item.getAttribute('data-open') === '1') {
      vtaState.drillOpen[productoId] = false;
      item.setAttribute('data-open', '0');
      removeDrillRows(item);
      return;
    }
    vtaState.drillOpen[productoId] = true;
    item.setAttribute('data-open', '1');
    if (!vtaState.drillCache[productoId]) {
      insertDrillRows(item, vrowMsg('Cargando variantes…'));
      const { data, error } = await sb.rpc('ventas_variantes', {
        p_tienda_id: T.state.tienda.id, p_producto_ids: [productoId],
        p_desde: vtaState.desde, p_hasta: vtaState.hasta,
      });
      if (error) {
        T.toast('No pudimos cargar las variantes: ' + error.message, 'error');
        vtaState.drillOpen[productoId] = false; item.setAttribute('data-open', '0'); removeDrillRows(item); return;
      }
      vtaState.drillCache[productoId] = data || [];
    }
    removeDrillRows(item);
    insertDrillRows(item, filaDrillVenta(productoId));
  }
  function removeDrillRows(item) {
    let n = item.nextElementSibling;
    while (n && n.classList && n.classList.contains('ta-vta-vrow')) { const x = n; n = n.nextElementSibling; x.remove(); }
  }
  function insertDrillRows(item, html) {
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    let ref = item;
    Array.from(tpl.content.children).forEach(node => { ref.after(node); ref = node; });
  }
  function cssEsc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

  // ============================================================
  // Utils
  // ============================================================
  function num(n) { return Number(n || 0); }
  function fmtCOP(n) {
    if (!n && n !== 0) return '$0';
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n); }
    catch { return '$' + Math.round(n).toLocaleString('es-CO'); }
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString('es-CO'); }
  function fmtPct(x) { const p = Number(x) * 100; return (Math.round(p * 10) / 10).toLocaleString('es-CO') + '%'; }
  function loadingCard() {
    return '<div class="ta-card" style="padding:40px 16px;text-align:center;color:var(--ta-text-mut);">Cargando ventas…</div>';
  }
  function errorCard(msg) {
    return '<div class="ta-card"><div class="ta-empty" style="padding:32px 16px;">' +
      '<h2 class="ta-empty__title">No pudimos cargar las ventas</h2>' +
      '<p class="ta-empty__text">' + window.TiendaIA.escapeHtml(msg || 'Intenta de nuevo.') + '</p></div></div>';
  }
})();
