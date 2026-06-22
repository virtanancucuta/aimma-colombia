/* AIMMA · Tienda IA · views/inventario.js · v1 · 2026-06-21 · Fase 1b
   Modulo Inventario (la cara de la capa de lectura de 1a).
   Un route #/inventario con 4 tabs (GENERAL / SOBRESTOCK & RUPTURA / SIN VENTAS /
   KARDEX) sobre las RPCs inventario_resumen / inventario_kardex (1a) +
   inventario_variantes (drill-down, 1b). Umbrales editables inline (Task 5).
   Task 2: shell + GENERAL + drill-down + paginacion. Resto en Tasks 3-5. */
(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[inventario.js] TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }
  whenReady(() => { window.TiendaIA.registerView('inventario', renderInventario); });

  // ============================================================
  // Estado de modulo (persiste dentro de la sesion del SPA)
  // ============================================================
  let invState = null;
  function initState() {
    const T = window.TiendaIA;
    const def = (T.state.tienda && T.state.tienda.inv_periodo_default_dias) || 30;
    invState = {
      periodo: def,
      filtros: { proveedor_id: '', categoria_id: '', buscar: '' },
      tab: 'general',
      page: { limit: 25, offset: 0 },
      general: null,            // { rows, total }
      drillCache: {},           // producto_id -> [variantes]
      drillOpen: {},            // producto_id -> bool
      catalogos: { proveedores: [], categorias: [] },
      loadedCatalogos: false,
      buscarTimer: null,
    };
  }

  async function renderInventario() {
    const T = window.TiendaIA;
    if (!invState) initState();
    if (!invState.loadedCatalogos) await cargarCatalogos();
    T.dom.mainView.innerHTML = renderShell();
    wireShell();
    renderActiveTab();
  }

  async function cargarCatalogos() {
    const T = window.TiendaIA, sb = T.supabase(), tienda = T.state.tienda;
    try {
      const [prov, cat] = await Promise.all([
        sb.from('proveedores').select('id, nombre').eq('tienda_id', tienda.id).order('nombre'),
        sb.from('categorias').select('id, nombre, parent_id').eq('tienda_id', tienda.id).order('nombre'),
      ]);
      invState.catalogos.proveedores = prov.data || [];
      invState.catalogos.categorias = cat.data || [];
    } catch (e) { console.warn('[inventario] catalogos', e); }
    invState.loadedCatalogos = true;
  }

  // ============================================================
  // Shell (header + filtros + tabs)
  // ============================================================
  const TABS = [
    { id: 'general', label: 'General' },
    { id: 'accion', label: 'Sobrestock & Ruptura' },
    { id: 'sinventas', label: 'Sin ventas' },
    { id: 'kardex', label: 'Kardex' },
  ];

  function renderShell() {
    const T = window.TiendaIA;
    const per = invState.periodo;
    const rup = (T.state.tienda && T.state.tienda.inv_umbral_ruptura_dias) || 15;
    const sob = (T.state.tienda && T.state.tienda.inv_umbral_sobrestock_dias) || 90;
    const chip = (per === 30 || per === 60)
      ? ''
      : '<span class="ta-btn ta-btn--primary" style="padding:6px 14px;">' + per + '</span>';
    const btn = (n) => '<button type="button" class="ta-btn inv-per' + (per === n ? ' ta-btn--primary' : '') + '" data-per="' + n + '" style="padding:6px 14px;">' + n + '</button>';

    const provOpts = '<option value="">Todos los proveedores</option>' +
      invState.catalogos.proveedores.map(p => '<option value="' + T.escapeHtml(p.id) + '"' + (invState.filtros.proveedor_id === p.id ? ' selected' : '') + '>' + T.escapeHtml(p.nombre) + '</option>').join('');
    const cats = invState.catalogos.categorias;
    const catOpts = '<option value="">Todas las categorías</option>' +
      cats.map(c => '<option value="' + T.escapeHtml(c.id) + '"' + (invState.filtros.categoria_id === c.id ? ' selected' : '') +
        '>' + (c.parent_id ? '— ' : '') + T.escapeHtml(c.nombre) + '</option>').join('');

    const tabBar = TABS.map(t =>
      '<button type="button" class="ta-btn inv-tab' + (invState.tab === t.id ? ' ta-btn--primary' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>'
    ).join('');

    return '' +
      '<header style="display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:16px;flex-wrap:wrap;">' +
        '<div>' +
          '<h1 class="ta-section-title">Inventario</h1>' +
          '<p class="ta-section-sub">Stock, valor, velocidad y cobertura de tu catálogo. Umbrales: ruptura &lt;' + rup + ' días, sobrestock &gt;' + sob + ' días (configurables próximamente).</p>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
          '<span style="color:var(--ta-text-soft);font-size:13px;">Ventas de los últimos</span>' +
          btn(30) + btn(60) + chip +
          '<span style="color:var(--ta-text-soft);font-size:13px;">días</span>' +
          '<span title="Define la ventana de ventas con la que se calculan la velocidad de venta y los días de inventario (cobertura). Más días = promedio más estable." style="cursor:help;color:var(--ta-text-mut);font-size:12px;font-style:italic;border:1px solid var(--ta-border);border-radius:999px;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;line-height:1;">i</span>' +
          '<button type="button" id="inv-ajustes" class="ta-btn" title="Editar los umbrales de ruptura y sobrestock de tu tienda (próximamente)" style="padding:6px 12px;">⚙︎ Ajustes</button>' +
        '</div>' +
      '</header>' +

      '<div class="ta-card" style="padding:14px 16px;margin-bottom:16px;">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
          '<input id="inv-buscar" class="ta-input" type="text" placeholder="Buscar por referencia o nombre..." value="' + T.escapeHtml(invState.filtros.buscar) + '" style="flex:1;min-width:220px;">' +
          '<select id="inv-proveedor" class="ta-select" style="max-width:220px;">' + provOpts + '</select>' +
          '<select id="inv-categoria" class="ta-select" style="max-width:220px;">' + catOpts + '</select>' +
          (invState.filtros.buscar || invState.filtros.proveedor_id || invState.filtros.categoria_id
            ? '<button id="inv-limpiar" class="ta-btn" style="white-space:nowrap;">Limpiar</button>' : '') +
        '</div>' +
      '</div>' +

      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' + tabBar + '</div>' +

      '<div id="inv-content"></div>';
  }

  function wireShell() {
    const T = window.TiendaIA, view = T.dom.mainView;
    view.querySelectorAll('.inv-per').forEach(b => b.addEventListener('click', () => {
      const n = parseInt(b.getAttribute('data-per'), 10);
      if (invState.periodo === n) return;
      invState.periodo = n; invState.page.offset = 0; invState.general = null;
      renderInventario();
    }));
    view.querySelectorAll('.inv-tab').forEach(b => b.addEventListener('click', () => {
      const id = b.getAttribute('data-tab');
      if (invState.tab === id) return;
      invState.tab = id; invState.page.offset = 0;
      renderInventario();
    }));
    const ajustes = view.querySelector('#inv-ajustes');
    if (ajustes) ajustes.addEventListener('click', () => T.toast('Ajustes de inventario — disponible en breve.', 'info'));

    const buscar = view.querySelector('#inv-buscar');
    if (buscar) buscar.addEventListener('input', () => {
      clearTimeout(invState.buscarTimer);
      invState.buscarTimer = setTimeout(() => {
        invState.filtros.buscar = buscar.value.trim();
        invState.page.offset = 0; invState.general = null; renderInventario();
      }, 300);
    });
    const prov = view.querySelector('#inv-proveedor');
    if (prov) prov.addEventListener('change', () => { invState.filtros.proveedor_id = prov.value; invState.page.offset = 0; invState.general = null; renderInventario(); });
    const cat = view.querySelector('#inv-categoria');
    if (cat) cat.addEventListener('change', () => { invState.filtros.categoria_id = cat.value; invState.page.offset = 0; invState.general = null; renderInventario(); });
    const limpiar = view.querySelector('#inv-limpiar');
    if (limpiar) limpiar.addEventListener('click', () => { invState.filtros = { proveedor_id: '', categoria_id: '', buscar: '' }; invState.page.offset = 0; invState.general = null; renderInventario(); });
  }

  function renderActiveTab() {
    const cont = window.TiendaIA.dom.mainView.querySelector('#inv-content');
    if (!cont) return;
    if (invState.tab === 'general') { fetchAndRenderGeneral(cont); return; }
    cont.innerHTML = '<div class="ta-card"><div class="ta-empty" style="padding:32px 16px;">' +
      '<h2 class="ta-empty__title">En construcción</h2>' +
      '<p class="ta-empty__text">Esta vista llega en la próxima entrega.</p></div></div>';
  }

  // ============================================================
  // GENERAL
  // ============================================================
  async function fetchAndRenderGeneral(cont) {
    const T = window.TiendaIA, sb = T.supabase();
    cont.innerHTML = loadingCard();
    try {
      const { data, error } = await sb.rpc('inventario_resumen', {
        p_tienda_id: T.state.tienda.id,
        p_periodo: invState.periodo,
        p_orden: 'referencia',
        p_clasificacion: null,
        p_proveedor_id: invState.filtros.proveedor_id || null,
        p_categoria_id: invState.filtros.categoria_id || null,
        p_buscar: invState.filtros.buscar || null,
        p_limit: invState.page.limit,
        p_offset: invState.page.offset,
      });
      if (error) { cont.innerHTML = errorCard(error.message); return; }
      const rows = data || [];
      invState.general = { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
      renderGeneral(cont);
    } catch (e) { cont.innerHTML = errorCard(e.message || String(e)); }
  }

  function renderGeneral(cont) {
    const T = window.TiendaIA;
    const { rows, total } = invState.general;
    if (!rows.length) {
      cont.innerHTML = '<div class="ta-card"><div class="ta-empty" style="padding:32px 16px;">' +
        '<h2 class="ta-empty__title">Sin productos</h2>' +
        '<p class="ta-empty__text">No hay productos con esos filtros.</p></div></div>';
      return;
    }
    let html = '';
    rows.forEach(r => {
      html += filaGeneral(r);
      if (invState.drillOpen[r.producto_id]) html += filaDrill(r.producto_id);
    });
    const desde = invState.page.offset + 1;
    const hasta = invState.page.offset + rows.length;
    cont.innerHTML =
      '<div class="ta-card" style="padding:0;overflow:hidden;">' +
        '<div class="ta-inv-list">' +
          '<div class="ta-inv-list__head">' +
            '<span></span><span></span><span>Referencia</span>' +
            '<span style="text-align:right;">Stock</span>' +
            '<span>Días inv.</span>' +
            '<span style="text-align:right;">Valor</span>' +
            '<span style="text-align:right;">Costo</span>' +
            '<span>Última venta</span>' +
            '<span>Proveedor</span>' +
          '</div>' + html +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:12px;flex-wrap:wrap;">' +
        '<span style="color:var(--ta-text-mut);font-size:13px;">' + total + ' producto(s) · mostrando ' + desde + '–' + hasta + '</span>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="inv-prev" class="ta-btn" ' + (invState.page.offset <= 0 ? 'disabled' : '') + ' style="padding:6px 12px;">← Anterior</button>' +
          '<button id="inv-next" class="ta-btn" ' + (hasta >= total ? 'disabled' : '') + ' style="padding:6px 12px;">Siguiente →</button>' +
        '</div>' +
      '</div>';
    wireGeneral(cont);
  }

  // cell helper: una celda del grid-list con su label (visible solo en mobile)
  function cell(cls, label, val) {
    return '<div class="ta-inv-cell ' + cls + '"><span class="ta-inv-cell__label">' + label + '</span>' + val + '</div>';
  }

  function filaGeneral(r) {
    const T = window.TiendaIA;
    const abierto = !!invState.drillOpen[r.producto_id];
    const foto = r.foto_principal_url
      ? '<img class="ta-inv-thumb" src="' + T.escapeHtml(r.foto_principal_url) + '" alt="">'
      : '<div class="ta-inv-thumb ta-inv-thumb--empty">📦</div>';
    const costo = r.costo_unitario != null ? fmtCOP(Number(r.costo_unitario)) : '—';
    return '<div class="ta-inv-item" data-prod="' + T.escapeHtml(r.producto_id) + '" data-open="' + (abierto ? '1' : '0') + '">' +
      '<span class="ta-inv-chevron" aria-hidden="true">▸</span>' +
      foto +
      '<div class="ta-inv-ref"><strong>' + T.escapeHtml(r.referencia) + '</strong><span>' + T.escapeHtml(r.nombre || '') + '</span></div>' +
      '<div class="ta-inv-metrics">' +
        cell('num ta-inv-cell--stock', 'Stock', String(Number(r.stock_total))) +
        cell('ta-inv-cell--dias', 'Días inv.', diasInvCelda(r)) +
        cell('num ta-inv-cell--valor', 'Valor', fmtCOP(Number(r.valor_inventario || 0))) +
      '</div>' +
      '<div class="ta-inv-sec">' +
        cell('num ta-inv-cell--sec ta-inv-cell--costo', 'Costo', costo) +
        cell('ta-inv-cell--sec ta-inv-cell--ultima', 'Última venta', fmtFecha(r.fecha_ultima_venta)) +
        cell('ta-inv-cell--sec ta-inv-cell--prov', 'Proveedor', (r.proveedor_nombre ? T.escapeHtml(r.proveedor_nombre) : '—')) +
      '</div>' +
    '</div>';
  }

  function diasInvCelda(r) {
    // 0 -> "Agotado"; null -> "Sin consumo"; numero -> badge segun clasificacion
    let texto, cls = badgeClasif(r.clasificacion);
    if (r.dias_inventario === 0 || r.dias_inventario === '0') texto = 'Agotado';
    else if (r.dias_inventario == null) texto = 'Sin consumo';
    else texto = Math.round(Number(r.dias_inventario)) + ' días';
    const badge = cls ? '<span class="' + cls + '" style="margin-left:0;">' + texto + '</span>' : '<span>' + texto + '</span>';
    const nota = r.datos_insuficientes ? '<span class="ta-inv-note">pocos días de data</span>' : '';
    return badge + nota;
  }

  function filaDrill(productoId) {
    const T = window.TiendaIA;
    const vs = invState.drillCache[productoId];
    if (!vs) return '<div class="ta-inv-drill">' + miniLoading() + '</div>';
    if (!vs.length) return '<div class="ta-inv-drill" style="color:var(--ta-text-mut);font-size:12px;">Sin variantes.</div>';
    const filas = vs.map(v => {
      const etiqueta = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '—');
      return '<div class="ta-inv-drill__v">' +
        '<b>' + T.escapeHtml(etiqueta) + '</b> <code>' + T.escapeHtml(v.sku || '') + '</code>' +
        '<span>Stock ' + Number(v.stock) + '</span>' +
        '<span style="color:var(--ta-text-mut);">Reservado ' + Number(v.reservado) + '</span>' +
        '<span><b>Disp. ' + Number(v.disponible) + '</b></span>' +
      '</div>';
    }).join('');
    return '<div class="ta-inv-drill">' + filas + '</div>';
  }

  function wireGeneral(cont) {
    cont.querySelectorAll('.ta-inv-item').forEach(it => it.addEventListener('click', () => toggleDrill(it.getAttribute('data-prod'))));
    const prev = cont.querySelector('#inv-prev');
    const next = cont.querySelector('#inv-next');
    if (prev) prev.addEventListener('click', () => { if (invState.page.offset <= 0) return; invState.page.offset -= invState.page.limit; invState.general = null; renderActiveTab(); });
    if (next) next.addEventListener('click', () => { invState.page.offset += invState.page.limit; invState.general = null; renderActiveTab(); });
  }

  async function toggleDrill(productoId) {
    const T = window.TiendaIA, sb = T.supabase();
    const cont = T.dom.mainView.querySelector('#inv-content');
    if (invState.drillOpen[productoId]) { invState.drillOpen[productoId] = false; renderGeneral(cont); return; }
    invState.drillOpen[productoId] = true;
    if (!invState.drillCache[productoId]) {
      renderGeneral(cont); // muestra mini-loading
      const { data, error } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_id: productoId });
      if (error) { T.toast('No pudimos cargar las variantes: ' + error.message, 'error'); invState.drillOpen[productoId] = false; renderGeneral(cont); return; }
      invState.drillCache[productoId] = data || [];
    }
    renderGeneral(cont);
  }

  // ============================================================
  // Utils
  // ============================================================
  function badgeClasif(clasif) {
    if (clasif === 'quiebre' || clasif === 'ruptura') return 'ta-pill ta-pill--danger';
    if (clasif === 'sobrestock') return 'ta-pill ta-pill--warn';
    if (clasif === 'sin_ventas') return 'ta-pill ta-inv-pill--mut';
    return '';
  }
  function fmtCOP(n) {
    if (!n && n !== 0) return '$0';
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n); }
    catch { return '$' + Math.round(n).toLocaleString('es-CO'); }
  }
  function fmtFecha(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return '—'; }
  }
  function loadingCard() {
    return '<div class="ta-card" style="padding:40px 16px;text-align:center;color:var(--ta-text-mut);">Cargando inventario…</div>';
  }
  function miniLoading() { return '<span style="font-size:12px;color:var(--ta-text-mut);padding:8px 16px;display:inline-block;">Cargando variantes…</span>'; }
  function errorCard(msg) {
    return '<div class="ta-card"><div class="ta-empty" style="padding:32px 16px;">' +
      '<h2 class="ta-empty__title">No pudimos cargar el inventario</h2>' +
      '<p class="ta-empty__text">' + window.TiendaIA.escapeHtml(msg || 'Intenta de nuevo.') + '</p></div></div>';
  }
})();
