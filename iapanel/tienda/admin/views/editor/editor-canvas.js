/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-canvas.js v3 (carril patch)
 * El canvas ahora es un <iframe> que muestra el storefront REAL en modo preview.
 * SIN mockups, SIN GridStack. Puente postMessage bidireccional con validacion de origin.
 *  - Admin -> iframe: refresh() => postMessage({type:'reload'}, TENANT_ORIGIN)
 *  - Admin -> iframe: applyPatch(op, opts) => postMessage({type:'section-patch',...}, TENANT_ORIGIN)
 *  - iframe -> admin: {type:'select',sectionId} => EditorState.select; {type:'preview-ready'}
 * renderFragment: stash KV -> pagina GET -> DOMParser -> outerHTML limpio (sin execute de scripts).
 * Marker: editor-plan4-v3-canvas.
 */
(function(window) {
  'use strict';

  const PREVIEW_TOKEN_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-preview-token';
  // El preview-token vence a los 15 min. Re-minteamos con 90s de margen (proactivo) y
  // tratamos como "stale" todo lo que esté dentro de ese margen (reactivo, en refresh()).
  const REMINT_MARGIN_MS = 90000;
  // C.2 Paso 1: validacion del section-action entrante (mismo regex que el bridge del storefront).
  const SECTION_ID_RE = /^sec_[a-z0-9]{4,}$/;
  const SECTION_ACTIONS = { up: 1, down: 1, duplicate: 1, remove: 1 };

  const state = {
    container: null,
    callbacks: {},
    iframe: null,
    frameWrap: null,
    statusEl: null,
    tenantOrigin: null,   // https://<slug>.tienda.aimma.com.co
    previewUrl: null,
    pagePath: '/',        // L3: ruta de la pagina activa en el preview ('/', '/c/<cat>', ...)
    ready: false,
    device: 'desktop',
    messageHandler: null,
    expiresAt: null,
    remintTimer: null,
    selUnsub: null,       // unsub de la suscripcion a 'selection' (emite set-selection al iframe)
  };

  function render(container, callbacks) {
    state.container = container;
    state.callbacks = callbacks || {};
    container.innerHTML = '';
    container.setAttribute('data-device', 'desktop');

    const inner = document.createElement('div');
    inner.className = 'ed-canvas__inner';
    inner.id = 'editor-canvas-inner';
    container.appendChild(inner);

    const frameWrap = document.createElement('div');
    frameWrap.className = 'ed-frame-wrap';
    frameWrap.id = 'editor-frame-wrap';
    inner.appendChild(frameWrap);
    state.frameWrap = frameWrap;

    const status = document.createElement('div');
    status.className = 'ed-frame-status';
    status.id = 'editor-frame-status';
    status.textContent = 'Cargando vista previa de tu tienda...';
    frameWrap.appendChild(status);
    state.statusEl = status;

    bindMessageBridge();
    loadPreview();
  }

  // ============================================================
  // Preview token + iframe
  // ============================================================
  async function loadPreview() {
    const ES = window.TiendaIA.editorState;
    setStatus('Cargando vista previa de tu tienda...', false);
    try {
      // fix/preview-cortesia: token fresco (auto-refresh) en vez del cache sincrono stale.
      const token = window.TiendaIA?.getAccessToken
        ? await window.TiendaIA.getAccessToken()
        : null;
      if (!token) {
        setStatus('No pudimos validar tu sesion. Recarga la pagina e intenta de nuevo.', true);
        return;
      }
      const r = await fetch(PREVIEW_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tienda_id: ES.tienda_id }),
      });
      const data = await r.json().catch(() => ({ error: 'parse_error' }));
      if (!r.ok || !data.preview_url) {
        console.error('[editor-canvas] preview-token error', data);
        setStatus('No pudimos abrir la vista previa. Verifica que la tienda exista y vuelve a intentar.', true);
        return;
      }
      state.expiresAt = data.expires_at || null;
      // Derivar TENANT_ORIGIN de la URL real (robusto vs construir el slug a mano).
      var origin;
      try {
        origin = new URL(data.preview_url).origin;
      } catch (e) {
        setStatus('La URL de vista previa no es valida.', true);
        return;
      }
      state.tenantOrigin = origin;
      // L3: el token es PAGE-AGNOSTIC (validate_preview_token anda en / y /c/[slug]).
      // El iframe carga la PAGINA activa (state.pagePath); home '/' = comportamiento previo.
      var tok = data.token || new URL(data.preview_url).searchParams.get('preview');
      var path = state.pagePath || '/';
      state.previewUrl = origin + path + '?preview=' + encodeURIComponent(tok);
      mountIframe();
      scheduleRemint(); // re-mint proactivo antes de que el token venza (evita el 403 en canvas)
    } catch (err) {
      console.error('[editor-canvas] loadPreview error', err);
      setStatus('Error de conexion al cargar la vista previa.', true);
    }
  }

  function mountIframe() {
    // Limpiar iframe previo si existe (reload de token).
    if (state.iframe) {
      try { state.iframe.remove(); } catch (e) { /* noop */ }
      state.iframe = null;
    }
    state.ready = false;

    const iframe = document.createElement('iframe');
    iframe.className = 'ed-frame';
    iframe.id = 'editor-frame';
    iframe.title = 'Vista previa de tu tienda';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.setAttribute('loading', 'eager');
    iframe.src = state.previewUrl;
    iframe.addEventListener('load', () => {
      // 'preview-ready' del storefront es la senial canonica; load es respaldo.
      setStatus('', false);
    });
    state.frameWrap.appendChild(iframe);
    state.iframe = iframe;
  }

  function bindMessageBridge() {
    if (state.messageHandler) {
      window.removeEventListener('message', state.messageHandler);
    }
    state.messageHandler = function(event) {
      // SEGURIDAD: validar origin SIEMPRE contra el tenant esperado (gate G3, ambos sentidos).
      if (!state.tenantOrigin || event.origin !== state.tenantOrigin) return;
      const ES = window.TiendaIA.editorState;
      const msg = event.data || {};
      if (msg.type === 'select') {
        if (msg.sectionId === null) { ES.select(null); return; } // deseleccion (click en vacio del canvas)
        if (typeof msg.sectionId !== 'string') return;
        // D4: el id clickeado puede ser una seccion top-level O un hijo de contenedor -> findTarget
        // resuelve a {sectionId, childId}. Seleccionar el target (chrome enmarca el hijo, inspector lo refleja).
        const t = ES.findTarget(msg.sectionId);
        if (!t) return;
        if (t.childId) ES.select(t.sectionId, t.childId);
        else ES.select(t.sectionId);
        openInspectorDrawer();
      } else if (msg.type === 'section-action') {
        // origin ya validado; el dispatcher revalida action + seccion ANTES de mutar.
        handleSectionAction(msg);
      } else if (msg.type === 'add-child') {
        // D4: "+ agregar bloque" del canvas -> abre el catalogo de hijos filtrado e inserta en la columna.
        handleAddChild(msg);
      } else if (msg.type === 'inline-edit-start' || msg.type === 'inline-commit' || msg.type === 'inline-cancel') {
        handleInlineMessage(msg);
      } else if (msg.type === 'preview-ready') {
        state.ready = true;
        setStatus('', false);
        // Tras (re)cargar el iframe: restaurar la seleccion vigente (chrome) + re-habilitar la edicion inline.
        // D4: enmarca el childId si la seleccion es un hijo (cae a sectionId si no).
        postSelection(ES.selection ? (ES.selection.childId || ES.selection.sectionId) : null);
        sendInlineEnable();
      }
    };
    window.addEventListener('message', state.messageHandler);

    // Fuente UNICA = editorState.selection: el admin emite set-selection al iframe en CADA cambio
    // de seleccion (las 3 fuentes -> click en iframe, lista del sidebar, auto-select tras duplicar
    // -> pasan por aca). El iframe es reflector puro (dibuja/limpia solo al recibir set-selection).
    const ES0 = window.TiendaIA.editorState;
    if (ES0 && ES0.subscribe) {
      state.selUnsub = ES0.subscribe('selection', function() {
        // D4: enmarca el childId si la seleccion es un hijo (cae a sectionId si no).
        postSelection(ES0.selection ? (ES0.selection.childId || ES0.selection.sectionId) : null);
      });
    }
  }

  // section-action (iframe -> admin). El origin ya se valido en messageHandler; aca el resto del
  // gate G3: action en el enum + seccion CONOCIDA, ANTES de mutar. Un frame hostil no dispara ops.
  function handleSectionAction(msg) {
    const ES = window.TiendaIA.editorState;
    if (!SECTION_ACTIONS[msg.action]) return;
    if (typeof msg.sectionId !== 'string' || !SECTION_ID_RE.test(msg.sectionId)) return;
    // D4: si la seleccion vigente es un HIJO y el action vino para ese hijo -> ops de hijo (scopeadas
    // al contenedor: reorden SAME-COLUMN, duplicar, borrar). El section-action solo trae sectionId, asi
    // que confirmamos contra ES.selection (un frame stale/hostil no dispara ops de hijo ajenas).
    const sel = ES.selection || {};
    if (sel.childId && msg.sectionId === sel.childId) {
      const parentId = sel.sectionId, childId = sel.childId;
      if (msg.action === 'up') ES.reorderChildBlock(parentId, childId, -1);
      else if (msg.action === 'down') ES.reorderChildBlock(parentId, childId, 1);
      else if (msg.action === 'duplicate') { const nid = ES.duplicateChildBlock(parentId, childId); if (nid) ES.select(parentId, nid); }
      else if (msg.action === 'remove') ES.removeChildBlock(parentId, childId);
      return;
    }
    if (!ES.findSection(msg.sectionId)) return;
    const idx = ES.sections.findIndex(function(s) { return s.id === msg.sectionId; });
    if (msg.action === 'up') {
      if (idx > 0) ES.reorderSections(idx, idx - 1);                  // guard FUNCIONAL de limite (no el gris)
    } else if (msg.action === 'down') {
      if (idx >= 0 && idx < ES.sections.length - 1) ES.reorderSections(idx, idx + 1);
    } else if (msg.action === 'duplicate') {
      const nid = ES.duplicateSection(msg.sectionId);
      // set-selection a la copia DESPUES de que drene el patch insert (ancla al nodo nuevo, no a uno viejo).
      const em = window.TiendaIA.editorMain;
      if (nid && em && em.pendingSelectAfterPatch) em.pendingSelectAfterPatch(nid);
    } else if (msg.action === 'remove') {
      // SOLO abre el modal del admin (NO borra directo). Un mensaje no puede auto-confirmar.
      const conf = window.TiendaIA.editorConfirm;
      if (conf && conf.removeSection) conf.removeSection(msg.sectionId);
    }
  }

  // D4: "+ agregar bloque" del canvas. Abre el catalogo de hijos (filtrado a CHILD_TIPOS) e inserta
  // en el contenedor + columna indicados; selecciona el hijo nuevo (chrome + inspector en sync).
  function handleAddChild(msg) {
    const ES = window.TiendaIA.editorState;
    if (typeof msg.parentId !== 'string' || !SECTION_ID_RE.test(msg.parentId)) return;
    if (!ES.findContenedor(msg.parentId)) return;            // gate: contenedor CONOCIDO antes de abrir
    const col = Number.isInteger(msg.column) ? msg.column : 0;
    const insp = window.TiendaIA.editorInspector;
    const tipos = (insp && insp.CHILD_TIPOS) || null;
    window.TiendaIA.editorModalCatalog.open(function (tipo) {
      const nid = ES.addChildBlock(msg.parentId, tipo, col);
      if (nid) ES.select(msg.parentId, nid);
    }, tipos);
  }

  // Label de la seccion desde sectionDefs (fuente unica A.1). NULL-SAFE: '' si no hay seccion
  // (deseleccion: sectionId null) o tipo desconocido -> NUNCA accede defs[undefined] (no tira).
  function selectionLabel(id) {
    if (!id) return '';
    const ES = window.TiendaIA.editorState;
    // D4: el id enmarcado puede ser un hijo -> resolver su tipo via findTarget/findChild.
    const t = ES.findTarget(id);
    if (!t) return '';
    let tipo = null;
    if (t.childId) { const ch = ES.findChild(t.sectionId, t.childId); tipo = ch ? ch.tipo : null; }
    else { const sec = ES.findSection(t.sectionId); tipo = sec ? sec.tipo : null; }
    const defs = window.TiendaIA.editorSectionDefs && window.TiendaIA.editorSectionDefs.defs;
    const def = defs && tipo && defs[tipo];
    return (def && def.label) ? def.label : (tipo || '');
  }

  // set-selection (admin -> iframe). origin = tenantOrigin. DEFENSIVO: todo el cuerpo (label +
  // postMessage) va en try/catch -> postSelection NUNCA tira al caller. Critico porque la
  // deseleccion postSelection(null) corre en cada click-en-vacio (y el emit post-drain en el finally).
  function postSelection(sectionId) {
    if (!state.iframe || !state.tenantOrigin) return;
    try {
      state.iframe.contentWindow.postMessage(
        { type: 'set-selection', sectionId: sectionId || null, label: selectionLabel(sectionId) },
        state.tenantOrigin
      );
    } catch (e) { /* noop */ }
  }

  // inline-enable (admin -> iframe): despierta la edicion inline. Se manda en cada preview-ready
  // (carga/recarga del iframe). El admin viejo no lo manda -> InlineEdit queda dormido.
  function sendInlineEnable() {
    if (!state.iframe || !state.tenantOrigin) return;
    try { state.iframe.contentWindow.postMessage({ type: 'inline-enable' }, state.tenantOrigin); } catch (e) { /* noop */ }
  }

  // inline-edit-start/commit/cancel (iframe -> admin). origin ya validado en messageHandler; aca el resto
  // del gate G3: sectionId conocido + fieldPath EN EL REGISTRO + value string, ANTES de mutar. Un frame
  // hostil no puede escribir props arbitrarias. El suspend/commit viven en editor.js (editorMain).
  function handleInlineMessage(msg) {
    const ES = window.TiendaIA.editorState;
    const IF = window.TiendaIA.editorInlineFields;
    const em = window.TiendaIA.editorMain;
    if (!IF || !em) return;
    if (typeof msg.sectionId !== 'string' || !SECTION_ID_RE.test(msg.sectionId)) return;
    const sec = ES.findSection(msg.sectionId);
    if (!sec) return;
    if (typeof msg.fieldPath !== 'string' || !IF.isSimpleTextField(sec.tipo, msg.fieldPath)) return;
    if (msg.type === 'inline-edit-start') {
      em.setEditingSection(msg.sectionId);
    } else if (msg.type === 'inline-cancel') {
      em.clearEditingSection();
    } else if (msg.type === 'inline-commit') {
      if (typeof msg.value !== 'string') { em.clearEditingSection(); return; } // value debe ser string
      let value = IF.cleanInlineText(msg.value);          // defensa: re-limpiar (texto plano una linea)
      if (value.length > 500) value = value.slice(0, 500); // cap defensivo
      em.commitInlineEdit(msg.sectionId, msg.fieldPath, value);
    }
  }

  // En layouts angostos (<1100px) el inspector es un drawer; al seleccionar desde
  // el iframe lo abrimos para que el usuario vea los controles.
  function openInspectorDrawer() {
    const insp = document.getElementById('editor-inspector');
    if (insp && window.matchMedia('(max-width: 1100px)').matches) {
      insp.classList.add('ed-inspector--open');
    }
  }

  // ============================================================
  // Refresh (Admin -> iframe). Llamado por editor.js tras autosave draft.
  // ============================================================
  function refresh() {
    if (!state.iframe || !state.tenantOrigin) return;
    // Si el preview-token esta por vencer, NO recargamos con el viejo (daria 403
    // "Preview token invalido o expirado" dentro del canvas): re-minteamos primero.
    if (tokenIsStale()) { reloadFull(); return; }
    const win = state.iframe.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ type: 'reload' }, state.tenantOrigin);
    } catch (e) {
      // Si postMessage falla (token expirado, etc.) recargamos via nuevo token.
      console.warn('[editor-canvas] postMessage reload fallo, recargando preview', e);
      reloadFull();
    }
  }

  // El token de la URL del iframe esta vencido o dentro del margen -> hay que re-mintear.
  function tokenIsStale() {
    if (!state.expiresAt) return false;
    return (new Date(state.expiresAt).getTime() - Date.now()) < REMINT_MARGIN_MS;
  }

  // Re-mint proactivo: agenda un reloadFull (token fresco + iframe nuevo) ~90s antes de vencer,
  // para que la URL del iframe nunca quede con un token muerto. Se re-agenda en cada loadPreview.
  function scheduleRemint() {
    if (state.remintTimer) { clearTimeout(state.remintTimer); state.remintTimer = null; }
    if (!state.expiresAt) return;
    const ms = new Date(state.expiresAt).getTime() - Date.now() - REMINT_MARGIN_MS;
    state.remintTimer = setTimeout(() => { reloadFull(); }, Math.max(ms, 1000));
  }

  // Recarga completa: pide un token nuevo y recrea el iframe.
  // Util cuando el token de 15 min expira durante una sesion larga.
  function reloadFull() {
    loadPreview();
  }

  function setDevice(device) {
    state.device = device === 'mobile' ? 'mobile' : 'desktop';
    if (state.container) state.container.setAttribute('data-device', state.device);
  }

  // L3: setea la ruta de la pagina activa para el proximo loadPreview/reloadFull.
  // NO recarga por si solo (el caller hace reloadFull tras setearla). Default '/'.
  function setPagePath(path) {
    state.pagePath = (typeof path === 'string' && path) ? path : '/';
  }

  function setStatus(text, isError) {
    if (!state.statusEl) return;
    if (!text) {
      state.statusEl.hidden = true;
      state.statusEl.textContent = '';
      return;
    }
    state.statusEl.hidden = false;
    state.statusEl.textContent = text;
    state.statusEl.classList.toggle('ed-frame-status--error', !!isError);
  }

  function destroy() {
    if (state.messageHandler) {
      window.removeEventListener('message', state.messageHandler);
      state.messageHandler = null;
    }
    if (state.selUnsub) { try { state.selUnsub(); } catch (e) {} state.selUnsub = null; }
    if (state.remintTimer) { clearTimeout(state.remintTimer); state.remintTimer = null; }
    state.iframe = null;
    state.ready = false;
  }

  // Preview en vivo del theme: postea los --ta-* (colores) + el ID del pairing al iframe.
  // targetOrigin = tenantOrigin (nunca '*'). El bridge del storefront valida origin + regex + allowlist.
  function applyThemePreview(colors, fontPairingId, navTextSize) {
    if (!state.iframe || !state.tenantOrigin) return;
    try {
      state.iframe.contentWindow.postMessage({ type: 'theme', colors: colors, font_pairing: fontPairingId, nav_text_size: navTextSize }, state.tenantOrigin);
    } catch (e) { /* noop */ }
  }

  // No-op compat: el canvas v3 no reconstruye DOM de secciones (lo hace el iframe).
  // Se conserva por si algun caller viejo lo invoca; refresca el iframe.
  function rebuild() {
    refresh();
  }

  // ============================================================
  // Carril patch (Task 5 Fase C)
  // ============================================================

  // Renderiza una seccion via el SSR real (stash KV -> pagina GET) y extrae el nodo limpio.
  // DOMParser NO ejecuta scripts -> extraccion segura del outerHTML del [data-section-id].
  async function renderFragment(section) {
    if (!state.tenantOrigin || !state.previewUrl) throw new Error('no_preview');
    const token = new URL(state.previewUrl).searchParams.get('preview');
    if (!token) throw new Error('no_token');
    const sres = await fetch(
      state.tenantOrigin + '/internal/stash-fragment?preview=' + encodeURIComponent(token),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: section }),
      }
    );
    if (!sres.ok) throw new Error('stash_' + sres.status);
    const sj = await sres.json();
    if (!sj || !sj.nonce) throw new Error('no_nonce');
    const rres = await fetch(
      state.tenantOrigin + '/internal/render-fragment?preview=' + encodeURIComponent(token) +
      '&nonce=' + encodeURIComponent(sj.nonce)
    );
    if (!rres.ok) throw new Error('render_' + rres.status);
    const pageHtml = await rres.text();
    const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
    const node = doc.querySelector('[data-section-id]');
    if (!node) throw new Error('no_node');
    return node.outerHTML;
  }

  // Postea un patch al iframe (el bridge valida origin + shape). targetOrigin = tenantOrigin, nunca '*'.
  function applyPatch(op, opts) {
    if (!state.iframe || !state.tenantOrigin) return;
    try {
      var msg = { type: 'section-patch', op: op };
      for (var k in opts) msg[k] = opts[k];
      state.iframe.contentWindow.postMessage(msg, state.tenantOrigin);
    } catch (e) { /* noop */ }
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorCanvas = {
    render, refresh, reloadFull, setDevice, setPagePath, destroy, rebuild, applyThemePreview,
    renderFragment, applyPatch, handleSectionAction, handleAddChild, postSelection, selectionLabel, handleInlineMessage,
    get previewUrl() { return state.previewUrl; },
    get pagePath() { return state.pagePath || '/'; },
  };
})(window);
