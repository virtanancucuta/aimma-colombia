/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-canvas.js v2 (WYSIWYG iframe)
 * El canvas ahora es un <iframe> que muestra el storefront REAL en modo preview.
 * SIN mockups, SIN GridStack. Puente postMessage bidireccional con validacion de origin.
 *  - Admin -> iframe: refresh() => postMessage({type:'reload'}, TENANT_ORIGIN)
 *  - iframe -> admin: {type:'select',sectionId} => EditorState.select; {type:'preview-ready'}
 * Marker: editor-plan4-v3-canvas.
 */
(function(window) {
  'use strict';

  const PREVIEW_TOKEN_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-preview-token';

  const state = {
    container: null,
    callbacks: {},
    iframe: null,
    frameWrap: null,
    statusEl: null,
    tenantOrigin: null,   // https://<slug>.tienda.aimma.com.co
    previewUrl: null,
    ready: false,
    device: 'desktop',
    messageHandler: null,
    expiresAt: null,
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
      const session = window.TiendaIA?.getSession && window.TiendaIA.getSession();
      const token = session?.access_token;
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
      state.previewUrl = data.preview_url;
      state.expiresAt = data.expires_at || null;
      // Derivar TENANT_ORIGIN de la URL real (robusto vs construir el slug a mano).
      try {
        state.tenantOrigin = new URL(data.preview_url).origin;
      } catch (e) {
        setStatus('La URL de vista previa no es valida.', true);
        return;
      }
      mountIframe();
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
      // SEGURIDAD: validar origin SIEMPRE contra el tenant esperado.
      if (!state.tenantOrigin || event.origin !== state.tenantOrigin) return;
      const msg = event.data || {};
      if (msg.type === 'select' && typeof msg.sectionId === 'string') {
        const sec = window.TiendaIA.editorState.findSection(msg.sectionId);
        if (sec) {
          window.TiendaIA.editorState.select(msg.sectionId);
          openInspectorDrawer();
        }
      } else if (msg.type === 'preview-ready') {
        state.ready = true;
        setStatus('', false);
      }
    };
    window.addEventListener('message', state.messageHandler);
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

  // Recarga completa: pide un token nuevo y recrea el iframe.
  // Util cuando el token de 15 min expira durante una sesion larga.
  function reloadFull() {
    loadPreview();
  }

  function setDevice(device) {
    state.device = device === 'mobile' ? 'mobile' : 'desktop';
    if (state.container) state.container.setAttribute('data-device', state.device);
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
    state.iframe = null;
    state.ready = false;
  }

  // No-op compat: el canvas v3 no reconstruye DOM de secciones (lo hace el iframe).
  // Se conserva por si algun caller viejo lo invoca; refresca el iframe.
  function rebuild() {
    refresh();
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorCanvas = {
    render, refresh, reloadFull, setDevice, destroy, rebuild,
    get previewUrl() { return state.previewUrl; },
  };
})(window);
