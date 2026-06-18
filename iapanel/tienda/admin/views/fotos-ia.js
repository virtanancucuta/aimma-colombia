/* AIMMA · Tienda IA · views/fotos-ia.js · v1 · 2026-06-18 · Pestana Fotos IA
   Embebe /iapanel/estudio/?embed=tienda en un iframe (mismo patron que el canvas del editor).
   Gate: entitlement (tiene_acceso_pro) en el route + tokens (402) server-side en la EF.
   El chip de tokens se refresca por postMessage del iframe tras cada generacion. */
(function () {
  'use strict';

  var ESTUDIO_ORIGIN = 'https://aimma.com.co'; // mismo origen que el iframe

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[fotos-ia] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(function () { whenReady(cb, attempts + 1); }, 50);
  }

  // Gate de ENTITLEMENT (capa 1): tiene_acceso_pro en el route handler, aparte del 402 de tokens de
  // la EF (capa 2). Replica el gate original de Contenido IA. Fail-closed: si el RPC falla -> no-PRO.
  // IMPORTANTE: solo cachea en T.state.acceso un resultado REAL del RPC. Si el profile aun no esta
  // cargado (admin.js lo trae async tras requireAuth) NO se cachea {pro:false} -> evita envenenar el
  // gate (bug: el link-hide del startup corria antes del profile y dejaba a un PRO afuera).
  async function ensureAcceso() {
    var T = window.TiendaIA;
    if (T.state.acceso) return T.state.acceso;
    for (var i = 0; i < 100 && (!T.state.profile || !T.state.profile.id); i++) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    if (!T.state.profile || !T.state.profile.id) return { pro: false };
    try {
      var res = await T.supabase().rpc('tiene_acceso_pro', { p_user_id: T.state.profile.id });
      if (res && res.data && typeof res.data.pro === 'boolean') { T.state.acceso = res.data; return res.data; }
    } catch (e) { /* no cachear el error -> reintentable */ }
    return { pro: false };
  }

  async function renderFotosIA() {
    var T = window.TiendaIA;
    // Defensivo: sin tienda no se monta (ya garantizado por el gate has-tienda del admin).
    if (!T.state || !T.state.tienda) {
      T.dom.mainView.innerHTML = '<div class="ta-card"><p class="ta-section-sub">Esta seccion requiere una tienda activa.</p></div>';
      return;
    }
    // ENFORCE el gate PRO en el route: un no-PRO que escribe #/fotos-ia a mano NO entra.
    var acceso = await ensureAcceso();
    if (!acceso.pro) {
      T.dom.mainView.innerHTML = '<div class="ta-card"><div class="ta-empty">' +
        '<h2 class="ta-empty__title">Fotos IA es parte del Plan PRO</h2>' +
        '<p class="ta-empty__text">Esta herramienta requiere Plan PRO. Activalo para generar fotos con IA.</p>' +
        '<a href="/upgrade-pro.html" class="ta-btn ta-btn--primary" style="margin-top:12px;display:inline-block;">Ver planes</a>' +
        '</div></div>';
      return;
    }
    var chip = (T.tokenChip && typeof T.tokenChip.html === 'function') ? T.tokenChip.html() : '';
    T.dom.mainView.innerHTML = '' +
      '<header class="ta-fotos-ia-head">' +
        '<div>' +
          '<h1 class="ta-section-title">Fotos IA</h1>' +
          '<p class="ta-section-sub">Subi una foto, elegi fondo estudio o describi el cambio, y la IA la genera.</p>' +
        '</div>' +
        chip +
      '</header>' +
      '<div class="ta-fotos-ia-frame">' +
        '<iframe src="/iapanel/estudio/?embed=tienda" title="Fotos IA" class="ta-fotos-ia-iframe" loading="lazy"></iframe>' +
      '</div>';

    var onMsg = function (e) {
      if (e.origin !== ESTUDIO_ORIGIN) return;
      var d = e.data || {};
      if (d.type === 'fotos-ia:balance' || d.type === 'fotos-ia:job-done') {
        if (T.tokenChip) T.tokenChip.refresh();
      }
    };
    window.addEventListener('message', onMsg);
    var onVis = function () { if (!document.hidden && T.tokenChip) T.tokenChip.refresh(); };
    document.addEventListener('visibilitychange', onVis);

    if (typeof T.registerCleanup === 'function') {
      T.registerCleanup(function () {
        window.removeEventListener('message', onMsg);
        document.removeEventListener('visibilitychange', onVis);
      });
    }
  }

  whenReady(function () {
    window.TiendaIA.registerView('fotos-ia', renderFotosIA);
    // Cosmetico (el enforcement REAL es el route handler): ocultar el link del sidebar a no-PRO.
    ensureAcceso().then(function (acceso) {
      if (!acceso.pro) {
        var link = document.querySelector('.ta-nav-link[data-route="fotos-ia"]');
        if (link) link.hidden = true;
      }
    });
  });
})();
