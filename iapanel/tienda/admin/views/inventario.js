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
      ajustesOpen: false,
      accion: null,             // { rows, ver }
      sinventas: null,          // { rows }
      sinventasPeriodo: 30,     // ventana propia del tab (30/45/60/90)
      kardex: null,             // { productoId, ref, nombre, varianteId, desde, hasta, variantes, rows, fin, _loaded }
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
    // PARTE B: todo Inventario aprovecha el ancho desktop (sube el cap de .ta-main). Cada tab tiene
    // su grilla ancha (GENERAL 9 cols / acción 3 cols). cleanupCurrentView() la quita al salir.
    T.dom.mainView.classList.add('ta-main--inv-wide');
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
            ((invState.tab === 'general' || invState.tab === 'accion')
              ? ('<span style="color:var(--ta-text-soft);font-size:13px;">Ventas de los últimos</span>' + btn(30) + btn(60) + chip + '<span style="color:var(--ta-text-soft);font-size:13px;">días</span>')
              : '') +
            ((invState.tab === 'general' || invState.tab === 'accion' || invState.tab === 'sinventas' || (invState.tab === 'kardex' && !(invState.kardex && invState.kardex.panel))) ? '<button type="button" id="inv-export" class="ta-btn" style="padding:6px 12px;">⬇ Exportar Excel</button>' : '') +
            '<button type="button" id="inv-ajustes" class="ta-btn" title="Editar los umbrales de ruptura y sobrestock de tu tienda (próximamente)" style="padding:6px 12px;">⚙︎ Ajustes</button>' +
          '</div>' +
          ((invState.tab === 'general' || invState.tab === 'accion') ? '<span style="font-size:12px;color:var(--ta-text-soft);max-width:340px;text-align:right;line-height:1.4;">Elegí sobre cuántos días de ventas calcular tu ritmo. Eso define tu cobertura.</span>' : '') +
        '</div>' +
      '</header>' +

      // En Kardex Nivel 2 (panel de una variante) los filtros no aplican -> se ocultan. En la lista (Nivel 1) sí.
      ((invState.tab === 'kardex' && invState.kardex && invState.kardex.panel) ? '' : (
        '<div class="ta-card" style="padding:14px 16px;margin-bottom:16px;">' +
          '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
            '<input id="inv-buscar" class="ta-input" type="text" placeholder="Buscar por referencia o nombre..." value="' + T.escapeHtml(invState.filtros.buscar) + '" style="flex:1;min-width:220px;">' +
            '<select id="inv-proveedor" class="ta-select" style="max-width:220px;">' + provOpts + '</select>' +
            '<select id="inv-categoria" class="ta-select" style="max-width:220px;">' + catOpts + '</select>' +
            (invState.tab === 'general' ? '<select id="inv-orden" class="ta-select" style="max-width:230px;">' + ordenOpts + '</select>' : '') +
            (invState.filtros.buscar || invState.filtros.proveedor_id || invState.filtros.categoria_id
              ? '<button id="inv-limpiar" class="ta-btn" style="white-space:nowrap;">Limpiar</button>' : '') +
          '</div>' +
        '</div>'
      )) +

      panelAjustesHtml() +

      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' + tabBar + '</div>' +

      '<div id="inv-content"></div>';
  }

  // Panel inline de Ajustes (3 umbrales). Se muestra cuando invState.ajustesOpen.
  function panelAjustesHtml() {
    if (!invState.ajustesOpen) return '';
    const t = window.TiendaIA.state.tienda || {};
    const campo = (id, label, help, val) =>
      '<div class="ta-inv-aj__row">' +
        '<label class="ta-inv-aj__lbl" for="' + id + '">' + label + '</label>' +
        '<input id="' + id + '" class="ta-input ta-inv-aj__inp" type="number" min="1" step="1" value="' + val + '">' +
        '<span class="ta-inv-aj__help">' + help + '</span>' +
      '</div>';
    return '<div class="ta-card ta-inv-aj" style="margin-bottom:16px;">' +
      '<h2 class="ta-inv-aj__title">Ajustes de inventario</h2>' +
      '<p class="ta-inv-aj__intro">Estos 3 números definen tus alarmas y la sugerencia de compra. Van en orden: ruptura &lt; óptimo &lt; sobrestock.</p>' +
      campo('aj-ruptura', 'Ruptura (días)', 'Avisame cuando a un producto le queden menos de estos días de stock.', (t.inv_umbral_ruptura_dias || 15)) +
      campo('aj-optimo', 'Inventario óptimo (días)', 'Cuántos días de stock querés tener como meta. Lo usamos para sugerirte cuánto comprar.', (t.inv_umbral_optimo_dias || 30)) +
      campo('aj-sobrestock', 'Sobrestock (días)', 'Avisame cuando un producto tenga más de estos días de stock (capital parado).', (t.inv_umbral_sobrestock_dias || 60)) +
      '<p id="aj-error" class="ta-inv-aj__error" hidden></p>' +
      '<div class="ta-inv-aj__actions">' +
        '<button type="button" id="aj-cancel" class="ta-btn">Cancelar</button>' +
        '<button type="button" id="aj-save" class="ta-btn ta-btn--primary">Guardar</button>' +
      '</div>' +
    '</div>';
  }

  async function guardarAjustes(btn) {
    const T = window.TiendaIA, sb = T.supabase(), view = T.dom.mainView;
    const err = view.querySelector('#aj-error');
    const showErr = (m) => { if (err) { err.textContent = m; err.hidden = false; } };
    const r = parseInt(view.querySelector('#aj-ruptura').value, 10);
    const o = parseInt(view.querySelector('#aj-optimo').value, 10);
    const s = parseInt(view.querySelector('#aj-sobrestock').value, 10);
    if (![r, o, s].every(n => Number.isInteger(n) && n >= 1)) return showErr('Poné números enteros de 1 día o más.');
    if (!(r < o && o < s)) return showErr('Tienen que ir en orden: ruptura < óptimo < sobrestock.');
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const { error } = await sb.from('tiendas')
        .update({ inv_umbral_ruptura_dias: r, inv_umbral_optimo_dias: o, inv_umbral_sobrestock_dias: s })
        .eq('id', T.state.tienda.id);
      if (error) {
        showErr(error.code === '23514' ? 'Revisá los números: ruptura < óptimo < sobrestock.' : ('No se pudo guardar: ' + error.message));
        btn.disabled = false; btn.textContent = old; return;
      }
      T.state.tienda.inv_umbral_ruptura_dias = r;
      T.state.tienda.inv_umbral_optimo_dias = o;
      T.state.tienda.inv_umbral_sobrestock_dias = s;
      invState.ajustesOpen = false;
      invState.general = null; invState.totales = null; invState.accion = null;
      T.toast('Ajustes guardados.', 'success');
      renderInventario();
    } catch (e) {
      showErr('No se pudo guardar: ' + (e.message || e));
      btn.disabled = false; btn.textContent = old;
    }
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
    if (ajustes) ajustes.addEventListener('click', () => { invState.ajustesOpen = !invState.ajustesOpen; renderInventario(); });
    const ajCancel = view.querySelector('#aj-cancel');
    if (ajCancel) ajCancel.addEventListener('click', () => { invState.ajustesOpen = false; renderInventario(); });
    const ajSave = view.querySelector('#aj-save');
    if (ajSave) ajSave.addEventListener('click', () => guardarAjustes(ajSave));
    const ex = view.querySelector('#inv-export');
    if (ex) ex.addEventListener('click', () => {
      if (invState.tab === 'accion') exportarExcelAccion(ex);
      else if (invState.tab === 'sinventas') exportarExcelSinVentas(ex);
      else if (invState.tab === 'kardex') exportarExcelKardexLista(ex);
      else exportarExcel(ex);
    });
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
    if (invState.tab === 'accion') { fetchAndRenderAccion(cont); return; }
    if (invState.tab === 'sinventas') { fetchAndRenderSinVentas(cont); return; }
    if (invState.tab === 'kardex') { fetchAndRenderKardex(cont); return; }
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

  // ============================================================
  // SOBRESTOCK & RUPTURA (tab 'accion') — segmented Ver + sugerencia de compra
  // ============================================================
  async function fetchAndRenderAccion(cont) {
    const T = window.TiendaIA, sb = T.supabase();
    cont.innerHTML = loadingCard();
    try {
      const { data, error } = await sb.rpc('inventario_resumen', {
        p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo, p_orden: 'dias_asc',
        p_clasificacion: ['quiebre', 'ruptura', 'sobrestock'],
        p_proveedor_id: invState.filtros.proveedor_id || null,
        p_categoria_id: invState.filtros.categoria_id || null,
        p_buscar: invState.filtros.buscar || null, p_limit: null, p_offset: 0,
      });
      if (error) { cont.innerHTML = errorCard(error.message); return; }
      const ver = (invState.accion && invState.accion.ver) || 'ruptura';
      invState.accion = { rows: data || [], ver };
      renderAccion(cont);
    } catch (e) { cont.innerHTML = errorCard(e.message || String(e)); }
  }

  function umbrOptimo() { return Number((window.TiendaIA.state.tienda || {}).inv_umbral_optimo_dias || 30); }
  function umbrSobrestock() { return Number((window.TiendaIA.state.tienda || {}).inv_umbral_sobrestock_dias || 60); }
  function capitalAmarrado(velocidad, stock, costo) {
    const sob = umbrSobrestock();
    const demas = Math.max(0, Math.round(Number(stock) - sob * Number(velocidad || 0)));
    return { unidades: demas, capital: demas * Number(costo || 0) };
  }
  // cantidad a comprar hacia el óptimo. -1e-9 absorbe residuo flotante (óptimo==días_ef:
  // óptimo×venta_diaria=14.0000000002 -> ceil empujaría 9->10). Verificado Task 1 + bordes.
  function sugCompra(velocidad, datos_insuf, stock, costo) {
    if (datos_insuf) return { estado: 'insuf' };
    if (!velocidad || Number(velocidad) === 0) return { estado: 'sinhist' };
    const opt = umbrOptimo();
    const cant = Math.max(0, Math.ceil(opt * Number(velocidad) - Number(stock) - 1e-9));
    if (cant === 0) return { estado: 'enmeta' };
    return { estado: 'comprar', cant, costo: cant * Number(costo || 0) };
  }
  // Columna ACCIÓN integrada. Signos en POSITIVO, SIN "~" (se leía como menos). Unidades destacadas.
  function accionCompraHtml(s) {
    if (s.estado === 'insuf' || s.estado === 'sinhist') return '<span class="ta-inv-act ta-inv-act--mut">Definí vos cuánto pedir</span>';
    if (s.estado === 'enmeta') return '<span class="ta-inv-act ta-inv-act--mut">Ya en tu meta</span>';
    return '<span class="ta-inv-act ta-inv-act--rep">Comprá <b>' + s.cant + '</b> <span class="ta-inv-act__cop">≈ ' + fmtCOP(s.costo) + '</span></span>';
  }
  function accionSobraHtml(velocidad, stock, costo) {
    const c = capitalAmarrado(velocidad, stock, costo);
    if (c.unidades <= 0) return '<span class="ta-inv-act ta-inv-act--mut">En su nivel</span>';
    return '<span class="ta-inv-act ta-inv-act--liq">Sobran <b>' + c.unidades + '</b> <span class="ta-inv-act__cop">≈ ' + fmtCOP(c.capital) + ' parados</span></span>';
  }
  function accionHtml(r, ver) {
    return ver === 'sobrestock'
      ? accionSobraHtml(r.venta_diaria, r.stock_total, r.costo_unitario)
      : accionCompraHtml(sugCompra(r.venta_diaria, r.datos_insuficientes, r.stock_total, r.costo_unitario));
  }
  // Fila compacta de acción (3 columnas: Referencia · Cobertura · Acción). NO reusa la grilla de GENERAL.
  function filaAccion(r, ver) {
    const T = window.TiendaIA;
    const abierto = !!invState.drillOpen[r.producto_id];
    const foto = r.foto_principal_url
      ? '<img class="ta-inv-athumb" src="' + T.escapeHtml(r.foto_principal_url) + '" alt="">'
      : '<div class="ta-inv-athumb ta-inv-athumb--empty">📦</div>';
    return '<div class="ta-inv-item ta-inv-item--accion" data-prod="' + T.escapeHtml(r.producto_id) + '" data-open="' + (abierto ? '1' : '0') + '">' +
      '<span class="ta-inv-chevron" aria-hidden="true">▸</span>' +
      '<div class="ta-inv-aref">' + foto + '<div class="ta-inv-aref__txt"><strong>' + T.escapeHtml(r.referencia) + '</strong><span>' + T.escapeHtml(r.nombre || '') + '</span></div></div>' +
      '<div class="ta-inv-acob"><span class="ta-inv-cell__label">Cobertura</span>' + diasInvCelda(r) + '</div>' +
      '<div class="ta-inv-aaccion"><span class="ta-inv-cell__label">Acción</span>' + accionHtml(r, ver) + '</div>' +
    '</div>';
  }
  function drillHtml(productoId) {
    if (invState.tab === 'accion') return filaDrillAccion(productoId);
    if (invState.tab === 'sinventas') return filaDrillSinVentas(productoId);
    if (invState.tab === 'kardex') return filaDrillKardex(productoId);
    return filaDrill(productoId);
  }
  // Drill por variante, alineado a las MISMAS 3 columnas de la vista de acción.
  function filaDrillAccion(productoId) {
    const T = window.TiendaIA;
    const vs = invState.drillCache[productoId];
    const msg = (t) => '<div class="ta-inv-vrow ta-inv-vrow--accion ta-inv-vrow--msg"><span></span><div class="ta-inv-aref" style="color:var(--ta-text-mut);font-size:12px;">' + t + '</div></div>';
    if (!vs) return msg('Cargando variantes…');
    if (!vs.length) return msg('Sin variantes.');
    const padre = ((invState.accion && invState.accion.rows) || []).find(x => x.producto_id === productoId) || {};
    const costo = padre.costo_unitario;
    const ver = (invState.accion && invState.accion.ver) || 'ruptura';
    return vs.map(v => {
      const etiqueta = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '—');
      const acc = ver === 'sobrestock'
        ? accionSobraHtml(v.venta_diaria, v.stock, costo)
        : accionCompraHtml(sugCompra(v.venta_diaria, v.datos_insuficientes, v.stock, costo));
      return '<div class="ta-inv-vrow ta-inv-vrow--accion">' +
        '<div class="ta-inv-vamref"><strong>' + T.escapeHtml(etiqueta) + '</strong> <span class="ta-inv-vamstk">stock ' + Number(v.stock) + ' · disp. ' + Number(v.disponible) + '</span></div>' +
        '<div class="ta-inv-aaccion">' + acc + '</div>' +
      '</div>';
    }).join('');
  }
  // Resumen del tab con jerarquía de encabezado: importe grande + label, nota explicativa chica/AA debajo.
  function resumenHtml(val, lbl, note) {
    return '<div class="ta-inv-resumen"><div class="ta-inv-resumen__val">' + val + ' <span class="ta-inv-resumen__lbl">' + lbl + '</span></div>' +
      (note ? '<p class="ta-inv-resumen__note">' + note + '</p>' : '') + '</div>';
  }

  function renderAccion(cont) {
    const ver = invState.accion.ver, rows = invState.accion.rows;
    const cls = ver === 'ruptura' ? 'ruptura' : ver === 'sobrestock' ? 'sobrestock' : 'quiebre';
    const lista = rows.filter(r => r.clasificacion === cls);
    if (ver === 'sobrestock') lista.sort((a, b) => Number(b.valor_inventario || 0) - Number(a.valor_inventario || 0));
    else lista.sort((a, b) => Number(a.dias_inventario || 0) - Number(b.dias_inventario || 0));
    const nR = rows.filter(r => r.clasificacion === 'ruptura').length;
    const nS = rows.filter(r => r.clasificacion === 'sobrestock').length;
    const nA = rows.filter(r => r.clasificacion === 'quiebre').length;
    const seg = (id, label, n) => '<button type="button" class="ta-btn inv-ver' + (ver === id ? ' ta-btn--primary' : '') + '" data-ver="' + id + '">' + label + ' (' + n + ')</button>';
    let body;
    if (!lista.length) {
      const vacio = ver === 'sobrestock' ? 'Sin exceso de inventario.' : ver === 'ruptura' ? 'Nada en ruptura. Tu stock está al día.' : 'Nada agotado.';
      body = '<div class="ta-card"><div class="ta-empty" style="padding:28px 16px;"><p class="ta-empty__text">' + vacio + '</p></div></div>';
    } else {
      let filas = '';
      lista.forEach(r => {
        filas += filaAccion(r, ver);
        if (invState.drillOpen[r.producto_id]) filas += drillHtml(r.producto_id);
      });
      const accionHead = ver === 'sobrestock' ? 'Capital parado' : 'Acción';
      body = '<div class="ta-card" style="padding:0;overflow:hidden;"><div class="ta-inv-list ta-inv-list--accion">' +
        '<div class="ta-inv-ahead"><span></span><span>Referencia</span><span>Cobertura</span><span style="text-align:right;">' + accionHead + '</span></div>' +
        filas + '</div></div>';
    }
    let extra = '';
    if (ver === 'sobrestock' && lista.length) {
      const cap = lista.reduce((s, r) => s + capitalAmarrado(r.venta_diaria, r.stock_total, r.costo_unitario).capital, 0);
      extra = resumenHtml(fmtCOP(cap), 'en capital parado', 'En esta lista — considerá liquidar o promocionar para liberarlo.');
    } else if (ver !== 'sobrestock' && lista.length) {
      const totalCompra = lista.reduce((s, r) => { const c = sugCompra(r.venta_diaria, r.datos_insuficientes, r.stock_total, r.costo_unitario); return s + (c.estado === 'comprar' ? c.costo : 0); }, 0);
      extra = resumenHtml(fmtCOP(totalCompra), 'para reponer a tu óptimo de ' + umbrOptimo() + ' días', 'Es una sugerencia, no genera la orden — vos decidís cuánto pedir.');
    }
    cont.innerHTML =
      '<div class="ta-inv-ver">' + seg('ruptura', 'Ruptura', nR) + seg('sobrestock', 'Sobrestock', nS) + seg('agotado', 'Agotado', nA) + '</div>' +
      extra + body;
    cont.querySelectorAll('.inv-ver').forEach(b => b.addEventListener('click', () => {
      invState.accion.ver = b.getAttribute('data-ver'); renderAccion(cont);
    }));
    wireGeneral(cont);
  }

  // ============================================================
  // SIN VENTAS (tab 'sinventas') — capital muerto; ventana propia 30/45/60/90
  // ============================================================
  function haceTxt(fecha) {
    if (!fecha) return '—';
    const d = Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000));
    return d === 0 ? 'hoy' : 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
  async function fetchAndRenderSinVentas(cont) {
    const T = window.TiendaIA, sb = T.supabase();
    cont.innerHTML = loadingCard();
    try {
      const { data, error } = await sb.rpc('inventario_resumen', {
        p_tienda_id: T.state.tienda.id, p_periodo: invState.sinventasPeriodo, p_orden: 'valor',
        p_clasificacion: ['sin_ventas'],
        p_proveedor_id: invState.filtros.proveedor_id || null,
        p_categoria_id: invState.filtros.categoria_id || null,
        p_buscar: invState.filtros.buscar || null, p_limit: null, p_offset: 0,
      });
      if (error) { cont.innerHTML = errorCard(error.message); return; }
      invState.sinventas = { rows: data || [] };
      renderSinVentas(cont);
    } catch (e) { cont.innerHTML = errorCard(e.message || String(e)); }
  }
  function filaSinVentas(r) {
    const T = window.TiendaIA;
    const abierto = !!invState.drillOpen[r.producto_id];
    const foto = r.foto_principal_url ? '<img class="ta-inv-athumb" src="' + T.escapeHtml(r.foto_principal_url) + '" alt="">' : '<div class="ta-inv-athumb ta-inv-athumb--empty">📦</div>';
    return '<div class="ta-inv-item ta-inv-item--sv" data-prod="' + T.escapeHtml(r.producto_id) + '" data-open="' + (abierto ? '1' : '0') + '">' +
      '<span class="ta-inv-chevron" aria-hidden="true">▸</span>' +
      '<div class="ta-inv-aref">' + foto + '<div class="ta-inv-aref__txt"><strong>' + T.escapeHtml(r.referencia) + '</strong><span>' + T.escapeHtml(r.nombre || '') + '</span>' + (r.proveedor_nombre ? '<span class="ta-inv-sv-prov">Proveedor: ' + T.escapeHtml(r.proveedor_nombre) + '</span>' : '') + '</div></div>' +
      '<div class="ta-inv-svcell ta-inv-svcell--uv"><span class="ta-inv-cell__label">Última venta</span>' + (r.fecha_ultima_venta ? haceTxt(r.fecha_ultima_venta) : 'Nunca vendido') + '</div>' +
      '<div class="ta-inv-svcell ta-inv-svcell--ui"><span class="ta-inv-cell__label">Último ingreso</span>' + haceTxt(r.fecha_ultimo_ingreso) + '</div>' +
      '<div class="ta-inv-svcap"><span class="ta-inv-cell__label">Capital parado</span><b>' + fmtCOP(Number(r.valor_inventario || 0)) + '</b></div>' +
    '</div>';
  }
  function filaDrillSinVentas(productoId) {
    const T = window.TiendaIA;
    const vs = invState.drillCache[productoId];
    const padre = ((invState.sinventas && invState.sinventas.rows) || []).find(x => x.producto_id === productoId) || {};
    const costo = padre.costo_unitario;
    const msg = (t) => '<div class="ta-inv-vrow ta-inv-vrow--sv ta-inv-vrow--msg"><span></span><div class="ta-inv-aref" style="color:var(--ta-text-mut);font-size:12px;">' + t + '</div></div>';
    if (!vs) return msg('Cargando variantes…');
    if (!vs.length) return msg('Sin variantes.');
    return vs.map(v => {
      const etiqueta = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '—');
      // 5 celdas alineadas a la fila padre: Ref(+stock) · Última venta(—) · Último ingreso(—) · Capital.
      // En este tab la variante nunca tuvo venta -> "—" (NO stock bajo Última venta). Capital = stock×costo.
      return '<div class="ta-inv-vrow ta-inv-vrow--sv">' +
        '<span class="ta-inv-vmark" aria-hidden="true"></span>' +
        '<div class="ta-inv-aref ta-inv-aref--v"><strong>' + T.escapeHtml(etiqueta) + '</strong> <code>' + T.escapeHtml(v.sku || '') + '</code><span class="ta-inv-sv-stk"> · stock ' + Number(v.stock) + '</span></div>' +
        '<div class="ta-inv-svcell ta-inv-svcell--uv"><span class="ta-inv-cell__label">Última venta</span>—</div>' +
        '<div class="ta-inv-svcell ta-inv-svcell--ui"><span class="ta-inv-cell__label">Último ingreso</span>—</div>' +
        '<div class="ta-inv-svcap"><span class="ta-inv-cell__label">Capital parado</span>' + fmtCOP(Number(v.stock) * Number(costo || 0)) + '</div>' +
      '</div>';
    }).join('');
  }
  function renderSinVentas(cont) {
    const rows = invState.sinventas.rows;
    const cap = rows.reduce((s, r) => s + Number(r.valor_inventario || 0), 0);
    const per = invState.sinventasPeriodo;
    const seg = (n) => '<button type="button" class="ta-btn inv-svper' + (per === n ? ' ta-btn--primary' : '') + '" data-per="' + n + '">' + n + '</button>';
    const ventana = '<div class="ta-inv-svwin"><span style="color:var(--ta-text-soft);font-size:13px;">Ventana de venta:</span>' + seg(30) + seg(45) + seg(60) + seg(90) + '<span style="color:var(--ta-text-soft);font-size:13px;">días</span></div>';
    let body;
    if (!rows.length) {
      body = '<div class="ta-card"><div class="ta-empty" style="padding:28px 16px;"><p class="ta-empty__text">Todo tu stock está rotando. Sin capital muerto en esta ventana.</p></div></div>';
    } else {
      let filas = '';
      rows.forEach(r => { filas += filaSinVentas(r); if (invState.drillOpen[r.producto_id]) filas += drillHtml(r.producto_id); });
      body = '<div class="ta-card" style="padding:0;overflow:hidden;"><div class="ta-inv-list ta-inv-list--sv">' +
        '<div class="ta-inv-svhead"><span></span><span>Referencia</span><span>Última venta</span><span>Último ingreso</span><span style="text-align:right;">Capital parado</span></div>' +
        filas + '</div></div>';
    }
    const resumen = rows.length ? resumenHtml(fmtCOP(cap), 'en capital sin rotación', rows.length + ' producto(s) · sin venta en los últimos ' + per + ' días.') : '';
    cont.innerHTML = ventana + resumen + body;
    cont.querySelectorAll('.inv-svper').forEach(b => b.addEventListener('click', () => {
      const n = parseInt(b.getAttribute('data-per'), 10);
      if (invState.sinventasPeriodo === n) return;
      invState.sinventasPeriodo = n; invState.sinventas = null; invState.drillCache = {}; invState.drillOpen = {};
      fetchAndRenderSinVentas(cont);
    }));
    wireGeneral(cont);
  }

  // ============================================================
  // KARDEX (tab 'kardex') — DROP PROGRESIVO. Nivel 1: lista de referencias con drop por
  // variante (stock disp + último ingreso). Nivel 2: "Ver movimientos" -> panel del historial
  // de ESA variante (saldo siempre limpio, entrás por variante). Front-only, sin RPC nueva.
  // ============================================================
  function tipoLabel(m) {
    const base = { venta: 'Venta', entrada: 'Entrada', saldo_inicial: 'Saldo inicial', ajuste: 'Ajuste', devolucion: 'Devolución' }[m.tipo] || m.tipo;
    if (m.tipo === 'ajuste') return Number(m.cantidad) > 0 ? 'Ajuste (+)' : 'Ajuste (−)';
    return base;
  }
  function fetchAndRenderKardex(cont) {
    if (!invState.kardex) invState.kardex = { refs: [], panel: null };
    if (invState.kardex.panel) { renderKardexPanel(cont); return; }
    renderKardexList(cont);
  }
  // --- Nivel 1: lista de referencias + drop por variante ---
  async function renderKardexList(cont) {
    const T = window.TiendaIA, sb = T.supabase();
    cont.innerHTML = loadingCard();
    try {
      const { data, error } = await sb.rpc('inventario_resumen', {
        p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo, p_orden: 'referencia', p_clasificacion: null,
        p_proveedor_id: invState.filtros.proveedor_id || null, p_categoria_id: invState.filtros.categoria_id || null,
        p_buscar: invState.filtros.buscar || null, p_limit: 60, p_offset: 0,
      });
      if (error) { cont.innerHTML = errorCard(error.message); return; }
      invState.kardex.refs = data || [];
      if (!invState.kardex.refs.length) {
        cont.innerHTML = '<div class="ta-card"><div class="ta-empty" style="padding:28px 16px;"><p class="ta-empty__text">No hay referencias con esos filtros.</p></div></div>';
        return;
      }
      let html = '';
      invState.kardex.refs.forEach(r => { html += filaKxRef(r); if (invState.drillOpen[r.producto_id]) html += drillHtml(r.producto_id); });
      cont.innerHTML = '<p class="ta-inv-resumen__note" style="margin:0 2px 12px;">Tocá una referencia para ver sus variantes y entrar a su historial.</p>' +
        '<div class="ta-card" style="padding:0;overflow:hidden;"><div class="ta-inv-list ta-inv-list--kx">' + html + '</div></div>';
      wireGeneral(cont); // wirea el clic de la fila -> toggleDrill (mismo gesto que los otros tabs)
      if (!cont._kxDelegated) { cont._kxDelegated = true; cont.addEventListener('click', kardexVerDelegate); } // botones "Ver movimientos" (insertados por el drill)
    } catch (e) { cont.innerHTML = errorCard(e.message || String(e)); }
  }
  function filaKxRef(r) {
    const T = window.TiendaIA;
    const abierto = !!invState.drillOpen[r.producto_id];
    return '<div class="ta-inv-item ta-inv-item--kx" data-prod="' + T.escapeHtml(r.producto_id) + '" data-open="' + (abierto ? '1' : '0') + '">' +
      '<span class="ta-inv-chevron" aria-hidden="true">▸</span>' +
      '<div class="ta-inv-kxrefname"><strong>' + T.escapeHtml(r.referencia) + '</strong><span>' + T.escapeHtml(r.nombre || '') + '</span></div>' +
      '<button type="button" class="ta-btn ta-inv-kxver" data-prod="' + T.escapeHtml(r.producto_id) + '" data-var="" data-ref="' + T.escapeHtml(r.referencia) + '" data-vlabel="Todas las variantes">Ver movimientos</button>' +
    '</div>';
  }
  function filaDrillKardex(productoId) {
    const T = window.TiendaIA;
    const vs = invState.drillCache[productoId];
    const msg = (t) => '<div class="ta-inv-vrow ta-inv-vrow--kx ta-inv-vrow--msg"><div style="color:var(--ta-text-mut);font-size:12px;">' + t + '</div></div>';
    if (!vs) return msg('Cargando variantes…');
    if (!vs.length) return msg('Sin variantes.');
    const padre = ((invState.kardex && invState.kardex.refs) || []).find(x => x.producto_id === productoId) || {};
    const ult = haceTxt(padre.fecha_ultimo_ingreso); // último ingreso = product-level (PASO 0: variantes no lo trae)
    return vs.map(v => {
      const label = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '—');
      return '<div class="ta-inv-vrow ta-inv-vrow--kx">' +
        '<div class="ta-inv-kxvref"><strong>' + T.escapeHtml(label) + '</strong>' +
          '<span class="ta-inv-kxvmeta">stock ' + Number(v.stock) + ' · disp. ' + Number(v.disponible) + ' · ingreso ' + ult + '</span></div>' +
        '<button type="button" class="ta-btn ta-inv-kxver" data-prod="' + T.escapeHtml(productoId) + '" data-var="' + T.escapeHtml(v.variante_id) + '" data-ref="' + T.escapeHtml(padre.referencia || '') + '" data-vlabel="' + T.escapeHtml(label) + '">Ver movimientos</button>' +
      '</div>';
    }).join('');
  }
  function kardexVerDelegate(e) {
    const btn = e.target.closest && e.target.closest('.ta-inv-kxver');
    if (!btn) return;
    e.stopPropagation();
    enterKardexPanel(btn.getAttribute('data-prod'), btn.getAttribute('data-var'), btn.getAttribute('data-ref'), btn.getAttribute('data-vlabel'));
  }
  // --- Nivel 2: panel del historial de UNA variante ---
  function enterKardexPanel(productoId, varianteId, ref, vlabel) {
    invState.kardex.panel = { productoId, varianteId, ref, vlabel, desde: '', hasta: '', tipoFiltro: 'todos', rows: [], shown: 200, fin: true, _loaded: false };
    renderInventario(); // oculta el card de filtros + enruta a renderKardexPanel (que dispara la carga)
  }
  async function loadKardexPanelRows() {
    const T = window.TiendaIA, sb = T.supabase(), p = invState.kardex.panel;
    let all = [], offset = 0; const page = 500; let guard = 0;
    while (guard < 20) {
      const { data, error } = await sb.rpc('inventario_kardex', {
        p_tienda_id: T.state.tienda.id, p_producto_id: p.productoId, p_variante_id: p.varianteId || null,
        p_desde: p.desde || null, p_hasta: p.hasta || null, p_limit: page, p_offset: offset,
      });
      if (error) throw error;
      const rows = data || [];
      all = all.concat(rows);
      if (rows.length < page) { guard = -1; break; }
      offset += page; guard++;
    }
    p.rows = all.reverse();   // oldest-first -> newest-first (más reciente arriba)
    p.fin = (guard === -1); p.shown = 200;
  }
  function renderKardexPanel(cont) {
    const T = window.TiendaIA, p = invState.kardex.panel;
    const head = '<div class="ta-inv-kxhead"><button type="button" id="kx-volver" class="ta-btn">← Volver</button>' +
      '<h2 class="ta-inv-kxtitle">' + T.escapeHtml(p.ref) + ' <span>' + T.escapeHtml(p.vlabel) + '</span></h2></div>';
    const controls = '<div class="ta-inv-kxctrls">' +
      '<label class="ta-inv-kxdate">Desde <input type="date" id="kx-desde" class="ta-input" value="' + (p.desde || '') + '"></label>' +
      '<label class="ta-inv-kxdate">Hasta <input type="date" id="kx-hasta" class="ta-input" value="' + (p.hasta || '') + '"></label>' +
      ((p.desde || p.hasta) ? '<button type="button" id="kx-limpiar" class="ta-btn">Limpiar fechas</button>' : '') +
      '<label class="ta-inv-kxtipo"><span class="ta-inv-kxtipo__lbl">Filtrar por tipo de movimiento</span>' +
        '<select id="kx-tipo" class="ta-select" style="max-width:180px;">' +
          ['todos:Todos', 'entradas:Entradas', 'salidas:Salidas'].map(function (o) { var a = o.split(':'); return '<option value="' + a[0] + '"' + (p.tipoFiltro === a[0] ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') +
        '</select>' +
      '</label>' +
      ((p._loaded && p.rows.length) ? '<button type="button" id="kx-export" class="ta-btn">⬇ Exportar Excel</button>' : '') +
    '</div>';
    const todas = !p.varianteId; // A2: todas las variantes -> columna Variante, SIN saldo (el saldo salta entre variantes)
    const filtradas = (p.rows || []).filter(function (m) { return p.tipoFiltro === 'entradas' ? m.entrada > 0 : p.tipoFiltro === 'salidas' ? m.salida > 0 : true; }); // B
    let body;
    if (!p._loaded) {
      body = loadingCard();
    } else if (!filtradas.length) {
      body = '<div class="ta-card"><div class="ta-empty" style="padding:28px 16px;"><p class="ta-empty__text">Sin movimientos' + (p.tipoFiltro !== 'todos' ? ' de ese tipo' : '') + ' para ' + (todas ? 'esta referencia' : 'esta variante') + ' en ese rango.</p></div></div>';
    } else {
      // FIX 2: columnas condicionales al filtro (Entradas oculta Salida; Salidas oculta Entrada).
      // Grilla inline para no multiplicar clases CSS por combinación (todas/una × filtro).
      const showEnt = p.tipoFiltro !== 'salidas';
      const showSal = p.tipoFiltro !== 'entradas';
      const gridCols = ['110px', 'minmax(120px,1fr)']
        .concat(showEnt ? ['78px'] : [])
        .concat(showSal ? ['78px'] : [])
        .concat([todas ? 'minmax(150px,1.4fr)' : '96px']) // FIX 1: Variante con más aire
        .concat(['minmax(120px,1fr)']).join(' ');
      const gstyle = 'grid-template-columns:' + gridCols + ';';
      const visibles = filtradas.slice(0, p.shown);
      const filas = visibles.map(function (m) {
        const ent = m.entrada > 0 ? '<span class="ta-inv-kxin">+' + m.entrada + '</span>' : '—';
        const sal = m.salida > 0 ? '<span class="ta-inv-kxout">-' + m.salida + '</span>' : '—';
        return '<div class="ta-inv-kxrow" style="' + gstyle + '">' +
          '<div class="ta-inv-kxcell"><span class="ta-inv-cell__label">Fecha</span>' + fmtFecha(m.fecha) + '</div>' +
          '<div class="ta-inv-kxcell"><span class="ta-inv-cell__label">Movimiento</span>' + tipoLabel(m) + '</div>' +
          (showEnt ? '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Entrada</span>' + ent + '</div>' : '') +
          (showSal ? '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Salida</span>' + sal + '</div>' : '') +
          (todas
            ? '<div class="ta-inv-kxcell ta-inv-kxcell--var"><span class="ta-inv-cell__label">Variante</span>' + T.escapeHtml([m.color, m.talla].filter(Boolean).join(' · ') || (m.sku || '—')) + '</div>'
            : '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Saldo</span>' + Number(m.saldo_acumulado) + '</div>') +
          '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Costo unit.</span>' + (m.costo_unitario != null ? fmtCOP(Number(m.costo_unitario)) : '—') + '</div>' +
        '</div>';
      }).join('');
      const headRow = '<div class="ta-inv-kxhrow" style="' + gstyle + '"><span>Fecha</span><span>Movimiento</span>' +
        (showEnt ? '<span style="text-align:right;">Entrada</span>' : '') +
        (showSal ? '<span style="text-align:right;">Salida</span>' : '') +
        (todas ? '<span>Variante</span>' : '<span style="text-align:right;">Saldo</span>') +
        '<span style="text-align:right;">Costo unit.</span></div>';
      const masBtn = (p.shown < filtradas.length) ? '<div style="text-align:center;margin-top:12px;"><button type="button" id="kx-mas" class="ta-btn">Ver más movimientos</button></div>' : '';
      body = '<div class="ta-card" style="padding:0;overflow:hidden;"><div class="ta-inv-kxtable">' + headRow + filas + '</div></div>' + masBtn +
        (p.fin ? '' : '<p class="ta-inv-resumen__note" style="margin:10px 2px 0;">Historial muy largo: mostrando los primeros 10.000 movimientos. Refiná por fecha.</p>');
    }
    cont.innerHTML = head + controls + body;
    const reload = () => { p._loaded = false; renderKardexPanel(cont); };
    cont.querySelector('#kx-volver').addEventListener('click', () => { invState.kardex.panel = null; renderInventario(); });
    const dD = cont.querySelector('#kx-desde'), dH = cont.querySelector('#kx-hasta'), lim = cont.querySelector('#kx-limpiar'), mas = cont.querySelector('#kx-mas');
    if (dD) dD.addEventListener('change', (e) => { p.desde = e.target.value; reload(); });
    if (dH) dH.addEventListener('change', (e) => { p.hasta = e.target.value; reload(); });
    if (lim) lim.addEventListener('click', () => { p.desde = ''; p.hasta = ''; reload(); });
    if (mas) mas.addEventListener('click', () => { p.shown += 200; renderKardexPanel(cont); });
    const tf = cont.querySelector('#kx-tipo'); if (tf) tf.addEventListener('change', (e) => { p.tipoFiltro = e.target.value; p.shown = 200; renderKardexPanel(cont); });
    const exK = cont.querySelector('#kx-export'); if (exK) exK.addEventListener('click', () => exportarExcelKardex(exK));
    if (!p._loaded) { p._loaded = true; loadKardexPanelRows().then(() => renderKardexPanel(cont)).catch(e => { cont.innerHTML = head + controls + errorCard(e.message || String(e)); }); }
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
      if (invState.drillOpen[r.producto_id]) html += drillHtml(r.producto_id);
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
    cont.querySelectorAll('.ta-inv-item').forEach(it => it.addEventListener('click', (e) => {
      // un botón dentro de la fila (ej. "Ver movimientos" del Kardex) no debe togglear el drop
      if (e.target.closest && e.target.closest('button')) return;
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
    insertDrillRows(item, drillHtml(productoId));
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
  // Helper de descarga: arma el workbook desde hojas=[{nombre, aoa, cols}] y descarga.
  function xlsxDescargar(XLSX, hojas, filename) {
    const wb = XLSX.utils.book_new();
    hojas.forEach(h => {
      const ws = XLSX.utils.aoa_to_sheet(h.aoa);
      if (h.cols) ws['!cols'] = h.cols;
      XLSX.utils.book_append_sheet(wb, ws, h.nombre);
    });
    XLSX.writeFile(wb, filename);
  }
  function hoyExcel() { return new Date().toISOString().slice(0, 10); }
  function slugTienda() { return (window.TiendaIA.state.tienda || {}).slug || 'tienda'; }

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

  // Exportar Excel — Sobrestock & Ruptura (refleja el Ver activo + filtros del shell)
  async function exportarExcelAccion(btn) {
    const T = window.TiendaIA, sb = T.supabase();
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      const ver = invState.accion.ver;
      const cls = ver === 'ruptura' ? 'ruptura' : ver === 'sobrestock' ? 'sobrestock' : 'quiebre';
      const lista = (invState.accion.rows || []).filter(r => r.clasificacion === cls);
      if (!lista.length) { T.toast('No hay productos para exportar en esta vista.', 'info'); return; }
      if (ver === 'sobrestock') lista.sort((a, b) => Number(b.valor_inventario || 0) - Number(a.valor_inventario || 0));
      else lista.sort((a, b) => Number(a.dias_inventario || 0) - Number(b.dias_inventario || 0));
      const { data: vars } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: lista.map(r => r.producto_id), p_periodo: invState.periodo });
      const byProd = {}; (vars || []).forEach(v => { (byProd[v.producto_id] = byProd[v.producto_id] || []).push(v); });
      const esSob = ver === 'sobrestock';
      const head = esSob
        ? ['Referencia', 'Nombre', 'Proveedor', 'Stock', 'Cobertura', 'Sobran (uds)', 'Capital parado']
        : ['Referencia', 'Nombre', 'Proveedor', 'Stock', 'Cobertura', 'Comprar (uds)', 'Costo reposición'];
      const aoa = [head];
      lista.forEach(r => {
        const etq = (v) => '↳ ' + ([v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || ''));
        if (esSob) {
          const c = capitalAmarrado(r.venta_diaria, r.stock_total, r.costo_unitario);
          aoa.push([r.referencia, r.nombre || '', r.proveedor_nombre || '', numExcel(r.stock_total), cobTexto(r), c.unidades, numExcel(c.capital)]);
          (byProd[r.producto_id] || []).forEach(v => { const cv = capitalAmarrado(v.venta_diaria, v.stock, r.costo_unitario); aoa.push([etq(v), v.sku || '', '', numExcel(v.stock), cobTexto(v), cv.unidades, numExcel(cv.capital)]); });
        } else {
          const s = sugCompra(r.venta_diaria, r.datos_insuficientes, r.stock_total, r.costo_unitario);
          aoa.push([r.referencia, r.nombre || '', r.proveedor_nombre || '', numExcel(r.stock_total), cobTexto(r), (s.estado === 'comprar' ? s.cant : 0), (s.estado === 'comprar' ? numExcel(s.costo) : 0)]);
          (byProd[r.producto_id] || []).forEach(v => { const sv = sugCompra(v.venta_diaria, v.datos_insuficientes, v.stock, r.costo_unitario); aoa.push([etq(v), v.sku || '', '', numExcel(v.stock), cobTexto(v), (sv.estado === 'comprar' ? sv.cant : 0), (sv.estado === 'comprar' ? numExcel(sv.costo) : 0)]); });
        }
      });
      const total = lista.reduce((s, r) => esSob ? s + capitalAmarrado(r.venta_diaria, r.stock_total, r.costo_unitario).capital : s + (sugCompra(r.venta_diaria, r.datos_insuficientes, r.stock_total, r.costo_unitario).costo || 0), 0);
      aoa.push([]); aoa.push([esSob ? 'TOTAL capital parado' : 'TOTAL a reponer', '', '', '', '', '', numExcel(total)]);
      const nombreHoja = esSob ? 'Sobrestock' : (ver === 'quiebre' ? 'Agotado' : 'Ruptura');
      xlsxDescargar(XLSX, [{ nombre: nombreHoja, aoa, cols: [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 16 }] }],
        'Inventario_' + nombreHoja + '_' + slugTienda() + '_' + hoyExcel() + '.xlsx');
    } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  // Exportar Excel — Sin Ventas (ventana activa + filtros)
  async function exportarExcelSinVentas(btn) {
    const T = window.TiendaIA, sb = T.supabase();
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      const lista = invState.sinventas.rows || [];
      if (!lista.length) { T.toast('No hay productos para exportar.', 'info'); return; }
      const { data: vars } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: lista.map(r => r.producto_id), p_periodo: invState.sinventasPeriodo });
      const byProd = {}; (vars || []).forEach(v => { (byProd[v.producto_id] = byProd[v.producto_id] || []).push(v); });
      const aoa = [['Referencia', 'Nombre', 'Proveedor', 'Stock', 'Última venta', 'Último ingreso', 'Capital parado']];
      lista.forEach(r => {
        aoa.push([r.referencia, r.nombre || '', r.proveedor_nombre || '', numExcel(r.stock_total),
          (r.fecha_ultima_venta ? haceTxt(r.fecha_ultima_venta) : 'Nunca vendido'), haceTxt(r.fecha_ultimo_ingreso), numExcel(r.valor_inventario)]);
        (byProd[r.producto_id] || []).forEach(v => {
          aoa.push(['↳ ' + ([v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '')), v.sku || '', '', numExcel(v.stock), '', '', numExcel(Number(v.stock) * Number(r.costo_unitario || 0))]);
        });
      });
      const total = lista.reduce((s, r) => s + Number(r.valor_inventario || 0), 0);
      aoa.push([]); aoa.push(['TOTAL capital sin rotación', '', '', '', '', '', numExcel(total)]);
      xlsxDescargar(XLSX, [{ nombre: 'Sin ventas', aoa, cols: [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 }] }],
        'Inventario_SinVentas_' + invState.sinventasPeriodo + 'd_' + slugTienda() + '_' + hoyExcel() + '.xlsx');
    } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  // Exportar Excel — Kardex (panel de UNA variante, con su rango de fechas)
  async function exportarExcelKardex(btn) {
    const T = window.TiendaIA, p = invState.kardex.panel;
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      if (!p || !p.rows || !p.rows.length) { T.toast('No hay movimientos para exportar.', 'info'); return; }
      const todas = !p.varianteId; // todas -> columna Variante; una -> Saldo
      const filtradas = p.rows.filter(function (m) { return p.tipoFiltro === 'entradas' ? m.entrada > 0 : p.tipoFiltro === 'salidas' ? m.salida > 0 : true; });
      if (!filtradas.length) { T.toast('No hay movimientos de ese tipo para exportar.', 'info'); return; }
      const aoa = [
        ['Kardex', p.ref + ' · ' + p.vlabel],
        ['Rango', (p.desde || 'inicio') + ' a ' + (p.hasta || 'hoy')],
        ['Tipo', p.tipoFiltro === 'entradas' ? 'Entradas' : p.tipoFiltro === 'salidas' ? 'Salidas' : 'Todos'],
        [],
        ['Fecha', 'Movimiento', 'Entrada', 'Salida', (todas ? 'Variante' : 'Saldo'), 'Costo unit.'],
      ];
      filtradas.forEach(m => aoa.push([fechaExcel(m.fecha), tipoLabel(m), numExcel(m.entrada), numExcel(m.salida),
        (todas ? ([m.color, m.talla].filter(Boolean).join(' · ') || (m.sku || '')) : numExcel(m.saldo_acumulado)),
        (m.costo_unitario != null ? numExcel(m.costo_unitario) : '')]));
      xlsxDescargar(XLSX, [{ nombre: 'Kardex', aoa, cols: [{ wch: 14 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 12 }] }],
        'Kardex_' + (p.ref || 'ref').replace(/[^\w-]/g, '') + '_' + (p.vlabel || '').replace(/[^\w-]/g, '') + '_' + hoyExcel() + '.xlsx');
    } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  // Exportar Excel — Kardex Nivel 1 (lista de referencias + variantes, solo el último ingreso)
  async function exportarExcelKardexLista(btn) {
    const T = window.TiendaIA, sb = T.supabase();
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      const lista = (invState.kardex && invState.kardex.refs) || [];
      if (!lista.length) { T.toast('No hay referencias para exportar.', 'info'); return; }
      const { data: vars } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: lista.map(r => r.producto_id), p_periodo: invState.periodo });
      const byProd = {}; (vars || []).forEach(v => { (byProd[v.producto_id] = byProd[v.producto_id] || []).push(v); });
      const aoa = [['Referencia', 'Nombre', 'Proveedor', 'Variante', 'Stock', 'Disponible', 'Último ingreso']];
      lista.forEach(r => {
        aoa.push([r.referencia, r.nombre || '', r.proveedor_nombre || '', '', numExcel(r.stock_total), numExcel(r.stock_disponible), fechaExcel(r.fecha_ultimo_ingreso)]);
        (byProd[r.producto_id] || []).forEach(v => {
          aoa.push(['', '', '', ([v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '')), numExcel(v.stock), numExcel(v.disponible), '']);
        });
      });
      xlsxDescargar(XLSX, [{ nombre: 'Últimos ingresos', aoa, cols: [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 8 }, { wch: 11 }, { wch: 14 }] }],
        'Kardex_ultimo_ingreso_' + slugTienda() + '_' + hoyExcel() + '.xlsx');
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
