/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-sidebar.js v2 (SCHEMA v3)
 * Panel izquierdo: lista de secciones REORDENABLE con SortableJS (handle ⋮⋮).
 * El orden del array = orden vertical. Click en item -> select. Boton +Agregar -> catalogo.
 * Marker: editor-plan4-v3-sidebar.
 */
(function(window) {
  'use strict';

  const SECTION_LABELS = {
    banner: 'Banner principal', texto: 'Texto', imagen: 'Imagen',
    botones: 'Botones', productos: 'Productos', galeria: 'Galeria',
    formulario: 'Formulario', espacio: 'Espacio en blanco', video: 'Video o mapa',
  };

  const state = { container: null, callbacks: {}, sortable: null, listEl: null };

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

    if (state.sortable) { try { state.sortable.destroy(); } catch (e) {} state.sortable = null; }
    container.innerHTML = '';

    // Encabezado Paginas + switcher (L3). getPages() viene de editor.js (Inicio / Coleccion / ...).
    container.appendChild(E('p', { class: 'ed-sidebar__title' }, 'Paginas'));
    const pages = (state.callbacks.getPages && state.callbacks.getPages()) ||
      [{ id: 'home', label: 'Inicio', enabled: true, active: true }];
    pages.forEach((p) => {
      const cls = 'ed-sidebar__page' +
        (p.active ? ' ed-sidebar__page--active' : '') +
        (p.enabled ? '' : ' ed-sidebar__page--disabled');
      const attrs = { class: cls };
      if (!p.enabled && p.hint) attrs.title = p.hint;
      if (p.enabled && !p.active) {
        attrs.onClick = () => state.callbacks.onSwitchPage && state.callbacks.onSwitchPage(p.id);
      }
      container.appendChild(E('div', attrs, p.label));
    });

    // Encabezado Secciones
    container.appendChild(E('p', { class: 'ed-sidebar__title', style: 'margin-top:1.25rem' }, 'Secciones'));

    const list = E('ul', { class: 'ed-sidebar__outline', id: 'editor-sidebar-list' });
    const sel = ES.selection;
    ES.sections.forEach((sec) => {
      const label = SECTION_LABELS[sec.tipo] || sec.tipo;
      const item = E('li', {
        class: 'ed-sidebar__outline-item' +
          (sel && sel.sectionId === sec.id ? ' ed-sidebar__outline-item--selected' : ''),
        'data-section-id': sec.id,
      }, [
        E('span', {
          class: 'ed-sidebar__handle',
          'aria-label': 'Mover seccion',
          title: 'Arrastra para reordenar',
        }, '⋮⋮'),
        E('span', {
          class: 'ed-sidebar__outline-label',
          onClick: () => {
            ES.select(sec.id);
            openInspectorDrawer();
          },
        }, label),
      ]);
      list.appendChild(item);
    });
    container.appendChild(list);
    state.listEl = list;

    if (ES.sections.length === 0) {
      container.appendChild(E('p', { class: 'ed-sidebar__empty' },
        'Tu pagina no tiene secciones todavia. Agrega la primera abajo.'));
    }

    // SortableJS reorder (vendorizado en lib/sortable.min.js)
    if (window.Sortable && ES.sections.length > 1) {
      state.sortable = new window.Sortable(list, {
        handle: '.ed-sidebar__handle',
        animation: 180,
        ghostClass: 'ed-sidebar__outline-item--ghost',
        onEnd: (evt) => {
          if (evt.oldIndex !== evt.newIndex && evt.oldIndex != null && evt.newIndex != null) {
            ES.reorderSections(evt.oldIndex, evt.newIndex);
          }
        },
      });
    }

    // Boton +Agregar seccion
    const addBtn = E('button', {
      type: 'button',
      class: 'ed-sidebar__add-btn',
      onClick: () => state.callbacks.onAddSection && state.callbacks.onAddSection(),
    }, '+ Agregar seccion');
    container.appendChild(addBtn);
  }

  function openInspectorDrawer() {
    const insp = document.getElementById('editor-inspector');
    if (insp && window.matchMedia('(max-width: 1100px)').matches) {
      insp.classList.add('ed-inspector--open');
    }
  }

  function bindStateListeners() {
    const ES = window.TiendaIA.editorState;
    ES.subscribe('sections', rebuild);
    ES.subscribe('selection', rebuild);
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorSidebar = { render };
})(window);
