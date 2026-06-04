/* AIMMA · Tienda IA · admin.js · v6 · 2026-05-30 · Panel Admin SPA */
/* v6 (2026-05-30): Fase 3.4b - boton "Ver tienda" del topbar redirige a
   #/vista-previa (mockup interno) en vez del subdominio publico que no tiene
   cert SSL todavia. Sera revertido cuando Fase 4 entregue automatizacion SSL.
   Ruta 'vista-previa' agregada a ROUTES.
   v5 (2026-05-30): Fase 3.4 - delegar la pantalla del wizard a views/wizard.js
   via window.TiendaIA.startWizard. Cambio de logica: el wizard se activa si
   plantilla_id IS NULL (sin chequear cortesia_razon). Razon: pilotos como
   Maraldo+Dimac tampoco tienen plantilla -> tampoco pueden publicar sin
   pasar por el wizard. Cortesia es sobre billing, no configuracion.
   v4 (2026-05-29): API registerNavGuard() - las views pueden interceptar
   hashchange ANTES del cleanup para confirmar/cancelar navegacion (ej. form
   con cambios sin guardar). El listener nativo de productos.js no funcionaba
   porque admin.js dispatch hashchange primero y llama cleanupCurrentView()
   que remueve el listener antes de que pueda chequear dirty.
   v3 (2026-05-29): Fase 3.2 - API registerView() para vistas modulares.
   v2 (2026-05-29 post-audit code-reviewer agent):
   - Fix HIGH: requireAuth() valida con getUser() server-side.
   - Fix HIGH: btnSidebarToggle guard dom.sidebar.
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

  // 'pedidos' mantiene retrocompat con URLs viejas; alias a 'crm' (misma vista).
  const ROUTES = ['', 'productos', 'categorias', 'crm', 'pedidos', 'configuracion', 'legales', 'vista-previa', 'editor'];
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
    // v4 (Fase 3.3): nav guards - cada view puede registrar fn() => boolean que
    // se evaluan ANTES del cleanup. Si alguno devuelve false, la navegacion se
    // cancela y el hash vuelve al anterior.
    viewNavGuards: [],
    _lastHash: '',              // ultimo hash aceptado, para rollback en nav cancel
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
      .select('id, user_id, slug, nombre_negocio, logo_url, plantilla_id, paleta_id, estado, idioma, whatsapp_dueno, mostrar_agotados, nombre_legal, nit, direccion, ciudad_negocio, email_contacto, telefono_contacto, sync_dashboard_excel_activo, cortesia_razon, plan_tienda, horario_atencion, easypanel_domain_id, subdominio_publicado_at, created_at, updated_at, personalizaciones')
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

    // v5 (Fase 3.4b): el botón "Ver tienda" apunta al mockup interno
    // (#/vista-previa) hasta que Fase 4 entregue el storefront real con cert
    // SSL automatico para cada subdominio. Esto evita el error
    // ERR_CERT_AUTHORITY_INVALID del navegador al ir al subdominio sin cert.
    if (state.tienda.estado === 'publicada' && state.tienda.plantilla_id) {
      dom.linkStorefront.href = '#/vista-previa';
      dom.linkStorefront.removeAttribute('target');
      dom.linkStorefront.firstChild && (dom.linkStorefront.childNodes[0].nodeValue = 'Vista previa ');
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
    // v4: reset nav guards al cambiar de view (la nueva view registra los suyos)
    state.viewNavGuards = [];
  }

  function registerCleanup(fn) {
    if (typeof fn === 'function') state.viewCleanup.push(fn);
  }

  // v4: las views registran un guard que retorna true (permitir nav) o false
  // (cancelar). El dispatcher de hashchange evalua todos los guards primero.
  function registerNavGuard(fn) {
    if (typeof fn === 'function') state.viewNavGuards.push(fn);
  }

  function setActiveNav(route) {
    dom.navLinks.forEach((a) => {
      const r = a.getAttribute('data-route') || '';
      a.classList.toggle('is-active', r === route);
    });
  }

  function handleHashChange() {
    // v4: evaluar nav guards ANTES de cambiar nada. Si alguno cancela, revertir.
    if (state.viewNavGuards.length > 0) {
      for (const guard of state.viewNavGuards) {
        let proceed = true;
        try { proceed = guard() !== false; } catch (e) { console.warn('[navGuard] error', e); }
        if (!proceed) {
          // Revertir hash al ultimo aceptado. Como hashchange ya disparo, debemos
          // setear el hash de vuelta. replaceState evita re-dispatch del listener.
          if (state._lastHash !== window.location.hash) {
            history.replaceState(null, '', state._lastHash || '#/');
          }
          return;
        }
      }
    }

    const { route, paramId } = parseHash();
    if (!ROUTES.includes(route)) {
      navigateTo(DEFAULT_ROUTE);
      return;
    }
    state.currentRoute = route;
    state.currentRouteParams = paramId ? { id: paramId } : null;
    state._lastHash = window.location.hash;

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
    'crm': function () { renderPlaceholder('CRM', 'Aun no tienes pedidos. Los pedidos apareceran aqui cuando publiques tu tienda y los compradores hagan checkout por WhatsApp (Fase 5).'); },
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

    // v7 fix Jorge (2026-05-31 noche): click outside del sidebar mobile lo
    // cierra. Antes solo se cerraba clickeando en un nav-link (cambio de ruta).
    // En Android la mayoria de users hacen tap en el contenido para descartar
    // overlays - esa expectativa estaba rota.
    document.addEventListener('click', (e) => {
      if (window.innerWidth > 760) return;
      if (!dom.sidebar || !dom.sidebar.classList.contains('is-open')) return;
      // Click dentro del sidebar o del boton toggle → ignorar
      if (dom.sidebar.contains(e.target)) return;
      if (dom.btnSidebarToggle && dom.btnSidebarToggle.contains(e.target)) return;
      // Click fuera → cerrar
      closeSidebarMobile();
    });
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

  // v2.1 (2026-05-29): API registerView() para que cada Fase 3.X registre su
  // vista en su propio archivo views/<route>.js sin tocar admin.js core.
  function registerView(route, renderFn) {
    if (typeof renderFn !== 'function') return;
    VIEWS[route] = renderFn;
    // Si el user esta en esa ruta ahora mismo, re-renderizar inmediatamente
    // (caso: script de la view cargo despues que el router despacho la default).
    if (state.currentRoute === route) {
      cleanupCurrentView();
      try { renderFn(); } catch (e) { console.error('[registerView] re-render error', e); }
    }
  }

  // Expose helpers para las views futuras (Fase 3.2+)
  window.TiendaIA = {
    state,
    supabase: () => supabase,
    dom,
    toast,
    navigateTo,
    registerCleanup,
    registerView,
    registerNavGuard,  // v4 (Fase 3.3): cancelar navegacion si dirty form
    escapeHtml,
    // Plan 3: cache de sesion sincrono para editor.js y otras views
    _lastSession: null,
    getSession: () => window.TiendaIA._lastSession,
    // fix/preview-cortesia: token FRESCO garantizado para llamadas a Edge Functions.
    // getSession() devuelve un cache sincrono (_lastSession) que puede estar vencido o
    // ser previo a un refresh -> las EFs lo rechazan con 401. getAccessToken() fuerza
    // supabase.auth.getSession(), que valida expiracion y refresca el token si hace falta.
    // Si el refresh falla (refresh token invalido), devuelve null y el caller degrada
    // pidiendo recargar la pagina (re-login), sin mandar un token muerto a la EF.
    getAccessToken: async () => {
      try {
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token || null;
      } catch (e) {
        console.error('[getAccessToken] error', e);
        return null;
      }
    },
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

    // Plan 3: cache sincrono de sesion una vez que supabase esta inicializado
    supabase.auth.getSession().then(({ data }) => {
      window.TiendaIA._lastSession = data.session;
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      window.TiendaIA._lastSession = session;
    });

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

    // v5 Decision wizard onboarding: si NO tiene plantilla, debe configurar.
    // La cortesia (billing) NO exime del setup de tienda.
    if (!state.tienda.plantilla_id) {
      showState('stateWizard');
      // Delegar el render a views/wizard.js si esta cargado. Si todavia no,
      // hacemos polling corto (idem patron de las views modulares).
      let attempts = 0;
      const tryStart = () => {
        if (window.TiendaIA && window.TiendaIA.startWizard) {
          try { window.TiendaIA.startWizard(); }
          catch (e) {
            console.error('[wizard] start error', e);
            const body = $('wizard-body');
            if (body) body.innerHTML = '<p style="color:#ff5d6c;">Error iniciando wizard: ' + escapeHtml(e.message || String(e)) + '</p>';
          }
          return;
        }
        if (++attempts >= 200) {
          const body = $('wizard-body');
          if (body) body.innerHTML = '<p style="color:#9aa8be;">No pudimos cargar el wizard. Recarga (Ctrl+Shift+R) o contacta a tu asesor.</p>';
          return;
        }
        setTimeout(tryStart, 50);
      };
      tryStart();
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

    // Plan 3: refresh badge mensajes (form_submissions no leidos) cada 60s
    setInterval(function () {
      if (state.tienda && window.TiendaIA && window.TiendaIA.crmMensajes && window.TiendaIA.crmMensajes.refreshBadge) {
        window.TiendaIA.crmMensajes.refreshBadge(supabase, state.tienda);
      }
    }, 60000);

    if (state.tienda && window.TiendaIA && window.TiendaIA.crmMensajes && window.TiendaIA.crmMensajes.refreshBadge) {
      window.TiendaIA.crmMensajes.refreshBadge(supabase, state.tienda);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
