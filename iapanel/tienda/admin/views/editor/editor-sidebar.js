/* AIMMA Tienda IA · Editor PRO-MAX · editor-sidebar.js (SCHEMA v3)
 * Panel izquierdo: switcher de Paginas (arbol nav) + lista de Secciones REORDENABLE (SortableJS).
 * M4: cada nodo (salvo Inicio) tiene un menu "⋮" con Renombrar / Subir / Bajar / Mostrar-Ocultar /
 *     Agregar subpagina (solo top-level). "Agregar pagina/subpagina" reusa renderAddArea(host, parentId).
 * Marker: editor-plan4-v3-sidebar.
 */
(function(window) {
  'use strict';

  const SECTION_LABELS = {
    banner: 'Banner principal', texto: 'Texto', imagen: 'Imagen',
    botones: 'Botones', productos: 'Productos', galeria: 'Galeria',
    formulario: 'Formulario', espacio: 'Espacio en blanco', video: 'Video o mapa',
  };

  const state = { container: null, callbacks: {}, sortable: null, listEl: null,
    openActionsId: null, openSubAddId: null, lastActiveKey: null };

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

    // Encabezado Paginas + switcher (arbol). getPages() viene de editor.js.
    container.appendChild(E('p', { class: 'ed-sidebar__title' }, 'Paginas'));
    const pages = (state.callbacks.getPages && state.callbacks.getPages()) ||
      [{ id: 'home', label: 'Inicio', enabled: true, active: true }];

    // M4: si cambio la pagina activa (switch / alta de subpagina), cerramos los paneles de acciones.
    const activeKey = (pages.find((p) => p.active) || {}).id || 'home';
    if (activeKey !== state.lastActiveKey) { state.openActionsId = null; state.openSubAddId = null; state.lastActiveKey = activeKey; }

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
      const labelStyle = (p.mostrar === false) ? 'opacity:0.5' : '';
      const kids = [E('span', { class: 'ed-sidebar__page-label', style: labelStyle, title: p.mostrar === false ? 'Oculta del menu' : '' }, p.label + (p.mostrar === false ? '  (oculta)' : ''))];
      // M4: menu "⋮" de acciones del nodo (Inicio no tiene nodeId -> no acciones).
      if (p.nodeId && hasNodeActions()) {
        kids.push(E('button', {
          type: 'button', class: 'ed-sidebar__page-kebab', title: 'Acciones de la pagina',
          style: 'flex:none;background:none;border:none;cursor:pointer;font-size:1rem;color:#64748b;padding:0 0.3rem',
          onClick: (e) => { e.stopPropagation(); state.openActionsId = (state.openActionsId === p.nodeId ? null : p.nodeId); state.openSubAddId = null; rebuild(); },
        }, '⋮')); // ⋮
      }
      container.appendChild(E('div', attrs, kids));

      // M4: panel de acciones inline (abierto para este nodo)
      if (p.nodeId && state.openActionsId === p.nodeId) {
        container.appendChild(renderActionPanel(p));
      }
    });

    // M3: aviso "plantilla global" cuando la pagina activa es una Categoria (editar afecta a TODAS).
    const activePg = pages.find((p) => p.active);
    if (activePg && activePg.tipo === 'coleccion') {
      container.appendChild(E('p', {
        class: 'ed-sidebar__note',
        style: 'font-size:0.72rem;line-height:1.35;color:#64748b;background:#f1f5f9;border-radius:6px;padding:0.45rem 0.6rem;margin:0.4rem 0 0;',
      }, 'Editas la plantilla de las paginas de CATEGORIA: los cambios aplican a TODAS. El preview muestra esta categoria.'));
    }

    // M3/M4: agregar pagina TOP-LEVEL -> selector de tipo (En blanco / Categoria) + picker.
    if (state.callbacks.onAddBlankPage || state.callbacks.onAddColeccion) {
      const addHost = E('div', { class: 'ed-sidebar__add-host' });
      container.appendChild(addHost);
      renderAddArea(addHost, null);
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
        E('span', { class: 'ed-sidebar__handle', 'aria-label': 'Mover seccion', title: 'Arrastra para reordenar' }, '⋮⋮'),
        E('span', {
          class: 'ed-sidebar__outline-label',
          onClick: () => { ES.select(sec.id); openInspectorDrawer(); },
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

    const addBtn = E('button', {
      type: 'button', class: 'ed-sidebar__add-btn',
      onClick: () => state.callbacks.onAddSection && state.callbacks.onAddSection(),
    }, '+ Agregar seccion');
    container.appendChild(addBtn);
  }

  function hasNodeActions() {
    const cb = state.callbacks;
    return !!(cb.onRenamePage || cb.onMoveNode || cb.onToggleMostrar || cb.onAddBlankPage || cb.onDeleteNode);
  }

  // M4: panel de acciones de un nodo (Renombrar / Subir / Bajar / Mostrar-Ocultar / Agregar subpagina /
  // Borrar). Agregar subpagina solo en top-level (depth 0) -> 2 niveles max.
  function renderActionPanel(p) {
    const E = window.TiendaIA.editorControls.el;
    const cb = state.callbacks;
    const act = (label, onClick, color) => E('button', {
      type: 'button', class: 'ed-sidebar__act',
      style: 'display:block;width:100%;text-align:left;background:none;border:none;padding:0.32rem 0.5rem;font-size:0.78rem;color:' + (color || '#334155') + ';cursor:pointer;border-radius:4px',
      onClick: (e) => { e.stopPropagation(); onClick(); },
    }, label);
    const panel = E('div', {
      class: 'ed-sidebar__actions',
      style: 'margin:0.15rem 0 0.4rem;padding:0.25rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px',
    }, []);
    if (cb.onRenamePage) panel.appendChild(act('Renombrar', () => cb.onRenamePage(p.nodeId, p.label)));
    if (cb.onMoveNode) {
      panel.appendChild(act('Subir ↑', () => cb.onMoveNode(p.nodeId, -1)));
      panel.appendChild(act('Bajar ↓', () => cb.onMoveNode(p.nodeId, 1)));
    }
    if (cb.onToggleMostrar) {
      panel.appendChild(act(p.mostrar === false ? 'Mostrar en el menu' : 'Ocultar del menu', () => cb.onToggleMostrar(p.nodeId, p.mostrar === false)));
    }
    if (p.depth === 0 && (cb.onAddBlankPage || cb.onAddColeccion)) {
      panel.appendChild(act('+ Agregar subpagina', () => { state.openSubAddId = (state.openSubAddId === p.nodeId ? null : p.nodeId); rebuild(); }));
      if (state.openSubAddId === p.nodeId) {
        const subHost = E('div', { class: 'ed-sidebar__sub-add', style: 'padding:0 0 0 0.4rem' });
        panel.appendChild(subHost);
        renderAddArea(subHost, p.nodeId, 'menu'); // ya pidio "agregar subpagina" -> abre directo el menu de tipo
      }
    }
    if (cb.onDeleteNode) panel.appendChild(act('Borrar', () => cb.onDeleteNode(p.nodeId), '#dc2626'));
    return panel;
  }

  function openInspectorDrawer() {
    const insp = document.getElementById('editor-inspector');
    if (insp && window.matchMedia('(max-width: 1100px)').matches) {
      insp.classList.add('ed-inspector--open');
    }
  }

  // M3/M4: area "Agregar pagina/subpagina" con estado local (closed -> menu de tipo -> picker de categoria).
  // parentNodeId: null = pagina top-level; un nodeId = SUBpagina de ese nodo.
  function renderAddArea(host, parentNodeId, initialMode) {
    const E = window.TiendaIA.editorControls.el;
    const cb = state.callbacks;
    const sub = !!parentNodeId;
    const opt = (label, onClick) => E('button', { type: 'button', class: 'ed-sidebar__add-page', style: 'margin-top:0.3rem', onClick: onClick }, label);
    const link = (label, onClick) => E('button', { type: 'button', class: 'ed-sidebar__add-cancel', style: 'background:none;border:none;color:#64748b;font-size:0.74rem;cursor:pointer;padding:0.35rem 0;text-decoration:underline', onClick: onClick }, label);
    let mode = initialMode || 'closed';
    const draw = () => {
      host.innerHTML = '';
      if (mode === 'closed') {
        host.appendChild(E('button', { type: 'button', class: 'ed-sidebar__add-page', onClick: () => { mode = 'menu'; draw(); } }, sub ? '+ Agregar subpagina' : '+ Agregar pagina'));
        return;
      }
      if (mode === 'menu') {
        const kids = [];
        if (cb.onAddBlankPage) kids.push(opt(sub ? 'Subpagina en blanco' : 'Pagina en blanco', () => { mode = 'closed'; draw(); cb.onAddBlankPage(parentNodeId); }));
        if (cb.onAddColeccion) kids.push(opt(sub ? 'Subpagina de categoria' : 'Pagina de categoria', () => { mode = 'categoria'; draw(); }));
        kids.push(link('Cancelar', () => { mode = 'closed'; draw(); }));
        host.appendChild(E('div', { class: 'ed-sidebar__add-menu' }, kids));
        return;
      }
      // mode === 'categoria': picker de categorias SIN pagina (D3)
      const cats = (cb.getCategoriasSinPagina && cb.getCategoriasSinPagina()) || [];
      const kids = [E('p', { class: 'ed-sidebar__title', style: 'margin:0.4rem 0 0.2rem;font-size:0.72rem' }, 'Categorias sin pagina')];
      if (!cats.length) {
        kids.push(E('p', { style: 'font-size:0.72rem;color:#64748b;margin:0.2rem 0' }, 'Todas tus categorias ya estan en el arbol.'));
      } else {
        cats.forEach((c) => {
          kids.push(E('div', { class: 'ed-sidebar__add-cat', style: 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.25rem 0' }, [
            E('span', { style: 'font-size:0.78rem;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, c.nombre + (c.esSub ? ' · sub' : '')),
            E('button', { type: 'button', class: 'ed-sidebar__add-cat-btn', style: 'flex:none;font-size:0.72rem;padding:0.2rem 0.55rem;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer', onClick: () => { mode = 'closed'; draw(); cb.onAddColeccion(c.id, parentNodeId); } }, 'Agregar'),
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
    ES.subscribe('nav', rebuild); // agregar/renombrar/reordenar/mostrar-ocultar/borrar -> re-render del switcher
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorSidebar = { render };
})(window);
