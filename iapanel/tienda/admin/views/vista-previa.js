/* AIMMA · Tienda IA · views/vista-previa.js · v6 · 2026-06-03
   v6 (fix/preview-cortesia): cache-buster pasa de ?preview= a ?_cb=. El Plan 4
   le dio a ?preview= el significado de TOKEN efimero (validate_preview_token);
   un timestamp no es uuid valido -> el storefront respondia 403 "Preview token
   invalido o expirado". Vista Previa muestra la tienda PUBLICADA (no el draft),
   asi que usa un param neutro que el storefront ignora.
   v5 (Fase 6 paridad LIVE): la vista previa ahora muestra un <iframe>
   apuntando a la URL real del storefront (<slug>.tienda.aimma.com.co).
   Esto garantiza paridad 100% — el cliente ve EXACTAMENTE lo que vera
   el visitante. Modo editor inline + mockup interno se retiran a futuro
   (Editor Webflow-style PRO-MAX, ver memoria).
   Cache buster ?v=timestamp para forzar refresco al volver a esta vista.
   v4 (Fase 3.7.b): editor de URL del CTA separado del hero.
   v3 (Fase 3.4c fix Jorge): cache de data + tienda.
   v2 (Fase 3.4c): MVP Modo Editor inline.
   Fase 3.4b: Mockup interactivo del storefront. */

(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[vista-previa.js] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.registerView('vista-previa', renderVistaPrevia);
  });

  // Validar slug DNS-safe (mismo regex que BD CHECK)
  const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/;
  const SUBDOMAIN_BASE = 'tienda.aimma.com.co';

  async function renderVistaPrevia() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;
    const tienda = T.state.tienda;

    // Validar slug antes de construir URL
    if (!tienda.slug || !SLUG_REGEX.test(tienda.slug)) {
      view.innerHTML = '' +
        '<div class="ta-card">' +
          '<div class="ta-empty">' +
            '<h2 class="ta-empty__title">Slug invalido</h2>' +
            '<p class="ta-empty__text">El slug de tu tienda no es valido. Contacta a soporte.</p>' +
          '</div>' +
        '</div>';
      return;
    }

    // Si la tienda no esta publicada, mostrar mensaje (la URL real solo sirve si esta publicada)
    if (tienda.estado !== 'publicada') {
      view.innerHTML = '' +
        '<div class="ta-card">' +
          '<header style="margin-bottom:24px;">' +
            '<h1 class="ta-section-title">Vista previa</h1>' +
          '</header>' +
          '<div class="ta-empty">' +
            '<h2 class="ta-empty__title">Tu tienda no esta publicada</h2>' +
            '<p class="ta-empty__text">La vista previa muestra tu tienda real en vivo. Para verla, primero publica tu tienda desde <a href="#/configuracion">Configuracion → Estado: Publicada</a>.</p>' +
          '</div>' +
        '</div>';
      return;
    }

    // Si falta plantilla o paleta, avisar
    if (!tienda.plantilla_id || !tienda.paleta_id) {
      view.innerHTML = '' +
        '<div class="ta-card">' +
          '<div class="ta-empty">' +
            '<h2 class="ta-empty__title">Configura plantilla y paleta</h2>' +
            '<p class="ta-empty__text">Necesitas elegir plantilla y paleta antes de ver la vista previa. <a href="#/configuracion">Ir a Configuracion</a>.</p>' +
          '</div>' +
        '</div>';
      return;
    }

    // Construir URL del storefront con cache buster (param neutro, NO ?preview=
    // que ahora es un token del editor; ver nota de cabecera v6).
    const url = 'https://' + tienda.slug + '.' + SUBDOMAIN_BASE + '/?_cb=' + Date.now();

    view.innerHTML = renderHeaderHTML(url) + renderIframeHTML(url);
    wireToolbarEvents(tienda);
  }

  function renderHeaderHTML(url) {
    const T = window.TiendaIA;
    const safeUrl = T.escapeHtml(url);
    return '' +
      '<header style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
        '<div>' +
          '<h1 class="ta-section-title">Vista previa en vivo</h1>' +
          '<p class="ta-section-sub">' +
            'Esta es tu tienda <strong>real</strong>, tal como la veran tus clientes. ' +
            'Las cosas se actualizan automaticamente al guardar cambios en otras secciones. ' +
            'Si recien cambiaste algo, espera ~1 minuto a que se refresque el cache.' +
          '</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button type="button" id="vp-refresh" class="ta-btn">Recargar</button>' +
          '<a href="' + safeUrl + '" target="_blank" rel="noopener" class="ta-btn ta-btn--primary">Abrir en pestania nueva ↗</a>' +
        '</div>' +
      '</header>';
  }

  function renderIframeHTML(url) {
    const T = window.TiendaIA;
    const safeUrl = T.escapeHtml(url);
    return '' +
      '<div class="ta-card" style="padding:0;overflow:hidden;">' +
        '<div style="background:#f4f4f6;padding:8px 12px;border-bottom:1px solid var(--ta-border);display:flex;align-items:center;gap:8px;font-size:13px;">' +
          '<span style="display:inline-block;width:10px;height:10px;background:#ff5f57;border-radius:50%;"></span>' +
          '<span style="display:inline-block;width:10px;height:10px;background:#febc2e;border-radius:50%;"></span>' +
          '<span style="display:inline-block;width:10px;height:10px;background:#28c840;border-radius:50%;"></span>' +
          '<span style="flex:1;text-align:center;color:#666;font-family:ui-monospace,monospace;">' + safeUrl.replace(/^https:\/\//, '') + '</span>' +
        '</div>' +
        '<div style="position:relative;width:100%;height:80vh;background:#fff;">' +
          '<iframe ' +
            'id="vp-iframe" ' +
            'src="' + safeUrl + '" ' +
            'style="width:100%;height:100%;border:0;display:block;" ' +
            'loading="eager" ' +
            'referrerpolicy="origin"' +
          '></iframe>' +
        '</div>' +
      '</div>' +
      '<p style="margin-top:12px;font-size:12px;color:var(--ta-text-soft);">' +
        'Si la vista previa no se actualiza al guardar, espera ~60s y haz click en Recargar. ' +
        'El cache global se renueva cada minuto automaticamente.' +
      '</p>';
  }

  function wireToolbarEvents(tienda) {
    const btnRefresh = document.getElementById('vp-refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        const iframe = document.getElementById('vp-iframe');
        if (!iframe) return;
        const newUrl = 'https://' + tienda.slug + '.' + SUBDOMAIN_BASE + '/?_cb=' + Date.now();
        iframe.src = newUrl;
      });
    }
  }
})();
