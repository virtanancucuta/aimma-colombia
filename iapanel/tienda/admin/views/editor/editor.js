/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor.js v2 (SCHEMA v3 + WYSIWYG)
 * Entry/wiring. Monta UI 3 paneles (sidebar | iframe | inspector).
 * Autosave draft debounced (~1.5s) via guardar-layout mode:draft; tras success
 * postMessage reload al iframe. Guardar = publish. Maneja 409 stale_layout.
 * registerView('editor', mountEditor) — funcion directa (fix Plan 3).
 * Marker: editor-plan4-v3-entry.
 */
(function(window) {
  'use strict';

  const EF_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-guardar-layout';
  const AUTOSAVE_DEBOUNCE_MS = 1500;

  const state = {
    autoSaveTimer: null,
    mounted: false,
    unsubs: [],
  };

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') {
      cb();
      return;
    }
    if (attempts >= 200) {
      console.error('[editor.js] window.TiendaIA no inicializo en 10s.');
      return;
    }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  function registerEditor() {
    whenReady(() => {
      window.TiendaIA.registerView('editor', mountEditor);
    });
  }

  async function mountEditor() {
    const T = window.TiendaIA;
    const tienda = T.state.tienda;
    const container = T.dom.mainView;
    if (!tienda) {
      container.innerHTML = '<div style="padding:2rem">No hay tienda asociada.</div>';
      return;
    }
    if (typeof T.registerCleanup === 'function') {
      T.registerCleanup(unmountEditor);
    }

    container.innerHTML = '';
    const view = document.createElement('div');
    view.className = 'ed-view';
    view.id = 'editor-root';
    container.appendChild(view);

    const toolbarEl = document.createElement('header');
    toolbarEl.className = 'ed-toolbar';
    toolbarEl.id = 'editor-toolbar';
    view.appendChild(toolbarEl);

    const shell = document.createElement('div');
    shell.className = 'ed-shell';
    view.appendChild(shell);

    const sidebarEl = document.createElement('aside');
    sidebarEl.className = 'ed-sidebar';
    sidebarEl.id = 'editor-sidebar';
    shell.appendChild(sidebarEl);

    const canvasEl = document.createElement('main');
    canvasEl.className = 'ed-canvas';
    canvasEl.id = 'editor-canvas';
    canvasEl.setAttribute('data-device', 'desktop');
    shell.appendChild(canvasEl);

    const inspectorEl = document.createElement('aside');
    inspectorEl.className = 'ed-inspector';
    inspectorEl.id = 'editor-inspector';
    shell.appendChild(inspectorEl);

    // Init state v3
    window.TiendaIA.editorState.init(tienda.personalizaciones, tienda.id);
    state.unsubs.push(window.TiendaIA.editorState.subscribe('dirty', onDirtyChange));

    // Render paneles
    window.TiendaIA.editorToolbar.render(toolbarEl, {
      onBack: () => handleBack(),
      onUndo: () => window.TiendaIA.editorState.undo(),
      onRedo: () => window.TiendaIA.editorState.redo(),
      onSave: () => savePublish(),
      onPreview: () => openPreviewTab(),
      onDeselect: () => window.TiendaIA.editorState.deselect(),
      onTheme: () => window.TiendaIA.editorThemePanel.toggle(),
    });

    window.TiendaIA.editorSidebar.render(sidebarEl, {
      onAddSection: () => openCatalog(),
    });

    window.TiendaIA.editorCanvas.render(canvasEl, {});

    window.TiendaIA.editorInspector.render(inspectorEl, {});

    window.TiendaIA.editorThemePanel.render(shell);

    // First-use: si la pagina NO tiene secciones, ofrecer starter o desde cero.
    // (Mas robusto que depender de la columna editor_first_choice_at, que no
    //  siempre viene en el SELECT del admin.)
    if (window.TiendaIA.editorState.sections.length === 0) {
      window.TiendaIA.editorFirstUse.showFirstUseModal((choice) => {
        if (choice === 'starter') {
          const starter = window.TiendaIA.editorFirstUse.createStarterPage();
          starter.forEach(sec => window.TiendaIA.editorState.sections.push(sec));
          window.TiendaIA.editorState.pushSnapshot();
          window.TiendaIA.editorState.markDirty();
          // markDirty dispara onDirtyChange -> autosave -> reload del iframe.
          // Notificamos sections para refrescar sidebar/toolbar.
          window.TiendaIA.editorState.select(starter[0].id);
        }
        markFirstChoice();
      });
    }

    state.mounted = true;
    window.addEventListener('beforeunload', beforeUnloadGuard);
  }

  function unmountEditor() {
    state.mounted = false;
    if (state.autoSaveTimer) { clearTimeout(state.autoSaveTimer); state.autoSaveTimer = null; }
    state.unsubs.forEach(u => { try { u(); } catch (e) {} });
    state.unsubs = [];
    window.removeEventListener('beforeunload', beforeUnloadGuard);
    if (window.TiendaIA?.editorCanvas?.destroy) window.TiendaIA.editorCanvas.destroy();
    if (window.TiendaIA?.editorToolbar?.unbindKeyboard) window.TiendaIA.editorToolbar.unbindKeyboard();
  }

  function beforeUnloadGuard(e) {
    if (window.TiendaIA.editorState.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  // Autosave debounced en cada cambio que ensucia el estado.
  function onDirtyChange(dirty) {
    if (!dirty) return;
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = setTimeout(saveDraft, AUTOSAVE_DEBOUNCE_MS);
  }

  function openCatalog() {
    window.TiendaIA.editorModalCatalog.open((tipo) => {
      const id = window.TiendaIA.editorState.addSection(tipo);
      if (id) window.TiendaIA.editorState.select(id);
    });
  }

  function openPreviewTab() {
    const url = window.TiendaIA?.editorCanvas?.previewUrl;
    if (url) {
      window.open(url, '_blank', 'noopener');
    } else {
      toast('La vista previa aun no esta lista. Espera unos segundos.', 'info');
    }
  }

  // ============================================================
  // Save
  // ============================================================
  async function saveDraft() {
    const ES = window.TiendaIA.editorState;
    if (ES.saving) return;
    if (!ES.dirty) return;
    ES.markSaving(true);
    try {
      const body = {
        tienda_id: ES.tienda_id,
        page_id: 'home',
        mode: 'draft',
        personalizaciones: ES.serialize(),
        base_updated_at: ES.base_updated_at,
      };
      const r = await callEF(body);
      if (r && r.success) {
        ES.setLastDraftSavedAt(new Date());
        syncTiendaCache('draft', r.home); // refresca state.tienda para re-entrar sin recargar
        // Refrescar el iframe del preview para reflejar el draft.
        if (window.TiendaIA?.editorCanvas?.refresh) window.TiendaIA.editorCanvas.refresh();
        // Tocar toolbar para actualizar "Borrador guardado hace ..."
        if (window.TiendaIA?.editorToolbar?.updateButtons) window.TiendaIA.editorToolbar.updateButtons();
      } else if (r && r.error === 'stale_layout') {
        handleStale(r);
      } else if (r && r.error) {
        console.warn('[editor] saveDraft error', r.error);
      }
    } catch (err) {
      console.error('saveDraft error', err);
    } finally {
      ES.markSaving(false);
    }
  }

  async function savePublish() {
    const ES = window.TiendaIA.editorState;
    if (ES.saving) return;
    ES.markSaving(true);
    try {
      const body = {
        tienda_id: ES.tienda_id,
        page_id: 'home',
        mode: 'publish',
        personalizaciones: ES.serialize(),
        base_updated_at: ES.base_updated_at,
      };
      const r = await callEF(body);
      if (r && r.success) {
        ES.markClean(r.updated_at);
        syncTiendaCache('publish', r.home); // refresca state.tienda para re-entrar sin recargar
        if (window.TiendaIA?.editorCanvas?.refresh) window.TiendaIA.editorCanvas.refresh();
        toast('Tienda actualizada ✓', 'success');
      } else if (r && r.error === 'stale_layout') {
        handleStale(r);
      } else {
        toast('No pudimos guardar. Intenta de nuevo.', 'error');
      }
    } catch (err) {
      console.error('savePublish error', err);
      toast('No pudimos guardar. Intenta de nuevo.', 'error');
    } finally {
      ES.markSaving(false);
    }
  }

  async function callEF(body) {
    // fix/preview-cortesia: token fresco (auto-refresh) en vez del cache sincrono stale.
    const token = window.TiendaIA?.getAccessToken
      ? await window.TiendaIA.getAccessToken()
      : null;
    if (!token) {
      console.error('callEF: sin token');
      return { error: 'unauthorized' };
    }
    const r = await fetch(EF_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return await r.json().catch(() => ({ error: 'parse_error' }));
  }

  // Mantiene T.state.tienda.personalizaciones en sync con lo recien guardado, para que
  // re-entrar al editor en la misma sesion (sin recargar la pagina) cargue el dato fresco
  // en vez del valor de carga del admin. savedPage = r.home (pagina autoritativa de la EF,
  // con su updated_at -> evita falsos 409 en el siguiente guardado). draft toca home_draft;
  // publish reemplaza home y borra home_draft (igual que la EF).
  function syncTiendaCache(mode, savedPage) {
    const T = window.TiendaIA;
    if (!T || !T.state || !T.state.tienda || !savedPage) return;
    const cur = T.state.tienda.personalizaciones || { schema_version: 3, pages: {} };
    const draftTheme = T.editorState.serialize().theme; // el theme que se edita ES el borrador
    const next = { schema_version: 3, pages: { ...(cur.pages || {}) } };
    if (mode === 'publish') {
      next.theme = draftTheme;          // promueve
      // theme_draft se elimina (no se copia)
      next.pages.home = savedPage;
      delete next.pages.home_draft;
    } else {
      next.theme = cur.theme;           // preserva el publicado intacto
      next.theme_draft = draftTheme;    // borrador
      next.pages.home_draft = savedPage;
    }
    T.state.tienda.personalizaciones = next;
  }

  // 409 stale_layout: otro dispositivo publico. Avisar y recargar del server.
  function handleStale(r) {
    const ES = window.TiendaIA.editorState;
    const serverPers = r.server_personalizaciones;
    const ok = confirm(
      'Otro dispositivo modifico esta tienda mientras editabas.\n\n' +
      'Aceptar = cargar la version del servidor (perdes los cambios locales sin publicar).\n' +
      'Cancelar = seguir editando (podras reintentar publicar luego).'
    );
    if (ok) {
      if (serverPers) {
        ES.init(serverPers, ES.tienda_id);
        if (window.TiendaIA?.editorCanvas?.reloadFull) window.TiendaIA.editorCanvas.reloadFull();
        toast('Cargamos la version del servidor.', 'info');
      } else {
        toast('No recibimos la version del servidor. Recarga la pagina.', 'error');
      }
    }
  }

  async function markFirstChoice() {
    // window.TiendaIA.supabase es factory: invocar con ?.()
    const supabase = window.TiendaIA?.supabase?.();
    if (!supabase) return;
    const ES = window.TiendaIA.editorState;
    try {
      await supabase
        .from('tiendas')
        .update({ editor_first_choice_at: new Date().toISOString() })
        .eq('id', ES.tienda_id);
    } catch (e) { /* columna opcional; no bloquear */ }
  }

  function handleBack() {
    const ES = window.TiendaIA.editorState;
    if (ES.dirty) {
      if (!confirm('Tenes cambios sin publicar.\n\nTu borrador queda guardado y podras retomarlo cuando vuelvas. Salir igual?')) return;
    }
    window.TiendaIA.navigateTo ? window.TiendaIA.navigateTo('') : (window.location.hash = '#/');
  }

  function toast(msg, kind) {
    if (window.TiendaIA?.toast) window.TiendaIA.toast(msg, kind);
    else console.log('[toast]', kind, msg);
  }

  // Auto-register
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerEditor);
  } else {
    registerEditor();
  }
})(window);
