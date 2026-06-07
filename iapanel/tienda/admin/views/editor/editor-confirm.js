/* AIMMA Tienda IA · Editor PRO-MAX · C.2 Paso 1 · editor-confirm.js
 * Modal de confirmacion del ADMIN (los dialogos son UI del admin; el storefront no lleva modales).
 * Doble red del borrado: el modal PREVIENE (CANCELAR = default seguro/prominente, foco inicial;
 * ELIMINAR = estilo de advertencia, deliberado) + el borrado va por removeSection (UNDO-able).
 * Un mensaje section-action(remove) SOLO abre este modal; el borrado exige el click humano.
 * Marker: editor-c2-confirm.
 */
(function(window) {
  'use strict';

  let active = null; // { overlay, keyHandler }

  function close() {
    if (!active) return;
    document.removeEventListener('keydown', active.keyHandler, true);
    if (active.overlay && active.overlay.parentNode) active.overlay.parentNode.removeChild(active.overlay);
    active = null;
  }

  function open(opts) {
    close(); // un modal a la vez
    opts = opts || {};

    const overlay = document.createElement('div');
    overlay.className = 'ed-confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'ed-confirm';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');

    const h = document.createElement('h3');
    h.className = 'ed-confirm__title';
    h.textContent = opts.title || 'Confirmar';

    const p = document.createElement('p');
    p.className = 'ed-confirm__msg';
    p.textContent = opts.message || '';

    const actions = document.createElement('div');
    actions.className = 'ed-confirm__actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ed-confirm__btn ed-confirm__btn--cancel';
    cancel.textContent = opts.cancelLabel || 'Cancelar';
    cancel.addEventListener('click', close);

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'ed-confirm__btn ' + (opts.danger ? 'ed-confirm__btn--danger' : 'ed-confirm__btn--primary');
    confirm.textContent = opts.confirmLabel || 'Aceptar';
    confirm.addEventListener('click', function() {
      close();
      if (typeof opts.onConfirm === 'function') opts.onConfirm();
    });

    // CANCELAR a la izquierda (default seguro/prominente, recibe el foco); ELIMINAR a la derecha.
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    dialog.appendChild(h);
    dialog.appendChild(p);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    // Click fuera del dialogo -> cancelar (cae en el default seguro).
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

    const keyHandler = function(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    document.addEventListener('keydown', keyHandler, true);

    document.body.appendChild(overlay);
    active = { overlay: overlay, keyHandler: keyHandler };
    // El foco en CANCELAR -> un Enter accidental cancela (no elimina).
    try { cancel.focus(); } catch (e) { /* noop */ }
  }

  function removeSection(id) {
    open({
      title: '¿Eliminar esta sección?',
      message: 'Se quitará de tu página. Podrás recuperarla con el botón Deshacer de la barra.',
      cancelLabel: 'Cancelar',
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: function() {
        if (window.TiendaIA && window.TiendaIA.editorState) {
          window.TiendaIA.editorState.removeSection(id);
        }
      },
    });
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorConfirm = { open: open, removeSection: removeSection, close: close };
})(window);
