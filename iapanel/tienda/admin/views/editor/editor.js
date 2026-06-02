/* AIMMA Editor PRO-MAX Plan 3 · editor.js v1
 * Entry. Monta UI 3 paneles, conecta callbacks, maneja auto-save + save manual.
 * Registra vista 'editor' en admin.js via window.TiendaIA.registerView.
 */
(function(window) {
  'use strict';

  const EF_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-guardar-layout';

  const state = {
    autoSaveTimer: null,
    AUTO_SAVE_MS: 30000,
    mounted: false,
  };

  // Registrar como view del panel admin
  function registerEditor() {
    if (!window.TiendaIA || !window.TiendaIA.registerView) {
      console.warn('editor.js: registerView no disponible aun, reintentando...');
      setTimeout(registerEditor, 200);
      return;
    }
    window.TiendaIA.registerView('editor', {
      render: mountEditor,
      cleanup: unmountEditor,
    });
  }

  async function mountEditor(container, ctx) {
    const tienda = ctx.state.tienda;
    if (!tienda) {
      container.innerHTML = '<div style="padding:2rem">No hay tienda asociada.</div>';
      return;
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
    shell.appendChild(canvasEl);

    const inspectorEl = document.createElement('aside');
    inspectorEl.className = 'ed-inspector';
    inspectorEl.id = 'editor-inspector';
    shell.appendChild(inspectorEl);

    // Init state
    window.TiendaIA.editorState.init(tienda.personalizaciones, tienda.id);
    window.TiendaIA.editorState.subscribe('dirty', onDirtyChange);

    // Render paneles
    window.TiendaIA.editorToolbar.render(toolbarEl, {
      onBack: () => handleBack(ctx),
      onUndo: () => window.TiendaIA.editorState.undo(),
      onRedo: () => window.TiendaIA.editorState.redo(),
      onSave: () => savePublish(ctx),
      onDeselect: () => window.TiendaIA.editorState.deselect(),
      onDelete: () => {
        const sel = window.TiendaIA.editorState.selection;
        if (!sel) return;
        if (!confirm('¿Eliminar el elemento seleccionado?')) return;
        if (sel.tipo === 'element') window.TiendaIA.editorState.removeElement(sel.id);
        else window.TiendaIA.editorState.removeSection(sel.id);
      },
    });

    window.TiendaIA.editorSidebar.render(sidebarEl, {
      onAddSection: () => openCatalogForSection(ctx),
    });

    window.TiendaIA.editorCanvas.render(canvasEl, {
      onAddSection: () => openCatalogForSection(ctx),
    });

    window.TiendaIA.editorInspector.render(inspectorEl, {
      onAddElement: (sectionId) => openCatalogForElement(sectionId),
    });

    // First-use check
    if (!tienda.editor_first_choice_at) {
      window.TiendaIA.editorFirstUse.showFirstUseModal((choice) => {
        if (choice === 'starter') {
          const starter = window.TiendaIA.editorFirstUse.createStarterPage();
          starter.forEach(sec => window.TiendaIA.editorState.sections.push(sec));
          window.TiendaIA.editorState.pushSnapshot();
          window.TiendaIA.editorState.markDirty();
          window.TiendaIA.editorCanvas.rebuild();
        }
        markFirstChoice(ctx);
        if (!tienda.editor_tour_visto_at) {
          window.TiendaIA.editorFirstUse.showTour(() => markTourSeen(ctx));
        }
      });
    } else if (!tienda.editor_tour_visto_at) {
      window.TiendaIA.editorFirstUse.showTour(() => markTourSeen(ctx));
    }

    state.mounted = true;

    // Warn al salir si dirty
    window.addEventListener('beforeunload', beforeUnloadGuard);
  }

  function unmountEditor() {
    state.mounted = false;
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    window.removeEventListener('beforeunload', beforeUnloadGuard);
  }

  function beforeUnloadGuard(e) {
    if (window.TiendaIA.editorState.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  function onDirtyChange(dirty) {
    if (!dirty) return;
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = setTimeout(saveDraft, state.AUTO_SAVE_MS);
  }

  function openCatalogForSection(ctx) {
    window.TiendaIA.editorModalCatalog.open((tipo) => {
      window.TiendaIA.editorState.insertSection(tipo);
    });
  }

  function openCatalogForElement(sectionId) {
    window.TiendaIA.editorModalCatalog.open((tipo) => {
      window.TiendaIA.editorState.insertElement(sectionId, tipo);
    });
  }

  // ============================================================
  // Save
  // ============================================================
  async function saveDraft() {
    const ES = window.TiendaIA.editorState;
    if (ES.saving) return;
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
        toast('Borrador guardado', 'info');
      }
    } catch (err) {
      console.error('saveDraft error', err);
    } finally {
      ES.markSaving(false);
    }
  }

  async function savePublish(ctx) {
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
        toast('Tienda actualizada ✓', 'success');
      } else if (r && r.error === 'stale_layout') {
        showConflictModal(r.server_personalizaciones);
      } else {
        toast('No pudimos guardar. Intentá de nuevo.', 'error');
      }
    } finally {
      ES.markSaving(false);
    }
  }

  async function callEF(body) {
    const session = window.TiendaIA?.getSession && window.TiendaIA.getSession();
    const token = session?.access_token;
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

  function showConflictModal(serverPers) {
    if (confirm('Otro dispositivo modificó esta tienda. ¿Cargar la versión del servidor y perder tus cambios locales?')) {
      const ES = window.TiendaIA.editorState;
      const home = serverPers?.pages?.home;
      if (home) {
        ES.init(serverPers, ES.tienda_id);
      }
    }
  }

  async function markFirstChoice(ctx) {
    const supabase = window.TiendaIA?.supabase;
    if (!supabase) return;
    const ES = window.TiendaIA.editorState;
    await supabase
      .from('tiendas')
      .update({ editor_first_choice_at: new Date().toISOString() })
      .eq('id', ES.tienda_id);
  }

  async function markTourSeen(ctx) {
    const supabase = window.TiendaIA?.supabase;
    if (!supabase) return;
    const ES = window.TiendaIA.editorState;
    await supabase
      .from('tiendas')
      .update({ editor_tour_visto_at: new Date().toISOString() })
      .eq('id', ES.tienda_id);
  }

  function handleBack(ctx) {
    const ES = window.TiendaIA.editorState;
    if (ES.dirty) {
      if (!confirm('Tenés cambios sin publicar.\n\nTu borrador queda guardado y podrás retomarlo cuando vuelvas. ¿Salir igual?')) return;
    }
    window.location.hash = '#/';
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
