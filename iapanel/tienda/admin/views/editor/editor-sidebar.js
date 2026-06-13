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
        (p.enabled ? '' : ' ed-sidebar__page--disabled') +
        (p.depth ? ' ed-sidebar__page--child' : '');
      const attrs = { class: cls };
      // M3: indentacion del arbol (subpaginas anidadas) via padding-left por profundidad.
      if (p.depth) attrs.style = 'padding-left:' + (0.6 + p.depth * 1.1) + 'rem';
      if (!p.enabled && p.hint) attrs.title = p.hint;
      if (p.enabled && !p.active) {
        attrs.onClick = () => state.callbacks.onSwitchPage && state.callbacks.onSwitchPage(p.id);
      }
      const kids = [E('span', { class: 'ed-sidebar__page-label' }, p.label)];
      // M2/M3: renombrar paginas EN BLANCO y nodos COLECCION (nodeId presente). El slug/ruta NO cambia.
      if (p.nodeId && state.callbacks.onRenamePage) {
        kids.push(E('button', {
          type: 'button', class: 'ed-sidebar__page-rename', title: 'Renombrar pagina',
          onClick: (e) => { e.stopPropagation(); state.callbacks.onRenamePage(p.nodeId, p.label); },
        }, '✎'));
      }
      container.appendChild(E('div', attrs, kids));
    });
    // M3: aviso "plantilla global" cuando la pagina activa es una Coleccion (editar afecta a TODAS).
    const activePg = pages.find((p) => p.active);
    if (activePg && activePg.tipo === 'coleccion') {
      container.appendChild(E('p', {
        class: 'ed-sidebar__note',
        style: 'font-size:0.72rem;line-height:1.35;color:#64748b;background:#f1f5f9;border-radius:6px;padding:0.45rem 0.6rem;margin:0.4rem 0 0;',
      }, 'Editas la plantilla de Coleccion: los cambios aplican a TODAS las colecciones. El preview muestra esta categoria.'));
    }
    // M3: agregar pagina -> selector de tipo (En blanco / Coleccion). Coleccion abre el picker de
    // "categorias sin pagina" (D3). El area maneja su estado local; un alta dispara 'nav' -> rebuild -> resetea.
    if (state.callbacks.onAddBlankPage || state.callbacks.onAddColeccion) {
      const addHost = E('div', { class: 'ed-sidebar__add-host' });
      container.appendChild(addHost);
      renderAddArea(addHost);
    }

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

  // M3: area "Agregar pagina" con estado local (closed -> menu de tipo -> picker de coleccion).
  function renderAddArea(host) {
    const E = window.TiendaIA.editorControls.el;
    const cb = state.callbacks;
    const opt = (label, onClick) => E('button', { type: 'button', class: 'ed-sidebar__add-page', style: 'margin-top:0.3rem', onClick: onClick }, label);
    const link = (label, onClick) => E('button', { type: 'button', class: 'ed-sidebar__add-cancel', style: 'background:none;border:none;color:#64748b;font-size:0.74rem;cursor:pointer;padding:0.35rem 0;text-decoration:underline', onClick: onClick }, label);
    let mode = 'closed';
    const draw = () => {
      host.innerHTML = '';
      if (mode === 'closed') {
        host.appendChild(E('button', { type: 'button', class: 'ed-sidebar__add-page', onClick: () => { mode = 'menu'; draw(); } }, '+ Agregar pagina'));
        return;
      }
      if (mode === 'menu') {
        const kids = [];
        if (cb.onAddBlankPage) kids.push(opt('Pagina en blanco', () => { mode = 'closed'; draw(); cb.onAddBlankPage(); }));
        if (cb.onAddColeccion) kids.push(opt('Pagina de coleccion', () => { mode = 'coleccion'; draw(); }));
        kids.push(link('Cancelar', () => { mode = 'closed'; draw(); }));
        host.appendChild(E('div', { class: 'ed-sidebar__add-menu' }, kids));
        return;
      }
      // mode === 'coleccion': picker de categorias SIN pagina (D3)
      const cats = (cb.getCategoriasSinPagina && cb.getCategoriasSinPagina()) || [];
      const kids = [E('p', { class: 'ed-sidebar__title', style: 'margin:0.4rem 0 0.2rem;font-size:0.72rem' }, 'Categorias sin pagina')];
      if (!cats.length) {
        kids.push(E('p', { style: 'font-size:0.72rem;color:#64748b;margin:0.2rem 0' }, 'Todas tus categorias ya estan en el arbol.'));
      } else {
        cats.forEach((c) => {
          kids.push(E('div', { class: 'ed-sidebar__add-cat', style: 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.25rem 0' }, [
            E('span', { style: 'font-size:0.78rem;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, c.nombre + (c.esSub ? ' · sub' : '')),
            E('button', { type: 'button', class: 'ed-sidebar__add-cat-btn', style: 'flex:none;font-size:0.72rem;padding:0.2rem 0.55rem;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer', onClick: () => { mode = 'closed'; draw(); cb.onAddColeccion(c.id); } }, 'Agregar'),
          ]));
        });
      }
      kids.push(link('Volver', () => { mode = 'menu'; draw(); }));
      host.appendChild(E('div', { class: 'ed-sidebar__add-menu' }, kids));
    };
    draw();
  }

  function bindStateListeners() {
    const ES = window.TiendaIA.editorState;
    ES.subscribe('sections', rebuild);
    ES.subscribe('selection', rebuild);
    ES.subscribe('nav', rebuild); // M2: agregar/renombrar pagina -> re-render del switcher
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorSidebar = { render };
})(window);
