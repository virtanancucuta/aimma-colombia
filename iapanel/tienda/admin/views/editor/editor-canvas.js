/* AIMMA Editor PRO-MAX Plan 3 · editor-canvas.js v1
 * Canvas: lista de sections con SortableJS reorder + GridStack por seccion.
 * Render visual de elements en grid.
 */
(function(window) {
  'use strict';

  const SECTION_LABELS = {
    hero: 'Hero', texto: 'Texto', imagen: 'Imagen',
    botones: 'Botones', productos: 'Productos', galeria: 'Galería',
    espaciador: 'Espaciador', formulario: 'Formulario',
  };

  const state = {
    container: null,
    sectionsListEl: null,
    sortable: null,
    gridStacks: {}, // sectionId -> GridStack instance
    callbacks: {},
  };

  function render(container, callbacks) {
    state.container = container;
    state.callbacks = callbacks || {};
    container.innerHTML = '';
    container.setAttribute('data-edit-mode', 'true');
    container.setAttribute('data-device', 'desktop');

    const inner = document.createElement('div');
    inner.className = 'ed-canvas__inner';
    inner.id = 'editor-canvas-inner';
    container.appendChild(inner);

    const list = document.createElement('div');
    list.id = 'editor-sections-list';
    inner.appendChild(list);
    state.sectionsListEl = list;

    const addBtn = document.createElement('button');
    addBtn.className = 'ed-add-section-cta';
    addBtn.type = 'button';
    addBtn.textContent = '+ Agregar sección';
    addBtn.onclick = () => state.callbacks.onAddSection && state.callbacks.onAddSection();
    inner.appendChild(addBtn);

    rebuild();
    bindStateListeners();
  }

  function rebuild() {
    destroyAllGridStacks();
    if (state.sortable) { state.sortable.destroy(); state.sortable = null; }
    state.sectionsListEl.innerHTML = '';

    const ES = window.TiendaIA.editorState;
    ES.sections.forEach(sec => {
      state.sectionsListEl.appendChild(renderSection(sec));
    });
    ES.sections.forEach(sec => initGridStackForSection(sec));

    state.sortable = new window.Sortable(state.sectionsListEl, {
      handle: '.ed-section-handle',
      animation: 200,
      ghostClass: 'ed-section-ghost',
      onEnd: evt => {
        if (evt.oldIndex !== evt.newIndex) {
          ES.reorderSections(evt.oldIndex, evt.newIndex);
        }
      },
    });

    updateSelection();
  }

  function renderSection(sec) {
    const article = document.createElement('article');
    article.className = 'ed-section';
    article.dataset.sectionId = sec.id;
    article.dataset.tipo = sec.tipo;
    article.setAttribute('data-edit-mode', 'true');
    article.style.minHeight = (sec.altura_filas * 60) + 'px';
    article.style.padding = sec.padding === 'sm' ? '1rem' :
                            sec.padding === 'lg' ? '3rem' :
                            sec.padding === 'xl' ? '4rem' : '2rem';

    if (sec.fondo.tipo === 'color' && sec.fondo.valor) {
      article.style.backgroundColor = sec.fondo.valor;
    } else if (sec.fondo.tipo === 'imagen' && sec.fondo.valor) {
      article.style.backgroundImage = 'url("' + cssEscape(sec.fondo.valor) + '")';
      article.style.backgroundSize = 'cover';
      article.style.backgroundPosition = 'center';
    } else if (sec.fondo.tipo === 'gradient' && sec.fondo.valor) {
      article.style.background = sec.fondo.valor;
    }

    article.onclick = e => {
      if (e.target === article || e.target.classList.contains('grid-stack')) {
        window.TiendaIA.editorState.select('section', sec.id);
        e.stopPropagation();
      }
    };

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'ed-section-handle';
    handle.setAttribute('aria-label', 'Mover sección');
    handle.textContent = '⋮⋮';
    article.appendChild(handle);

    const toolbar = document.createElement('div');
    toolbar.className = 'ed-section-toolbar';
    toolbar.innerHTML =
      '<span class="ed-section-toolbar__label">' + (SECTION_LABELS[sec.tipo] || sec.tipo) + '</span>' +
      '<button type="button" class="ed-section-toolbar__btn" data-action="dup">Duplicar</button>' +
      '<button type="button" class="ed-section-toolbar__btn ed-section-toolbar__btn--danger" data-action="del">Eliminar</button>';
    toolbar.querySelector('[data-action="dup"]').onclick = e => {
      e.stopPropagation();
      window.TiendaIA.editorState.duplicateSection(sec.id);
    };
    toolbar.querySelector('[data-action="del"]').onclick = e => {
      e.stopPropagation();
      if (confirm('¿Eliminar esta sección?')) {
        window.TiendaIA.editorState.removeSection(sec.id);
      }
    };
    article.appendChild(toolbar);

    const grid = document.createElement('div');
    grid.className = 'grid-stack ed-section-grid';
    grid.setAttribute('data-section-id', sec.id);
    article.appendChild(grid);

    return article;
  }

  function initGridStackForSection(sec) {
    const gridEl = state.sectionsListEl.querySelector(
      '.ed-section[data-section-id="' + sec.id + '"] .grid-stack'
    );
    if (!gridEl) return;

    const grid = window.GridStack.init({
      column: 24,
      cellHeight: 60,
      margin: 0,
      float: true,
      animate: true,
      disableOneColumnMode: true,
      handle: '.grid-stack-item-content',
      resizable: { handles: 'se, sw, ne, nw, e, w, n, s' },
      minRow: sec.altura_filas,
    }, gridEl);

    sec.elementos.forEach(el => {
      const node = grid.addWidget({
        x: (el.grid.col_start || 1) - 1,
        y: (el.grid.row_start || 1) - 1,
        w: (el.grid.col_end || 13) - (el.grid.col_start || 1),
        h: (el.grid.row_end || 4) - (el.grid.row_start || 1),
        content: renderElementHTML(el),
        id: el.id,
      });
      node.setAttribute('data-element-id', el.id);
      bindElementEvents(node, sec.id, el.id);
    });

    grid.on('change', (event, items) => {
      items.forEach(item => {
        const elementId = item.el.dataset.elementId;
        if (!elementId) return;
        window.TiendaIA.editorState.updateElementGrid(sec.id, elementId, {
          col_start: item.x + 1,
          col_end: item.x + item.w + 1,
          row_start: item.y + 1,
          row_end: item.y + item.h + 1,
        });
      });
    });

    state.gridStacks[sec.id] = grid;
  }

  function destroyAllGridStacks() {
    Object.values(state.gridStacks).forEach(g => g.destroy(false));
    state.gridStacks = {};
  }

  function bindElementEvents(node, sectionId, elementId) {
    node.onclick = e => {
      e.stopPropagation();
      window.TiendaIA.editorState.select('element', elementId);
    };

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'ed-element-delete';
    delBtn.setAttribute('aria-label', 'Eliminar elemento');
    delBtn.textContent = '×';
    delBtn.onclick = e => {
      e.stopPropagation();
      window.TiendaIA.editorState.removeElement(elementId);
    };
    node.appendChild(delBtn);
  }

  function renderElementHTML(el) {
    const sizeMap = { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.25rem', xl: '1.75rem', '2xl': '2.25rem', '3xl': '3rem' };
    const fontSize = sizeMap[el.estilo.tamaño || el.estilo.tamano || 'md'] || '1rem';
    const weight = el.estilo.peso === 'bold' ? 700 : el.estilo.peso === 'semibold' ? 600 : el.estilo.peso === 'medium' ? 500 : 400;
    const align = el.estilo.alineacion || 'left';
    const color = el.estilo.color_texto || '#1a1a1a';

    switch (el.tipo) {
      case 'texto':
        return '<div style="font-size:' + fontSize + ';font-weight:' + weight +
          ';text-align:' + align + ';color:' + escapeAttr(color) + ';white-space:pre-wrap">' +
          escapeHTML(el.props.contenido || '[texto vacío]') + '</div>';

      case 'imagen': {
        const src = el.props.src || '';
        const safeSrc = /^https:\/\//.test(src) ? src : 'https://placehold.co/800x600';
        return '<img src="' + escapeAttr(safeSrc) + '" alt="' + escapeAttr(el.props.alt || '') +
          '" style="width:100%;height:100%;object-fit:' + (el.props.objeto || 'cover') + '" />';
      }

      case 'boton': {
        const txt = escapeHTML(el.props.texto || 'Botón');
        const variant = el.props.estilo_visual || 'primary';
        const bg = variant === 'primary' ? '#006d8b' : variant === 'secondary' ? '#4b5563' : 'transparent';
        const col = variant === 'ghost' || variant === 'outline' ? '#1a1a1a' : 'white';
        const border = variant === 'outline' ? '1.5px solid currentColor' : 'none';
        return '<div style="display:inline-flex;padding:0.625rem 1.125rem;background:' + bg +
          ';color:' + col + ';border:' + border + ';border-radius:0.375rem;font-weight:600;font-size:' + fontSize + '">' + txt + '</div>';
      }

      case 'productos':
        return '<div style="padding:0.5rem;border:1px dashed rgba(0,0,0,0.2);background:rgba(0,0,0,0.02);font-size:0.75rem;color:#666;text-align:center">' +
          'Productos (' + (el.props.limite || 8) + ' · ' + (el.props.orden || 'recientes') + ' · ' + (el.props.columnas || 'auto') + ' col)</div>';

      case 'galeria':
        return '<div style="padding:0.5rem;border:1px dashed rgba(0,0,0,0.2);background:rgba(0,0,0,0.02);font-size:0.75rem;color:#666;text-align:center">' +
          'Galería (' + (el.props.imagenes?.length || 0) + ' imágenes · ' + (el.props.layout || 'grid') + ')</div>';

      case 'form_field':
        return '<div style="font-size:' + fontSize + ';color:' + escapeAttr(color) + '">' +
          '<label style="display:block;margin-bottom:0.25rem;font-weight:600">' + escapeHTML(el.props.label || 'Campo') +
          (el.props.requerido ? ' *' : '') + '</label>' +
          (el.props.tipo_campo === 'textarea'
            ? '<textarea readonly placeholder="' + escapeAttr(el.props.placeholder || '') + '" style="width:100%;padding:0.5rem;border:1px solid #ddd;border-radius:4px"></textarea>'
            : '<input type="' + escapeAttr(el.props.tipo_campo || 'text') + '" readonly placeholder="' +
              escapeAttr(el.props.placeholder || '') + '" style="width:100%;padding:0.5rem;border:1px solid #ddd;border-radius:4px" />') +
          '</div>';

      case 'embed':
        return '<div style="padding:1rem;border:1px dashed rgba(0,0,0,0.2);background:rgba(0,0,0,0.02);text-align:center;font-size:0.75rem;color:#666">Embed (' + (el.props.aspect_ratio || '16/9') + ')</div>';

      case 'divisor':
        return '<hr style="border:none;border-top:1px solid #ddd;margin:0" />';

      default:
        return '<div style="color:#999">' + escapeHTML(el.tipo) + '</div>';
    }
  }

  function updateSelection() {
    const ES = window.TiendaIA.editorState;
    const sel = ES.selection;

    document.querySelectorAll('.ed-section').forEach(art => {
      art.classList.toggle('ed-section--selected',
        sel && sel.tipo === 'section' && art.dataset.sectionId === sel.id);
    });
    document.querySelectorAll('.grid-stack-item').forEach(node => {
      node.classList.toggle('ed-element--selected',
        sel && sel.tipo === 'element' && node.dataset.elementId === sel.id);
    });
  }

  function bindStateListeners() {
    const ES = window.TiendaIA.editorState;
    ES.subscribe('sections', rebuild);
    ES.subscribe('selection', updateSelection);
  }

  function setEditMode(enabled) {
    if (!state.container) return;
    state.container.setAttribute('data-edit-mode', enabled ? 'true' : 'false');
    state.sectionsListEl.querySelectorAll('.ed-section').forEach(a =>
      a.setAttribute('data-edit-mode', enabled ? 'true' : 'false'));
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHTML(s); }
  function cssEscape(s) {
    return String(s).replace(/["\\<>`{}]/g, '');
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorCanvas = { render, rebuild, setEditMode };
})(window);
