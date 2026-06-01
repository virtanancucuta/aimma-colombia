/* AIMMA · Tienda IA · views/pedidos.js · v2 · 2026-06-01
   Fase 12.B.5 LIVE: Tabla real Supabase + filtros estado/fecha + buscar
   por codigo + modal detalle items + botones cambiar estado.

   ARQUITECTURA Opcion 2 Hibrida: AIMMA es CRM leads del dueno. Pedidos
   guardados en BD para conveniencia del owner (no transaccion AIMMA).
*/

(function () {
  'use strict';

  // ============================================================
  // State local de la vista
  // ============================================================

  const state = {
    pedidos: [],
    filtros: {
      estado: 'todos',         // todos | pendiente_confirmacion | confirmado | cancelado
      rango: '30d',            // 7d | 30d | 90d | todos
      buscar: '',              // texto libre codigo_publico / nombre / telefono
    },
    cargando: false,
  };

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[pedidos.js] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.registerView('pedidos', renderPedidos);
  });

  // ============================================================
  // Render principal
  // ============================================================

  async function renderPedidos() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;
    view.innerHTML = renderHeaderHTML() + '<div id="pd-content"><div class="ta-card"><div class="ta-empty"><div class="ta-loader" style="width:32px;height:32px;margin:0 auto 12px;"></div><p class="ta-empty__text">Cargando pedidos...</p></div></div></div>';
    wireToolbarEvents();
    await loadPedidos();
  }

  function renderHeaderHTML() {
    return '' +
      '<header style="margin-bottom:20px;">' +
        '<h1 class="ta-section-title">Pedidos</h1>' +
        '<p class="ta-section-sub">Solicitudes recibidas via tu storefront publico. Coordinas pago y entrega directamente por WhatsApp.</p>' +
      '</header>' +

      // Toolbar filtros + buscador
      '<div class="ta-card" style="padding:14px;margin-bottom:16px;">' +
        '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button type="button" class="pd-filter-estado ta-btn" data-estado="todos">Todos</button>' +
            '<button type="button" class="pd-filter-estado ta-btn" data-estado="pendiente_confirmacion">Pendiente</button>' +
            '<button type="button" class="pd-filter-estado ta-btn" data-estado="confirmado">Confirmados</button>' +
            '<button type="button" class="pd-filter-estado ta-btn" data-estado="cancelado">Cancelados</button>' +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;">' +
            '<label style="font-size:12px;color:var(--ta-text-soft);">Periodo:</label>' +
            '<select id="pd-rango" class="ta-input" style="padding:6px 10px;font-size:13px;">' +
              '<option value="7d">Ultimos 7 dias</option>' +
              '<option value="30d" selected>Ultimos 30 dias</option>' +
              '<option value="90d">Ultimos 90 dias</option>' +
              '<option value="todos">Todos</option>' +
            '</select>' +
          '</div>' +
          '<div style="flex:1;min-width:200px;">' +
            '<input id="pd-buscar" type="search" placeholder="Buscar codigo, nombre o telefono..." class="ta-input" style="width:100%;padding:8px 12px;font-size:13px;" />' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function wireToolbarEvents() {
    document.querySelectorAll('.pd-filter-estado').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filtros.estado = btn.getAttribute('data-estado');
        highlightActiveFilter();
        loadPedidos();
      });
    });
    const selRango = document.getElementById('pd-rango');
    if (selRango) {
      selRango.addEventListener('change', () => {
        state.filtros.rango = selRango.value;
        loadPedidos();
      });
    }
    const inpBuscar = document.getElementById('pd-buscar');
    if (inpBuscar) {
      let t;
      inpBuscar.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          state.filtros.buscar = inpBuscar.value.trim();
          renderTabla(); // filtrado in-memory, no re-fetch
        }, 200);
      });
    }
    highlightActiveFilter();
  }

  function highlightActiveFilter() {
    document.querySelectorAll('.pd-filter-estado').forEach((btn) => {
      const isActive = btn.getAttribute('data-estado') === state.filtros.estado;
      btn.style.background = isActive ? 'var(--ta-accent)' : '';
      btn.style.color = isActive ? '#ffffff' : '';
      btn.style.borderColor = isActive ? 'var(--ta-accent)' : '';
    });
  }

  // ============================================================
  // Data fetch
  // ============================================================

  async function loadPedidos() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    state.cargando = true;

    // Calcular fecha desde segun rango
    let desde = null;
    if (state.filtros.rango === '7d') desde = new Date(Date.now() - 7 * 86400e3).toISOString();
    else if (state.filtros.rango === '30d') desde = new Date(Date.now() - 30 * 86400e3).toISOString();
    else if (state.filtros.rango === '90d') desde = new Date(Date.now() - 90 * 86400e3).toISOString();

    try {
      let q = sb.from('pedidos')
        .select('id, codigo_publico, comprador_nombre, comprador_telefono, comprador_email, comprador_direccion, comprador_ciudad, comprador_observ, metodo_envio, estado, total, subtotal_productos, costo_envio, pendiente_at, confirmado_at, cancelado_at, cancelado_razon, created_at')
        .eq('tienda_id', tienda.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (state.filtros.estado !== 'todos') q = q.eq('estado', state.filtros.estado);
      if (desde) q = q.gte('created_at', desde);

      const { data, error } = await q;
      if (error) throw error;
      state.pedidos = data || [];
      state.cargando = false;
      renderTabla();
    } catch (e) {
      console.error('[pedidos] load error', e);
      const content = document.getElementById('pd-content');
      if (content) {
        content.innerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">Error</h2><p class="ta-empty__text">' + T.escapeHtml(e.message || String(e)) + '</p></div></div>';
      }
      state.cargando = false;
    }
  }

  // ============================================================
  // Tabla render
  // ============================================================

  function renderTabla() {
    const T = window.TiendaIA;
    const content = document.getElementById('pd-content');
    if (!content) return;

    const buscar = state.filtros.buscar.toLowerCase();
    const filtrados = buscar
      ? state.pedidos.filter((p) =>
          (p.codigo_publico || '').toLowerCase().includes(buscar) ||
          (p.comprador_nombre || '').toLowerCase().includes(buscar) ||
          (p.comprador_telefono || '').toLowerCase().includes(buscar))
      : state.pedidos;

    if (filtrados.length === 0) {
      content.innerHTML = '<div class="ta-card"><div class="ta-empty" style="padding:48px 20px;">' +
        '<h2 class="ta-empty__title">' + (state.pedidos.length === 0 ? 'Aun no hay pedidos' : 'Sin resultados') + '</h2>' +
        '<p class="ta-empty__text">' +
        (state.pedidos.length === 0
          ? 'Cuando tus clientes hagan pedidos desde el storefront publico aparecen aqui. <a href="https://' + T.escapeHtml(T.state.tienda.slug) + '.tienda.aimma.com.co/" target="_blank" rel="noopener" style="text-decoration:underline;">Abrir tienda</a>'
          : 'No hay pedidos que coincidan con los filtros aplicados.') +
        '</p></div></div>';
      return;
    }

    const rows = filtrados.map((p) => renderRow(p, T)).join('');
    content.innerHTML = '<div class="ta-card" style="padding:0;">' +
      '<div class="ta-table-wrap" style="overflow-x:auto;">' +
        '<table class="ta-table" style="width:100%;">' +
          '<thead><tr>' +
            '<th>Codigo</th>' +
            '<th>Cliente</th>' +
            '<th>Estado</th>' +
            '<th style="text-align:right;">Total</th>' +
            '<th>Fecha</th>' +
            '<th style="text-align:right;">Accion</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +
    '<p style="margin-top:12px;font-size:12px;color:var(--ta-text-mut);text-align:right;">' + filtrados.length + ' de ' + state.pedidos.length + ' pedido(s)</p>';

    // Wire detalle clicks
    document.querySelectorAll('.pd-row-action').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const pedido = state.pedidos.find((x) => x.id === id);
        if (pedido) openDetalle(pedido);
      });
    });
  }

  function renderRow(p, T) {
    const estadoPill = renderEstadoPill(p.estado);
    const wppLink = (p.comprador_telefono || '').replace(/\D/g, '');
    const wppHref = wppLink ? 'https://wa.me/' + wppLink : '#';
    return '<tr style="cursor:pointer;" class="pd-row" data-id="' + T.escapeHtml(p.id) + '">' +
      '<td><code style="font-size:12px;">' + T.escapeHtml(p.codigo_publico || p.id.slice(0, 8)) + '</code></td>' +
      '<td>' + T.escapeHtml(p.comprador_nombre || '-') +
        (wppLink ? '<br><a href="' + wppHref + '" target="_blank" rel="noopener" style="font-size:11px;color:var(--ta-accent);text-decoration:none;">' + T.escapeHtml(p.comprador_telefono) + '</a>' : '') +
      '</td>' +
      '<td>' + estadoPill + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtCOP(Number(p.total || 0)) + '</td>' +
      '<td style="font-size:12px;color:var(--ta-text-soft);">' + formatFecha(p.created_at || p.pendiente_at) + '</td>' +
      '<td style="text-align:right;"><button type="button" class="ta-btn pd-row-action" data-id="' + T.escapeHtml(p.id) + '" style="padding:4px 12px;font-size:13px;">Ver</button></td>' +
    '</tr>';
  }

  function renderEstadoPill(estado) {
    if (estado === 'confirmado') return '<span class="ta-pill ta-pill--ok" style="margin-left:0;">Confirmado</span>';
    if (estado === 'cancelado') return '<span class="ta-pill ta-pill--danger" style="margin-left:0;">Cancelado</span>';
    return '<span class="ta-pill ta-pill--warn" style="margin-left:0;">Pendiente</span>';
  }

  // ============================================================
  // Modal detalle
  // ============================================================

  async function openDetalle(pedido) {
    const T = window.TiendaIA;
    const sb = T.supabase();

    // Backdrop + modal
    const backdrop = document.createElement('div');
    backdrop.className = 'ta-modal-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:100;backdrop-filter:blur(4px);';
    backdrop.innerHTML = '<div class="ta-modal" style="background:#ffffff;border-radius:14px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,0.18);">' +
      '<div id="pd-modal-content" style="padding:24px;">' +
        '<div class="ta-loader" style="width:32px;height:32px;margin:40px auto;"></div>' +
      '</div>' +
    '</div>';

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    const cleanup = () => {
      backdrop.remove();
      document.body.style.overflow = '';
    };

    // ESC para cerrar
    const escHandler = (e) => { if (e.key === 'Escape') { cleanup(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    // Fetch items
    try {
      const { data: items, error } = await sb.from('pedido_items')
        .select('id, referencia, nombre, color, talla, cantidad, precio_unitario, subtotal')
        .eq('pedido_id', pedido.id)
        .order('id');
      if (error) throw error;
      renderDetalleHTML(pedido, items || [], cleanup);
    } catch (e) {
      console.error('[pedidos] detalle error', e);
      document.getElementById('pd-modal-content').innerHTML =
        '<h2 style="margin-top:0;">Error</h2><p>' + T.escapeHtml(e.message || String(e)) + '</p>' +
        '<button type="button" class="ta-btn" id="pd-modal-close" style="margin-top:12px;">Cerrar</button>';
      document.getElementById('pd-modal-close').addEventListener('click', cleanup);
    }
  }

  function renderDetalleHTML(pedido, items, cleanup) {
    const T = window.TiendaIA;
    const modalContent = document.getElementById('pd-modal-content');

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
    const wppHref = wppDigits ? 'https://wa.me/' + wppDigits + '?text=' + encodeURIComponent('Hola ' + (pedido.comprador_nombre || '') + ', te escribo sobre tu pedido ' + (pedido.codigo_publico || '') + '.') : null;

    modalContent.innerHTML = '' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;">' +
        '<div>' +
          '<h2 style="margin:0 0 4px 0;font-size:1.25rem;">' + T.escapeHtml(pedido.codigo_publico || pedido.id.slice(0, 8)) + '</h2>' +
          '<p style="margin:0;font-size:13px;color:var(--ta-text-soft);">' + formatFecha(pedido.created_at || pedido.pendiente_at) + ' &middot; ' + renderEstadoPill(pedido.estado) + '</p>' +
        '</div>' +
        '<button type="button" id="pd-modal-close-x" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ta-text-soft);line-height:1;">&times;</button>' +
      '</div>' +

      // Cliente
      '<section style="margin-bottom:16px;padding:14px;background:var(--ta-bg-soft);border-radius:8px;">' +
        '<h3 style="font-size:13px;font-weight:600;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);">Cliente</h3>' +
        '<p style="margin:0;font-size:14px;line-height:1.6;">' +
          '<strong>' + T.escapeHtml(pedido.comprador_nombre || '-') + '</strong><br>' +
          (wppHref ? '<a href="' + wppHref + '" target="_blank" rel="noopener" style="color:var(--ta-accent);text-decoration:none;">📱 ' + T.escapeHtml(pedido.comprador_telefono) + '</a>' : T.escapeHtml(pedido.comprador_telefono || '-')) +
          (pedido.comprador_email ? '<br><span style="font-size:13px;color:var(--ta-text-soft);">' + T.escapeHtml(pedido.comprador_email) + '</span>' : '') +
        '</p>' +
        '<p style="margin:8px 0 0 0;font-size:13px;color:var(--ta-text-soft);">' +
          T.escapeHtml(pedido.comprador_direccion || '-') + ', ' + T.escapeHtml(pedido.comprador_ciudad || '-') +
        '</p>' +
        (pedido.comprador_observ ? '<p style="margin:8px 0 0 0;padding:8px;background:var(--ta-bg);border-radius:6px;font-size:13px;font-style:italic;">"' + T.escapeHtml(pedido.comprador_observ) + '"</p>' : '') +
      '</section>' +

      // Items
      '<section style="margin-bottom:16px;">' +
        '<h3 style="font-size:13px;font-weight:600;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.04em;color:var(--ta-text-soft);">Productos</h3>' +
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

      // Acciones
      (pedido.estado === 'pendiente_confirmacion'
        ? '<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--ta-border);">' +
            '<button type="button" id="pd-confirmar" class="ta-btn ta-btn--primary" style="flex:1;min-width:140px;">Marcar confirmado</button>' +
            '<button type="button" id="pd-cancelar" class="ta-btn ta-btn--danger" style="flex:1;min-width:140px;">Cancelar pedido</button>' +
          '</div>'
        : '<div style="padding-top:16px;border-top:1px solid var(--ta-border);">' +
            '<p style="margin:0;font-size:12px;color:var(--ta-text-mut);">' +
              (pedido.estado === 'confirmado'
                ? 'Confirmado el ' + formatFecha(pedido.confirmado_at)
                : 'Cancelado el ' + formatFecha(pedido.cancelado_at) + (pedido.cancelado_razon ? ' - ' + T.escapeHtml(pedido.cancelado_razon) : '')) +
            '</p>' +
          '</div>'
      );

    document.getElementById('pd-modal-close-x').addEventListener('click', cleanup);

    const btnConf = document.getElementById('pd-confirmar');
    const btnCanc = document.getElementById('pd-cancelar');
    if (btnConf) btnConf.addEventListener('click', () => actualizarEstado(pedido.id, 'confirmado', null, cleanup));
    if (btnCanc) btnCanc.addEventListener('click', () => {
      const razon = window.prompt('Razon de cancelacion (opcional):', '');
      if (razon === null) return;
      actualizarEstado(pedido.id, 'cancelado', razon || 'Cancelado por la tienda', cleanup);
    });
  }

  async function actualizarEstado(pedidoId, nuevoEstado, razon, cleanup) {
    const T = window.TiendaIA;
    const sb = T.supabase();

    const patch = { estado: nuevoEstado };
    if (nuevoEstado === 'confirmado') patch.confirmado_at = new Date().toISOString();
    if (nuevoEstado === 'cancelado') {
      patch.cancelado_at = new Date().toISOString();
      if (razon) patch.cancelado_razon = razon;
    }

    try {
      const { error } = await sb.from('pedidos').update(patch).eq('id', pedidoId);
      if (error) throw error;
      cleanup();
      await loadPedidos();
      T.toast && T.toast.show('Pedido actualizado', 'success');
    } catch (e) {
      console.error('[pedidos] update error', e);
      alert('Error: ' + (e.message || String(e)));
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  function fmtCOP(n) {
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n); }
    catch { return '$' + Math.round(n).toLocaleString('es-CO'); }
  }
  function formatFecha(iso) {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return String(iso); }
  }
})();
