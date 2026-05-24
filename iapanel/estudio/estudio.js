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
  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const POLL_INTERVAL_MS = 3000;
  const JOB_TIMEOUT_MS = 180000; // 3 min
  // Solo 'nano-banana-pro' funciona en KIE.ai (verificado contra API).
  // 'nano-banana' a secas devuelve 422 model not supported.
  // Mapeamos ambos al mismo modelo real con costo unico = 1 token.
  const MODEL_COST = { 'nano-banana': 1, 'nano-banana-pro': 1 };
  const MODEL_REAL = 'nano-banana-pro';

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
    modelo: 'nano-banana-pro',
    instruccion: '',
    currentJobId: null,
    realtimeSub: null,
    pollTimer: null,
    jobTimeoutTimer: null,
    isGenerating: false,
    lastFocused: null,
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
  async function init() {
    cacheDom();
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
    updateCtaHint();
    loadBalance().catch(e => console.warn('[balance] background fetch error', e));
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
    setGeneratingUi(true, 'Preparando imagen...');

    try {
      // 1) Subir input si no fue subido aun
      if (!state.inputPath) {
        const path = await uploadInput(state.selectedFile);
        state.inputPath = path;
      }

      setSkeletonText('Encolando trabajo...');

      // 2) Llamar edge function. Forzar MODEL_REAL: KIE solo acepta 'nano-banana-pro'.
      // El radio del frontend es solo decorativo en esta iteracion (ambos = 1 token).
      const body = {
        modelo: MODEL_REAL,
        input_path: state.inputPath,
        instruccion: (state.instruccion && state.instruccion.trim()) || null,
        accion_rapida: state.quickAction,
      };
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

      setSkeletonText('Generando imagen...');

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
      setSkeletonText(skeletonText || 'Generando imagen...');
    }
  }

  function setSkeletonText(text) {
    dom.skeletonText.textContent = text;
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

      // Timeout
      state.jobTimeoutTimer = setTimeout(() => {
        finishErr(new Error('La generacion esta tardando mas de lo normal. Volve a intentar en unos minutos.'));
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

    // Boton "Ver URL": abre signed URL en pestana nueva (sirve para compartir / inspeccionar)
    if (dom.btnViewUrl) dom.btnViewUrl.href = blobUrl;

    // Boton "Descargar .jpg": fuerza download del archivo (sin abrir pestana).
    // No se puede confiar en attr 'download' de <a> porque la signed URL es cross-origin
    // (supabase.co vs aimma.com.co) -> el browser lo ignora. Hacemos download via Blob.
    state.outputPath = path;
    if (dom.btnDownload) {
      dom.btnDownload.onclick = async (ev) => {
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
          toast('No pudimos descargar. Probá "Ver URL" y guardá manual.', 'error');
        } finally {
          dom.btnDownload.disabled = false;
          dom.btnDownload.innerHTML = original;
        }
      };
    }
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
