/* AIMMA Tienda IA · Editor PRO-MAX Plan 3 · crm-mensajes.js v1
 * 6to tab del CRM: lista de form_submissions + filtros + badge no-leidos +
 * modal detalle con boton "Responder por WhatsApp" si detecta tel CO.
 */
(function(window) {
  'use strict';

  const state = {
    mensajes: [],
    filtros: { soloNoLeidos: false, dias: 30, busqueda: '' },
  };

  async function render(container, tienda) {
    // admin.js expone window.TiendaIA.supabase como factory function () => supabase.
    // Hay que invocarla, no leerla como propiedad.
    const supabase = window.TiendaIA?.supabase?.();
    if (!supabase) {
      container.innerHTML = '<div class="ta-empty">No se pudo cargar mensajes.</div>';
      return;
    }
    container.innerHTML = '<div class="ta-loader" style="margin:2rem auto"></div>';

    const since = new Date(Date.now() - state.filtros.dias * 86400000).toISOString();
    const { data, error } = await supabase
      .from('form_submissions')
      .select('id, section_id, fields, ip, user_agent, leido_at, created_at')
      .eq('tienda_id', tienda.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      container.innerHTML = '<div class="ta-empty">Error cargando mensajes: ' + escapeHTML(error.message) + '</div>';
      return;
    }

    state.mensajes = data || [];
    container.innerHTML = renderUI();
    bindEvents(container, supabase, tienda);
  }

  function renderUI() {
    const filtrados = applyFiltros(state.mensajes);
    if (state.mensajes.length === 0) {
      return '<div class="ta-empty"><p>Cuando alguien envíe un formulario en tu tienda, los mensajes aparecerán acá.</p></div>';
    }

    let html = '';
    html += '<div class="crm-mensajes__filtros" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center">';
    html += '  <label style="display:inline-flex;align-items:center;gap:0.375rem;font-size:0.875rem">';
    html += '    <input type="checkbox" id="crm-msg-filter-unread"' + (state.filtros.soloNoLeidos ? ' checked' : '') + '>';
    html += '    Solo no leídos';
    html += '  </label>';
    html += '  <select id="crm-msg-filter-dias" style="padding:0.375rem;border-radius:4px;border:1px solid #ccc">';
    [7, 30, 90, 365].forEach(d => {
      html += '<option value="' + d + '"' + (state.filtros.dias === d ? ' selected' : '') + '>Últimos ' + d + ' días</option>';
    });
    html += '  </select>';
    html += '  <input type="search" id="crm-msg-filter-search" placeholder="Buscar..." value="' + escapeAttr(state.filtros.busqueda) + '" style="padding:0.375rem 0.625rem;border-radius:4px;border:1px solid #ccc;min-width:180px">';
    html += '</div>';

    if (filtrados.length === 0) {
      html += '<div class="ta-empty"><p>Sin mensajes que coincidan con los filtros.</p></div>';
      return html;
    }

    html += '<ul class="crm-mensajes__list" style="list-style:none;padding:0;margin:0">';
    filtrados.forEach(m => {
      const noLeido = !m.leido_at;
      const fecha = new Date(m.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
      const preview = computePreview(m.fields);
      html += '<li class="crm-mensajes__item" data-id="' + m.id + '" style="padding:0.875rem 1rem;border-bottom:1px solid rgba(0,0,0,0.08);cursor:pointer;display:flex;align-items:center;gap:0.75rem">';
      html += '  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (noLeido ? '#006d8b' : 'transparent') + '"></span>';
      html += '  <span style="font-size:0.8125rem;color:#4b5563;min-width:110px">' + fecha + '</span>';
      html += '  <span style="font-size:0.875rem;flex:1;font-weight:' + (noLeido ? 600 : 400) + '">' + escapeHTML(preview) + '</span>';
      html += '</li>';
    });
    html += '</ul>';
    return html;
  }

  function applyFiltros(items) {
    return items.filter(m => {
      if (state.filtros.soloNoLeidos && m.leido_at) return false;
      if (state.filtros.busqueda) {
        const needle = state.filtros.busqueda.toLowerCase();
        const txt = JSON.stringify(m.fields).toLowerCase();
        if (!txt.includes(needle)) return false;
      }
      return true;
    });
  }

  function computePreview(fields) {
    const entries = Object.entries(fields || {});
    if (!entries.length) return '(sin contenido)';
    const nombre = entries.find(([k]) => /nombre|name/i.test(k));
    const mensaje = entries.find(([k]) => /mensaje|message|consulta/i.test(k));
    let s = '';
    if (nombre) s += nombre[1] + ' · ';
    if (mensaje) s += '"' + truncate(mensaje[1], 80) + '"';
    else if (entries[0]) s += truncate(entries[0][1], 80);
    return s || '(sin contenido)';
  }

  function bindEvents(container, supabase, tienda) {
    const unread = container.querySelector('#crm-msg-filter-unread');
    if (unread) unread.onchange = () => { state.filtros.soloNoLeidos = unread.checked; render(container, tienda); };

    const dias = container.querySelector('#crm-msg-filter-dias');
    if (dias) dias.onchange = () => { state.filtros.dias = parseInt(dias.value, 10); render(container, tienda); };

    const search = container.querySelector('#crm-msg-filter-search');
    if (search) {
      let t;
      search.oninput = () => {
        clearTimeout(t);
        t = setTimeout(() => { state.filtros.busqueda = search.value; render(container, tienda); }, 300);
      };
    }

    container.querySelectorAll('.crm-mensajes__item').forEach(li => {
      li.onclick = () => openDetalle(li.dataset.id, supabase, tienda);
    });
  }

  function openDetalle(id, supabase, tienda) {
    const m = state.mensajes.find(x => x.id === id);
    if (!m) return;

    const tel = detectarTelefonoCO(m.fields);
    const nombre = Object.entries(m.fields).find(([k]) => /nombre|name/i.test(k))?.[1] || 'cliente';
    const fechaStr = new Date(m.created_at).toLocaleString('es-CO');

    let html = '<div class="ed-modal-backdrop" id="crm-msg-modal">';
    html += '  <div class="ed-modal" style="max-width:560px">';
    html += '    <div class="ed-modal__header">';
    html += '      <h3 class="ed-modal__title">Mensaje recibido · ' + fechaStr + '</h3>';
    html += '      <button type="button" class="ed-modal__close" id="crm-msg-modal-close" aria-label="Cerrar">×</button>';
    html += '    </div>';
    html += '    <div class="ed-modal__body" style="display:flex;flex-direction:column;gap:0.75rem">';
    Object.entries(m.fields).forEach(([k, v]) => {
      html += '<div><span style="font-size:0.75rem;color:#4b5563;text-transform:uppercase;letter-spacing:0.04em">' + escapeHTML(k) + '</span>';
      html += '<div style="font-size:0.9375rem;white-space:pre-wrap">' + escapeHTML(v) + '</div></div>';
    });
    html += '<hr style="border:none;border-top:1px solid #eee;margin:0.5rem 0">';
    html += '<div style="font-size:0.75rem;color:#666"><strong>IP:</strong> ' + escapeHTML(m.ip || '-') + ' · <strong>Navegador:</strong> ' + escapeHTML((m.user_agent || '-').slice(0, 80)) + '</div>';
    html += '    </div>';
    html += '    <div class="ed-modal__footer">';
    if (!m.leido_at) {
      html += '<button type="button" class="ed-btn ed-btn--danger" id="crm-msg-marcar-leido">Marcar como leído</button>';
    }
    if (tel) {
      const greeting = 'Hola ' + nombre + ', vi tu mensaje en la tienda...';
      const url = 'https://wa.me/57' + tel + '?text=' + encodeURIComponent(greeting);
      html += '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener" class="ed-btn ed-btn--primary">Responder por WhatsApp</a>';
    }
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstChild);

    document.getElementById('crm-msg-modal-close').onclick = closeModal;
    document.getElementById('crm-msg-modal').onclick = (e) => {
      if (e.target.id === 'crm-msg-modal') closeModal();
    };
    const btnLeido = document.getElementById('crm-msg-marcar-leido');
    if (btnLeido) {
      btnLeido.onclick = async () => {
        await supabase.from('form_submissions').update({ leido_at: new Date().toISOString() }).eq('id', id);
        m.leido_at = new Date().toISOString();
        closeModal();
        const container = document.querySelector('#crm-mensajes-tab') || document.querySelector('.ta-main');
        if (container) render(container, tienda);
        refreshBadge(supabase, tienda);
      };
    }
  }

  function closeModal() {
    const modal = document.getElementById('crm-msg-modal');
    if (modal) modal.remove();
  }

  function detectarTelefonoCO(fields) {
    for (const v of Object.values(fields)) {
      const s = String(v).replace(/\s+/g, '');
      const m = s.match(/^(\+57)?(3\d{9})$/);
      if (m) return m[2];
    }
    return null;
  }

  async function refreshBadge(supabase, tienda) {
    if (!supabase || !tienda) return;
    const { count } = await supabase
      .from('form_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('tienda_id', tienda.id)
      .is('leido_at', null);

    const badge = document.getElementById('badge-mensajes-tab');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHTML(s); }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.crmMensajes = { render, refreshBadge };
})(window);
