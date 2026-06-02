/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-toolbar.js v2 (SCHEMA v3)
 * Top toolbar: Volver | Escritorio/Celular | Undo/Redo | Vista previa | Guardar
 * Atajos: Ctrl+Z (undo), Ctrl+Shift+Z (redo), Ctrl+S (publicar), Esc (deselect).
 * "Vista previa" abre el preview_url en nueva pestana. Desktop/Mobile cambia el
 * ancho simulado del contenedor del iframe (data-device en #editor-canvas).
 * Marker: editor-plan4-v3-toolbar.
 */
(function(window) {
  'use strict';

  const state = { container: null, callbacks: {}, keyHandler: null };

  function render(container, callbacks) {
    state.container = container;
    state.callbacks = callbacks || {};
    const E = window.TiendaIA.editorControls.el;

    const btnBack = E('button', { type: 'button', class: 'ed-toolbar__btn',
      onClick: () => callbacks.onBack && callbacks.onBack() }, '← Volver');

    const btnDesktop = E('button', { type: 'button', class: 'ed-toolbar__btn ed-toolbar__btn--primary',
      'data-device': 'desktop',
      onClick: () => setDevice('desktop') }, 'Escritorio');
    const btnMobile = E('button', { type: 'button', class: 'ed-toolbar__btn ed-toolbar__btn--ghost',
      'data-device': 'mobile',
      onClick: () => setDevice('mobile') }, 'Celular');

    const btnUndo = E('button', { type: 'button', class: 'ed-toolbar__btn',
      id: 'ed-toolbar-undo', title: 'Deshacer (Ctrl+Z)',
      onClick: () => callbacks.onUndo && callbacks.onUndo() }, '↶');
    const btnRedo = E('button', { type: 'button', class: 'ed-toolbar__btn',
      id: 'ed-toolbar-redo', title: 'Rehacer (Ctrl+Shift+Z)',
      onClick: () => callbacks.onRedo && callbacks.onRedo() }, '↷');

    const btnPreview = E('button', {
      type: 'button',
      class: 'ed-toolbar__btn ed-toolbar__btn--ghost',
      id: 'ed-toolbar-preview',
      title: 'Abre tu tienda en una pestana nueva',
      onClick: () => callbacks.onPreview && callbacks.onPreview(),
    }, 'Vista previa');

    const btnSave = E('button', {
      type: 'button',
      class: 'ed-toolbar__btn ed-toolbar__btn--primary',
      id: 'ed-toolbar-save',
      onClick: () => callbacks.onSave && callbacks.onSave(),
    }, 'Publicar');

    const saveInfo = E('span', { class: 'ed-toolbar__save-info', id: 'ed-toolbar-save-info' });

    const left = E('div', { class: 'ed-toolbar__group' }, [btnBack]);
    const center = E('div', { class: 'ed-toolbar__group' }, [btnDesktop, btnMobile, btnUndo, btnRedo]);
    const right = E('div', { class: 'ed-toolbar__group' }, [btnPreview, saveInfo, btnSave]);

    container.innerHTML = '';
    container.appendChild(left);
    container.appendChild(center);
    container.appendChild(right);

    updateButtons();
    bindKeyboard();
    bindStateListeners();
  }

  function setDevice(d) {
    const canvas = document.getElementById('editor-canvas');
    if (canvas) canvas.setAttribute('data-device', d);
    if (window.TiendaIA?.editorCanvas?.setDevice) {
      window.TiendaIA.editorCanvas.setDevice(d);
    }
    if (state.container) {
      state.container.querySelectorAll('[data-device]').forEach(b => {
        const active = b.getAttribute('data-device') === d;
        b.classList.toggle('ed-toolbar__btn--primary', active);
        b.classList.toggle('ed-toolbar__btn--ghost', !active);
      });
    }
  }

  function updateButtons() {
    const ES = window.TiendaIA.editorState;
    const undoBtn = document.getElementById('ed-toolbar-undo');
    const redoBtn = document.getElementById('ed-toolbar-redo');
    const saveBtn = document.getElementById('ed-toolbar-save');
    const saveInfo = document.getElementById('ed-toolbar-save-info');

    if (undoBtn) undoBtn.disabled = !ES.canUndo();
    if (redoBtn) redoBtn.disabled = !ES.canRedo();

    if (saveBtn) {
      if (ES.saving) {
        saveBtn.textContent = 'Guardando...';
        saveBtn.disabled = true;
      } else if (ES.dirty) {
        saveBtn.innerHTML = 'Publicar <span class="ed-toolbar__badge"></span>';
        saveBtn.disabled = false;
      } else {
        saveBtn.textContent = 'Publicado ✓';
        saveBtn.disabled = false;
      }
    }
    if (saveInfo) {
      const last = ES.lastDraftSavedAt;
      saveInfo.textContent = last ? 'Borrador guardado ' + formatRelative(last) : '';
    }
  }

  function bindStateListeners() {
    const ES = window.TiendaIA.editorState;
    ES.subscribe('dirty', updateButtons);
    ES.subscribe('saving', updateButtons);
    ES.subscribe('sections', updateButtons);
  }

  function isTypingInField(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  function bindKeyboard() {
    if (state.keyHandler) document.removeEventListener('keydown', state.keyHandler);
    state.keyHandler = function(e) {
      const editorEl = document.querySelector('.ed-view');
      if (!editorEl) return;
      if (isTypingInField(e.target)) {
        // Permitir Ctrl+S y Esc incluso escribiendo; el resto no.
        if (!((e.ctrlKey || e.metaKey) && e.key === 's') && e.key !== 'Escape') return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const cbs = state.callbacks;

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        cbs.onUndo && cbs.onUndo();
      } else if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        cbs.onRedo && cbs.onRedo();
      } else if (mod && e.key === 's') {
        e.preventDefault();
        cbs.onSave && cbs.onSave();
      } else if (e.key === 'Escape') {
        cbs.onDeselect && cbs.onDeselect();
      }
    };
    document.addEventListener('keydown', state.keyHandler);
  }

  function unbindKeyboard() {
    if (state.keyHandler) {
      document.removeEventListener('keydown', state.keyHandler);
      state.keyHandler = null;
    }
  }

  function formatRelative(date) {
    if (!date) return '';
    const ms = Date.now() - new Date(date).getTime();
    const s = Math.round(ms / 1000);
    if (s < 60) return 'hace ' + s + ' s';
    const m = Math.round(s / 60);
    if (m < 60) return 'hace ' + m + ' min';
    return new Date(date).toLocaleString('es-CO');
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorToolbar = { render, updateButtons, unbindKeyboard };
})(window);
