/* AIMMA Tienda IA · views/resenas.js · v1 · 2026-06-11 · Fase F4
   Moderacion de reseñas de clientes. Tabs: Pendientes / Aprobadas / Rechazadas.
   Acciones: aprobar / rechazar / eliminar. Tenant-scoped (.eq('tienda_id') + RLS dueño).
   Solo las 'aprobada' se muestran en la tienda (las crea anon via EF en 'pendiente'). */
(function () {
  'use strict';

  const TABS = [['pendiente', 'Pendientes'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas']];
  const state = { tab: 'pendiente', resenas: [] };

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[resenas.js] window.TiendaIA no inicializo'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }
  whenReady(() => { window.TiendaIA.registerView('resenas', renderResenas); });

  async function renderResenas() {
    const T = window.TiendaIA;
    T.dom.mainView.innerHTML = renderShellHTML();
    wireTabs();
    await loadData();
  }

  function renderShellHTML() {
    return '' +
      '<header style="margin-bottom:20px;">' +
        '<h1 class="ta-section-title">Reseñas</h1>' +
        '<p class="ta-section-sub">Modera las reseñas de tus clientes. Solo las que apruebes se muestran en la tienda.</p>' +
      '</header>' +
      '<div class="ta-card" style="padding:0;margin-bottom:16px;overflow-x:auto;">' +
        '<div style="display:flex;border-bottom:1px solid var(--ta-border);min-width:max-content;">' +
          TABS.map(tabBtn).join('') +
        '</div>' +
      '</div>' +
      '<div id="res-list"></div>';
  }

  function tabBtn(t) {
    const key = t[0], label = t[1], active = state.tab === key;
    return '<button type="button" data-res-tab="' + key + '" ' +
      'style="padding:12px 18px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:600;' +
      'border-bottom:2px solid ' + (active ? 'var(--ta-accent)' : 'transparent') + ';' +
      'color:' + (active ? 'var(--ta-text)' : 'var(--ta-text-soft)') + ';">' + label + '</button>';
  }

  function wireTabs() {
    const T = window.TiendaIA;
    T.dom.mainView.querySelectorAll('[data-res-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { state.tab = btn.getAttribute('data-res-tab'); renderResenas(); });
    });
  }

  async function loadData() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const cont = T.dom.mainView.querySelector('#res-list');
    if (cont) cont.innerHTML = '<div class="ta-card"><p style="color:var(--ta-text-soft);margin:0;">Cargando...</p></div>';
    const { data, error } = await sb.from('resenas')
      .select('id, producto_id, calificacion, nombre_cliente, comentario, estado, created_at')
      .eq('tienda_id', tienda.id)
      .eq('estado', state.tab)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('[resenas] load', error);
      if (cont) cont.innerHTML = '<div class="ta-card"><p style="color:var(--ta-danger);margin:0;">No pudimos cargar las reseñas.</p></div>';
      return;
    }
    state.resenas = data || [];
    renderList();
  }

  function stars(n) {
    n = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
    return '<span style="color:#f5a623;letter-spacing:1px;" aria-label="' + n + ' de 5">' +
      '★'.repeat(n) + '<span style="color:var(--ta-border-strong);">' + '★'.repeat(5 - n) + '</span></span>';
  }

  function fmtFecha(iso) {
    try { return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (_) { return ''; }
  }

  function renderList() {
    const T = window.TiendaIA;
    const cont = T.dom.mainView.querySelector('#res-list');
    if (!cont) return;
    if (state.resenas.length === 0) {
      const label = (TABS.find((t) => t[0] === state.tab) || ['', ''])[1].toLowerCase();
      cont.innerHTML = '<div class="ta-card"><div class="ta-empty"><p class="ta-empty__text">No hay reseñas ' + label + '.</p></div></div>';
      return;
    }
    cont.innerHTML = '<div class="ta-card" style="display:grid;gap:14px;">' + state.resenas.map(renderCard).join('') + '</div>';
    wireCardActions();
  }

  function renderCard(r) {
    const T = window.TiendaIA;
    const acciones = [];
    if (r.estado !== 'aprobada') acciones.push(btn('aprobar', r.id, 'Aprobar', 'ta-btn--primary'));
    if (r.estado !== 'rechazada') acciones.push(btn('rechazar', r.id, 'Rechazar', ''));
    acciones.push(btn('eliminar', r.id, 'Eliminar', 'ta-btn--danger'));
    return '' +
      '<div style="border:1px solid var(--ta-border);border-radius:8px;padding:14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
          '<div>' +
            '<div style="font-weight:600;color:var(--ta-text);">' + T.escapeHtml(r.nombre_cliente) + ' &nbsp;' + stars(r.calificacion) + '</div>' +
            '<div style="font-size:12px;color:var(--ta-text-mut);margin-top:2px;">' + fmtFecha(r.created_at) + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + acciones.join('') + '</div>' +
        '</div>' +
        (r.comentario ? '<p style="margin:10px 0 0;white-space:pre-wrap;color:var(--ta-text-soft);line-height:1.5;">' + T.escapeHtml(r.comentario) + '</p>' : '') +
      '</div>';
  }

  function btn(accion, id, label, cls) {
    const T = window.TiendaIA;
    return '<button type="button" class="ta-btn ta-btn--xs ' + cls + '" data-res-accion="' + accion + '" data-res-id="' + T.escapeHtml(id) + '">' + label + '</button>';
  }

  function wireCardActions() {
    const T = window.TiendaIA;
    T.dom.mainView.querySelectorAll('[data-res-accion]').forEach((b) => {
      b.addEventListener('click', () => handleAccion(b.getAttribute('data-res-accion'), b.getAttribute('data-res-id')));
    });
  }

  async function handleAccion(accion, id) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    if (accion === 'eliminar') {
      if (!confirm('¿Eliminar esta reseña? Esta accion no se puede deshacer.')) return;
      const { error } = await sb.from('resenas').delete().eq('id', id).eq('tienda_id', tienda.id);
      if (error) { T.toast('No pudimos eliminar la reseña', 'error'); return; }
      T.toast('Reseña eliminada', 'success');
    } else {
      const nuevo = accion === 'aprobar' ? 'aprobada' : 'rechazada';
      const { data, error } = await sb.from('resenas').update({ estado: nuevo })
        .eq('id', id).eq('tienda_id', tienda.id).select().maybeSingle();
      if (error || !data) { T.toast('No pudimos actualizar la reseña', 'error'); return; }
      T.toast(accion === 'aprobar' ? 'Reseña aprobada — ya se ve en la tienda' : 'Reseña rechazada', 'success');
    }
    await loadData();
  }
})();
