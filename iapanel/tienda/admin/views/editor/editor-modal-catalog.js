/* AIMMA Editor PRO-MAX Plan 3 · editor-modal-catalog.js v1
 * Modal con 8 thumbnails para elegir tipo de seccion a agregar.
 */
(function(window) {
  'use strict';

  const CATALOG = [
    { tipo: 'hero', icon: '🎯', title: 'Hero banner' },
    { tipo: 'texto', icon: '📝', title: 'Texto rico' },
    { tipo: 'imagen', icon: '🖼', title: 'Imagen banner' },
    { tipo: 'botones', icon: '🔘', title: 'Botones de acción' },
    { tipo: 'productos', icon: '🛍', title: 'Productos' },
    { tipo: 'galeria', icon: '📷', title: 'Galería' },
    { tipo: 'espaciador', icon: '⬚', title: 'Espaciador' },
    { tipo: 'formulario', icon: '✉', title: 'Formulario' },
  ];

  let modalEl = null;

  function open(onPick) {
    if (modalEl) close();
    const E = window.TiendaIA.editorControls.el;

    const grid = E('div', { class: 'ed-catalog-grid' });
    CATALOG.forEach(item => {
      const card = E('button', {
        type: 'button',
        class: 'ed-catalog-card',
        'data-tipo': item.tipo,
        onClick: () => {
          close();
          onPick(item.tipo);
        },
      }, [
        E('div', { class: 'ed-catalog-card__icon' }, item.icon),
        E('h4', { class: 'ed-catalog-card__title' }, item.title),
      ]);
      grid.appendChild(card);
    });

    const modal = E('div', { class: 'ed-modal' }, [
      E('div', { class: 'ed-modal__header' }, [
        E('h3', { class: 'ed-modal__title' }, 'Agregá una sección'),
        E('button', {
          type: 'button',
          class: 'ed-modal__close',
          'aria-label': 'Cerrar',
          onClick: close,
        }, '×'),
      ]),
      E('div', { class: 'ed-modal__body' }, [grid]),
    ]);

    modalEl = E('div', {
      class: 'ed-modal-backdrop',
      role: 'dialog',
      onClick: e => { if (e.target === modalEl) close(); },
    }, [modal]);

    document.body.appendChild(modalEl);
    document.addEventListener('keydown', onEsc);
  }

  function close() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) {
    if (e.key === 'Escape') close();
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorModalCatalog = { open, close };
})(window);
