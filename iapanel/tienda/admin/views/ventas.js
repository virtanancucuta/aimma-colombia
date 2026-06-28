/* AIMMA · Tienda IA · views/ventas.js · v3 · Fase 3a/3b + 4-UI-a · Ventas
   Sub-pestañas: Artículo (3a/3b, viva) / Proveedor / Categoría (placeholder "Próximamente", se construyen en 4-UI-b).
   Rango de fechas ARRIBA, compartido (montado 1 vez, persiste al cambiar de pestaña).
   Controles de orden/filtros/buscador/Excel DENTRO de la pestaña Artículo.
   renderActiveTab() re-monta SOLO #vta-tab-content -> los listeners viejos mueren con el DOM (sin duplicar);
   wireShared (fechas+tabs) corre 1 sola vez. El estado (vtaState.orden/filtros) persiste y repuebla los inputs. */
(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[ventas.js] TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }
  whenReady(() => { window.TiendaIA.registerView('ventas', renderVentas); });

  const TABS = [
    { id: 'articulo', label: 'Artículo' },
    { id: 'proveedor', label: 'Proveedor' },
    { id: 'categoria', label: 'Categoría' },
    { id: 'cliente', label: 'Cliente' },
  ];
  const TAB_META = {
    articulo:  { titulo: 'Ventas por artículo',  sub: 'Lo que vendiste en el período, por referencia. La venta neta es sin IVA; la rentabilidad se calcula sobre la neta.' },
    proveedor: { titulo: 'Ventas por proveedor', sub: 'Cuánto vendiste agrupado por proveedor, en el período.' },
    categoria: { titulo: 'Ventas por categoría', sub: 'Cuánto vendiste agrupado por categoría, en el período.' },
    cliente:   { titulo: 'Ventas por cliente',   sub: 'Cuánto te compró cada cliente, en el período.' },
  };

  // ============================================================
  // Estado de modulo
  // ============================================================
  let vtaState = null;
  function initState() {
    vtaState = {
      tab: 'articulo',        // 4-UI-a: pestaña activa (default Artículo)
      desde: null,            // resueltos por la RPC (fuente de verdad server, tz Bogota). null = mes en curso.
      hasta: null,
      orden: 'ingreso',       // default = Mayor venta
      totales: null,
      page: { limit: 25, offset: 0 },
      resumen: null,          // { rows, total }
      drillCache: {},         // producto_id -> [variantes]
      drillOpen: {},          // producto_id -> bool
      filtros: { proveedor_id: '', categoria_id: '', buscar: '' },
      catalogos: { proveedores: [], categorias: [] },
      loadedCatalogos: false,
      buscarTimer: null,
      grupo: null,            // 4-UI-b: { tipo, rows, drillCache, drillOpen } (solo el rango, NO hereda filtros)
    };
  }

  async function renderVentas() {
    const T = window.TiendaIA;
    if (!vtaState) initState();
    if (!vtaState.loadedCatalogos) await cargarCatalogos();
    T.dom.mainView.innerHTML = renderShell();
    T.dom.mainView.classList.add('ta-main--inv-wide'); // tabla ancha (cleanupCurrentView la quita al salir)
    wireShared();
    renderActiveTab();
  }

  async function cargarCatalogos() {
    const T = window.TiendaIA, sb = T.supabase(), tienda = T.state.tienda;
    try {
      const [prov, cat] = await Promise.all([
        sb.from('proveedores').select('id, nombre').eq('tienda_id', tienda.id).order('nombre'),
        sb.from('categorias').select('id, nombre, parent_id').eq('tienda_id', tienda.id).order('nombre'),
      ]);
      vtaState.catalogos.proveedores = prov.data || [];
      vtaState.catalogos.categorias = cat.data || [];
    } catch (e) { console.warn('[ventas] catalogos', e); }
    vtaState.loadedCatalogos = true;
  }

  // ============================================================
  // Shell COMPARTIDO: titulo dinamico + rango de fechas (arriba) + barra de tabs + contenedor del panel
  // ============================================================
  function renderShell() {
    const d = vtaState.desde || '', h = vtaState.hasta || '';
    const tabBar = TABS.map(t =>
      '<button type="button" class="ta-btn ta-vta-tab' + (vtaState.tab === t.id ? ' ta-btn--primary' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>'
    ).join('');
    return '' +
      '<header style="display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:12px;flex-wrap:wrap;">' +
        '<div style="max-width:560px;">' +
          '<h1 class="ta-section-title" id="vta-title"></h1>' +
          '<p class="ta-section-sub" id="vta-sub"></p>' +
        '</div>' +
        '<div class="ta-vta-daterange">' +
          '<label class="ta-vta-date">Desde <input type="date" id="vta-desde" class="ta-input" value="' + d + '"></label>' +
          '<label class="ta-vta-date">Hasta <input type="date" id="vta-hasta" class="ta-input" value="' + h + '"></label>' +
        '</div>' +
      '</header>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' + tabBar + '</div>' +
      '<div id="vta-tab-content"></div>';
  }

  function wireShared() {
    const view = window.TiendaIA.dom.mainView;
    const dD = view.querySelector('#vta-desde'), dH = view.querySelector('#vta-hasta');
    if (dD) dD.addEventListener('change', (e) => { vtaState.desde = e.target.value || null; onRangeChange(); });
    if (dH) dH.addEventListener('change', (e) => { vtaState.hasta = e.target.value || null; onRangeChange(); });
    view.querySelectorAll('.ta-vta-tab').forEach(b => b.addEventListener('click', () => {
      const id = b.getAttribute('data-tab');
      if (vtaState.tab === id) return;
      vtaState.tab = id;
      renderActiveTab();
    }));
  }

  function onRangeChange() {
    vtaState.page.offset = 0;
    vtaState.totales = null; vtaState.resumen = null;
    vtaState.drillCache = {}; vtaState.drillOpen = {}; // el costo/agregado por variante depende del rango
    if (vtaState.tab === 'articulo') fetchAndRender();
    else renderActiveTab(); // Proveedor/Categoría: re-monta el panel (re-fetch + reset drill) con el nuevo rango
  }

  function syncDateInputs() {
    const v = window.TiendaIA.dom.mainView;
    const dD = v.querySelector('#vta-desde'), dH = v.querySelector('#vta-hasta');
    if (dD && vtaState.desde) dD.value = vtaState.desde;
    if (dH && vtaState.hasta) dH.value = vtaState.hasta;
  }

  // Cambia el panel segun la pestaña. Re-monta SOLO #vta-tab-content (listeners viejos mueren con el DOM).
  function renderActiveTab() {
    const view = window.TiendaIA.dom.mainView;
    view.querySelectorAll('.ta-vta-tab').forEach(b =>
      b.classList.toggle('ta-btn--primary', b.getAttribute('data-tab') === vtaState.tab));
    const meta = TAB_META[vtaState.tab] || TAB_META.articulo;
    const tEl = view.querySelector('#vta-title'), sEl = view.querySelector('#vta-sub');
    if (tEl) tEl.textContent = meta.titulo;
    if (sEl) sEl.textContent = meta.sub;
    const cont = view.querySelector('#vta-tab-content');
    if (!cont) return;
    if (vtaState.tab === 'articulo') {
      cont.innerHTML = renderArticuloPanel();
      wireArticulo();
      fetchAndRender();
    } else {
      cont.innerHTML = renderGrupoPanel(vtaState.tab);
      wireGrupo(vtaState.tab);
      fetchGrupo(vtaState.tab);
    }
  }

  // ============================================================
  // Pestaña ARTÍCULO (3a/3b) — controles + tabla por referencia + KPIs + drill (sin cambios funcionales)
  // ============================================================
  function renderArticuloPanel() {
    const T = window.TiendaIA, f = vtaState.filtros;
    const provOpts = '<option value="">Todos los proveedores</option>' +
      vtaState.catalogos.proveedores.map(p => '<option value="' + T.escapeHtml(p.id) + '"' + (f.proveedor_id === p.id ? ' selected' : '') + '>' + T.escapeHtml(p.nombre) + '</option>').join('');
    const catOpts = '<option value="">Todas las categorías</option>' +
      vtaState.catalogos.categorias.map(c => '<option value="' + T.escapeHtml(c.id) + '"' + (f.categoria_id === c.id ? ' selected' : '') + '>' + (c.parent_id ? '— ' : '') + T.escapeHtml(c.nombre) + '</option>').join('');
    const sel = (v) => vtaState.orden === v ? ' selected' : '';
    const ordenOpts =
      '<option value="ingreso"' + sel('ingreso') + '>Mayor venta</option>' +
      '<option value="ingreso_asc"' + sel('ingreso_asc') + '>Menor venta</option>' +
      '<option value="unidades"' + sel('unidades') + '>Mayor cantidad</option>' +
      '<option value="utilidad"' + sel('utilidad') + '>Mayor utilidad</option>' +
      '<option value="rentabilidad"' + sel('rentabilidad') + '>Mayor rentabilidad</option>' +
      '<option value="referencia"' + sel('referencia') + '>Referencia (A-Z)</option>';
    const hayFiltro = f.proveedor_id || f.categoria_id || f.buscar;
    return '' +
      '<div class="ta-card" style="padding:14px 16px;margin-bottom:16px;">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
          '<input id="vta-buscar" class="ta-input" type="text" placeholder="Buscar por referencia o nombre..." value="' + T.escapeHtml(f.buscar) + '" style="flex:1;min-width:220px;">' +
          '<select id="vta-proveedor" class="ta-select" style="max-width:220px;">' + provOpts + '</select>' +
          '<select id="vta-categoria" class="ta-select" style="max-width:220px;">' + catOpts + '</select>' +
          '<select id="vta-orden" class="ta-select" style="max-width:210px;">' + ordenOpts + '</select>' +
          (hayFiltro ? '<button id="vta-limpiar" class="ta-btn" style="white-space:nowrap;">Limpiar</button>' : '') +
          '<button id="vta-export" class="ta-btn" style="padding:6px 12px;white-space:nowrap;">⬇ Exportar a Excel</button>' +
        '</div>' +
      '</div>' +
      '<div id="vta-kpis"></div>' +
      '<div id="vta-content"></div>';
  }

  function wireArticulo() {
    const view = window.TiendaIA.dom.mainView;
    const orden = view.querySelector('#vta-orden');
    if (orden) orden.addEventListener('change', () => {
      vtaState.orden = orden.value; vtaState.page.offset = 0;
      fetchResumen(view.querySelector('#vta-content')); // orden no cambia el header
    });
    const prov = view.querySelector('#vta-proveedor');
    if (prov) prov.addEventListener('change', () => { vtaState.filtros.proveedor_id = prov.value; vtaState.page.offset = 0; fetchAndRender(); });
    const cat = view.querySelector('#vta-categoria');
    if (cat) cat.addEventListener('change', () => { vtaState.filtros.categoria_id = cat.value; vtaState.page.offset = 0; fetchAndRender(); });
    const buscar = view.querySelector('#vta-buscar');
    if (buscar) buscar.addEventListener('input', () => {
      clearTimeout(vtaState.buscarTimer);
      vtaState.buscarTimer = setTimeout(() => {
        vtaState.filtros.buscar = buscar.value.trim(); vtaState.page.offset = 0; fetchAndRender();
      }, 300);
    });
    const limpiar = view.querySelector('#vta-limpiar');
    if (limpiar) limpiar.addEventListener('click', () => {
      vtaState.filtros = { proveedor_id: '', categoria_id: '', buscar: '' };
      vtaState.page.offset = 0;
      renderActiveTab(); // re-monta el panel Artículo (repuebla controles desde vtaState)
    });
    const ex = view.querySelector('#vta-export');
    if (ex) ex.addEventListener('click', () => exportarExcelVentas(ex));
  }

  // params comunes de filtro/rango para las RPCs
  function rpcParams() {
    const f = vtaState.filtros;
    return {
      p_tienda_id: window.TiendaIA.state.tienda.id,
      p_desde: vtaState.desde, p_hasta: vtaState.hasta,
      p_proveedor_id: f.proveedor_id || null,
      p_categoria_id: f.categoria_id || null,
      p_buscar: f.buscar || null,
    };
  }

  async function fetchAndRender() {
    const T = window.TiendaIA, sb = T.supabase();
    const cont = T.dom.mainView.querySelector('#vta-content');
    if (cont) cont.innerHTML = loadingCard();
    try {
      const p = rpcParams();
      const { data: tdata, error: terr } = await sb.rpc('ventas_totales', {
        p_tienda_id: p.p_tienda_id, p_desde: p.p_desde, p_hasta: p.p_hasta,
        p_proveedor_id: p.p_proveedor_id, p_categoria_id: p.p_categoria_id, p_buscar: p.p_buscar,
      });
      if (terr) { if (cont) cont.innerHTML = errorCard(terr.message); return; }
      const tot = (tdata && tdata[0]) || null;
      vtaState.totales = tot;
      if (tot) { vtaState.desde = String(tot.desde); vtaState.hasta = String(tot.hasta); syncDateInputs(); }
      pintarKpis(tot);
      await fetchResumen(cont);
    } catch (e) { if (cont) cont.innerHTML = errorCard(e.message || String(e)); }
  }

  async function fetchResumen(cont) {
    const T = window.TiendaIA, sb = T.supabase();
    if (cont) cont.innerHTML = loadingCard();
    const p = rpcParams();
    const { data, error } = await sb.rpc('ventas_resumen', {
      p_tienda_id: p.p_tienda_id, p_desde: p.p_desde, p_hasta: p.p_hasta, p_orden: vtaState.orden,
      p_proveedor_id: p.p_proveedor_id, p_categoria_id: p.p_categoria_id, p_buscar: p.p_buscar,
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
        '<p class="ta-empty__text">No hubo ventas cerradas con esos filtros en este período.</p></div></div>';
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

  function cell(cls, label, val) {
    return '<div class="ta-vta-cell ' + cls + '"><span class="ta-vta-cell__label">' + label + '</span>' + val + '</div>';
  }
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
    if (prev) prev.addEventListener('click', () => { if (vtaState.page.offset <= 0) return; vtaState.page.offset -= vtaState.page.limit; fetchResumen(cont); });
    if (next) next.addEventListener('click', () => { vtaState.page.offset += vtaState.page.limit; fetchResumen(cont); });
  }

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
  // Excel (exporta TODO el filtro/orden/rango vigente, no solo la pagina)
  // ============================================================
  let _xlsxPromise = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlsxPromise) return _xlsxPromise;
    _xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('Excel no cargó'));
      s.onerror = () => { _xlsxPromise = null; reject(new Error('No se pudo cargar el generador de Excel')); };
      document.head.appendChild(s);
    });
    return _xlsxPromise;
  }
  function xlsxDescargar(XLSX, hojas, filename) {
    const wb = XLSX.utils.book_new();
    hojas.forEach(h => {
      const ws = XLSX.utils.aoa_to_sheet(h.aoa);
      if (h.cols) ws['!cols'] = h.cols;
      XLSX.utils.book_append_sheet(wb, ws, h.nombre);
    });
    XLSX.writeFile(wb, filename);
  }
  function numExcel(n) { return (n == null) ? '' : Number(n); }
  function pctExcel(x) { return (x == null) ? '' : Math.round(Number(x) * 1000) / 10; }
  function slugTienda() { return (window.TiendaIA.state.tienda || {}).slug || 'tienda'; }
  function hoyExcel() { return new Date().toISOString().slice(0, 10); }

  async function exportarExcelVentas(btn) {
    const T = window.TiendaIA, sb = T.supabase();
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      const p = rpcParams();
      // ESCALA (anotado, no optimizar ahora): full-fetch (p_limit:null) + drill de todos los ids es el mismo
      // punto de escala ya nombrado; con miles de refs -> tabla pre-agregada (palanca nombrada).
      const { data: prods, error } = await sb.rpc('ventas_resumen', {
        p_tienda_id: p.p_tienda_id, p_desde: p.p_desde, p_hasta: p.p_hasta, p_orden: vtaState.orden,
        p_proveedor_id: p.p_proveedor_id, p_categoria_id: p.p_categoria_id, p_buscar: p.p_buscar,
        p_limit: null, p_offset: 0,
      });
      if (error) throw error;
      if (!prods || !prods.length) { T.toast('No hay ventas para exportar con esos filtros.', 'info'); return; }
      const ids = prods.map(r => r.producto_id).filter(Boolean);
      let byProd = {};
      if (ids.length) {
        const { data: vars, error: e2 } = await sb.rpc('ventas_variantes', {
          p_tienda_id: p.p_tienda_id, p_producto_ids: ids, p_desde: p.p_desde, p_hasta: p.p_hasta,
        });
        if (e2) throw e2;
        (vars || []).forEach(v => { (byProd[v.producto_id] = byProd[v.producto_id] || []).push(v); });
      }
      const aoa = [['Referencia', 'Unidades', 'Ingreso', 'Venta Neta', 'IVA', 'Costo', 'Utilidad', 'Rentabilidad %', '¿Costo aprox.?']];
      prods.forEach(r => {
        aoa.push([r.referencia, numExcel(r.unidades), numExcel(r.ingreso), numExcel(r.neta), numExcel(r.iva),
          numExcel(r.costo), numExcel(r.utilidad), pctExcel(r.rentabilidad), (r.costo_estimado ? 'Sí' : '')]);
        (byProd[r.producto_id] || []).forEach(v => {
          const et = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '');
          aoa.push(['↳ ' + et, numExcel(v.unidades), numExcel(v.ingreso), numExcel(v.neta), numExcel(v.iva),
            numExcel(v.costo), numExcel(v.utilidad), pctExcel(v.rentabilidad), (v.costo_estimado ? 'Sí' : '')]);
        });
      });
      const sum = (k) => prods.reduce((a, r) => a + Number(r[k] || 0), 0);
      aoa.push([]);
      aoa.push(['TOTAL', sum('unidades'), sum('ingreso'), sum('neta'), sum('iva'), sum('costo'), sum('utilidad'), '', '']);
      xlsxDescargar(XLSX, [{
        nombre: 'Ventas',
        aoa,
        cols: [{ wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 13 }],
      }], 'ventas_' + slugTienda() + '_' + hoyExcel() + '.xlsx');
    } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  // ============================================================
  // Pestañas PROVEEDOR / CATEGORÍA (4-UI-b) — tabla de grupos + drill (SOLO el rango; NO hereda filtros de Artículo)
  // ============================================================
  function renderGrupoPanel(tipo) {
    return '' +
      '<div class="ta-card" style="padding:12px 16px;margin-bottom:16px;display:flex;justify-content:flex-end;">' +
        '<button id="vta-grp-export" class="ta-btn" style="padding:6px 12px;white-space:nowrap;">⬇ Exportar a Excel</button>' +
      '</div>' +
      '<div id="vta-kpis"></div>' +
      '<div id="vta-grp-content"></div>';
  }

  function wireGrupo(tipo) {
    const ex = window.TiendaIA.dom.mainView.querySelector('#vta-grp-export');
    if (ex) ex.addEventListener('click', () => exportarExcelGrupo(ex, tipo));
  }

  async function fetchGrupo(tipo) {
    const T = window.TiendaIA, sb = T.supabase();
    const cont = T.dom.mainView.querySelector('#vta-grp-content');
    if (cont) cont.innerHTML = loadingCard();
    vtaState.grupo = { tipo: tipo, rows: null, drillCache: {}, drillOpen: {} };
    try {
      // Header KPIs: ventas_totales del periodo SIN filtros de Articulo (solo el rango compartido) -> invariante.
      const { data: tdata, error: terr } = await sb.rpc('ventas_totales', {
        p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta,
        p_proveedor_id: null, p_categoria_id: null, p_buscar: null,
      });
      if (terr) { if (cont) cont.innerHTML = errorCard(terr.message); return; }
      const tot = (tdata && tdata[0]) || null;
      if (tot) { vtaState.desde = String(tot.desde); vtaState.hasta = String(tot.hasta); syncDateInputs(); }
      pintarKpis(tot);
      const rpc = tipo === 'proveedor' ? 'ventas_por_proveedor'
                : tipo === 'cliente' ? 'ventas_por_cliente'
                : 'ventas_por_categoria';
      // SOLO el rango compartido — NO hereda vtaState.filtros (proveedor/categoria/buscar viven en Articulo) -> invariante.
      const args = (tipo === 'categoria')
        ? { p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta, p_parent_id: null }
        : { p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta };
      const { data, error } = await sb.rpc(rpc, args);
      if (error) { if (cont) cont.innerHTML = errorCard(error.message); return; }
      vtaState.grupo.rows = data || [];
      renderGrupoTabla(cont);
    } catch (e) { if (cont) cont.innerHTML = errorCard(e.message || String(e)); }
  }

  // rentabilidad del GRUPO sobre sus totales agregados (NO promedio de refs). Misma formula + neta=0->null que Articulo.
  function grupoRentab(r) { const n = num(r.neta); return n === 0 ? null : (n - num(r.costo)) / n; }

  function renderGrupoTabla(cont) {
    if (!cont) return;
    const g = vtaState.grupo, rows = (g && g.rows) || [];
    if (!rows.length) {
      cont.innerHTML = '<div class="ta-card"><div class="ta-empty" style="padding:32px 16px;">' +
        '<h2 class="ta-empty__title">Sin ventas</h2>' +
        '<p class="ta-empty__text">No hubo ventas cerradas en este período.</p></div></div>';
      return;
    }
    const maxIng = Math.max.apply(null, rows.map(r => Number(r.ingreso || 0)).concat([1]));
    let html = '';
    rows.forEach(r => {
      html += filaGrupo(r, maxIng);
      if (!r.es_sin_grupo && g.drillOpen[r.grupo_id]) html += drillGrupoHtml(r);
    });
    cont.innerHTML =
      '<div class="ta-card" style="padding:0;overflow:hidden;"><div class="ta-vta-grp">' +
        '<div class="ta-vta-grphead">' +
          '<span>' + (g.tipo === 'proveedor' ? 'Proveedor' : g.tipo === 'cliente' ? 'Cliente' : 'Categoría') + '</span>' +
          '<span style="text-align:right;">' + (g.tipo === 'cliente' ? 'N° pedidos' : 'Refs') + '</span>' +
          '<span style="text-align:right;">Unidades</span>' +
          '<span style="text-align:right;">Ingreso</span>' +
          '<span style="text-align:right;">Venta neta</span>' +
          '<span style="text-align:right;">Costo</span>' +
          '<span style="text-align:right;">Utilidad</span>' +
          '<span style="text-align:right;">Rentab.</span>' +
          '<span>% participación</span>' +
        '</div>' + html +
      '</div></div>';
    wireGrupoRows(cont);
  }

  function filaGrupo(r, maxIng) {
    const T = window.TiendaIA;
    const drillable = !r.es_sin_grupo;
    const abierto = drillable && !!vtaState.grupo.drillOpen[r.grupo_id];
    const barW = Math.max(2, Math.round(Number(r.ingreso || 0) / maxIng * 100));
    const pct1 = (r.pct == null) ? '0' : String(Math.round(Number(r.pct) * 10) / 10);
    const rentab = grupoRentab(r);
    const rentabNeg = (rentab != null && rentab < 0);
    const costoCell = fmtCOP(num(r.costo)) + aproxBadge(r.costo_estimado_parcial);
    return '<div class="ta-vta-grprow' + (drillable ? '' : ' ta-vta-grprow--nodrill') + '"' +
      (drillable ? ' data-gid="' + T.escapeHtml(r.grupo_id) + '" data-open="' + (abierto ? '1' : '0') + '" role="button" tabindex="0"' : '') + '>' +
      '<div class="ta-vta-grpname"><span class="ta-vta-chevron" aria-hidden="true"' + (drillable ? '' : ' style="visibility:hidden;"') + '>▸</span>' +
        (vtaState.grupo.tipo === 'cliente'
          ? '<span style="display:flex;flex-direction:column;line-height:1.25;min-width:0;"><strong>' + T.escapeHtml(r.grupo_nombre) + '</strong><span style="font-size:12px;color:var(--ta-text-mut);">' + T.escapeHtml(r.grupo_id || '') + '</span></span>'
          : '<strong>' + T.escapeHtml(r.grupo_nombre) + '</strong>') +
      '</div>' +
      cell('num', (vtaState.grupo.tipo === 'cliente' ? 'N° pedidos' : 'Refs'), fmtNum(r.num_referencias)) +
      cell('num', 'Unidades', fmtNum(r.unidades)) +
      cell('num', 'Ingreso', fmtCOP(num(r.ingreso))) +
      cell('num', 'Venta neta', fmtCOP(num(r.neta))) +
      cell('num', 'Costo', costoCell) +
      cell('num', 'Utilidad', fmtCOP(num(r.utilidad))) +
      '<div class="ta-vta-cell num' + (rentabNeg ? ' ta-vta-neg' : '') + '"><span class="ta-vta-cell__label">Rentab.</span>' + rentabTxt(rentab) + '</div>' +
      '<div class="ta-vta-grppct"><span class="ta-vta-cell__label">% participación</span>' +
        '<span class="ta-vta-grpbar"><span class="ta-vta-grpbar__fill" style="width:' + barW + '%;"></span></span>' +
        '<span class="ta-vta-grppct__n">' + pct1 + '%</span></div>' +
    '</div>';
  }

  function drillGrupoHtml(r) {
    const T = window.TiendaIA, g = vtaState.grupo;
    const c = g.drillCache[r.grupo_id];
    if (!c) return '<div class="ta-vta-grpdrill"><div class="ta-vta-grpdrill__msg">Cargando…</div></div>';
    let html = '<div class="ta-vta-grpdrill">';
    if (g.tipo === 'categoria' && c.subs && c.subs.length > 1) {
      html += '<div class="ta-vta-grpsubs">' + c.subs.map(s =>
        '<span class="ta-vta-grpsub"><b>' + T.escapeHtml(s.grupo_nombre) + '</b> ' + fmtCOP(num(s.ingreso)) + ' · ' + fmtNum(s.num_referencias) + ' refs</span>').join('') + '</div>';
    }
    if (!c.refs || !c.refs.length) html += '<div class="ta-vta-grpdrill__msg">Sin referencias.</div>';
    else html += c.refs.map(filaGrupoRef).join('');
    html += '</div>';
    return html;
  }

  function filaGrupoRef(rf) {
    const T = window.TiendaIA;
    const costoCell = fmtCOP(num(rf.costo)) + aproxBadge(rf.costo_estimado);
    return '<div class="ta-vta-vrow">' +
      '<span class="ta-vta-vmark" aria-hidden="true"></span>' +
      '<div class="ta-vta-vref"><strong>' + T.escapeHtml(rf.referencia) + '</strong> <span>' + T.escapeHtml(rf.nombre || '') + '</span></div>' +
      cell('num', 'Unidades', fmtNum(rf.unidades)) +
      cell('num', 'Ingreso', fmtCOP(num(rf.ingreso))) +
      cell('num', 'Venta neta', fmtCOP(num(rf.neta))) +
      cell('num', 'Costo', costoCell) +
      cell('num', 'Utilidad', fmtCOP(num(rf.utilidad))) +
      cell('num', 'Rentab.', rentabTxt(rf.rentabilidad)) +
    '</div>';
  }

  async function toggleGrupo(gid, tipo) {
    const T = window.TiendaIA;
    const g = vtaState.grupo;
    const cont = T.dom.mainView.querySelector('#vta-grp-content');
    if (!cont) return;
    const open = !g.drillOpen[gid];
    g.drillOpen[gid] = open;
    if (open && !g.drillCache[gid]) {
      renderGrupoTabla(cont); // muestra "Cargando…" en ese grupo
      try { await loadGrupoDrill(gid, tipo); } catch (e) { T.toast('No se pudo cargar el detalle: ' + (e.message || e), 'error'); }
    }
    renderGrupoTabla(cont);
  }

  async function loadGrupoDrill(gid, tipo) {
    const T = window.TiendaIA, sb = T.supabase();
    const cache = {};
    if (tipo === 'proveedor') {
      const { data } = await sb.rpc('ventas_resumen', {
        p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta, p_orden: 'ingreso',
        p_proveedor_id: gid, p_categoria_id: null, p_buscar: null, p_limit: null, p_offset: 0 });
      cache.refs = data || [];
    } else if (tipo === 'cliente') {
      const { data } = await sb.rpc('ventas_resumen', {
        p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta, p_orden: 'ingreso',
        p_proveedor_id: null, p_categoria_id: null, p_buscar: null, p_limit: null, p_offset: 0, p_telefono: gid });
      cache.refs = data || [];
    } else {
      const subsR = await sb.rpc('ventas_por_categoria', { p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta, p_parent_id: gid });
      const refsR = await sb.rpc('ventas_resumen', {
        p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta, p_orden: 'ingreso',
        p_proveedor_id: null, p_categoria_id: gid, p_buscar: null, p_limit: null, p_offset: 0 });
      cache.subs = subsR.data || []; cache.refs = refsR.data || [];
    }
    vtaState.grupo.drillCache[gid] = cache;
  }

  function wireGrupoRows(cont) {
    cont.querySelectorAll('.ta-vta-grprow[data-gid]').forEach(row => {
      const gid = row.getAttribute('data-gid');
      const go = () => toggleGrupo(gid, vtaState.grupo.tipo);
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  async function exportarExcelGrupo(btn, tipo) {
    const T = window.TiendaIA, sb = T.supabase();
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      const rpc = tipo === 'proveedor' ? 'ventas_por_proveedor'
                : tipo === 'cliente' ? 'ventas_por_cliente'
                : 'ventas_por_categoria';
      const args = (tipo === 'categoria')
        ? { p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta, p_parent_id: null }
        : { p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta };
      const { data: groups, error } = await sb.rpc(rpc, args);
      if (error) throw error;
      if (!groups || !groups.length) { T.toast('No hay ventas para exportar.', 'info'); return; }
      const enc = tipo === 'proveedor' ? 'Proveedor' : tipo === 'cliente' ? 'Cliente' : 'Categoría';
      const colConteo = tipo === 'cliente' ? 'N° pedidos' : 'N° refs';
      const aoa = [[enc, colConteo, 'Unidades', 'Ingreso', 'Venta Neta', 'IVA', 'Costo', 'Utilidad', 'Rentabilidad %', '% Participación']];
      for (const grp of groups) {
        const rentab = grupoRentab(grp);
        aoa.push([grp.grupo_nombre, numExcel(grp.num_referencias), numExcel(grp.unidades), numExcel(grp.ingreso),
          numExcel(grp.neta), numExcel(grp.iva), numExcel(grp.costo), numExcel(grp.utilidad),
          pctExcel(rentab), (grp.pct == null ? '' : Math.round(Number(grp.pct) * 10) / 10)]);
        if (!grp.es_sin_grupo) {
          const refArgs = tipo === 'proveedor'
            ? { p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta, p_orden: 'ingreso', p_proveedor_id: grp.grupo_id, p_categoria_id: null, p_buscar: null, p_limit: null, p_offset: 0 }
            : tipo === 'cliente'
            ? { p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta, p_orden: 'ingreso', p_proveedor_id: null, p_categoria_id: null, p_buscar: null, p_limit: null, p_offset: 0, p_telefono: grp.grupo_id }
            : { p_tienda_id: T.state.tienda.id, p_desde: vtaState.desde, p_hasta: vtaState.hasta, p_orden: 'ingreso', p_proveedor_id: null, p_categoria_id: grp.grupo_id, p_buscar: null, p_limit: null, p_offset: 0 };
          const { data: refs } = await sb.rpc('ventas_resumen', refArgs);
          (refs || []).forEach(rf => aoa.push(['↳ ' + rf.referencia, '', numExcel(rf.unidades), numExcel(rf.ingreso),
            numExcel(rf.neta), numExcel(rf.iva), numExcel(rf.costo), numExcel(rf.utilidad), pctExcel(rf.rentabilidad), '']));
        }
      }
      const sum = (k) => groups.reduce((a, gg) => a + Number(gg[k] || 0), 0);
      const sumPct = groups.reduce((a, gg) => a + Number(gg.pct || 0), 0);
      aoa.push([]);
      aoa.push(['TOTAL', '', numExcel(sum('unidades')), numExcel(sum('ingreso')), numExcel(sum('neta')), numExcel(sum('iva')),
        numExcel(sum('costo')), numExcel(sum('utilidad')), '', Math.round(sumPct * 10) / 10]);
      xlsxDescargar(XLSX, [{ nombre: enc, aoa, cols: [{ wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }] }],
        'ventas_por_' + tipo + '_' + slugTienda() + '_' + hoyExcel() + '.xlsx');
    } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

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
