/* AIMMA Editor PRO-MAX Plan 3 · editor-sidebar.js v1
 * Sidebar izquierdo: Pages section + Outline de sections actuales + boton +Agregar.
 */
(function(window) {
  'use strict';

  const SECTION_LABELS = {
    hero: 'Banner principal', texto: 'Texto', imagen: 'Imagen',
    botones: 'Botones', productos: 'Productos', galeria: 'Galería',
    espaciador: 'Espacio en blanco', formulario: 'Formulario',
  };

  const state = { container: null, callbacks: {} };

  function render(container, callbacks) {
    state.container = container;
    state.callbacks = callbacks || {};
    rebuild();
    bindStateListeners();
  }

  function rebuild() {
    const E = window.TiendaIA.editorControls.el;
    const ES = window.TiendaIA.editorState;
    const container = state.container;

    container.innerHTML = '';

    // Pages section
    container.appendChild(E('p', { class: 'ed-sidebar__title' }, 'Páginas'));
    container.appendChild(E('div', { class: 'ed-sidebar__page ed-sidebar__page--active' }, '🏠 Inicio'));

    // Outline section
    container.appendChild(E('p', { class: 'ed-sidebar__title', style: 'margin-top:1.25rem' }, 'Secciones'));
    const outline = E('ul', { class: 'ed-sidebar__outline' });
    const sel = ES.selection;
    ES.sections.forEach((sec, idx) => {
      const label = SECTION_LABELS[sec.tipo] || sec.tipo;
      const item = E('li', {
        class: 'ed-sidebar__outline-item' +
          (sel && sel.tipo === 'section' && sel.id === sec.id ? ' ed-sidebar__outline-item--selected' : ''),
        'data-section-id': sec.id,
        onClick: () => ES.select('section', sec.id),
      }, (idx + 1) + '. ' + label);
      outline.appendChild(item);
    });
    container.appendChild(outline);

    // Boton +Agregar seccion
    const addBtn = E('button', {
      type: 'button',
      class: 'ed-sidebar__add-btn',
      onClick: () => state.callbacks.onAddSection && state.callbacks.onAddSection(),
    }, '+ Agregar sección');
    container.appendChild(addBtn);
  }

  function bindStateListeners() {
    const ES = window.TiendaIA.editorState;
    ES.subscribe('sections', rebuild);
    ES.subscribe('selection', rebuild);
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorSidebar = { render };
})(window);
