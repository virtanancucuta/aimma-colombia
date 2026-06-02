/* AIMMA Tienda IA · views/crm.js · v2 · 2026-06-01
   Fase 12.B+ CRM expansion: 5 tabs (Pendientes / Cerrados / Cancelados /
   Devoluciones / Clientes) + acciones flujo + Vista Clientes con segmentacion.

   Estados flujo:
   pendiente_confirmacion -> cerrado (con guia + wa.me cliente) | cancelado
   cerrado -> devuelto (reintegra stock automatico via trigger BD)
*/

(function () {
  'use strict';

  const TAB_TITULOS = {
    pendientes: 'Pendientes',
    cerrados: 'Cerrados',
    cancelados: 'Cancelados',
    devoluciones: 'Devoluciones',
    clientes: 'Clientes',
    mensajes: 'Mensajes',
  };

  const state = {
    tab: 'pendientes',         // pendientes | cerrados | cancelados | devoluciones | clientes
    pedidos: [],
    clientes: [],
    rango: '30d',              // 7d | 30d | 90d | todos
    buscar: '',
    cargando: false,
  };

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[crm.js] window.TiendaIA no inicializo'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    // Registrar tanto 'crm' (preferido) como 'pedidos' (retrocompat)
    window.TiendaIA.registerView('crm', renderCRM);
    window.TiendaIA.registerView('pedidos', renderCRM);
  });

  // ============================================================
  // Render principal
  // ============================================================

  async function renderCRM() {
    const T = window.TiendaIA;
    T.dom.mainView.innerHTML = renderShellHTML();
    wireToolbarEvents();
    highlightActiveTab();
    await loadDataForCurrentTab();
  }

  function renderShellHTML() {
    return '' +
      '<header style="margin-bottom:20px;">' +
        '<h1 class="ta-section-title">CRM</h1>' +
        '<p class="ta-section-sub">Gestiona pedidos, devoluciones y clientes desde un solo lugar.</p>' +
      '</header>' +

      // Tabs
      '<div class="ta-card" style="padding:0;margin-bottom:16px;overflow-x:auto;">' +
        '<div class="cm-tabs" style="display:flex;border-bottom:1px solid var(--ta-border);min-width:max-content;">' +
          renderTabBtn('pendientes', 'Pendientes') +
          renderTabBtn('cerrados', 'Cerrados') +
          renderTabBtn('cancelados', 'Cancelados') +
          renderTabBtn('devoluciones', 'Devoluciones') +
          renderTabBtn('clientes', 'Clientes') +
          renderTabBtn('mensajes', 'Mensajes', 'badge-mensajes-tab') +
        '</div>' +
      '</div>' +

      // Toolbar: filtros + buscar (no se muestra en clientes)
      '<div id="cm-toolbar" class="ta-card" style="padding:14px;margin-bottom:16px;">' +
        '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">' +
          '<div id="cm-toolbar-periodo" style="display:flex;gap:6px;align-items:center;">' +
            '<label style="font-size:12px;color:var(--ta-text-soft);">Periodo:</label>' +
            '<select id="cm-rango" class="ta-input" style="padding:6px 10px;font-size:13px;">' +
              '<option value="7d">Ultimos 7 dias</option>' +
              '<option value="30d" selected>Ultimos 30 dias</option>' +
              '<option value="90d">Ultimos 90 dias</option>' +
              '<option value="todos">Todos</option>' +
            '</select>' +
          '</div>' +
          '<div style="flex:1;min-width:200px;">' +
            '<input id="cm-buscar" type="search" placeholder="Buscar codigo, nombre, telefono o email..." class="ta-input" style="width:100%;padding:8px 12px;font-size:13px;" />' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Content
      '<div id="cm-content"></div>';
  }

  function renderTabBtn(id, label, badgeId) {
    var badgeHtml = badgeId
      ? '<span id="' + badgeId + '" class="ta-nav-badge" style="display:none;margin-left:6px;"></span>'
      : '';
    return '<button type="button" class="cm-tab" data-tab="' + id + '" style="padding:14px 18px;background:none;border:none;border-bottom:2px solid transparent;font-size:14px;font-weight:500;color:var(--ta-text-soft);cursor:pointer;white-space:nowrap;">' + label + badgeHtml + '</button>';
  }

  function wireToolbarEvents() {
    document.querySelectorAll('.cm-tab').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.tab = btn.getAttribute('data-tab');
        state.buscar = '';
        const buscarInp = document.getElementById('cm-buscar');
        if (buscarInp) buscarInp.value = '';
        highlightActiveTab();
        // Mostrar/ocultar periodo segun tab (Clientes no usa periodo)
        const periodo = document.getElementById('cm-toolbar-periodo');
        if (periodo) periodo.style.display = (state.tab === 'clientes' || state.tab === 'mensajes') ? 'none' : 'flex';
        await loadDataForCurrentTab();
      });
    });

    const selRango = document.getElementById('cm-rango');
    if (selRango) {
      selRango.addEventListener('change', () => {
        state.rango = selRango.value;
        loadDataForCurrentTab();
      });
    }

    const inpBuscar = document.getElementById('cm-buscar');
    if (inpBuscar) {
      let t;
      inpBuscar.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          state.buscar = inpBuscar.value.trim();
          renderContent();
        }, 200);
      });
    }
  }

  function highlightActiveTab() {
    document.querySelectorAll('.cm-tab').forEach((btn) => {
      const isActive = btn.getAttribute('data-tab') === state.tab;
      btn.style.borderBottomColor = isActive ? 'var(--ta-accent)' : 'transparent';
      btn.style.color = isActive ? 'var(--ta-accent)' : 'var(--ta-text-soft)';
      btn.style.fontWeight = isActive ? '600' : '500';
    });
  }

  // ============================================================
  // Load data segun tab activa
  // ============================================================

  async function loadDataForCurrentTab() {
    state.cargando = true;
    showLoading();

    if (state.tab === 'clientes') {
      await loadClientes();
    } else if (state.tab === 'mensajes') {
      // El modulo crm-mensajes maneja su propia carga; solo limpiamos el loading
    } else {
      await loadPedidos();
    }

    state.cargando = false;
    renderContent();
  }

  function showLoading() {
    const c = document.getElementById('cm-content');
    if (c) c.innerHTML = '<div class="ta-card"><div class="ta-empty"><div class="ta-loader" style="width:32px;height:32px;margin:0 auto 12px;"></div><p class="ta-empty__text">Cargando...</p></div></div>';
  }

  async function loadPedidos() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;

    const estadoFiltro = {
      pendientes: 'pendiente_confirmacion',
      cerrados: 'cerrado',
      cancelados: 'cancelado',
      devoluciones: 'devuelto',
    }[state.tab];

    let desde = null;
    if (state.rango === '7d') desde = new Date(Date.now() - 7 * 86400e3).toISOString();
    else if (state.rango === '30d') desde = new Date(Date.now() - 30 * 86400e3).toISOString();
    else if (state.rango === '90d') desde = new Date(Date.now() - 90 * 86400e3).toISOString();

    try {
      let q = sb.from('pedidos')
        .select('id, codigo_publico, comprador_nombre, comprador_telefono, comprador_email, comprador_direccion, comprador_ciudad, comprador_observ, metodo_envio, estado, total, subtotal_productos, costo_envio, numero_guia, transportadora, cerrado_at, devuelto_at, devuelto_razon, cancelado_at, cancelado_razon, confirmado_at, pendiente_at, created_at')
        .eq('tienda_id', tienda.id)
        .eq('estado', estadoFiltro)
        .order('created_at', { ascending: false })
        .limit(300);

      if (desde) q = q.gte('created_at', desde);

      const { data, error } = await q;
      if (error) throw error;
      state.pedidos = data || [];
    } catch (e) {
      console.error('[crm] pedidos error', e);
      state.pedidos = [];
      showError(e.message || String(e));
    }
  }

  async function loadClientes() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;

    try {
      // Traer todos los clientes registrados (los que dejaron email)
      const { data: clientes, error: errC } = await sb.from('tienda_clientes')
        .select('id, email, nombre, telefono, direcciones, created_at, ultimo_login_at')
        .eq('tienda_id', tienda.id)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (errC) throw errC;

      // Traer todos los pedidos para calcular metricas por cliente
      const { data: pedidos, error: errP } = await sb.from('pedidos')
        .select('id, tienda_cliente_id, comprador_nombre, comprador_telefono, comprador_email, comprador_ciudad, estado, total, created_at, devuelto_at')
        .eq('tienda_id', tienda.id)
        .order('created_at', { ascending: false });
      if (errP) throw errP;

      // Tambien crear "clientes virtuales" de pedidos sin tienda_cliente_id
      // (compradores que no dejaron email)
      const clientesById = new Map((clientes || []).map((c) => [c.id, { ...c, pedidos: [], origen: 'registrado' }]));
      const virtualesByTel = new Map(); // clave: telefono normalizado

      for (const p of (pedidos || [])) {
        if (p.tienda_cliente_id && clientesById.has(p.tienda_cliente_id)) {
          clientesById.get(p.tienda_cliente_id).pedidos.push(p);
        } else {
          const tel = (p.comprador_telefono || '').replace(/\D/g, '');
          if (!tel) continue;
          if (!virtualesByTel.has(tel)) {
            virtualesByTel.set(tel, {
              id: 'virtual:' + tel,
              email: p.comprador_email || null,
              nombre: p.comprador_nombre,
              telefono: p.comprador_telefono,
              direcciones: [{ ciudad: p.comprador_ciudad }],
              created_at: p.created_at,
              ultimo_login_at: null,
              pedidos: [],
              origen: 'pedido_anonimo',
            });
          }
          virtualesByTel.get(tel).pedidos.push(p);
        }
      }

      // Combinar y calcular metricas
      const todos = [...clientesById.values(), ...virtualesByTel.values()].map((c) => {
        const pedidosOrdenados = (c.pedidos || []).slice().sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const cerrados = pedidosOrdenados.filter((p) => p.estado === 'cerrado' && !p.devuelto_at).length;
        const devueltos = pedidosOrdenados.filter((p) => p.estado === 'devuelto').length;
        const cancelados = pedidosOrdenados.filter((p) => p.estado === 'cancelado').length;
        const pendientes = pedidosOrdenados.filter((p) => p.estado === 'pendiente_confirmacion').length;
        const totalGastado = pedidosOrdenados
          .filter((p) => p.estado === 'cerrado' && !p.devuelto_at)
          .reduce((acc, p) => acc + Number(p.total || 0), 0);
        const ultimo = pedidosOrdenados[0] || null;

        let segmento;
        if (cerrados >= 2) segmento = 'recurrente';
        else if (cerrados === 1) segmento = 'comprador';
        else if (cancelados > 0 || devueltos > 0) segmento = 'cancelador';
        else segmento = 'prospecto';

        return {
          ...c,
          num_pedidos: pedidosOrdenados.length,
          cerrados,
          devueltos,
          cancelados,
          pendientes,
          total_gastado: totalGastado,
          ultimo_pedido: ultimo,
          segmento,
        };
      });

      state.clientes = todos;
    } catch (e) {
      console.error('[crm] clientes error', e);
      state.clientes = [];
      showError(e.message || String(e));
    }
  }

  function showError(msg) {
    const T = window.TiendaIA;
    const c = document.getElementById('cm-content');
    if (c) c.innerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">Error</h2><p class="ta-empty__text">' + T.escapeHtml(msg) + '</p></div></div>';
  }

  // ============================================================
  // Render content por tab
  // ============================================================

  function renderContent() {
    if (state.tab === 'clientes') {
      renderClientes();
    } else if (state.tab === 'mensajes') {
      var c = document.getElementById('cm-content');
      if (!c) return;
      // Crear contenedor hijo con id esperado por crm-mensajes.js
      c.innerHTML = '<div id="crm-mensajes-tab"></div>';
      var tabContent = document.getElementById('crm-mensajes-tab');
      if (window.TiendaIA && window.TiendaIA.crmMensajes && window.TiendaIA.crmMensajes.render) {
        window.TiendaIA.crmMensajes.render(tabContent, window.TiendaIA.state.tienda);
      } else {
        tabContent.innerHTML = '<div class="ta-empty">Modulo no disponible.</div>';
      }
    } else {
      renderPedidosTabla();
    }
  }

  function renderPedidosTabla() {
    const T = window.TiendaIA;
    const c = document.getElementById('cm-content');
    if (!c) return;

    const buscar = state.buscar.toLowerCase();
    const filtrados = buscar
      ? state.pedidos.filter((p) =>
          (p.codigo_publico || '').toLowerCase().includes(buscar) ||
          (p.comprador_nombre || '').toLowerCase().includes(buscar) ||
          (p.comprador_telefono || '').toLowerCase().includes(buscar) ||
          (p.comprador_email || '').toLowerCase().includes(buscar))
      : state.pedidos;

    if (filtrados.length === 0) {
      c.innerHTML = renderEmpty();
      return;
    }

    const rows = filtrados.map((p) => renderRowPedido(p, T)).join('');
    c.innerHTML = '<div class="ta-card" style="padding:0;">' +
      '<div class="ta-table-wrap" style="overflow-x:auto;">' +
        '<table class="ta-table" style="width:100%;">' +
          '<thead><tr>' +
            '<th>Codigo</th>' +
            '<th>Cliente</th>' +
            '<th style="text-align:right;">Total</th>' +
            (state.tab === 'cerrados' || state.tab === 'devoluciones' ? '<th>Guia</th>' : '') +
            '<th>Fecha</th>' +
            '<th style="text-align:right;">Accion</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div></div>' +
      '<p style="margin-top:12px;font-size:12px;color:var(--ta-text-mut);text-align:right;">' +
        filtrados.length + ' de ' + state.pedidos.length + ' pedido(s)' +
      '</p>';

    document.querySelectorAll('.cm-row-action').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const pedido = state.pedidos.find((x) => x.id === id);
        if (pedido) openDetallePedido(pedido);
      });
    });
  }

  function renderRowPedido(p, T) {
    const wppDigits = (p.comprador_telefono || '').replace(/\D/g, '');
    const wppHref = wppDigits ? 'https://wa.me/' + wppDigits : '#';
    const guiaCol = (state.tab === 'cerrados' || state.tab === 'devoluciones')
      ? '<td style="font-size:12px;">' +
          (p.numero_guia ? '<strong>' + T.escapeHtml(p.numero_guia) + '</strong><br><span style="color:var(--ta-text-mut);">' + T.escapeHtml(p.transportadora || '') + '</span>' : '<span style="color:var(--ta-text-mut);">-</span>') +
        '</td>'
      : '';
    return '<tr>' +
      '<td><code style="font-size:12px;">' + T.escapeHtml(p.codigo_publico || p.id.slice(0, 8)) + '</code></td>' +
      '<td>' + T.escapeHtml(p.comprador_nombre || '-') +
        (wppDigits ? '<br><a href="' + wppHref + '" target="_blank" rel="noopener" style="font-size:11px;color:var(--ta-accent);text-decoration:none;">' + T.escapeHtml(p.comprador_telefono) + '</a>' : '') +
      '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtCOP(Number(p.total || 0)) + '</td>' +
      guiaCol +
      '<td style="font-size:12px;color:var(--ta-text-soft);">' + formatFecha(p.created_at || p.pendiente_at) + '</td>' +
      '<td style="text-align:right;"><button type="button" class="ta-btn cm-row-action" data-id="' + T.escapeHtml(p.id) + '" style="padding:4px 12px;font-size:13px;">Ver</button></td>' +
    '</tr>';
  }

  function renderEmpty() {
    const msg = {
      pendientes: 'No hay pedidos pendientes en este periodo.',
      cerrados: 'No hay pedidos cerrados en este periodo.',
      cancelados: 'No hay pedidos cancelados en este periodo.',
      devoluciones: 'No hay devoluciones en este periodo.',
    }[state.tab] || 'Sin resultados.';
    return '<div class="ta-card"><div class="ta-empty" style="padding:48px 20px;">' +
      '<h2 class="ta-empty__title">Sin resultados</h2>' +
      '<p class="ta-empty__text">' + msg + '</p>' +
    '</div></div>';
  }

  // ============================================================
  // Vista CLIENTES
  // ============================================================

  function renderClientes() {
    const T = window.TiendaIA;
    const c = document.getElementById('cm-content');
    if (!c) return;

    const buscar = state.buscar.toLowerCase();
    const filtrados = buscar
      ? state.clientes.filter((cl) =>
          (cl.nombre || '').toLowerCase().includes(buscar) ||
          (cl.email || '').toLowerCase().includes(buscar) ||
          (cl.telefono || '').toLowerCase().includes(buscar))
      : state.clientes;

    if (filtrados.length === 0) {
      c.innerHTML = '<div class="ta-card"><div class="ta-empty" style="padding:48px 20px;">' +
        '<h2 class="ta-empty__title">Aun no hay clientes</h2>' +
        '<p class="ta-empty__text">Cuando un cliente complete el formulario de pedido en tu tienda, aparecera aqui.</p>' +
      '</div></div>';
      return;
    }

    // Resumen segmentos
    const seg = { recurrente: 0, comprador: 0, cancelador: 0, prospecto: 0 };
    state.clientes.forEach((cl) => { seg[cl.segmento]++; });

    const segmentosHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:10px;margin-bottom:16px;">' +
      renderSegmentCard('Recurrentes', seg.recurrente, '2+ compras', '#16a34a') +
      renderSegmentCard('Compradores', seg.comprador, '1 compra', '#0d9488') +
      renderSegmentCard('Canceladores', seg.cancelador, 'Solo cancelados', '#dc2626') +
      renderSegmentCard('Prospectos', seg.prospecto, 'Sin compra aun', '#737373') +
    '</div>';

    const rows = filtrados.map((cl) => renderRowCliente(cl, T)).join('');
    c.innerHTML = segmentosHTML +
      '<div class="ta-card" style="padding:0;">' +
        '<div class="ta-table-wrap" style="overflow-x:auto;">' +
          '<table class="ta-table" style="width:100%;">' +
            '<thead><tr>' +
              '<th>Cliente</th>' +
              '<th>Segmento</th>' +
              '<th style="text-align:center;">Pedidos</th>' +
              '<th style="text-align:right;">Total gastado</th>' +
              '<th>Ultimo pedido</th>' +
              '<th style="text-align:right;">Accion</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div></div>' +
      '<p style="margin-top:12px;font-size:12px;color:var(--ta-text-mut);text-align:right;">' +
        filtrados.length + ' de ' + state.clientes.length + ' cliente(s)' +
      '</p>';

    document.querySelectorAll('.cm-cliente-action').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const cliente = state.clientes.find((x) => x.id === id);
        if (cliente) openDetalleCliente(cliente);
      });
    });
  }

  function renderSegmentCard(titulo, count, sub, color) {
    return '<div style="background:#fff;border:1px solid var(--ta-border);border-left:4px solid ' + color + ';border-radius:10px;padding:14px;">' +
      '<div style="font-size:24px;font-weight:700;color:' + color + ';line-height:1;">' + count + '</div>' +
      '<div style="font-size:13px;color:var(--ta-text);margin-top:6px;font-weight:600;">' + titulo + '</div>' +
      '<div style="font-size:11px;color:var(--ta-text-mut);margin-top:2px;">' + sub + '</div>' +
    '</div>';
  }

  function renderRowCliente(cl, T) {
    const segColors = {
      recurrente: { bg: 'rgba(22,163,74,0.10)', text: '#15803d', label: 'Recurrente' },
      comprador: { bg: 'rgba(13,148,136,0.10)', text: '#0f766e', label: 'Comprador' },
      cancelador: { bg: 'rgba(220,38,38,0.10)', text: '#b91c1c', label: 'Cancelador' },
      prospecto: { bg: 'rgba(115,115,115,0.10)', text: '#525252', label: 'Prospecto' },
    }[cl.segmento];
    const wppDigits = (cl.telefono || '').replace(/\D/g, '');
    const wppHref = wppDigits ? 'https://wa.me/' + wppDigits : '#';
    return '<tr>' +
      '<td>' + T.escapeHtml(cl.nombre || cl.email || '-') +
        (cl.email ? '<br><span style="font-size:11px;color:var(--ta-text-mut);">' + T.escapeHtml(cl.email) + '</span>' : '') +
        (wppDigits ? '<br><a href="' + wppHref + '" target="_blank" rel="noopener" style="font-size:11px;color:var(--ta-accent);text-decoration:none;">' + T.escapeHtml(cl.telefono) + '</a>' : '') +
      '</td>' +
      '<td><span style="background:' + segColors.bg + ';color:' + segColors.text + ';padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;">' + segColors.label + '</span></td>' +
      '<td style="text-align:center;font-variant-numeric:tabular-nums;">' +
        cl.num_pedidos +
        (cl.pendientes > 0 ? ' <span style="font-size:10px;color:var(--ta-warn);">(' + cl.pendientes + ' pend.)</span>' : '') +
      '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">' + fmtCOP(cl.total_gastado) + '</td>' +
      '<td style="font-size:12px;color:var(--ta-text-soft);">' + (cl.ultimo_pedido ? formatFecha(cl.ultimo_pedido.created_at) : '-') + '</td>' +
      '<td style="text-align:right;"><button type="button" class="ta-btn cm-cliente-action" data-id="' + T.escapeHtml(cl.id) + '" style="padding:4px 12px;font-size:13px;">Ver</button></td>' +
    '</tr>';
  }

  // ============================================================
  // Modal detalle PEDIDO
  // ============================================================

  async function openDetallePedido(pedido) {
    const T = window.TiendaIA;
    const sb = T.supabase();

    const backdrop = createModalBackdrop();
    document.getElementById('cm-modal-content').innerHTML = '<div class="ta-loader" style="width:32px;height:32px;margin:40px auto;"></div>';

    try {
      const { data: items, error } = await sb.from('pedido_items')
        .select('id, referencia, nombre, color, talla, cantidad, precio_unitario, subtotal')
        .eq('pedido_id', pedido.id)
        .order('id');
      if (error) throw error;
      renderDetallePedidoHTML(pedido, items || [], backdrop);
    } catch (e) {
      console.error('[crm] detalle pedido error', e);
      document.getElementById('cm-modal-content').innerHTML =
        '<h2 style="margin-top:0;">Error</h2><p>' + T.escapeHtml(e.message || String(e)) + '</p>' +
        '<button type="button" class="ta-btn" id="cm-modal-close" style="margin-top:12px;">Cerrar</button>';
      document.getElementById('cm-modal-close').addEventListener('click', () => cleanupModal(backdrop));
    }
  }

  function renderDetallePedidoHTML(pedido, items, backdrop) {
    const T = window.TiendaIA;
    const m = document.getElementById('cm-modal-content');

    const itemsRows = items.length === 0
      ? '<tr><td colspan="3" style="padding:16px;color:var(--ta-text-soft);text-align:center;">Sin items</td></tr>'
      : items.map((it) => {
          const variante = [it.color, it.talla].filter(Boolean).join(' / ');
          return '<tr>' +
            '<td style="padding:8px 4px;">' +
              T.escapeHtml(it.nombre) +
              (variante ? '<br><span style="font-size:11px;color:var(--ta-text-mut);">' + T.escapeHtml(variante) + '</span>' : '') +
              '<br><code style="font-size:10px;color:var(--ta-text-mut);">REF ' + T.escapeHtml(it.referencia || '-') + '</code>' +
            '</td>' +
            '<td style="padding:8px 4px;text-align:center;">' + it.cantidad + '</td>' +
            '<td style="padding:8px 4px;text-align:right;font-variant-numeric:tabular-nums;">' + fmtCOP(Number(it.subtotal || 0)) + '</td>' +
          '</tr>';
        }).join('');

    const wppDigits = (pedido.comprador_telefono || '').replace(/\D/g, '');
    const wppHref = wppDigits ? 'https://wa.me/' + wppDigits : null;

    // Acciones segun estado
    let acciones = '';
    if (pedido.estado === 'pendiente_confirmacion') {
      acciones = '<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--ta-border);">' +
        '<button type="button" id="cm-cerrar" class="ta-btn ta-btn--primary" style="flex:1;min-width:170px;">Cerrar y enviar</button>' +
        '<button type="button" id="cm-cancelar" class="ta-btn ta-btn--danger" style="flex:1;min-width:140px;">Cancelar</button>' +
      '</div>';
    } else if (pedido.estado === 'cerrado') {
      acciones = '<div style="display:flex;gap:8px;padding-top:16px;border-top:1px solid var(--ta-border);">' +
        '<button type="button" id="cm-devolver" class="ta-btn ta-btn--danger" style="flex:1;">Marcar devolucion</button>' +
      '</div>';
    } else {
      const fechaEstado = pedido.estado === 'cancelado' ? pedido.cancelado_at : pedido.devuelto_at;
      const razonEstado = pedido.estado === 'cancelado' ? pedido.cancelado_razon : pedido.devuelto_razon;
      acciones = '<div style="padding-top:16px;border-top:1px solid var(--ta-border);">' +
        '<p style="margin:0;font-size:12px;color:var(--ta-text-mut);">' +
          (pedido.estado === 'devuelto' ? 'Devuelto' : 'Cancelado') + ' el ' + formatFecha(fechaEstado) +
          (razonEstado ? '<br>Razon: ' + T.escapeHtml(razonEstado) : '') +
        '</p>' +
      '</div>';
    }

    m.innerHTML = '' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;">' +
        '<div>' +
          '<h2 style="margin:0 0 4px 0;font-size:1.25rem;">' + T.escapeHtml(pedido.codigo_publico || pedido.id.slice(0, 8)) + '</h2>' +
          '<p style="margin:0;font-size:13px;color:var(--ta-text-soft);">' + formatFecha(pedido.created_at) + ' &middot; ' + renderEstadoPill(pedido.estado) + '</p>' +
        '</div>' +
        '<button type="button" id="cm-modal-close-x" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ta-text-soft);line-height:1;">&times;</button>' +
      '</div>' +

      // Cliente
      '<section style="margin-bottom:14px;padding:14px;background:var(--ta-bg-soft);border-radius:8px;">' +
        '<h3 style="font-size:12px;font-weight:600;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);">Cliente</h3>' +
        '<p style="margin:0;font-size:14px;line-height:1.6;">' +
          '<strong>' + T.escapeHtml(pedido.comprador_nombre || '-') + '</strong><br>' +
          (wppHref ? '<a href="' + wppHref + '" target="_blank" rel="noopener" style="color:var(--ta-accent);text-decoration:none;">' + T.escapeHtml(pedido.comprador_telefono) + '</a>' : T.escapeHtml(pedido.comprador_telefono || '-')) +
          (pedido.comprador_email ? '<br><span style="font-size:13px;color:var(--ta-text-soft);">' + T.escapeHtml(pedido.comprador_email) + '</span>' : '') +
        '</p>' +
        '<p style="margin:8px 0 0 0;font-size:13px;color:var(--ta-text-soft);">' +
          T.escapeHtml(pedido.comprador_direccion || '-') + ', ' + T.escapeHtml(pedido.comprador_ciudad || '-') +
        '</p>' +
        (pedido.comprador_observ ? '<p style="margin:8px 0 0 0;padding:8px;background:var(--ta-bg);border-radius:6px;font-size:13px;font-style:italic;">"' + T.escapeHtml(pedido.comprador_observ) + '"</p>' : '') +
      '</section>' +

      // Guia (si esta cerrado o devuelto)
      ((pedido.numero_guia || pedido.transportadora) ?
        '<section style="margin-bottom:14px;padding:14px;background:var(--ta-bg-soft);border-radius:8px;">' +
          '<h3 style="font-size:12px;font-weight:600;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);">Envio</h3>' +
          '<p style="margin:0;font-size:14px;line-height:1.6;">' +
            (pedido.transportadora ? '<strong>' + T.escapeHtml(pedido.transportadora) + '</strong><br>' : '') +
            (pedido.numero_guia ? '<span style="font-family:monospace;">' + T.escapeHtml(pedido.numero_guia) + '</span>' : '') +
            (pedido.cerrado_at ? '<br><span style="font-size:12px;color:var(--ta-text-soft);">Enviado: ' + formatFecha(pedido.cerrado_at) + '</span>' : '') +
          '</p>' +
        '</section>' : '') +

      // Items
      '<section style="margin-bottom:14px;">' +
        '<h3 style="font-size:12px;font-weight:600;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);">Productos</h3>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
          '<thead><tr style="border-bottom:1px solid var(--ta-border);">' +
            '<th style="text-align:left;padding:6px 4px;font-weight:600;color:var(--ta-text-soft);">Producto</th>' +
            '<th style="text-align:center;padding:6px 4px;font-weight:600;color:var(--ta-text-soft);">Cant</th>' +
            '<th style="text-align:right;padding:6px 4px;font-weight:600;color:var(--ta-text-soft);">Subtotal</th>' +
          '</tr></thead>' +
          '<tbody>' + itemsRows + '</tbody>' +
          '<tfoot><tr style="border-top:1px solid var(--ta-border);">' +
            '<td colspan="2" style="padding:10px 4px;text-align:right;font-weight:600;">Total</td>' +
            '<td style="padding:10px 4px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">' + fmtCOP(Number(pedido.total || 0)) + '</td>' +
          '</tr></tfoot>' +
        '</table>' +
      '</section>' +

      acciones;

    document.getElementById('cm-modal-close-x').addEventListener('click', () => cleanupModal(backdrop));

    const btnCerrar = document.getElementById('cm-cerrar');
    const btnCancelar = document.getElementById('cm-cancelar');
    const btnDevolver = document.getElementById('cm-devolver');
    if (btnCerrar) btnCerrar.addEventListener('click', () => openModalCerrarPedido(pedido, backdrop));
    if (btnCancelar) btnCancelar.addEventListener('click', () => accionCancelar(pedido, backdrop));
    if (btnDevolver) btnDevolver.addEventListener('click', () => accionDevolver(pedido, backdrop));
  }

  // ============================================================
  // Modal "Cerrar y enviar pedido" (con guia + transportadora + wa.me)
  // ============================================================

  function openModalCerrarPedido(pedido, parentBackdrop) {
    const T = window.TiendaIA;
    const m = document.getElementById('cm-modal-content');
    m.innerHTML = '' +
      '<h2 style="margin:0 0 14px 0;font-size:1.15rem;">Cerrar y enviar pedido</h2>' +
      '<p style="margin:0 0 16px 0;font-size:13px;color:var(--ta-text-soft);">' +
        'Ingresa los datos de envio. Al confirmar marcaremos el pedido como cerrado, descontaremos el stock y abriremos WhatsApp para enviar el aviso al cliente.' +
      '</p>' +
      '<div style="display:grid;gap:14px;">' +
        '<div>' +
          '<label for="cm-transp" style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Transportadora</label>' +
          '<input id="cm-transp" type="text" class="ta-input" placeholder="Servientrega, Coordinadora, Interrapidisimo..." style="width:100%;" />' +
        '</div>' +
        '<div>' +
          '<label for="cm-guia" style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Numero de guia</label>' +
          '<input id="cm-guia" type="text" class="ta-input" placeholder="GU123456789" style="width:100%;" />' +
        '</div>' +
        '<div>' +
          '<label for="cm-link-tracking" style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Link de rastreo <span style="font-weight:400;color:var(--ta-text-mut);">(opcional)</span></label>' +
          '<input id="cm-link-tracking" type="url" class="ta-input" placeholder="https://servientrega.com/tracking/..." style="width:100%;" />' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--ta-border);">' +
        '<button type="button" id="cm-cerrar-back" class="ta-btn" style="flex:1;">Cancelar</button>' +
        '<button type="button" id="cm-cerrar-go" class="ta-btn ta-btn--primary" style="flex:2;">Cerrar y abrir WhatsApp</button>' +
      '</div>';

    document.getElementById('cm-cerrar-back').addEventListener('click', () => {
      // Volver al detalle
      openDetallePedido(pedido);
    });
    document.getElementById('cm-cerrar-go').addEventListener('click', () => accionCerrar(pedido, parentBackdrop));
  }

  async function accionCerrar(pedido, backdrop) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const transp = (document.getElementById('cm-transp').value || '').trim();
    const guia = (document.getElementById('cm-guia').value || '').trim();
    const trackingLink = (document.getElementById('cm-link-tracking').value || '').trim();

    if (!transp || !guia) {
      alert('Ingresa transportadora y numero de guia.');
      return;
    }

    try {
      const { error } = await sb.from('pedidos').update({
        estado: 'cerrado',
        transportadora: transp,
        numero_guia: guia,
        cerrado_at: new Date().toISOString(),
      }).eq('id', pedido.id);
      if (error) throw error;

      // Construir mensaje WhatsApp al cliente
      const tiendaNombre = T.state.tienda.nombre_negocio;
      const lineas = [
        '¡Hola ' + (pedido.comprador_nombre || '') + '!',
        '',
        'Tu pedido *' + (pedido.codigo_publico || '') + '* en ' + tiendaNombre + ' ya va en camino. 📦',
        '',
        '*Transportadora:* ' + transp,
        '*Guia:* ' + guia,
      ];
      if (trackingLink) lineas.push('*Rastrear:* ' + trackingLink);
      lineas.push('');
      lineas.push('Gracias por tu compra.');

      const wppDigits = (pedido.comprador_telefono || '').replace(/\D/g, '');
      if (wppDigits) {
        const wppUrl = 'https://wa.me/' + wppDigits + '?text=' + encodeURIComponent(lineas.join('\n'));
        window.open(wppUrl, '_blank', 'noopener');
      }

      cleanupModal(backdrop);
      await loadDataForCurrentTab();
      T.toast && T.toast.show && T.toast.show('Pedido cerrado y aviso enviado', 'success');
    } catch (e) {
      console.error('[crm] cerrar error', e);
      alert('Error: ' + (e.message || String(e)));
    }
  }

  async function accionCancelar(pedido, backdrop) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const razon = window.prompt('Razon de cancelacion (opcional):', '');
    if (razon === null) return;

    try {
      const { error } = await sb.from('pedidos').update({
        estado: 'cancelado',
        cancelado_at: new Date().toISOString(),
        cancelado_razon: razon || 'Cancelado por la tienda',
      }).eq('id', pedido.id);
      if (error) throw error;
      cleanupModal(backdrop);
      await loadDataForCurrentTab();
      T.toast && T.toast.show && T.toast.show('Pedido cancelado, stock liberado', 'success');
    } catch (e) {
      console.error('[crm] cancelar error', e);
      alert('Error: ' + (e.message || String(e)));
    }
  }

  async function accionDevolver(pedido, backdrop) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const razon = window.prompt('Razon de la devolucion:', '');
    if (razon === null) return;
    if (!razon.trim()) { alert('Ingresa una razon para la devolucion.'); return; }

    try {
      const { error } = await sb.from('pedidos').update({
        estado: 'devuelto',
        devuelto_at: new Date().toISOString(),
        devuelto_razon: razon,
      }).eq('id', pedido.id);
      if (error) throw error;
      cleanupModal(backdrop);
      await loadDataForCurrentTab();
      T.toast && T.toast.show && T.toast.show('Devolucion registrada, stock reintegrado', 'success');
    } catch (e) {
      console.error('[crm] devolver error', e);
      alert('Error: ' + (e.message || String(e)));
    }
  }

  // ============================================================
  // Modal detalle CLIENTE (historial + WhatsApp custom)
  // ============================================================

  function openDetalleCliente(cliente) {
    const T = window.TiendaIA;
    const backdrop = createModalBackdrop();
    const m = document.getElementById('cm-modal-content');

    const wppDigits = (cliente.telefono || '').replace(/\D/g, '');

    const segColors = {
      recurrente: { bg: 'rgba(22,163,74,0.10)', text: '#15803d', label: 'Cliente recurrente' },
      comprador: { bg: 'rgba(13,148,136,0.10)', text: '#0f766e', label: 'Comprador' },
      cancelador: { bg: 'rgba(220,38,38,0.10)', text: '#b91c1c', label: 'Cliente con cancelaciones' },
      prospecto: { bg: 'rgba(115,115,115,0.10)', text: '#525252', label: 'Prospecto sin compra' },
    }[cliente.segmento];

    const pedidosOrdenados = (cliente.pedidos || []).slice().sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const pedidosHTML = pedidosOrdenados.length === 0
      ? '<p style="color:var(--ta-text-mut);font-size:13px;text-align:center;padding:20px;">Sin pedidos registrados</p>'
      : pedidosOrdenados.map((p) => '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--ta-border);">' +
          '<div>' +
            '<code style="font-size:12px;">' + T.escapeHtml(p.codigo_publico || p.id.slice(0, 8)) + '</code>' +
            ' ' + renderEstadoPill(p.estado) +
            '<br><span style="font-size:11px;color:var(--ta-text-mut);">' + formatFecha(p.created_at) + '</span>' +
          '</div>' +
          '<div style="font-weight:600;font-variant-numeric:tabular-nums;">' + fmtCOP(Number(p.total || 0)) + '</div>' +
        '</div>').join('');

    m.innerHTML = '' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;">' +
        '<div>' +
          '<h2 style="margin:0 0 4px 0;font-size:1.25rem;">' + T.escapeHtml(cliente.nombre || cliente.email || 'Cliente') + '</h2>' +
          '<p style="margin:0;font-size:13px;">' +
            '<span style="background:' + segColors.bg + ';color:' + segColors.text + ';padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;">' + segColors.label + '</span>' +
          '</p>' +
        '</div>' +
        '<button type="button" id="cm-modal-close-x" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ta-text-soft);line-height:1;">&times;</button>' +
      '</div>' +

      // Datos
      '<section style="margin-bottom:14px;padding:14px;background:var(--ta-bg-soft);border-radius:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">' +
        '<div>' +
          '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);margin-bottom:4px;">Telefono</div>' +
          '<div style="font-size:14px;">' +
            (wppDigits ? '<a href="https://wa.me/' + wppDigits + '" target="_blank" rel="noopener" style="color:var(--ta-accent);text-decoration:none;">' + T.escapeHtml(cliente.telefono) + '</a>' : '<span style="color:var(--ta-text-mut);">No registrado</span>') +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);margin-bottom:4px;">Email</div>' +
          '<div style="font-size:13px;">' + (cliente.email ? T.escapeHtml(cliente.email) : '<span style="color:var(--ta-text-mut);">No registrado</span>') + '</div>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);margin-bottom:4px;">Total gastado</div>' +
          '<div style="font-size:14px;font-weight:600;">' + fmtCOP(cliente.total_gastado) + '</div>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);margin-bottom:4px;">Pedidos</div>' +
          '<div style="font-size:14px;">' +
            '<strong>' + cliente.cerrados + '</strong> cerrados, ' + cliente.cancelados + ' cancelados, ' + cliente.devueltos + ' devueltos' +
          '</div>' +
        '</div>' +
      '</section>' +

      // Pedidos historial
      '<section style="margin-bottom:14px;">' +
        '<h3 style="font-size:12px;font-weight:600;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);">Historial de pedidos</h3>' +
        pedidosHTML +
      '</section>' +

      // Accion: WhatsApp custom
      (wppDigits
        ? '<div style="padding-top:14px;border-top:1px solid var(--ta-border);">' +
            '<label for="cm-wpp-msg" style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Enviar mensaje por WhatsApp</label>' +
            '<textarea id="cm-wpp-msg" rows="3" class="ta-input" style="width:100%;font-size:13px;" placeholder="Hola ' + T.escapeHtml(cliente.nombre || '') + ', ' + (cliente.segmento === 'cancelador' ? 'queremos recuperarte como cliente. Tenemos un descuento especial para ti...' : cliente.segmento === 'prospecto' ? 'gracias por interesarte en nuestros productos. Te puedo ayudar con algo?' : 'tenemos novedades que pueden interesarte...') + '"></textarea>' +
            '<button type="button" id="cm-wpp-send" class="ta-btn ta-btn--primary" style="margin-top:8px;width:100%;">Abrir WhatsApp</button>' +
          '</div>'
        : '');

    document.getElementById('cm-modal-close-x').addEventListener('click', () => cleanupModal(backdrop));

    const btnWpp = document.getElementById('cm-wpp-send');
    if (btnWpp) {
      btnWpp.addEventListener('click', () => {
        const msg = (document.getElementById('cm-wpp-msg').value || '').trim();
        if (!msg) { alert('Escribe un mensaje.'); return; }
        const wppUrl = 'https://wa.me/' + wppDigits + '?text=' + encodeURIComponent(msg);
        window.open(wppUrl, '_blank', 'noopener');
      });
    }
  }

  // ============================================================
  // Modal helpers
  // ============================================================

  function createModalBackdrop() {
    const backdrop = document.createElement('div');
    backdrop.className = 'cm-modal-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:100;backdrop-filter:blur(4px);';
    backdrop.innerHTML = '<div class="cm-modal" style="background:#ffffff;border-radius:14px;max-width:680px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,0.18);">' +
      '<div id="cm-modal-content" style="padding:24px;"></div>' +
    '</div>';
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanupModal(backdrop); });
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    // ESC para cerrar
    const escHandler = (e) => { if (e.key === 'Escape') { cleanupModal(backdrop); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    return backdrop;
  }

  function cleanupModal(backdrop) {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    document.body.style.overflow = '';
  }

  // ============================================================
  // Helpers comunes
  // ============================================================

  function renderEstadoPill(estado) {
    if (estado === 'cerrado') return '<span class="ta-pill ta-pill--ok" style="margin-left:0;">Cerrado</span>';
    if (estado === 'confirmado') return '<span class="ta-pill ta-pill--ok" style="margin-left:0;">Confirmado</span>';
    if (estado === 'cancelado') return '<span class="ta-pill ta-pill--danger" style="margin-left:0;">Cancelado</span>';
    if (estado === 'devuelto') return '<span class="ta-pill" style="margin-left:0;background:rgba(220,38,38,0.10);color:#b91c1c;">Devuelto</span>';
    return '<span class="ta-pill ta-pill--warn" style="margin-left:0;">Pendiente</span>';
  }

  function fmtCOP(n) {
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0); }
    catch { return '$' + Math.round(n || 0).toLocaleString('es-CO'); }
  }
  function formatFecha(iso) {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return String(iso); }
  }
})();
