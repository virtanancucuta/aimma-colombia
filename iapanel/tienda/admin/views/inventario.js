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
      orden: 'referencia',
      totales: null,
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
    const sel = (v) => invState.orden === v ? ' selected' : '';
    const ordenOpts = '<option value="referencia"' + sel('referencia') + '>Ordenar: Referencia (A-Z)</option>' +
      '<option value="cantidad_desc"' + sel('cantidad_desc') + '>Cantidad: mayor a menor</option>' +
      '<option value="cantidad_asc"' + sel('cantidad_asc') + '>Cantidad: menor a mayor</option>' +
      '<option value="valor"' + sel('valor') + '>Costo total: mayor a menor</option>' +
      '<option value="valor_asc"' + sel('valor_asc') + '>Costo total: menor a mayor</option>';

    const tabBar = TABS.map(t =>
      '<button type="button" class="ta-btn inv-tab' + (invState.tab === t.id ? ' ta-btn--primary' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>'
    ).join('');

    return '' +
      '<header style="display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:16px;flex-wrap:wrap;">' +
        '<div style="max-width:520px;">' +
          '<h1 class="ta-section-title">Inventario</h1>' +
          '<p class="ta-section-sub">Cobertura = para cuántos días te alcanza el stock, según tu ritmo de venta.</p>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">' +
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">' +
            '<span style="color:var(--ta-text-soft);font-size:13px;">Ventas de los últimos</span>' +
            btn(30) + btn(60) + chip +
            '<span style="color:var(--ta-text-soft);font-size:13px;">días</span>' +
            '<button type="button" id="inv-export" class="ta-btn" style="padding:6px 12px;">⬇ Exportar Excel</button>' +
            '<button type="button" id="inv-ajustes" class="ta-btn" title="Editar los umbrales de ruptura y sobrestock de tu tienda (próximamente)" style="padding:6px 12px;">⚙︎ Ajustes</button>' +
          '</div>' +
          '<span style="font-size:12px;color:var(--ta-text-soft);max-width:340px;text-align:right;line-height:1.4;">Elegí sobre cuántos días de ventas calcular tu ritmo. Eso define tu cobertura.</span>' +
        '</div>' +
      '</header>' +

      '<div class="ta-card" style="padding:14px 16px;margin-bottom:16px;">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
          '<input id="inv-buscar" class="ta-input" type="text" placeholder="Buscar por referencia o nombre..." value="' + T.escapeHtml(invState.filtros.buscar) + '" style="flex:1;min-width:220px;">' +
          '<select id="inv-proveedor" class="ta-select" style="max-width:220px;">' + provOpts + '</select>' +
          '<select id="inv-categoria" class="ta-select" style="max-width:220px;">' + catOpts + '</select>' +
          '<select id="inv-orden" class="ta-select" style="max-width:230px;">' + ordenOpts + '</select>' +
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
      invState.periodo = n; invState.page.offset = 0; invState.general = null; invState.totales = null;
      invState.drillCache = {}; invState.drillOpen = {}; // la cobertura por variante depende del período
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
    const ex = view.querySelector('#inv-export');
    if (ex) ex.addEventListener('click', () => exportarExcel(ex));
    const orden = view.querySelector('#inv-orden');
    if (orden) orden.addEventListener('change', () => { invState.orden = orden.value; invState.page.offset = 0; invState.general = null; renderInventario(); });

    const buscar = view.querySelector('#inv-buscar');
    if (buscar) buscar.addEventListener('input', () => {
      clearTimeout(invState.buscarTimer);
      invState.buscarTimer = setTimeout(() => {
        invState.filtros.buscar = buscar.value.trim();
        invState.page.offset = 0; invState.general = null; invState.totales = null; renderInventario();
      }, 300);
    });
    const prov = view.querySelector('#inv-proveedor');
    if (prov) prov.addEventListener('change', () => { invState.filtros.proveedor_id = prov.value; invState.page.offset = 0; invState.general = null; invState.totales = null; renderInventario(); });
    const cat = view.querySelector('#inv-categoria');
    if (cat) cat.addEventListener('change', () => { invState.filtros.categoria_id = cat.value; invState.page.offset = 0; invState.general = null; invState.totales = null; renderInventario(); });
    const limpiar = view.querySelector('#inv-limpiar');
    if (limpiar) limpiar.addEventListener('click', () => { invState.filtros = { proveedor_id: '', categoria_id: '', buscar: '' }; invState.page.offset = 0; invState.general = null; invState.totales = null; renderInventario(); });
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
        p_orden: invState.orden,
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

  // KPIs agregados (recalculan con el filtro). Cacheados en invState.totales; se
  // invalidan al cambiar período/filtros (NO en paginación/orden -> no refetch).
  async function fetchTotales() {
    const T = window.TiendaIA, sb = T.supabase();
    if (invState.totales) return invState.totales;
    const { data, error } = await sb.rpc('inventario_totales', {
      p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo,
      p_proveedor_id: invState.filtros.proveedor_id || null,
      p_categoria_id: invState.filtros.categoria_id || null,
      p_buscar: invState.filtros.buscar || null,
    });
    if (error) return null;
    invState.totales = (data && data[0]) || null;
    return invState.totales;
  }
  function pintarKpis(t) {
    const host = window.TiendaIA.dom.mainView.querySelector('#inv-kpis');
    if (!host) return;
    if (!t) { host.innerHTML = ''; return; }
    host.innerHTML =
      '<div class="ta-inv-kpis">' +
        '<div class="ta-inv-kpi"><span class="ta-inv-kpi__val">' + fmtNum(t.total_unidades) + '</span><span class="ta-inv-kpi__lbl">unidades</span></div>' +
        '<div class="ta-inv-kpi"><span class="ta-inv-kpi__val">' + fmtCOP(Number(t.valor_inventario || 0)) + '</span><span class="ta-inv-kpi__lbl">Costo Inventario</span></div>' +
        '<div class="ta-inv-kpi"><span class="ta-inv-kpi__val">' + cobTextoGeneral(t) + '</span><span class="ta-inv-kpi__lbl">cobertura general</span></div>' +
      '</div>' +
      '<p class="ta-inv-kpis__note">(cobertura según tu costo · últimos ' + invState.periodo + ' días)</p>';
  }
  function pintarTotes() {
    const host = window.TiendaIA.dom.mainView.querySelector('#inv-totes');
    const t = invState.totales;
    if (!host) return;
    if (!t) { host.innerHTML = ''; return; }
    host.innerHTML =
      '<div class="ta-inv-totes">' +
        '<span class="ta-inv-totes__lbl">TOTALES</span>' +
        '<span class="ta-inv-totes__stock">' + fmtNum(t.total_unidades) + '</span>' +
        '<span class="ta-inv-totes__valor">' + fmtCOP(Number(t.valor_inventario || 0)) + '</span>' +
      '</div>';
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
      '<div id="inv-kpis"></div>' +
      '<div class="ta-card" style="padding:0;overflow:hidden;">' +
        '<div class="ta-inv-list">' +
          '<div class="ta-inv-list__head">' +
            '<span></span><span></span><span>Referencia</span>' +
            '<span style="text-align:right;">Stock</span>' +
            '<span>Cobertura</span>' +
            '<span style="text-align:right;">Valor</span>' +
            '<span style="text-align:right;">Costo</span>' +
            '<span>Última venta</span>' +
            '<span>Proveedor</span>' +
          '</div>' + html +
          '<div id="inv-totes"></div>' +
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
    fetchTotales().then(t => { pintarKpis(t); pintarTotes(); });
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
        cell('ta-inv-cell--dias', 'Cobertura', diasInvCelda(r)) +
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
    // SIEMPRE un pill (nunca texto plano). Singular "1 día". datos_insuficientes -> pill tentativo
    // (borde punteado), distinto del sano (verde) y del rojo. "Sin ventas"/"Agotado" capitalizado.
    const pill = (cls, txt) => '<span class="ta-inv-pill ' + cls + '">' + txt + '</span>';
    if (r.clasificacion === 'quiebre' || r.dias_inventario === 0 || r.dias_inventario === '0')
      return pill('ta-inv-pill--rojo', 'Agotado');
    if (r.clasificacion === 'sin_ventas' || r.dias_inventario == null)
      return pill('ta-inv-pill--gris', 'Sin ventas');
    const d = Math.round(Number(r.dias_inventario));
    const txt = d + (d === 1 ? ' día' : ' días');
    if (r.datos_insuficientes) return pill('ta-inv-pill--tent', '≈' + txt + ' · pocos datos');
    if (r.clasificacion === 'ruptura') return pill('ta-inv-pill--rojo', txt);
    if (r.clasificacion === 'sobrestock') return pill('ta-inv-pill--ambar', txt);
    return pill('ta-inv-pill--ok', txt); // normal sano
  }

  function filaDrill(productoId) {
    const T = window.TiendaIA;
    const vs = invState.drillCache[productoId];
    if (!vs) return vrowMsg('Cargando variantes…');
    if (!vs.length) return vrowMsg('Sin variantes.');
    // Cada variante = fila ALINEADA a la grilla del padre: stock bajo STOCK,
    // cobertura (semaforo por variante) bajo COBERTURA. reservado/disp como sub-linea.
    return vs.map(v => {
      const etiqueta = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '—');
      return '<div class="ta-inv-vrow">' +
        '<span class="ta-inv-vmark" aria-hidden="true"></span>' +
        '<span class="ta-inv-vswatch" aria-hidden="true"></span>' +
        '<div class="ta-inv-vref"><strong>' + T.escapeHtml(etiqueta) + '</strong> <code>' + T.escapeHtml(v.sku || '') + '</code>' +
          '<span class="ta-inv-vsub">reservado ' + Number(v.reservado) + ' · disp. ' + Number(v.disponible) + '</span></div>' +
        '<div class="ta-inv-vcell num"><span class="ta-inv-vlabel">Stock</span>' + Number(v.stock) + '</div>' +
        '<div class="ta-inv-vcell"><span class="ta-inv-vlabel">Cobertura</span>' + diasInvCelda(v) + '</div>' +
      '</div>';
    }).join('');
  }
  function vrowMsg(txt) {
    return '<div class="ta-inv-vrow ta-inv-vrow--msg"><span class="ta-inv-vmark"></span><span class="ta-inv-vswatch"></span>' +
      '<div class="ta-inv-vref" style="color:var(--ta-text-mut);font-size:12px;">' + window.TiendaIA.escapeHtml(txt) + '</div></div>';
  }

  function wireGeneral(cont) {
    cont.querySelectorAll('.ta-inv-item').forEach(it => it.addEventListener('click', () => {
      // si el usuario esta seleccionando texto de una celda, no togglear (dejar copiar)
      if (window.getSelection && String(window.getSelection()).length > 0) return;
      toggleDrill(it.getAttribute('data-prod'));
    }));
    const prev = cont.querySelector('#inv-prev');
    const next = cont.querySelector('#inv-next');
    if (prev) prev.addEventListener('click', () => { if (invState.page.offset <= 0) return; invState.page.offset -= invState.page.limit; invState.general = null; renderActiveTab(); });
    if (next) next.addEventListener('click', () => { invState.page.offset += invState.page.limit; invState.general = null; renderActiveTab(); });
  }

  // Drill QUIRURGICO: inserta/quita las filas de variante en su lugar, SIN re-renderizar
  // toda la tabla (evita el salto de scroll y la perdida de seleccion al hacer clic).
  async function toggleDrill(productoId) {
    const T = window.TiendaIA, sb = T.supabase();
    const cont = T.dom.mainView.querySelector('#inv-content');
    if (!cont) return;
    const item = cont.querySelector('.ta-inv-item[data-prod="' + cssEsc(productoId) + '"]');
    if (!item) return;
    if (item.getAttribute('data-open') === '1') {
      invState.drillOpen[productoId] = false;
      item.setAttribute('data-open', '0');
      removeDrillRows(item);
      return;
    }
    invState.drillOpen[productoId] = true;
    item.setAttribute('data-open', '1');
    if (!invState.drillCache[productoId]) {
      insertDrillRows(item, vrowMsg('Cargando variantes…'));
      const { data, error } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: [productoId], p_periodo: invState.periodo });
      if (error) { T.toast('No pudimos cargar las variantes: ' + error.message, 'error'); invState.drillOpen[productoId] = false; item.setAttribute('data-open', '0'); removeDrillRows(item); return; }
      invState.drillCache[productoId] = data || [];
    }
    removeDrillRows(item);                 // quita el "Cargando…" si estaba
    insertDrillRows(item, filaDrill(productoId));
  }
  function removeDrillRows(item) {
    let n = item.nextElementSibling;
    while (n && n.classList && n.classList.contains('ta-inv-vrow')) { const x = n; n = n.nextElementSibling; x.remove(); }
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
  function fmtCOP(n) {
    if (!n && n !== 0) return '$0';
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n); }
    catch { return '$' + Math.round(n).toLocaleString('es-CO'); }
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString('es-CO'); }
  function cobTextoGeneral(t) {
    if (!t || Number(t.valor_inventario) === 0) return 'Sin inventario';
    if (t.cobertura_general_dias == null) return 'Sin ventas';
    return fmtNum(Math.round(Number(t.cobertura_general_dias))) + ' días';
  }
  function fmtFecha(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return '—'; }
  }

  // ============================================================
  // Exportar Excel (SheetJS lazy) — el view del momento (filtros + orden), sin paginar
  // ============================================================
  function resolverCat(categoriaId) {
    if (!categoriaId) return { cat: '', sub: '' };
    const cats = invState.catalogos.categorias;
    const c = cats.find(x => x.id === categoriaId);
    if (!c) return { cat: '', sub: '' };
    if (c.parent_id) { const par = cats.find(x => x.id === c.parent_id); return { cat: par ? par.nombre : '', sub: c.nombre }; }
    return { cat: c.nombre, sub: '' };
  }
  function cobTexto(r) {
    if (r.clasificacion === 'quiebre' || r.dias_inventario === 0 || r.dias_inventario === '0') return 'Agotado';
    if (r.clasificacion === 'sin_ventas' || r.dias_inventario == null) return 'Sin ventas';
    const d = Math.round(Number(r.dias_inventario));
    return (r.datos_insuficientes ? '≈' : '') + d + (d === 1 ? ' día' : ' días');
  }
  function numExcel(n) { return (n == null) ? '' : Number(n); }
  function fechaExcel(ts) { if (!ts) return ''; try { return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return ''; } }

  // SheetJS UMD lazy desde jsdelivr (mismo CDN que supabase/dompurify del admin). window.XLSX.
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

  async function exportarExcel(btn) {
    const T = window.TiendaIA, sb = T.supabase();
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      const { data: prods, error } = await sb.rpc('inventario_resumen', {
        p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo, p_orden: invState.orden, p_clasificacion: null,
        p_proveedor_id: invState.filtros.proveedor_id || null, p_categoria_id: invState.filtros.categoria_id || null,
        p_buscar: invState.filtros.buscar || null, p_limit: null, p_offset: 0,
      });
      if (error) throw error;
      if (!prods || !prods.length) { T.toast('No hay productos para exportar con esos filtros.', 'info'); return; }
      const ids = prods.map(p => p.producto_id);
      const { data: vars, error: e2 } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: ids, p_periodo: invState.periodo });
      if (e2) throw e2;
      const byProd = {}; (vars || []).forEach(v => { (byProd[v.producto_id] = byProd[v.producto_id] || []).push(v); });
      // Columnas: Referencia primero; Categoría/Subcategoría al FINAL (atributos de la
      // fila, no encabezado de agrupación) para que NO se lea agrupado por categoría.
      const aoa = [['Referencia', 'Nombre', 'Stock', 'Reservado', 'Disponible', 'Costo', 'Valor', 'Cobertura', 'Clasificación', 'Última venta', 'Proveedor', 'Categoría', 'Subcategoría']];
      prods.forEach(p => {
        const c = resolverCat(p.categoria_id);
        aoa.push([p.referencia, p.nombre || '', numExcel(p.stock_total), numExcel(p.reservado_total), numExcel(p.stock_disponible),
          numExcel(p.costo_unitario), numExcel(p.valor_inventario), cobTexto(p), p.clasificacion, fechaExcel(p.fecha_ultima_venta), p.proveedor_nombre || '', c.cat, c.sub]);
        (byProd[p.producto_id] || []).forEach(v => {
          const et = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '');
          aoa.push(['↳ ' + et, v.sku || '', numExcel(v.stock), numExcel(v.reservado), numExcel(v.disponible), '', '', cobTexto(v), v.clasificacion, '', '', '', '']);
        });
      });
      // Hoja 1: Inventario (por unidades) — operativa, intacta.
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 8 }, { wch: 10 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

      // Hoja 2: Resumen por costo (financiera) — agregado DIO + dónde está el capital
      // y de dónde sale el costo de venta. NO lleva cobertura por costo por referencia
      // (= a la de unidades; el costo solo cambia el número al agregar SKUs distintos).
      const { data: tot } = await sb.rpc('inventario_totales', {
        p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo,
        p_proveedor_id: invState.filtros.proveedor_id || null,
        p_categoria_id: invState.filtros.categoria_id || null, p_buscar: invState.filtros.buscar || null });
      const tt = (tot && tot[0]) || null;
      const totalValor = tt ? Number(tt.valor_inventario || 0) : 0;
      const r = [];
      r.push(['RESUMEN POR COSTO']);
      r.push(['Unidades', 'Valor de inventario', 'Costo de venta (' + invState.periodo + ' días)', 'Cobertura general (según tu costo)']);
      r.push([tt ? numExcel(tt.total_unidades) : '', tt ? numExcel(tt.valor_inventario) : '', tt ? numExcel(tt.costo_venta_periodo) : '', tt ? cobTextoGeneral(tt) : '']);
      r.push([]);
      r.push(['Referencia', 'Nombre', 'Unidades vendidas', 'Costo de venta', 'Valor de inventario', '% del capital']);
      prods.forEach(p => {
        const cogs = Math.round(Number(p.unidades_vendidas || 0) * Number(p.costo_unitario || 0));
        const pct = totalValor > 0 ? Number(((Number(p.valor_inventario || 0) / totalValor) * 100).toFixed(1)) : 0;
        r.push([p.referencia, p.nombre || '', numExcel(p.unidades_vendidas), cogs, numExcel(p.valor_inventario), pct]);
      });
      const ws2 = XLSX.utils.aoa_to_sheet(r);
      ws2['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 13 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por costo');

      const fecha = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, 'Inventario_' + (T.state.tienda.slug || 'tienda') + '_' + fecha + '.xlsx');
    } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }
  function loadingCard() {
    return '<div class="ta-card" style="padding:40px 16px;text-align:center;color:var(--ta-text-mut);">Cargando inventario…</div>';
  }
  function errorCard(msg) {
    return '<div class="ta-card"><div class="ta-empty" style="padding:32px 16px;">' +
      '<h2 class="ta-empty__title">No pudimos cargar el inventario</h2>' +
      '<p class="ta-empty__text">' + window.TiendaIA.escapeHtml(msg || 'Intenta de nuevo.') + '</p></div></div>';
  }
})();
