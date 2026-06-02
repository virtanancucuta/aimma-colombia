/* AIMMA Editor PRO-MAX Plan 3 · editor-modal-catalog.js v1
 * Modal con 8 thumbnails para elegir tipo de seccion a agregar.
 */
(function(window) {
  'use strict';

  const CATALOG = [
    { tipo: 'hero', icon: '🎯', title: 'Banner principal',
      desc: 'Encabezado grande con título, descripción y botón' },
    { tipo: 'texto', icon: '📝', title: 'Texto',
      desc: 'Párrafo descriptivo o título secundario' },
    { tipo: 'imagen', icon: '🖼', title: 'Imagen',
      desc: 'Una imagen destacada de tu negocio' },
    { tipo: 'botones', icon: '🔘', title: 'Botones',
      desc: 'Fila de botones (WhatsApp, ubicación, llamar)' },
    { tipo: 'productos', icon: '🛍', title: 'Productos',
      desc: 'Grilla con los productos de tu tienda' },
    { tipo: 'galeria', icon: '📷', title: 'Galería',
      desc: 'Varias imágenes en grilla o carrusel' },
    { tipo: 'espaciador', icon: '⬚', title: 'Espacio en blanco',
      desc: 'Separador vertical entre secciones' },
    { tipo: 'formulario', icon: '✉', title: 'Formulario',
      desc: 'Para que los clientes te dejen mensajes' },
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
        E('p', { class: 'ed-catalog-card__desc' }, item.desc || ''),
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
