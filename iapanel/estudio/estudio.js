/* AIMMA Contenido IA · estudio.js · v1 · 2026-05-23 */

(function () {
  'use strict';

  // ============================================================
  // Config
  // ============================================================
  const SUPABASE_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_VKKJmeQ6SVszVdD422h3qQ_KkDPeLH1';
  const LOGIN_URL = '/login.html';
  const RECARGAS_URL = 'recargas.html';
  const BUCKET_IN = 'studio-inputs';
  const BUCKET_OUT = 'studio-outputs';

  // === Migracion PASO 1: embed dentro de Tienda IA + parqueo de herramientas ===
  const EMBED_TIENDA = new URLSearchParams(location.search).get('embed') === 'tienda';
  const TIENDA_ORIGIN = 'https://aimma.com.co';
  // Parqueo GLOBAL y reversible: estos 3 chips se ocultan en TODOS lados (standalone + embed +
  // flujo de productos). Para reactivarlos: vaciar el Set. NO se borra el codigo.
  const PARKED_QUICK = new Set(['quitar_fondo', 'mejorar_luz', 'fondo_lifestyle']);
  function applyMigrationUI() {
    document.querySelectorAll('.quick-chip').forEach(function (b) {
      if (PARKED_QUICK.has(b.dataset.quick)) b.hidden = true;
    });
    if (EMBED_TIENDA) {
      const h = document.querySelector('.estudio-header');
      if (h) h.hidden = true;
    }
  }
  function notifyParentBalance() {
    if (!EMBED_TIENDA) return;
    try { window.parent.postMessage({ type: 'fotos-ia:balance' }, TIENDA_ORIGIN); } catch (_) {}
  }

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const POLL_INTERVAL_MS = 3000;
  // Fix B 2026-05-25: 4 min era muy corto; KIE outliers tardan hasta 9-10 min.
  // 12 min cubre el peor caso observado + margen.
  const JOB_TIMEOUT_MS = 720000; // 12 min (era 4 min)
  // 2026-05-25: solo 'nano-banana' (mapeado a seedream/4.5-edit en worker v11).
  // 1 token por imagen.
  const MODEL_COST = { 'nano-banana': 1 };
  const MODEL_REAL = 'nano-banana';
  // Tiempo estimado del job para alimentar la barra del UX loading.
  // Mediana empirica observada: 30-90 segundos. ETA conservador = 60s.
  const JOB_ETA_MS = 60000;
  const JOB_ETA_LABEL = '~1 minuto';
  // Fix D 2026-05-25: tras este umbral el job se considera "tardando", el
  // mensaje cambia para no quedar "Casi listo..." mintiendo indefinidamente.
  const LATE_MESSAGE_AT_MS = 90000; // 90 segundos
  const LATE_MESSAGE_TEXT = 'Está tomando un poco más de lo habitual, ya casi termina...';

  // Mensajes que rotan en el loading. Cada uno se muestra a partir de su pct.
  const LOADING_MESSAGES = [
    { pct: 8,  text: 'Subiendo tu foto...' },
    { pct: 22, text: 'Analizando con IA...' },
    { pct: 45, text: 'Aplicando tu instrucción...' },
    { pct: 65, text: 'Refinando detalles...' },
    { pct: 82, text: 'Optimizando colores...' },
    { pct: 94, text: 'Casi listo...' },
  ];

  // Fix C 2026-05-25: namespace por user.id para resucitar polling tras
  // recargar la pagina (mobile back, refresh) mientras un job sigue en cola.
  const CURRENT_JOB_KEY_PREFIX = 'aimma_estudio_current_job_v1_';

  // Fase 0 Tienda IA (2026-05-29): el editor es cross-modulo. Cuando se abre
  // con ?source=tienda_producto&return_to=...&producto_id=...&campo=... el
  // resultado final aplica al producto y redirige al panel de Tienda IA.
  // Sin params, comportamiento IDENTICO al de Contenido IA.
  const VALID_SOURCES = new Set(['contenido_ia', 'tienda_producto']);
  const VALID_TARGET_CAMPO = /^(foto_principal|foto_galeria_[0-3]|foto_color_[a-z0-9_-]{1,32})$/;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ============================================================
  // State
  // ============================================================
  const state = {
    user: null,
    testMode: null,           // unknown until first enqueue or balance read
    tokenBalance: null,       // real balance when test_mode = false
    selectedFile: null,
    inputPath: null,          // path inside studio-inputs once uploaded
    quickAction: null,        // 'quitar_fondo' | 'fondo_estudio' | ... | null
    modelo: 'nano-banana',    // unico modelo activo (Pro deshabilitado 2026-05-25)
    instruccion: '',
    loadingTimer: null,
    loadingStartTs: 0,
    skeletonFadeTimer: null,    // fix HIGH: cancelable para evitar bug post-stop
    wasHiddenDuringJob: false,  // true si el user minimizo/cambio pestana durante el job
    originalTitle: null,        // titulo de la pestana antes del flash
    currentJobId: null,
    realtimeSub: null,
    pollTimer: null,
    jobTimeoutTimer: null,
    isGenerating: false,
    lastFocused: null,
    // Fase 0 Tienda IA: bundle cross-modulo. NULL si no aplica.
    crossModulo: null,          // { source, returnTo, productoId, campo } | null
  };

  // ============================================================
  // DOM
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const dom = {};

  function cacheDom() {
    dom.app = $('app');
    dom.stateLoading = $('state-loading');
    dom.stateEditor = $('state-editor');
    dom.bannerTest = $('banner-test');
    dom.saldoBox = $('saldo-box');
    dom.saldoValue = $('saldo-value');
    dom.btnRecargar = $('btn-recargar');
    dom.dropzone = $('dropzone');
    dom.fileInput = $('file-input');
    dom.previews = $('previews');
    dom.previewInput = $('preview-input');
    dom.previewOutput = $('preview-output');
    dom.previewOutputMedia = $('preview-output-media');
    dom.previewEmpty = $('preview-empty');
    dom.previewSkeleton = $('preview-skeleton');
    dom.skeletonText = $('skeleton-text');
    dom.skeletonProgress = $('skeleton-progress');
    dom.skeletonBar = $('skeleton-bar');
    dom.skeletonEta = $('skeleton-eta');
    dom.skeletonEtaText = $('skeleton-eta-text');
    dom.btnChangeImage = $('btn-change-image');
    dom.resultActions = $('result-actions');
    dom.btnDownload = $('btn-download');
    dom.btnViewUrl = $('btn-view-url');
    dom.btnEditOther = $('btn-edit-other');
    dom.quickButtons = Array.from(document.querySelectorAll('.quick-chip'));
    dom.instruccion = $('instruccion');
    dom.chatCount = $('chat-count');
    dom.modeloRadios = Array.from(document.querySelectorAll('input[name="modelo"]'));
    dom.ctaHint = $('cta-hint');
    dom.hintCost = $('hint-cost');
    dom.hintBalance = $('hint-balance');
    dom.btnGenerar = $('btn-generar');
    dom.btnSpinner = dom.btnGenerar.querySelector('.btn-generar__spinner');
    dom.ctaWarn = $('cta-warn');
    dom.modalError = $('modal-error');
    dom.modalErrorBody = $('modal-error-body');
    dom.toast = $('toast');
  }

  // ============================================================
  // Supabase
  // ============================================================
  let supabase;
  function initSupabase() {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase SDK no cargo. Verifica conexion.');
    }
    // Preferir el cliente global de supabase-config.v2.js (mismo storage que iapanel/).
    // Si no esta, crear uno propio como fallback (caso edge).
    if (window.supabaseClient) {
      supabase = window.supabaseClient;
    } else {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
  }

  async function requireAuth() {
    try {
      // Timeout defensivo: si getSession se cuelga (refresh token roto), no quedar infinito.
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getSession_timeout_8s')), 8000));
      const { data, error } = await Promise.race([sessionPromise, timeoutPromise]);
      if (error) throw error;
      if (!data || !data.session || !data.session.user) {
        redirectToLogin();
        return null;
      }
      return data.session.user;
    } catch (err) {
      console.error('[auth] getSession error', err);
      redirectToLogin();
      return null;
    }
  }

  function redirectToLogin() {
    const next = encodeURIComponent(window.location.href);
    window.location.href = LOGIN_URL + '?next=' + next;
  }

  // ============================================================
  // Init
  // ============================================================
  // Fase 0 Tienda IA: parsea URLSearchParams para detectar origen cross-modulo.
  // Returns null si no aplica (caso normal Contenido IA).
  // Returns { source, returnTo, productoId, campo } si bundle valido.
  // Si bundle invalido (params parciales o malformados): null + warn console.
  function parseCrossModuloParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const source = (params.get('source') || '').trim();
      if (!source || source === 'contenido_ia') return null;
      if (!VALID_SOURCES.has(source)) {
        console.warn('[estudio] source desconocido:', source, '- ignorado');
        return null;
      }
      const returnTo = (params.get('return_to') || '').trim();
      const productoId = (params.get('producto_id') || '').trim();
      const campo = (params.get('campo') || '').trim();
      if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
        console.warn('[estudio] return_to invalido, bundle cross-modulo ignorado');
        return null;
      }
      if (!UUID_REGEX.test(productoId)) {
        console.warn('[estudio] producto_id no es UUID, bundle ignorado');
        return null;
      }
      if (!VALID_TARGET_CAMPO.test(campo)) {
        console.warn('[estudio] campo invalido, bundle ignorado');
        return null;
      }
      return { source, returnTo, productoId, campo };
    } catch (e) {
      console.warn('[estudio] parse URLSearchParams fallo:', e);
      return null;
    }
  }

  async function init() {
    cacheDom();
    // Fase 0 Tienda IA: leer bundle cross-modulo ANTES de Supabase (no toca red).
    state.crossModulo = parseCrossModuloParams();
    setLoadingText('Inicializando…');
    try {
      initSupabase();
    } catch (err) {
      showFatal(err.message);
      return;
    }

    // Timeout global de seguridad: si init no termina en 10s, mostrar error.
    const initTimeout = setTimeout(() => {
      showFatal('Carga lenta. Probá recargar (Ctrl+Shift+R) o abrir en incognito.');
    }, 10000);

    setLoadingText('Verificando sesion…');
    const user = await requireAuth();
    if (!user) { clearTimeout(initTimeout); return; }
    state.user = user;

    // Mostrar editor INMEDIATAMENTE. El balance se carga en background (no bloquea).
    clearTimeout(initTimeout);
    showEditor();
    wireEvents();
    setupNotifyListeners();
    updateCtaHint();
    loadBalance().catch(e => console.warn('[balance] background fetch error', e));
    // Restaurar ultimo resultado si lo hay (sirve mucho en mobile: si el user vuelve atras
    // tras abrir 'Ver URL' en pestana nueva, el editor restaura la imagen final).
    restoreLastResult().catch(e => console.warn('[restore] error', e));
    // Fix C 2026-05-25: si habia un job en curso cuando el user recargo/cerro,
    // reanudar polling y mostrar la imagen cuando termine.
    resumeIfPendingJob().catch(e => console.warn('[resume] error', e));
  }

  // Fix #12 auditoria: namespaced por user.id para que en dispositivos compartidos
  // (kioskos, PC del trabajo) un user no vea el ultimo resultado de otro.
  const LAST_RESULT_KEY_PREFIX = 'aimma_estudio_last_result_v1_';
  const LAST_RESULT_KEY_LEGACY = 'aimma_estudio_last_result_v1'; // pre-fix #12, limpiar
  function getLastResultKey() {
    if (!state.user || !state.user.id) return null;
    return LAST_RESULT_KEY_PREFIX + state.user.id;
  }

  function saveLastResult(jobId, outputPath) {
    const key = getLastResultKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        jobId, outputPath, ts: Date.now()
      }));
    } catch (_) {}
  }

  // Fix C 2026-05-25: persistir el job_id activo desde el momento del enqueue
  // (no esperar al done). Si el user recarga, navega atras, o cierra y vuelve,
  // resumeIfPendingJob() en init() lo recoge y reanuda polling sin perder el resultado.
  function getCurrentJobKey() {
    if (!state.user || !state.user.id) return null;
    return CURRENT_JOB_KEY_PREFIX + state.user.id;
  }
  function saveCurrentJobId(jobId) {
    const key = getCurrentJobKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ jobId, ts: Date.now() }));
    } catch (_) {}
  }
  function clearCurrentJobId() {
    const key = getCurrentJobKey();
    if (!key) return;
    try { localStorage.removeItem(key); } catch (_) {}
  }
  async function resumeIfPendingJob() {
    const key = getCurrentJobKey();
    if (!key) return;
    let entry;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      entry = JSON.parse(raw);
    } catch (_) { return; }
    if (!entry || !entry.jobId) return;
    // Expira a las 30 min — mas que JOB_TIMEOUT_MS (12 min) por margen.
    if (Date.now() - (entry.ts || 0) > 1800000) {
      clearCurrentJobId();
      return;
    }
    // Ver estado actual del job en BD
    let row;
    try {
      const { data } = await supabase
        .from('image_jobs')
        .select('id, estado, output_url, error, finalizado_at')
        .eq('id', entry.jobId)
        .maybeSingle();
      row = data;
    } catch (_) { clearCurrentJobId(); return; }
    if (!row) { clearCurrentJobId(); return; }

    if (row.estado === 'done') {
      // El job termino mientras el user no estaba — renderizar.
      try { await renderResult(row); } catch (e) { console.warn('[resume] renderResult fail', e); }
      clearCurrentJobId();
      return;
    }
    if (row.estado === 'failed' || row.estado === 'dead_letter') {
      // No mostrar modal de error en init — el job es viejo, ya el user vio el flujo original.
      clearCurrentJobId();
      return;
    }
    // estado queued o processing: reanudar UI loading + polling
    state.currentJobId = entry.jobId;
    state.isGenerating = true;
    state.wasHiddenDuringJob = true; // probable que el user haya cambiado pestana
    setGeneratingUi(true, 'Reanudando tu trabajo en curso...');
    try {
      const job = await waitForJob(entry.jobId);
      if (job.estado === 'done') {
        await renderResult(job);
      } else {
        openErrorModal(buildJobErrorMsg(job));
        dom.previewSkeleton.hidden = true;
        dom.previewEmpty.hidden = false;
      }
    } catch (err) {
      openErrorModal((err && err.message) || 'Error inesperado.');
      dom.previewSkeleton.hidden = true;
      dom.previewEmpty.hidden = false;
    } finally {
      setGeneratingUi(false);
      teardownJobListeners();
      state.currentJobId = null;
      clearCurrentJobId();
    }
  }

  async function restoreLastResult() {
    // Limpiar key legacy (pre-fix #12) si existe — venia sin namespace.
    try { localStorage.removeItem(LAST_RESULT_KEY_LEGACY); } catch (_) {}
    const key = getLastResultKey();
    if (!key) return;
    let last;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      last = JSON.parse(raw);
    } catch (_) { return; }
    if (!last || !last.outputPath) return;
    // Expira a las 24h
    if (Date.now() - (last.ts || 0) > 86400000) {
      try { localStorage.removeItem(key); } catch(_) {}
      return;
    }
    // Verificar que el archivo existe (signed URL)
    try {
      const { data: signed } = await supabase.storage.from(BUCKET_OUT).createSignedUrl(last.outputPath, 3600);
      if (!signed || !signed.signedUrl) return;
      dom.previewOutput.src = signed.signedUrl;
      dom.previewOutput.hidden = false;
      dom.previewEmpty.hidden = true;
      dom.previewSkeleton.hidden = true;
      dom.resultActions.hidden = false;
      // Re-wire los botones con este path restaurado
      state.outputPath = last.outputPath;
      if (dom.btnViewUrl) dom.btnViewUrl.href = signed.signedUrl;
      if (dom.btnDownload) dom.btnDownload.onclick = makeDownloadHandler(last.outputPath);
    } catch (_) {}
  }

  function makeDownloadHandler(path) {
    return async (ev) => {
      ev.preventDefault();
      const original = dom.btnDownload.innerHTML;
      dom.btnDownload.disabled = true;
      dom.btnDownload.textContent = 'Descargando...';
      try {
        const { data, error } = await supabase.storage.from(BUCKET_OUT).download(path);
        if (error || !data) throw error || new Error('sin_blob');
        const dlUrl = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = 'aimma-contenido-ia-' + Date.now() + '.jpg';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);
      } catch (e) {
        console.warn('[download] fallo', e);
        toast('No pudimos descargar. Proba "Ver URL" y guarda manual.', 'error');
      } finally {
        dom.btnDownload.disabled = false;
        dom.btnDownload.innerHTML = original;
      }
    };
  }

  function setLoadingText(t) {
    try {
      const el = document.querySelector('.state-loading__text');
      if (el) el.textContent = t;
    } catch (_) {}
  }

  function showFatal(msg) {
    dom.stateLoading.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'state-loading__text';
    p.style.color = 'var(--danger)';
    p.textContent = msg;
    dom.stateLoading.appendChild(p);
  }

  function showEditor() {
    dom.stateLoading.hidden = true;
    dom.stateEditor.hidden = false;
    applyMigrationUI();
    dom.app.setAttribute('aria-busy', 'false');
  }

  // ============================================================
  // Balance / test mode UI
  // ============================================================
  async function loadBalance() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('token_balance')
        .eq('id', state.user.id)
        .maybeSingle();
      if (error) {
        console.warn('[balance] read error', error);
        return;
      }
      if (data && typeof data.token_balance === 'number') {
        state.tokenBalance = data.token_balance;
      }
      renderBalance();
      notifyParentBalance();
    } catch (err) {
      console.warn('[balance] fetch failed', err);
    }
  }

  function renderBalance() {
    if (state.testMode === true) {
      dom.bannerTest.hidden = false;
      dom.saldoBox.classList.add('estudio-saldo--test');
      dom.saldoValue.textContent = 'MODO TEST · 100';
      dom.btnRecargar.hidden = true;
    } else if (state.testMode === false) {
      dom.bannerTest.hidden = true;
      dom.saldoBox.classList.remove('estudio-saldo--test');
      const bal = (state.tokenBalance == null) ? '...' : String(state.tokenBalance);
      dom.saldoValue.textContent = bal + ' tokens';
      dom.btnRecargar.hidden = (state.tokenBalance != null && state.tokenBalance > 0);
    } else {
      // unknown yet
      const bal = (state.tokenBalance == null) ? '...' : String(state.tokenBalance);
      dom.saldoValue.textContent = bal + ' tokens';
      dom.btnRecargar.hidden = true;
    }
    updateCtaHint();
  }

  // ============================================================
  // Events
  // ============================================================
  function wireEvents() {
    // Dropzone
    dom.dropzone.addEventListener('click', () => dom.fileInput.click());
    dom.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dom.fileInput.click();
      }
    });
    ['dragenter', 'dragover'].forEach((ev) => {
      dom.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.dropzone.classList.add('is-drag');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      dom.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.dropzone.classList.remove('is-drag');
      });
    });
    dom.dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    dom.fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFile(file);
      // reset input so same filename can be reselected
      dom.fileInput.value = '';
    });

    // Change image
    dom.btnChangeImage.addEventListener('click', resetForNewImage);
    dom.btnEditOther.addEventListener('click', resetForNewImage);

    // Quick action chips
    dom.quickButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.quick;
        if (state.quickAction === key) {
          // toggle off
          state.quickAction = null;
          btn.classList.remove('is-selected');
        } else {
          state.quickAction = key;
          dom.quickButtons.forEach((b) => b.classList.toggle('is-selected', b === btn));
        }
        updateCtaState();
      });
    });

    // Instruccion textarea
    dom.instruccion.addEventListener('input', () => {
      const v = dom.instruccion.value;
      state.instruccion = v;
      dom.chatCount.textContent = String(v.length);
      updateCtaState();
    });

    // Modelo radios
    dom.modeloRadios.forEach((r) => {
      r.addEventListener('change', () => {
        if (r.checked) {
          state.modelo = r.value;
          updateCtaHint();
        }
      });
    });

    // Generar
    dom.btnGenerar.addEventListener('click', onGenerate);

    // Modal close
    dom.modalError.addEventListener('click', (e) => {
      if (e.target && (e.target.dataset.closeModal !== undefined || e.target.closest('[data-close-modal]'))) {
        closeModal(dom.modalError);
      }
    });
    document.addEventListener('keydown', onGlobalKeydown);
  }

  function onGlobalKeydown(e) {
    if (e.key === 'Escape' && !dom.modalError.hidden) {
      closeModal(dom.modalError);
    }
  }

  // ============================================================
  // File handling
  // ============================================================
  function handleFile(file) {
    const err = validateFile(file);
    if (err) {
      toast(err, 'error');
      return;
    }
    state.selectedFile = file;
    // Show local preview immediately
    const url = URL.createObjectURL(file);
    dom.previewInput.src = url;
    dom.previews.hidden = false;
    dom.dropzone.style.display = 'none';
    clearResult();
    updateCtaState();
  }

  function validateFile(file) {
    if (!file) return 'No se selecciono archivo.';
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Formato no soportado. Usa JPG, PNG o WEBP.';
    }
    if (file.size > MAX_BYTES) {
      return 'La imagen supera 10 MB. Comprimila o subi otra.';
    }
    if (file.size < 200) {
      return 'El archivo parece estar vacio o corrupto.';
    }
    return null;
  }

  function resetForNewImage() {
    if (state.isGenerating) {
      toast('Hay una imagen procesandose. Espera a que termine.', 'error');
      return;
    }
    state.selectedFile = null;
    state.inputPath = null;
    state.quickAction = null;
    state.instruccion = '';
    dom.instruccion.value = '';
    dom.chatCount.textContent = '0';
    dom.quickButtons.forEach((b) => b.classList.remove('is-selected'));
    dom.previewInput.src = '';
    dom.previews.hidden = true;
    dom.dropzone.style.display = '';
    clearResult();
    updateCtaState();
  }

  function clearResult() {
    dom.previewOutput.hidden = true;
    dom.previewOutput.src = '';
    dom.previewEmpty.hidden = false;
    dom.previewSkeleton.hidden = true;
    dom.resultActions.hidden = true;
  }

  // ============================================================
  // CTA logic
  // ============================================================
  function canGenerate() {
    if (state.isGenerating) return false;
    if (!state.selectedFile) return false;
    if (!state.quickAction && (!state.instruccion || !state.instruccion.trim())) return false;
    return true;
  }

  function updateCtaState() {
    dom.btnGenerar.disabled = !canGenerate();
    updateCtaHint();
  }

  function updateCtaHint() {
    const cost = MODEL_COST[state.modelo] || 1;
    dom.hintCost.textContent = String(cost);
    let bal;
    if (state.testMode === true) bal = '100 (test)';
    else if (state.tokenBalance == null) bal = '...';
    else bal = String(state.tokenBalance);
    dom.hintBalance.textContent = bal;

    // warn si Pro
    if (state.modelo === 'nano-banana-pro' && state.testMode !== true) {
      const balNum = state.tokenBalance;
      if (typeof balNum === 'number' && balNum < cost) {
        dom.ctaWarn.hidden = false;
        dom.ctaWarn.textContent = 'Saldo insuficiente. Recarga tokens para usar Pro.';
      } else {
        dom.ctaWarn.hidden = true;
        dom.ctaWarn.textContent = '';
      }
    } else {
      dom.ctaWarn.hidden = true;
      dom.ctaWarn.textContent = '';
    }
  }

  // ============================================================
  // Generate flow
  // ============================================================
  async function onGenerate() {
    if (!canGenerate()) return;
    // Fix HIGH: setear el flag SINCRONICAMENTE antes de cualquier await
    // para bloquear doble-click rapido (el await del NotifyPermission o uploadInput
    // dejaba ventana de race donde un segundo click pasaba el guard de canGenerate).
    state.isGenerating = true;
    // Reset flag de visibility para este job + pedir permiso de notificaciones (user gesture).
    state.wasHiddenDuringJob = false;
    requestNotifyPermission();
    setGeneratingUi(true, 'Preparando imagen...');

    try {
      // 1) Subir input si no fue subido aun
      if (!state.inputPath) {
        const path = await uploadInput(state.selectedFile);
        state.inputPath = path;
      }

      setSkeletonText('Encolando trabajo...');

      // 2) Llamar edge function. Selector decorativo: siempre enviar MODEL_REAL.
      const body = {
        modelo: MODEL_REAL,
        input_path: state.inputPath,
        instruccion: (state.instruccion && state.instruccion.trim()) || null,
        accion_rapida: state.quickAction,
      };
      // Fase 0 Tienda IA: si venimos del panel de Tienda IA, inyectamos el
      // bundle cross-modulo para que el worker sepa que aplicar el resultado
      // al producto X campo Y al terminar.
      if (state.crossModulo) {
        body.source = state.crossModulo.source;
        body.return_to = state.crossModulo.returnTo;
        body.target_producto_id = state.crossModulo.productoId;
        body.target_campo = state.crossModulo.campo;
      }
      const resp = await callEnqueue(body);
      if (!resp || !resp.success || !resp.job_id) {
        const msg = (resp && resp.message) ? resp.message : 'No se pudo encolar el trabajo.';
        throw new Error(msg);
      }
      // Sync test_mode flag desde el server (authoritative)
      if (typeof resp.test_mode === 'boolean') {
        state.testMode = resp.test_mode;
        renderBalance();
      }
      state.currentJobId = resp.job_id;
      // Fix C: persistir antes del wait para sobrevivir reload/refresh del browser.
      saveCurrentJobId(resp.job_id);

      // Fase 1 paso 4 (2026-05-25): mostrar posicion en cola + ETA real al user.
      // Si hay cola significativa (>3 jobs antes o ETA > 90s), avisar honestamente.
      const queuePos = (typeof resp.queue_position === 'number') ? resp.queue_position : 0;
      const etaSec = (typeof resp.eta_seconds === 'number') ? resp.eta_seconds : 0;
      const activeWorkers = (typeof resp.queue_active_workers === 'number') ? resp.queue_active_workers : 0;
      if (queuePos >= 3 || etaSec >= 90) {
        const minutes = Math.floor(etaSec / 60);
        const seconds = etaSec % 60;
        const etaLabel = minutes > 0
          ? `~${minutes}:${String(seconds).padStart(2, '0')} min`
          : `~${seconds}s`;
        if (dom.skeletonEtaText) dom.skeletonEtaText.textContent = etaLabel;
        setSkeletonText(`Tu imagen es la #${queuePos + 1} en cola · ${activeWorkers} generándose ahora`);
      } else {
        setSkeletonText('Generando imagen...');
      }

      // 3) Esperar job
      const job = await waitForJob(resp.job_id);

      // 4) Render resultado
      if (job.estado === 'done') {
        await renderResult(job);
      } else {
        const errMsg = buildJobErrorMsg(job);
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error('[generate] failed', err);
      const message = (err && err.message) ? err.message : 'Error inesperado.';
      openErrorModal(message);
      // limpiar skeleton, dejar UI lista para reintentar
      dom.previewSkeleton.hidden = true;
      dom.previewEmpty.hidden = false;
    } finally {
      setGeneratingUi(false);
      teardownJobListeners();
      state.currentJobId = null;
      // Fix C: limpiar el job_id persistido — ya terminado, no hay que reanudar nada.
      clearCurrentJobId();
      // Fix MEDIUM: si el titulo quedo en "Lista!" por un error en renderResult
      // posterior al notify, restaurarlo aca. notifyJobDone() solo se llama en
      // success path, pero defensa en profundidad por si algo cambia.
      if (state.originalTitle) {
        try { document.title = state.originalTitle; } catch (_) {}
        state.originalTitle = null;
      }
      // refrescar saldo cuando NO es modo test
      if (state.testMode === false) {
        loadBalance();
      }
    }
  }

  function setGeneratingUi(on, skeletonText) {
    state.isGenerating = on;
    dom.btnGenerar.disabled = on || !canGenerate();
    dom.btnGenerar.classList.toggle('is-loading', on);
    dom.btnSpinner.hidden = !on;
    if (on) {
      dom.previewEmpty.hidden = true;
      dom.previewSkeleton.hidden = false;
      dom.previewOutput.hidden = true;
      dom.resultActions.hidden = true;
      setSkeletonText(skeletonText || 'Subiendo tu foto...');
      startLoadingAnimation();
    } else {
      stopLoadingAnimation();
    }
  }

  function setSkeletonText(text) {
    // Fade out → cambiar texto → fade in (visualmente suave).
    // Fix HIGH: cancela el timeout previo para que el callback no se ejecute
    // después de stopLoadingAnimation (sobreescribía textos de fases siguientes).
    if (!dom.skeletonText) return;
    if (state.skeletonFadeTimer) {
      clearTimeout(state.skeletonFadeTimer);
      state.skeletonFadeTimer = null;
    }
    const status = dom.skeletonText.parentElement;
    if (!status) { dom.skeletonText.textContent = text; return; }
    status.classList.add('is-fading');
    state.skeletonFadeTimer = setTimeout(() => {
      dom.skeletonText.textContent = text;
      status.classList.remove('is-fading');
      state.skeletonFadeTimer = null;
    }, 200);
  }

  // ============================================================
  // Loading animation: barra + mensajes rotando + ETA
  // ============================================================
  function startLoadingAnimation() {
    state.loadingStartTs = Date.now();
    if (dom.skeletonEtaText) dom.skeletonEtaText.textContent = JOB_ETA_LABEL;
    if (dom.skeletonProgress) dom.skeletonProgress.hidden = false;
    if (dom.skeletonEta) dom.skeletonEta.hidden = false;
    if (dom.skeletonBar) dom.skeletonBar.style.width = '0%';

    let currentMsgIdx = -1;

    let lateShown = false;

    const tick = () => {
      const elapsed = Date.now() - state.loadingStartTs;
      // pct = (elapsed/eta) * 95, cap a 95%. La barra NUNCA llega al 100% hasta que el job termina.
      let pct = (elapsed / JOB_ETA_MS) * 95;
      if (pct > 95) pct = 95;
      if (dom.skeletonBar) dom.skeletonBar.style.width = pct.toFixed(1) + '%';

      // Fix D: tras LATE_MESSAGE_AT_MS, mensaje honesto en vez de "Casi listo..." pegado.
      if (elapsed >= LATE_MESSAGE_AT_MS) {
        if (!lateShown) {
          lateShown = true;
          setSkeletonText(LATE_MESSAGE_TEXT);
          if (dom.skeletonEtaText) dom.skeletonEtaText.textContent = 'puede tardar unos minutos';
        }
        return;
      }

      // Buscar el mensaje correspondiente (antes del umbral)
      let nextIdx = 0;
      for (let i = 0; i < LOADING_MESSAGES.length; i++) {
        if (pct >= LOADING_MESSAGES[i].pct) nextIdx = i;
      }
      if (nextIdx !== currentMsgIdx) {
        currentMsgIdx = nextIdx;
        setSkeletonText(LOADING_MESSAGES[nextIdx].text);
      }
    };

    tick();
    state.loadingTimer = setInterval(tick, 1000);
  }

  function stopLoadingAnimation() {
    if (state.loadingTimer) {
      clearInterval(state.loadingTimer);
      state.loadingTimer = null;
    }
    // Fix HIGH: cancelar el fade pendiente para que no escriba sobre el texto
    // de "Descargando resultado..." o el resultado final.
    if (state.skeletonFadeTimer) {
      clearTimeout(state.skeletonFadeTimer);
      state.skeletonFadeTimer = null;
    }
    if (dom.skeletonBar) dom.skeletonBar.style.width = '100%';
    if (dom.skeletonProgress) dom.skeletonProgress.hidden = true;
    if (dom.skeletonEta) dom.skeletonEta.hidden = true;
  }

  // ============================================================
  // Notify when job done while tab is hidden (mobile back, switched tabs)
  // Stack: title flash + beep + Notification API + vibration.
  // Mejor cobertura: Android Chrome (todo). iOS Safari (title + beep).
  // ============================================================
  function setupNotifyListeners() {
    // Track visibility durante job (background trigger del notify)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.isGenerating) {
        state.wasHiddenDuringJob = true;
      }
      // Si vuelve a la pestana y hay flash en el titulo, restaurarlo
      if (!document.hidden && state.originalTitle) {
        document.title = state.originalTitle;
        state.originalTitle = null;
      }
    });
  }

  function requestNotifyPermission() {
    // Llamado dentro del user gesture del click Generar (best practice).
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch (_) { /* algunos browsers tiran error */ }
  }

  function notifyJobDone() {
    const wasHidden = state.wasHiddenDuringJob || document.hidden;
    if (!wasHidden) return; // user todavia esta mirando, no molestar

    // 1) Title flash (works en todo lado, incluso iOS background pestanas)
    try {
      if (!state.originalTitle) state.originalTitle = document.title;
      document.title = '✨ Lista! · AIMMA';
    } catch (_) {}

    // 2) Beep audio (works si el user ya interactuo - tenemos gesture del click Generar)
    try { playBeep(); } catch (_) {}

    // 3) Notification API (Android Chrome / desktop con permiso. iOS Safari ignora a menos que sea PWA instalada)
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification('AIMMA · Imagen lista', {
          body: 'Tu imagen ya está lista. Toca para verla.',
          icon: '/favicon.ico',
          tag: 'aimma-estudio-done',
          requireInteraction: false,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
        // auto-cerrar despues de 12s
        setTimeout(() => { try { n.close(); } catch(_) {} }, 12000);
      }
    } catch (_) {}

    // 4) Vibracion (Android only; iOS ignora silenciosamente)
    try {
      if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
    } catch (_) {}
  }

  function playBeep() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // Si suspended (mobile policy), intentar resume (tenemos user gesture previo)
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (_) {}
    }
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1175, ctx.currentTime + 0.18);
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.04);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    o.start();
    o.stop(ctx.currentTime + 0.55);
    setTimeout(() => { try { ctx.close(); } catch (_) {} }, 800);
  }

  function buildJobErrorMsg(job) {
    let base = 'No pudimos generar tu imagen.';
    if (job && job.error) base = job.error;
    if (state.testMode === false) base += ' Tus tokens fueron devueltos automaticamente.';
    return base;
  }

  // ============================================================
  // Upload input
  // ============================================================
  async function uploadInput(file) {
    const ext = mimeToExt(file.type);
    const id = nanoid();
    const path = state.user.id + '/' + id + '.' + ext;
    setSkeletonText('Subiendo imagen...');
    const { error } = await supabase
      .storage
      .from(BUCKET_IN)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: '3600',
      });
    if (error) {
      console.error('[upload] failed', error);
      throw new Error('No pudimos subir tu imagen. Reintenta en un momento.');
    }
    return path;
  }

  function mimeToExt(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
  }

  function nanoid() {
    // 21 chars, url-safe
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(21);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < 21; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  // ============================================================
  // Edge Function call
  // ============================================================
  async function callEnqueue(body) {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) {
      throw new Error('Sesion expirada. Inicia sesion de nuevo.');
    }
    const url = SUPABASE_URL + '/functions/v1/studio-enqueue';
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'apikey': SUPABASE_ANON,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('Sin conexion. Verifica tu internet y reintenta.');
    }
    let json = null;
    try { json = await resp.json(); } catch (e) { /* ignore */ }
    if (!resp.ok) {
      const msg = (json && (json.message || json.error)) || ('Error HTTP ' + resp.status);
      throw new Error(msg);
    }
    return json;
  }

  // ============================================================
  // Wait for job: realtime first, polling fallback
  // ============================================================
  function waitForJob(jobId) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        if (state.realtimeSub) {
          try { supabase.removeChannel(state.realtimeSub); } catch (e) { /* ignore */ }
          state.realtimeSub = null;
        }
        if (state.pollTimer) {
          clearInterval(state.pollTimer);
          state.pollTimer = null;
        }
        if (state.jobTimeoutTimer) {
          clearTimeout(state.jobTimeoutTimer);
          state.jobTimeoutTimer = null;
        }
      };

      const finishOk = (row) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(row);
      };
      const finishErr = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const isTerminal = (row) => row && (row.estado === 'done' || row.estado === 'failed' || row.estado === 'dead_letter');

      // Realtime
      try {
        const channel = supabase
          .channel('image_jobs_' + jobId)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'image_jobs', filter: 'id=eq.' + jobId },
            (payload) => {
              const row = payload && payload.new;
              if (row && isTerminal(row)) finishOk(row);
            }
          )
          .subscribe();
        state.realtimeSub = channel;
      } catch (e) {
        console.warn('[realtime] failed, falling back to polling', e);
      }

      // Polling fallback (siempre activo, por si realtime no entrega)
      const poll = async () => {
        try {
          const { data, error } = await supabase
            .from('image_jobs')
            .select('id, estado, output_url, error, finalizado_at')
            .eq('id', jobId)
            .maybeSingle();
          if (error) {
            console.warn('[poll] error', error);
            return;
          }
          if (data && isTerminal(data)) finishOk(data);
        } catch (e) {
          console.warn('[poll] exception', e);
        }
      };
      poll();
      state.pollTimer = setInterval(poll, POLL_INTERVAL_MS);

      // Timeout — Fix A: ultima poll antes de dar por perdido.
      // Si KIE termino el job mientras corria el timer, renderizar OK en vez de mostrar error.
      state.jobTimeoutTimer = setTimeout(async () => {
        if (settled) return;
        try {
          const { data } = await supabase
            .from('image_jobs')
            .select('id, estado, output_url, error, finalizado_at')
            .eq('id', jobId)
            .maybeSingle();
          if (data && isTerminal(data)) {
            finishOk(data);
            return;
          }
        } catch (e) {
          console.warn('[timeout-last-poll] exception', e);
        }
        finishErr(new Error('La generación está tomando más tiempo del normal. Tu imagen sigue procesándose — vuelve en unos minutos y la encontrarás lista.'));
      }, JOB_TIMEOUT_MS);
    });
  }

  function teardownJobListeners() {
    if (state.realtimeSub) {
      try { supabase.removeChannel(state.realtimeSub); } catch (e) { /* ignore */ }
      state.realtimeSub = null;
    }
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    if (state.jobTimeoutTimer) {
      clearTimeout(state.jobTimeoutTimer);
      state.jobTimeoutTimer = null;
    }
  }

  // ============================================================
  // Render result
  // ============================================================
  async function renderResult(job) {
    const path = extractOutputPath(job.output_url);
    if (!path) {
      throw new Error('La imagen se genero pero no pudimos localizar el archivo.');
    }
    setSkeletonText('Descargando resultado...');
    let blobUrl = null;
    try {
      // Intentar signed URL primero
      const signed = await supabase.storage.from(BUCKET_OUT).createSignedUrl(path, 3600);
      if (signed && signed.data && signed.data.signedUrl) {
        blobUrl = signed.data.signedUrl;
      } else {
        const dl = await supabase.storage.from(BUCKET_OUT).download(path);
        if (dl && dl.data) blobUrl = URL.createObjectURL(dl.data);
      }
    } catch (e) {
      console.warn('[download] fallback to download()', e);
      const dl = await supabase.storage.from(BUCKET_OUT).download(path);
      if (dl && dl.data) blobUrl = URL.createObjectURL(dl.data);
    }
    if (!blobUrl) {
      throw new Error('No pudimos descargar la imagen generada.');
    }
    dom.previewOutput.src = blobUrl;
    dom.previewOutput.hidden = false;
    dom.previewSkeleton.hidden = true;
    dom.previewEmpty.hidden = true;
    dom.resultActions.hidden = false;

    // Boton "Ver URL": abre signed URL en pestana nueva.
    if (dom.btnViewUrl) dom.btnViewUrl.href = blobUrl;

    // Boton "Descargar .jpg": fuerza download via Blob (cross-origin friendly).
    state.outputPath = path;
    if (dom.btnDownload) dom.btnDownload.onclick = makeDownloadHandler(path);

    // Persistir en localStorage para que al volver atras en mobile, el editor restaure la imagen.
    saveLastResult(job.id, path);

    // Avisar si el user minimizo o cambio de pestana durante el job.
    notifyJobDone();

    toast('Imagen generada con exito.', 'success');
  }

  function extractOutputPath(outputUrl) {
    if (!outputUrl) return null;
    // Cases: full URL ".../storage/v1/object/.../studio-outputs/<path>" OR plain "<user_id>/<id>.jpg"
    if (!outputUrl.startsWith('http')) {
      return outputUrl;
    }
    const marker = '/' + BUCKET_OUT + '/';
    const idx = outputUrl.indexOf(marker);
    if (idx === -1) return null;
    let p = outputUrl.substring(idx + marker.length);
    // Strip query string
    const q = p.indexOf('?');
    if (q !== -1) p = p.substring(0, q);
    return p;
  }

  // ============================================================
  // Modal helpers (tab-trap + escape)
  // ============================================================
  function openErrorModal(message) {
    dom.modalErrorBody.textContent = message || 'Error inesperado.';
    state.lastFocused = document.activeElement;
    dom.modalError.hidden = false;
    const panel = dom.modalError.querySelector('.modal__panel');
    const closeBtns = dom.modalError.querySelectorAll('[data-close-modal]');
    setTimeout(() => {
      const focusBtn = dom.modalError.querySelector('.modal__actions .btn-primary');
      (focusBtn || panel).focus();
    }, 30);
    trapFocus(dom.modalError);
  }

  function closeModal(modal) {
    modal.hidden = true;
    if (state.lastFocused && state.lastFocused.focus) state.lastFocused.focus();
    state.lastFocused = null;
    releaseFocusTrap(modal);
  }

  function trapFocus(modal) {
    if (modal._trapHandler) return;
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'
      )).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    modal._trapHandler = handler;
    modal.addEventListener('keydown', handler);
  }

  function releaseFocusTrap(modal) {
    if (modal._trapHandler) {
      modal.removeEventListener('keydown', modal._trapHandler);
      modal._trapHandler = null;
    }
  }

  // ============================================================
  // Toast
  // ============================================================
  let toastTimer = null;
  function toast(msg, kind) {
    dom.toast.textContent = msg;
    dom.toast.className = 'toast' + (kind === 'error' ? ' toast--error' : (kind === 'success' ? ' toast--success' : ''));
    dom.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 3600);
  }

  // ============================================================
  // Boot
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
