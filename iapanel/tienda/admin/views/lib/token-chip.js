/* AIMMA · Tienda IA · views/lib/token-chip.js · v1 · 2026-06-18
   Chip de tokens compartido (Inicio + pestana Fotos IA). Lee profiles.token_balance.
   .html() devuelve el markup (las views lo inyectan via innerHTML).
   .refresh() re-consulta la DB, actualiza T.state.profile.token_balance y TODOS los
   chips [data-token-chip] visibles (Inicio + Fotos IA se sincronizan juntos). */
(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[token-chip] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(function () { whenReady(cb, attempts + 1); }, 50);
  }

  function currentBalance() {
    var T = window.TiendaIA;
    var p = T && T.state && T.state.profile;
    return (p && typeof p.token_balance === 'number') ? p.token_balance : 0;
  }

  function html() {
    var bal = currentBalance();
    return '' +
      '<span class="ta-token-chip" data-token-chip>' +
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="flex:none;"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 12h6M12 9v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
        '<span class="ta-token-chip__val">' + bal + '</span> tokens' +
        '<a href="/iapanel/estudio/recargas.html" class="ta-token-chip__recargar">Recargar</a>' +
      '</span>';
  }

  async function refresh() {
    var T = window.TiendaIA;
    if (!T || !T.state || !T.state.profile) return;
    try {
      var res = await T.supabase()
        .from('profiles').select('token_balance').eq('id', T.state.profile.id).maybeSingle();
      var data = res && res.data;
      if (data && typeof data.token_balance === 'number') {
        T.state.profile.token_balance = data.token_balance;
        document.querySelectorAll('[data-token-chip] .ta-token-chip__val').forEach(function (el) {
          el.textContent = String(data.token_balance);
        });
      }
    } catch (e) { console.warn('[token-chip] refresh fallo', e); }
  }

  whenReady(function () {
    window.TiendaIA.tokenChip = { html: html, refresh: refresh };
  });
})();
