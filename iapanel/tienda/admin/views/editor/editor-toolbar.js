/* AIMMA Editor PRO-MAX Plan 3 · editor-toolbar.js v1
 * Top toolbar (56px): Volver | Desktop/Mobile | Undo/Redo | IA | Guardar
 * + Atajos teclado: Ctrl+Z (undo), Ctrl+Shift+Z (redo), Ctrl+S (save), Esc (deselect), Del (remove)
 */
(function(window) {
  'use strict';

  const state = { container: null, callbacks: {} };

  function render(container, callbacks) {
    state.container = container;
    state.callbacks = callbacks || {};
    const E = window.TiendaIA.editorControls.el;

    const btnBack = E('button', { type: 'button', class: 'ed-toolbar__btn',
      onClick: () => callbacks.onBack && callbacks.onBack() }, '← Volver');

    const btnDesktop = E('button', { type: 'button', class: 'ed-toolbar__btn ed-toolbar__btn--ghost',
      'data-device': 'desktop',
      onClick: () => setDevice('desktop') }, 'Escritorio');
    const btnMobile = E('button', { type: 'button', class: 'ed-toolbar__btn ed-toolbar__btn--ghost',
      'data-device': 'mobile',
      onClick: () => setDevice('mobile') }, 'Celular');

    const btnUndo = E('button', { type: 'button', class: 'ed-toolbar__btn',
      id: 'ed-toolbar-undo',
      onClick: () => callbacks.onUndo && callbacks.onUndo() }, '↶');
    const btnRedo = E('button', { type: 'button', class: 'ed-toolbar__btn',
      id: 'ed-toolbar-redo',
      onClick: () => callbacks.onRedo && callbacks.onRedo() }, '↷');

    const btnIA = E('button', {
      type: 'button',
      class: 'ed-toolbar__btn ed-toolbar__btn--ghost',
      disabled: 'true',
      title: 'Próximamente — Plan 4',
    }, '✨ Generar con IA');

    const btnSave = E('button', {
      type: 'button',
      class: 'ed-toolbar__btn ed-toolbar__btn--primary',
      id: 'ed-toolbar-save',
      onClick: () => callbacks.onSave && callbacks.onSave(),
    }, 'Guardar');

    const saveInfo = E('span', { class: 'ed-toolbar__save-info', id: 'ed-toolbar-save-info' });

    const left = E('div', { class: 'ed-toolbar__group' }, [btnBack]);
    const center = E('div', { class: 'ed-toolbar__group' }, [btnDesktop, btnMobile, btnUndo, btnRedo]);
    const right = E('div', { class: 'ed-toolbar__group' }, [btnIA, btnSave, saveInfo]);

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
    state.container.querySelectorAll('[data-device]').forEach(b => {
      b.classList.toggle('ed-toolbar__btn--primary', b.getAttribute('data-device') === d);
      b.classList.toggle('ed-toolbar__btn--ghost', b.getAttribute('data-device') !== d);
    });
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
        saveBtn.innerHTML = 'Guardar <span class="ed-toolbar__badge"></span>';
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
    document.addEventListener('keydown', e => {
      const editorEl = document.querySelector('.ed-view');
      if (!editorEl || editorEl.hidden) return;
      if (isTypingInField(e.target)) return;

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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') &&
                 window.TiendaIA.editorState.selection) {
        e.preventDefault();
        cbs.onDelete && cbs.onDelete();
      }
    });
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
  window.TiendaIA.editorToolbar = { render, updateButtons };
})(window);
