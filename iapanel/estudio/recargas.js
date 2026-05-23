// AIMMA Contenido IA · recargas.js · v1 · 2026-05-23
//
// Logica de la pagina recargas.html:
//   1) Auth gate: getSession() -> sin sesion redirige a login.
//   2) Lee profiles.cuenta_cancelada_at -> si esta cancelada redirige.
//   3) Lee system_config.contenido_ia.test_mode -> si true muestra banner + deshabilita CTAs.
//   4) Lee saldo (profiles.token_balance) para mostrarlo en el header.
//   5) Lee token_packs activos ordenados por orden -> renderiza grid (la del medio = featured).
//   6) Click "Comprar" -> POST a EF studio-mp-acreditar -> redirige a init_point de MP.
//
// No depende de /auth.js ni /supabase-config.v2.js (este modulo vive aparte de aimma-website
// hasta integrarse en Sprint 8). Una vez integrado, se puede migrar al patron compartido.

(function () {
  'use strict';

  // --- Constantes ---
  const SUPABASE_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_VKKJmeQ6SVszVdD422h3qQ_KkDPeLH1';
  const LOGIN_URL = '/login.html';
  const CUENTA_CANCELADA_URL = '/cuenta-cancelada.html';
  const EF_URL = `${SUPABASE_URL}/functions/v1/studio-mp-acreditar`;

  // MP host whitelist (defense in depth contra open-redirect)
  const MP_HOSTS_OK = [
    'https://www.mercadopago.com.co/',
    'https://www.mercadopago.com/',
    'https://sandbox.mercadopago.com.co/',
    'https://sandbox.mercadopago.com/',
  ];

  // --- Cliente Supabase ---
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[recargas] supabase-js no cargado');
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // --- Refs DOM ---
  const $ = (id) => document.getElementById(id);
  const els = {
    bannerTest: $('banner-test'),
    saldoBox: $('saldo-box'),
    saldoValue: $('saldo-value'),
    stateLoading: $('state-loading'),
    stateRecargas: $('state-recargas'),
    packsGrid: $('packs-grid'),
    errMsg: $('err-msg'),
    app: $('app'),
  };

  // --- Helpers ---
  function fmtCop(n) {
    // 30000 -> "30.000"
    return (n | 0).toLocaleString('es-CO');
  }
  function showErr(msg) {
    if (!els.errMsg) return;
    els.errMsg.textContent = msg;
    els.errMsg.hidden = false;
    els.errMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearErr() {
    if (!els.errMsg) return;
    els.errMsg.hidden = true;
    els.errMsg.textContent = '';
  }
  function urlEsMpValida(u) {
    if (typeof u !== 'string') return false;
    return MP_HOSTS_OK.some((h) => u.startsWith(h));
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      // 1) Auth gate
      const { data: { session } } = await sb.auth.getSession();
      if (!session || !session.user) {
        window.location.replace(LOGIN_URL);
        return;
      }
      const userId = session.user.id;

      // 2) Cuenta cancelada
      const { data: profile, error: profErr } = await sb
        .from('profiles')
        .select('cuenta_cancelada_at, token_balance')
        .eq('id', userId)
        .maybeSingle();
      if (profErr) {
        console.warn('[recargas] no se pudo leer profile:', profErr);
      }
      if (profile && profile.cuenta_cancelada_at) {
        window.location.replace(CUENTA_CANCELADA_URL);
        return;
      }

      // 3) Test mode flag
      const testMode = await leerTestMode();

      // 4) Saldo en header
      if (typeof profile?.token_balance === 'number') {
        els.saldoValue.textContent = testMode ? '∞' : String(profile.token_balance);
        els.saldoBox.hidden = false;
      }

      // 5) Banner test
      if (testMode) {
        els.bannerTest.hidden = false;
      }

      // 6) Cargar packs
      const packs = await leerPacks();
      renderPacks(packs, { testMode, session });

      // Mostrar UI
      els.stateLoading.hidden = true;
      els.stateRecargas.hidden = false;
      els.app.setAttribute('aria-busy', 'false');
    } catch (e) {
      console.error('[recargas] init fallo:', e);
      els.stateLoading.hidden = true;
      els.stateRecargas.hidden = false;
      els.app.setAttribute('aria-busy', 'false');
      showErr('No pudimos cargar los paquetes. Recarga la pagina o intenta mas tarde.');
    }
  }

  async function leerTestMode() {
    try {
      const { data, error } = await sb
        .from('system_config')
        .select('valor')
        .eq('clave', 'contenido_ia.test_mode')
        .maybeSingle();
      if (error) {
        console.warn('[recargas] no se pudo leer test_mode:', error);
        return false;
      }
      return (data?.valor || '').toString().toLowerCase() === 'true';
    } catch (e) {
      console.warn('[recargas] excepcion leyendo test_mode:', e);
      return false;
    }
  }

  async function leerPacks() {
    const { data, error } = await sb
      .from('token_packs')
      .select('codigo, nombre, precio_cop, cantidad_tokens, orden')
      .eq('activo', true)
      .order('orden', { ascending: true });
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('no_packs_disponibles');
    }
    return data;
  }

  function renderPacks(packs, ctx) {
    els.packsGrid.innerHTML = '';
    const total = packs.length;
    const featuredIdx = total >= 3 ? 1 : 0; // la del medio

    packs.forEach((pack, idx) => {
      const card = document.createElement('article');
      card.className = 'pack-card';
      if (idx === featuredIdx) card.classList.add('is-featured');
      if (ctx.testMode) card.classList.add('is-disabled');

      const bestoken = (pack.cantidad_tokens / pack.precio_cop * 1000).toFixed(0); // tokens por 1000 COP, info
      const valorPorToken = Math.round(pack.precio_cop / pack.cantidad_tokens); // COP/token

      card.innerHTML = `
        ${idx === featuredIdx ? '<span class="pack-badge">Mas popular</span>' : ''}
        <div class="pack-name">${escapeHtml(pack.nombre)}</div>
        <div class="pack-price-row">
          <span class="pack-price">$${fmtCop(pack.precio_cop)}</span>
          <span class="pack-currency">COP</span>
        </div>
        <div class="pack-tokens">
          <span class="pack-tokens__plus">+</span>
          <span>${pack.cantidad_tokens} tokens</span>
        </div>
        <div class="pack-equiv">${valorPorToken} COP por token</div>
        <ul class="pack-features">
          <li>${pack.cantidad_tokens} imagenes economicas</li>
          <li>${Math.floor(pack.cantidad_tokens / 5)} imagenes Pro (5 tokens c/u)</li>
          <li>Tokens sin caducidad</li>
        </ul>
        <button type="button" class="pack-cta" data-pack="${escapeAttr(pack.codigo)}" ${ctx.testMode ? 'disabled' : ''}>
          <span class="pack-spinner" hidden></span>
          <span class="pack-cta__label">${ctx.testMode ? 'No disponible en test' : 'Comprar'}</span>
        </button>
      `;
      els.packsGrid.appendChild(card);
    });

    // Bind handlers
    els.packsGrid.querySelectorAll('.pack-cta').forEach((btn) => {
      btn.addEventListener('click', () => onComprarClick(btn, ctx));
    });
  }

  async function onComprarClick(btn, ctx) {
    if (btn.disabled) return;
    clearErr();
    const pack_codigo = btn.getAttribute('data-pack');
    if (!pack_codigo) return;

    setBtnLoading(btn, true);

    try {
      // Refrescar session por si expiro mientras leia
      const { data: { session } } = await sb.auth.getSession();
      if (!session || !session.access_token) {
        window.location.replace(LOGIN_URL);
        return;
      }

      const res = await fetch(EF_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pack_codigo }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error('[recargas] EF fallo:', res.status, data);
        const txt = mapEfError(data?.error, data?.detail);
        showErr(txt);
        setBtnLoading(btn, false);
        return;
      }

      if (!data?.init_point) {
        showErr('Mercado Pago no devolvio URL de pago. Reintenta en unos segundos.');
        setBtnLoading(btn, false);
        return;
      }

      if (!urlEsMpValida(data.init_point)) {
        showErr('URL de pago invalida. Contacta soporte.');
        setBtnLoading(btn, false);
        return;
      }

      window.location.href = data.init_point;
    } catch (e) {
      console.error('[recargas] error red:', e);
      showErr('Sin conexion con el servidor. Reintenta en unos segundos.');
      setBtnLoading(btn, false);
    }
  }

  function mapEfError(code, detail) {
    switch (code) {
      case 'missing_authorization':
      case 'invalid_jwt':
        return 'Tu sesion expiro. Iniciamos sesion de nuevo en un momento.';
      case 'invalid_pack_codigo':
        return 'Paquete invalido. Recarga la pagina.';
      case 'pack_not_found':
        return 'Ese paquete ya no esta disponible.';
      case 'mp_network_error':
      case 'mp_api_error':
        return `No pudimos contactar a Mercado Pago (${detail || 'error'}). Reintenta en unos segundos.`;
      case 'db_error_pack':
      case 'db_error_insert':
        return 'Error guardando tu pedido. Reintenta o contacta soporte.';
      case 'missing_supabase_env':
      case 'missing_mp_token':
        return 'Configuracion del servidor incompleta. Avisamos a soporte.';
      default:
        return `No pudimos iniciar el pago${code ? ' (' + code + ')' : ''}. Reintenta o contacta soporte.`;
    }
  }

  function setBtnLoading(btn, loading) {
    const spinner = btn.querySelector('.pack-spinner');
    const label = btn.querySelector('.pack-cta__label');
    if (loading) {
      btn.disabled = true;
      if (spinner) spinner.hidden = false;
      if (label) label.textContent = 'Conectando...';
    } else {
      btn.disabled = false;
      if (spinner) spinner.hidden = true;
      if (label) label.textContent = 'Comprar';
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
