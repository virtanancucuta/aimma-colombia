/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-modal-catalog.js v2 (SCHEMA v3)
 * Modal de catalogo: 4 esenciales + boton "Mas" que despliega el resto.
 * Cada tipo trae una linea de ayuda en espanol natural CO.
 * Al elegir -> onPick(tipo). Marker: editor-plan4-v3-catalog.
 */
(function(window) {
  'use strict';

  // 4 esenciales (siempre visibles)
  const ESENCIALES = [
    { tipo: 'banner', icon: '★', title: 'Banner principal',
      desc: 'La foto grande y el titulo que ve el cliente al entrar.' },
    { tipo: 'productos', icon: '▦', title: 'Productos',
      desc: 'La grilla con los productos de tu tienda.' },
    { tipo: 'botones', icon: '◉', title: 'Botones',
      desc: 'Botones de accion: WhatsApp, ubicacion, llamar.' },
    { tipo: 'texto', icon: '¶', title: 'Texto',
      desc: 'Un parrafo o titulo para contar algo de tu negocio.' },
  ];

  // Resto (se despliega con "Mas")
  const AVANZADOS = [
    { tipo: 'galeria', icon: '▤', title: 'Galeria',
      desc: 'Varias fotos juntas en grilla, mosaico o carrusel.' },
    { tipo: 'imagen', icon: '▢', title: 'Imagen',
      desc: 'Una sola imagen destacada de tu negocio.' },
    { tipo: 'espacio', icon: '⎵', title: 'Espacio en blanco',
      desc: 'Un respiro vertical entre dos secciones.' },
    { tipo: 'formulario', icon: '✎', title: 'Formulario',
      desc: 'Para que los clientes te dejen sus datos y mensajes.' },
    { tipo: 'video', icon: '▷', title: 'Video o mapa',
      desc: 'Un video de YouTube/Vimeo o un mapa de Google.' },
  ];

  let modalEl = null;

  function open(onPick) {
    if (modalEl) close();
    const E = window.TiendaIA.editorControls.el;

    const grid = E('div', { class: 'ed-catalog-grid', id: 'ed-catalog-grid' });
    ESENCIALES.forEach(item => grid.appendChild(buildCard(E, item, onPick)));

    // Boton "Mas" que inyecta los avanzados.
    const moreBtn = E('button', {
      type: 'button',
      class: 'ed-catalog-more',
      id: 'ed-catalog-more',
      onClick: () => {
        AVANZADOS.forEach(item => grid.appendChild(buildCard(E, item, onPick)));
        moreBtn.remove();
      },
    }, 'Mas opciones (galeria, imagen, espacio, formulario, video o mapa)');

    const modal = E('div', { class: 'ed-modal' }, [
      E('div', { class: 'ed-modal__header' }, [
        E('h3', { class: 'ed-modal__title' }, 'Agrega una seccion'),
        E('button', {
          type: 'button',
          class: 'ed-modal__close',
          'aria-label': 'Cerrar',
          onClick: close,
        }, '×'),
      ]),
      E('div', { class: 'ed-modal__body' }, [grid, moreBtn]),
    ]);

    modalEl = E('div', {
      class: 'ed-modal-backdrop',
      role: 'dialog',
      'aria-modal': 'true',
      onClick: e => { if (e.target === modalEl) close(); },
    }, [modal]);

    document.body.appendChild(modalEl);
    document.addEventListener('keydown', onEsc);
  }

  function buildCard(E, item, onPick) {
    return E('button', {
      type: 'button',
      class: 'ed-catalog-card',
      'data-tipo': item.tipo,
      onClick: () => { close(); onPick(item.tipo); },
    }, [
      E('div', { class: 'ed-catalog-card__icon' }, item.icon),
      E('h4', { class: 'ed-catalog-card__title' }, item.title),
      E('p', { class: 'ed-catalog-card__desc' }, item.desc || ''),
    ]);
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
