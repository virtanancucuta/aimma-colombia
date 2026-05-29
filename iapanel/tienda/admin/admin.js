/* AIMMA · Tienda IA · admin.js · v2 · 2026-05-29 · Panel Admin SPA */
/* v2 (2026-05-29 post-audit code-reviewer agent):
   - Fix HIGH: requireAuth() no detectaba sesion expirada con refresh fallido.
     Ahora valida con getUser() server-side, redirige a login si JWT vencio.
   - Fix HIGH: btnSidebarToggle sin guard si dom.sidebar es null. Agregado guard.
*/

(function () {
  'use strict';

  // ============================================================
  // Config
  // ============================================================
  const SUPABASE_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_VKKJmeQ6SVszVdD422h3qQ_KkDPeLH1';
  const LOGIN_URL = '/login.html';
  const PANEL_URL = '/iapanel/';
  const STOREFRONT_HOST = 'tienda.aimma.com.co'; // <slug>.tienda.aimma.com.co

  const ROUTES = ['', 'productos', 'categorias', 'pedidos', 'configuracion', 'legales'];
  const DEFAULT_ROUTE = '';

  // ============================================================
  // State
  // ============================================================
  const state = {
    user: null,                 // Supabase auth user
    profile: null,              // public.profiles row
    tienda: null,               // public.tiendas row del user
    plantillas: [],             // catalogo plantillas (cargado on demand)
    paletas: [],                // catalogo paletas (cargado on demand)
    currentRoute: null,         // route slug ('', 'productos', 'categorias', ...)
    currentRouteParams: null,   // ej {id: 'uuid'} para productos/:id
    // Cleanup registry: cada view puede registrar funciones de limpieza al cambiar route.
    viewCleanup: [],
  };

  // ============================================================
  // DOM helpers
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const dom = {};
  function cacheDom() {
    dom.stateLoading = $('state-loading');
    dom.stateNoaccess = $('state-noaccess');
    dom.stateError = $('state-error');
    dom.stateWizard = $('state-wizard');
    dom.stateApp = $('state-app');
    dom.noaccessText = $('noaccess-text');
    dom.errorText = $('error-text');
    dom.mainView = $('main-view');
    dom.sidebar = $('sidebar');
    dom.btnSidebarToggle = $('btn-sidebar-toggle');
    dom.btnLogout = $('btn-logout');
    dom.planBadge = $('plan-badge');
    dom.linkStorefront = $('link-storefront');
    dom.toast = $('toast');
    dom.navLinks = document.querySelectorAll('.ta-nav-link[data-route]');
  }

  function showState(name) {
    const states = ['stateLoading', 'stateNoaccess', 'stateError', 'stateWizard', 'stateApp'];
    states.forEach((s) => {
      const el = dom[s];
      if (!el) return;
      el.hidden = (s !== name);
    });
  }

  function showError(msg) {
    if (dom.errorText) dom.errorText.textContent = msg || 'Recarga la pagina (Ctrl+Shift+R).';
    showState('stateError');
  }

  function showNoAccess(msg) {
    if (msg && dom.noaccessText) dom.noaccessText.textContent = msg;
    showState('stateNoaccess');
  }

  let toastTimer = null;
  function toast(msg, kind) {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.className = 'ta-toast' + (kind ? ' ta-toast--' + kind : '');
    dom.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 3500);
  }

  // ============================================================
  // Supabase
  // ============================================================
  let supabase;
  function initSupabase() {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase SDK no cargo.');
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  async function requireAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) {
      window.location.href = LOGIN_URL + '?next=' + encodeURIComponent(window.location.pathname + window.location.hash);
      return null;
    }
    // v2: validar JWT con server (getUser hace fetch a /auth/v1/user) para
    // detectar tokens vencidos cuyo refresh fallo. getSession solo lee
    // localStorage sin validar contra el server.
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      // JWT expirado o usuario revocado -> redirige a login en vez de mostrar
      // error confuso "JWT expired" al hacer queries despues.
      await supabase.auth.signOut().catch(() => {});
      window.location.href = LOGIN_URL + '?next=' + encodeURIComponent(window.location.pathname + window.location.hash);
      return null;
    }
    return user;
  }

  async function loadProfileAndTienda(userId) {
    // Profile
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, correo, nombre_completo, rol, plan_actual, cuenta_cancelada_at, token_balance')
      .eq('id', userId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!profile) throw new Error('No tenemos tu perfil en el sistema.');
    if (profile.cuenta_cancelada_at) {
      showNoAccess('Tu cuenta esta cancelada. Contacta a tu asesor para reactivarla.');
      return false;
    }
    state.profile = profile;

    // Tienda del user (1:1 en MVP)
    const { data: tienda, error: tErr } = await supabase
      .from('tiendas')
      .select('id, user_id, slug, nombre_negocio, logo_url, plantilla_id, paleta_id, estado, idioma, whatsapp_dueno, mostrar_agotados, nombre_legal, nit, direccion, ciudad_negocio, email_contacto, telefono_contacto, sync_dashboard_excel_activo, cortesia_razon, plan_tienda, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (tErr) throw tErr;

    if (!tienda) {
      // Sin tienda creada -> usuario no tiene Tienda IA activa
      const isAdmin = profile.rol === 'admin' || profile.rol === 'cofounder';
      if (isAdmin) {
        showNoAccess('Eres admin/cofounder pero no tienes tienda de prueba. Pide a Claude crear una via SQL.');
      } else {
        showNoAccess('Esta seccion esta reservada para clientes con Tienda IA activa. Contacta a tu asesor AIMMA para activarla.');
      }
      return false;
    }
    state.tienda = tienda;
    return true;
  }

  // ============================================================
  // UI: badge plan + storefront link
  // ============================================================
  function renderTopbar() {
    if (!state.tienda) return;
    // Plan badge
    let label, kind = '';
    if (state.tienda.cortesia_razon) {
      label = 'Cortesia';
      kind = 'cortesia';
    } else if (state.tienda.plan_tienda === 'pro_max') {
      label = 'PRO-MAX';
      kind = 'pro_max';
    } else {
      label = 'PRO';
    }
    dom.planBadge.textContent = label;
    dom.planBadge.className = 'ta-plan-badge' + (kind ? ' ta-plan-badge--' + kind : '');
    dom.planBadge.hidden = false;

    // Storefront link (solo si publicada)
    if (state.tienda.estado === 'publicada') {
      dom.linkStorefront.href = 'https://' + state.tienda.slug + '.' + STOREFRONT_HOST + '/';
      dom.linkStorefront.hidden = false;
    } else {
      dom.linkStorefront.hidden = true;
    }
  }

  // ============================================================
  // Hash router
  // ============================================================
  function parseHash() {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    const route = parts[0] || '';
    const paramId = parts[1] || null;
    return { route, paramId };
  }

  function navigateTo(routeOrPath) {
    if (!routeOrPath.startsWith('#')) {
      window.location.hash = '#/' + routeOrPath.replace(/^\/+/, '');
    } else {
      window.location.hash = routeOrPath;
    }
  }

  function cleanupCurrentView() {
    while (state.viewCleanup.length) {
      const fn = state.viewCleanup.pop();
      try { fn(); } catch (e) { console.warn('[cleanup] error', e); }
    }
  }

  function registerCleanup(fn) {
    if (typeof fn === 'function') state.viewCleanup.push(fn);
  }

  function setActiveNav(route) {
    dom.navLinks.forEach((a) => {
      const r = a.getAttribute('data-route') || '';
      a.classList.toggle('is-active', r === route);
    });
  }

  function handleHashChange() {
    const { route, paramId } = parseHash();
    if (!ROUTES.includes(route)) {
      navigateTo(DEFAULT_ROUTE);
      return;
    }
    state.currentRoute = route;
    state.currentRouteParams = paramId ? { id: paramId } : null;

    cleanupCurrentView();
    setActiveNav(route);
    closeSidebarMobile();

    // Dispatch a la view correcta
    const renderer = VIEWS[route] || VIEWS[''];
    try {
      renderer();
    } catch (e) {
      console.error('[view] render error', e);
      dom.mainView.innerHTML = '<div class="ta-empty"><h2 class="ta-empty__title">Error al cargar la vista</h2><p class="ta-empty__text">' + escapeHtml(e.message || String(e)) + '</p></div>';
    }
    // Scroll top al cambiar route
    dom.mainView.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // ============================================================
  // Views (placeholders - cada sub-fase reemplaza el suyo)
  // ============================================================
  const VIEWS = {
    '': function () { renderPlaceholder('Inicio', 'KPIs propios de tu tienda apareceran aqui (Fase 3.2). Esto NO es el Dashboard AIMMA financiero - son metricas del modulo Tienda IA.'); },
    'productos': function () { renderPlaceholder('Productos', 'Lista, crear, editar productos y variantes (Fase 3.3).'); },
    'categorias': function () { renderPlaceholder('Categorias', 'Arbol de 2 niveles para organizar tu catalogo (Fase 3.5).'); },
    'pedidos': function () { renderPlaceholder('Pedidos', 'Aun no tienes pedidos. Los pedidos apareceran aqui cuando publiques tu tienda y los compradores hagan checkout por WhatsApp (Fase 5).'); },
    'configuracion': function () { renderPlaceholder('Configuracion', 'Nombre, logo, WhatsApp, plantilla, paleta, datos legales (Fase 3.6).'); },
    'legales': function () { renderPlaceholder('Paginas legales', 'Editor de garantias, tratamiento de datos y contacto (Fase 3.7).'); },
  };

  function renderPlaceholder(titulo, descripcion) {
    dom.mainView.innerHTML = '' +
      '<header style="margin-bottom: 20px;">' +
        '<h1 class="ta-section-title">' + escapeHtml(titulo) + '</h1>' +
        '<p class="ta-section-sub">' + escapeHtml(descripcion) + '</p>' +
      '</header>' +
      '<div class="ta-card">' +
        '<div class="ta-empty">' +
          '<h2 class="ta-empty__title">En construccion</h2>' +
          '<p class="ta-empty__text">Esta vista todavia no esta implementada. Vuelve pronto.</p>' +
        '</div>' +
      '</div>';
  }

  // ============================================================
  // Utils
  // ============================================================
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function closeSidebarMobile() {
    if (window.innerWidth <= 760 && dom.sidebar) {
      dom.sidebar.classList.remove('is-open');
    }
  }

  function wireGlobalEvents() {
    if (dom.btnSidebarToggle) {
      dom.btnSidebarToggle.addEventListener('click', () => {
        if (dom.sidebar) dom.sidebar.classList.toggle('is-open');
      });
    }
    if (dom.btnLogout) {
      dom.btnLogout.addEventListener('click', async () => {
        try {
          await supabase.auth.signOut();
        } catch (e) { console.warn('[signOut] error', e); }
        window.location.href = LOGIN_URL;
      });
    }
    window.addEventListener('hashchange', handleHashChange);
  }

  // Expose helpers para las views futuras (Fase 3.2+)
  window.TiendaIA = {
    state,
    supabase: () => supabase,
    dom,
    toast,
    navigateTo,
    registerCleanup,
    escapeHtml,
  };

  // ============================================================
  // Init
  // ============================================================
  async function init() {
    cacheDom();
    showState('stateLoading');

    try {
      initSupabase();
    } catch (e) {
      showError(e.message);
      return;
    }

    let user;
    try {
      user = await requireAuth();
      if (!user) return;
      state.user = user;
    } catch (e) {
      showError('No pudimos verificar tu sesion: ' + (e.message || e));
      return;
    }

    try {
      const ok = await loadProfileAndTienda(user.id);
      if (!ok) return;
    } catch (e) {
      console.error('[load] error', e);
      showError('No pudimos cargar tu tienda: ' + (e.message || e));
      return;
    }

    // Decision: wizard onboarding o app?
    // Si la tienda NO tiene plantilla_id y NO es cortesia (pilotos saltan wizard porque ya estan sembrados manualmente)
    if (!state.tienda.plantilla_id && !state.tienda.cortesia_razon) {
      // Wizard (Fase 3.4 - placeholder por ahora)
      showState('stateWizard');
      const body = $('wizard-body');
      if (body) {
        body.innerHTML = '<p style="color:#9aa8be;margin:0 0 20px;">Wizard onboarding en construccion (Fase 3.4). Por ahora contacta a tu asesor para configurar tu tienda.</p>';
      }
      return;
    }

    // OK -> app
    renderTopbar();
    wireGlobalEvents();
    showState('stateApp');

    // Si no hay hash, default a inicio
    if (!window.location.hash || window.location.hash === '#') {
      window.history.replaceState(null, '', '#/');
    }
    handleHashChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
