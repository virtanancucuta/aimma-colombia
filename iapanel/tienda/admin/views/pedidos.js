/* AIMMA · Tienda IA · views/pedidos.js · v1 · 2026-05-30
   Fase 3.8 - Placeholder de Pedidos hasta Fase 5 (checkout WhatsApp +
   estados pendiente/confirmado/cancelado + reserva de stock). Muestra
   pedidos existentes en BD si hay (deberian ser 0 todavia) o un empty
   state informativo con explicacion. */

(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[pedidos.js] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.registerView('pedidos', renderPedidos);
  });

  async function renderPedidos() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;
    const sb = T.supabase();
    const tienda = T.state.tienda;

    view.innerHTML = '<div class="ta-card"><div class="ta-empty"><div class="ta-loader" style="width:32px;height:32px;margin:0 auto 12px;"></div><p class="ta-empty__text">Cargando pedidos...</p></div></div>';

    try {
      const { data, error, count } = await sb.from('pedidos')
        .select('id, codigo_publico, comprador_nombre, comprador_telefono, estado, total, pendiente_at, confirmado_at, cancelado_at', { count: 'exact' })
        .eq('tienda_id', tienda.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const pedidos = data || [];
      view.innerHTML = renderHTML(pedidos, count || 0);
    } catch (e) {
      console.error('[pedidos] error', e);
      view.innerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">Error</h2><p class="ta-empty__text">' + T.escapeHtml(e.message || String(e)) + '</p></div></div>';
    }
  }

  function renderHTML(pedidos, total) {
    const T = window.TiendaIA;
    if (pedidos.length === 0) {
      return '' +
        '<header style="margin-bottom:20px;">' +
          '<h1 class="ta-section-title">Pedidos</h1>' +
          '<p class="ta-section-sub">Aqui apareceran los pedidos que tus clientes hagan via WhatsApp desde tu tienda publica.</p>' +
        '</header>' +

        '<div class="ta-card">' +
          '<div class="ta-empty" style="padding:60px 20px;">' +
            '<div style="font-size:48px;margin-bottom:12px;">📦</div>' +
            '<h2 class="ta-empty__title">Aun no tienes pedidos</h2>' +
            '<p class="ta-empty__text" style="max-width:580px;">' +
              'El checkout via WhatsApp se activa en la <strong>proxima fase del modulo</strong>. Cuando este listo:' +
            '</p>' +
            '<ul style="text-align:left;max-width:540px;margin:18px auto 0;color:var(--ta-text-soft);font-size:14px;line-height:1.8;list-style:none;padding:0;">' +
              '<li>📲 Tu cliente arma su pedido en tu tienda publica</li>' +
              '<li>🛒 Hace checkout via WhatsApp (el mensaje llega a tu telefono)</li>' +
              '<li>📋 El pedido aparece aqui como <span class="ta-pill ta-pill--warn" style="margin-left:0;">Pendiente</span></li>' +
              '<li>✓ Confirmas o canceles desde este panel</li>' +
              '<li>📦 El stock se reserva automaticamente al recibir el pedido</li>' +
            '</ul>' +
            '<p style="margin-top:20px;font-size:13px;color:var(--ta-text-mut);">' +
              'Mientras tanto, asegurate de tener: catalogo cargado, plantilla elegida, paleta, paginas legales completas y datos del negocio actualizados.' +
            '</p>' +
          '</div>' +
        '</div>';
    }

    // Si hay pedidos reales (no deberian existir todavia pero por si acaso)
    const rows = pedidos.map(p => {
      const estadoPill = p.estado === 'confirmado'
        ? '<span class="ta-pill ta-pill--ok" style="margin-left:0;">Confirmado</span>'
        : p.estado === 'cancelado'
        ? '<span class="ta-pill ta-pill--danger" style="margin-left:0;">Cancelado</span>'
        : '<span class="ta-pill ta-pill--warn" style="margin-left:0;">Pendiente</span>';
      return '<tr>' +
        '<td><code style="font-size:12px;">' + T.escapeHtml(p.codigo_publico || p.id.slice(0, 8)) + '</code></td>' +
        '<td>' + T.escapeHtml(p.comprador_nombre || '-') + '<br><span style="font-size:11px;color:var(--ta-text-mut);">' + T.escapeHtml(p.comprador_telefono || '') + '</span></td>' +
        '<td>' + estadoPill + '</td>' +
        '<td style="text-align:right;">' + fmtCOP(Number(p.total || 0)) + '</td>' +
        '<td style="font-size:12px;color:var(--ta-text-soft);">' + formatFecha(p.pendiente_at) + '</td>' +
      '</tr>';
    }).join('');

    return '' +
      '<header style="margin-bottom:20px;">' +
        '<h1 class="ta-section-title">Pedidos</h1>' +
        '<p class="ta-section-sub">' + T.escapeHtml(String(total)) + ' pedido(s) en total.</p>' +
      '</header>' +
      '<div class="ta-card" style="padding:0;">' +
        '<div class="ta-table-wrap">' +
          '<table class="ta-table">' +
            '<thead><tr><th>Codigo</th><th>Cliente</th><th>Estado</th><th style="text-align:right;">Total</th><th>Fecha</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
  }

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
