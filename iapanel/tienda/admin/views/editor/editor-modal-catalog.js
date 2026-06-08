/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-modal-catalog.js v2 (SCHEMA v3)
 * Modal de catalogo: 4 esenciales + boton "Mas" que despliega el resto.
 * Cada tipo trae una linea de ayuda en espanol natural CO.
 * Al elegir -> onPick(tipo). Marker: editor-plan4-v3-catalog.
 */
(function(window) {
  'use strict';

  // Fase A.1: el catalogo deriva del registro unico section-defs.js (label + catalog).
  // El ORDEN se preserva explicito (identico al hardcode anterior).
  const D = window.TiendaIA.editorSectionDefs.defs;
  const toCard = (tipo) => ({ tipo, icon: D[tipo].catalog.icon, title: D[tipo].label, desc: D[tipo].catalog.desc });
  const ESENCIALES = ['banner', 'productos', 'botones', 'texto', 'imagen_con_texto'].map(toCard);
  const AVANZADOS = ['galeria', 'imagen', 'caracteristicas', 'cita', 'testimonios', 'faq', 'logos', 'categorias_destacadas', 'producto_destacado', 'espacio', 'formulario', 'video'].map(toCard);

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
    }, 'Mas opciones (galeria, imagen, caracteristicas, cita, testimonios, faq, logos, categorias destacadas, producto destacado, espacio, formulario, video)');

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
