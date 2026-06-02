/* AIMMA Tienda IA · Editor PRO-MAX Plan 3 · editor-state.js v1
 * Singleton state. Maneja: sections + theme + selection + dirty + snapshots.
 * Observer pattern para listeners de cambios.
 */

(function(window) {
  'use strict';

  const MAX_SNAPSHOTS = 20;
  const DEBOUNCE_TYPING_MS = 1000;

  const state = {
    tienda_id: null,
    sections: [],
    theme: {},
    selection: null,        // { tipo: 'section'|'element', id }
    dirty: false,
    saving: false,
    lastDraftSavedAt: null,
    lastPublishedAt: null,
    base_updated_at: null,
    snapshots: [],
    snapshotIdx: -1,
    _listeners: { sections: [], selection: [], dirty: [], saving: [] },
    _typingTimers: {},
  };

  // ============================================================
  // NanoID minimo (4 chars)
  // ============================================================
  function nanoid4() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  }

  // ============================================================
  // Observer pattern
  // ============================================================
  function subscribe(channel, fn) {
    if (!state._listeners[channel]) return () => {};
    state._listeners[channel].push(fn);
    return () => {
      state._listeners[channel] = state._listeners[channel].filter(f => f !== fn);
    };
  }

  function notify(channel) {
    (state._listeners[channel] || []).forEach(fn => {
      try {
        const value = channel === 'sections' ? state.sections
                    : channel === 'selection' ? state.selection
                    : channel === 'dirty' ? state.dirty
                    : channel === 'saving' ? state.saving
                    : null;
        fn(value);
      } catch (err) { console.error('editor-state listener error', err); }
    });
  }

  // ============================================================
  // Init
  // ============================================================
  function init(personalizaciones, tienda_id) {
    state.tienda_id = tienda_id;
    const pers = personalizaciones || {};
    const home = pers.pages?.home || pers.pages?.home_draft || null;
    state.sections = home?.sections ? structuredClone(home.sections) : [];
    state.theme = pers.theme ? structuredClone(pers.theme) : {};
    state.base_updated_at = home?.updated_at || null;
    state.selection = null;
    state.dirty = false;
    state.snapshots = [];
    state.snapshotIdx = -1;
    pushSnapshot(); // baseline
    notify('sections');
    notify('selection');
    notify('dirty');
  }

  // ============================================================
  // Section factories
  // ============================================================
  function createSectionDefault(tipo) {
    const id = 'sec_' + nanoid4();
    const base = {
      id,
      tipo,
      altura_filas: 5,
      fondo: { tipo: 'transparente', valor: '' },
      padding: 'md',
      elementos: [],
    };

    switch (tipo) {
      case 'hero':
        base.altura_filas = 10;
        base.padding = 'lg';
        base.elementos = [
          {
            id: 'el_' + nanoid4(),
            tipo: 'texto',
            grid: { col_start: 1, col_end: 17, row_start: 3, row_end: 6 },
            estilo: { alineacion: 'left', tamaño: '3xl', peso: 'bold' },
            props: { contenido: '[Tu título aquí]' },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'boton',
            grid: { col_start: 1, col_end: 7, row_start: 8, row_end: 10 },
            estilo: { alineacion: 'left', tamaño: 'lg', peso: 'semibold' },
            props: {
              texto: 'Ver productos', url: '#productos',
              estilo_visual: 'primary', target: '_self'
            },
          },
        ];
        break;

      case 'texto':
        base.altura_filas = 5;
        base.elementos = [{
          id: 'el_' + nanoid4(),
          tipo: 'texto',
          grid: { col_start: 4, col_end: 22, row_start: 2, row_end: 5 },
          estilo: { alineacion: 'left', tamaño: 'md', peso: 'normal' },
          props: { contenido: '[Escribí tu texto aquí]' },
        }];
        break;

      case 'imagen':
        base.altura_filas = 7;
        base.elementos = [{
          id: 'el_' + nanoid4(),
          tipo: 'imagen',
          grid: { col_start: 1, col_end: 25, row_start: 1, row_end: 7 },
          estilo: { alineacion: 'center', tamaño: 'md', peso: 'normal' },
          props: {
            src: 'https://placehold.co/1200x600',
            alt: 'Imagen banner',
            objeto: 'cover',
          },
        }];
        break;

      case 'botones':
        base.altura_filas = 3;
        base.elementos = [
          {
            id: 'el_' + nanoid4(),
            tipo: 'boton',
            grid: { col_start: 7, col_end: 13, row_start: 1, row_end: 3 },
            estilo: { alineacion: 'center', tamaño: 'md', peso: 'semibold' },
            props: {
              texto: 'WhatsApp', url: 'https://wa.me/57XXXXXXXXXX',
              estilo_visual: 'primary', target: '_blank', icono: 'whatsapp'
            },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'boton',
            grid: { col_start: 13, col_end: 19, row_start: 1, row_end: 3 },
            estilo: { alineacion: 'center', tamaño: 'md', peso: 'semibold' },
            props: {
              texto: 'Ubicación', url: 'https://maps.google.com',
              estilo_visual: 'secondary', target: '_blank', icono: 'location'
            },
          },
        ];
        break;

      case 'productos':
        base.altura_filas = 10;
        base.elementos = [{
          id: 'el_' + nanoid4(),
          tipo: 'productos',
          grid: { col_start: 1, col_end: 25, row_start: 1, row_end: 10 },
          estilo: { alineacion: 'center', tamaño: 'md', peso: 'normal' },
          props: {
            categoria_id: null, limite: 8, orden: 'recientes',
            columnas: 'auto', mostrar_precio: true,
          },
        }];
        break;

      case 'galeria':
        base.altura_filas = 8;
        base.elementos = [{
          id: 'el_' + nanoid4(),
          tipo: 'galeria',
          grid: { col_start: 1, col_end: 25, row_start: 1, row_end: 8 },
          estilo: { alineacion: 'center', tamaño: 'md', peso: 'normal' },
          props: {
            imagenes: [
              { src: 'https://placehold.co/800x800/eee/666?text=1', alt: 'Imagen 1' },
              { src: 'https://placehold.co/800x800/eee/666?text=2', alt: 'Imagen 2' },
              { src: 'https://placehold.co/800x800/eee/666?text=3', alt: 'Imagen 3' },
            ],
            layout: 'grid', gap: 'normal',
          },
        }];
        break;

      case 'espaciador':
        base.altura_filas = 2;
        base.elementos = [];
        break;

      case 'formulario':
        base.altura_filas = 8;
        base.elementos = [
          {
            id: 'el_' + nanoid4(),
            tipo: 'texto',
            grid: { col_start: 1, col_end: 25, row_start: 1, row_end: 2 },
            estilo: { alineacion: 'center', tamaño: 'xl', peso: 'semibold' },
            props: { contenido: 'Escribinos' },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'form_field',
            grid: { col_start: 7, col_end: 19, row_start: 2, row_end: 3 },
            estilo: { alineacion: 'left', tamaño: 'md', peso: 'normal' },
            props: { tipo_campo: 'text', label: 'Nombre', requerido: true },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'form_field',
            grid: { col_start: 7, col_end: 19, row_start: 3, row_end: 4 },
            estilo: { alineacion: 'left', tamaño: 'md', peso: 'normal' },
            props: { tipo_campo: 'email', label: 'Email', requerido: true },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'form_field',
            grid: { col_start: 7, col_end: 19, row_start: 4, row_end: 7 },
            estilo: { alineacion: 'left', tamaño: 'md', peso: 'normal' },
            props: { tipo_campo: 'textarea', label: 'Mensaje', requerido: false },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'boton',
            grid: { col_start: 9, col_end: 17, row_start: 7, row_end: 8 },
            estilo: { alineacion: 'center', tamaño: 'md', peso: 'semibold' },
            props: { texto: 'Enviar', url: '#submit', estilo_visual: 'primary', target: '_self' },
          },
        ];
        break;
    }
    return base;
  }

  function createElementDefault(tipo, gridDefault) {
    const id = 'el_' + nanoid4();
    const grid = gridDefault || { col_start: 1, col_end: 13, row_start: 1, row_end: 4 };
    const baseEstilo = { alineacion: 'left', tamaño: 'md', peso: 'normal' };

    const map = {
      texto: { props: { contenido: 'Nuevo texto' } },
      imagen: { props: { src: 'https://placehold.co/800x600', alt: '', objeto: 'cover' } },
      boton: { props: { texto: 'Botón', url: '#', estilo_visual: 'primary', target: '_self' } },
      productos: { props: { categoria_id: null, limite: 8, orden: 'recientes', columnas: 'auto', mostrar_precio: true } },
      galeria: { props: { imagenes: [{ src: 'https://placehold.co/600x600', alt: '' }], layout: 'grid', gap: 'normal' } },
      form_field: { props: { tipo_campo: 'text', label: 'Campo', requerido: false } },
      embed: { props: { html: '', aspect_ratio: '16/9' } },
      divisor: { props: { estilo: 'linea' } },
    };

    return { id, tipo, grid, estilo: baseEstilo, ...(map[tipo] || {}) };
  }

  // ============================================================
  // Section operations
  // ============================================================
  function insertSection(tipo, atIndex) {
    const section = createSectionDefault(tipo);
    if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= state.sections.length) {
      state.sections.splice(atIndex, 0, section);
    } else {
      state.sections.push(section);
    }
    pushSnapshot();
    markDirty();
    notify('sections');
    return section.id;
  }

  function removeSection(sectionId) {
    state.sections = state.sections.filter(s => s.id !== sectionId);
    if (state.selection?.id === sectionId) state.selection = null;
    pushSnapshot();
    markDirty();
    notify('sections');
    notify('selection');
  }

  function reorderSections(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const [moved] = state.sections.splice(fromIdx, 1);
    state.sections.splice(toIdx, 0, moved);
    pushSnapshot();
    markDirty();
    notify('sections');
  }

  function duplicateSection(sectionId) {
    const idx = state.sections.findIndex(s => s.id === sectionId);
    if (idx < 0) return;
    const copy = structuredClone(state.sections[idx]);
    copy.id = 'sec_' + nanoid4();
    copy.elementos = copy.elementos.map(el => ({ ...el, id: 'el_' + nanoid4() }));
    state.sections.splice(idx + 1, 0, copy);
    pushSnapshot();
    markDirty();
    notify('sections');
    return copy.id;
  }

  function updateSectionProp(sectionId, key, value) {
    const sec = state.sections.find(s => s.id === sectionId);
    if (!sec) return;
    sec[key] = value;
    debouncedSnapshot(sectionId + ':' + key);
    markDirty();
    notify('sections');
  }

  // ============================================================
  // Element operations
  // ============================================================
  function insertElement(sectionId, tipo, gridDefault) {
    const sec = state.sections.find(s => s.id === sectionId);
    if (!sec) return null;
    const el = createElementDefault(tipo, gridDefault);
    sec.elementos.push(el);
    pushSnapshot();
    markDirty();
    notify('sections');
    return el.id;
  }

  function removeElement(elementId) {
    let removed = false;
    state.sections.forEach(sec => {
      const before = sec.elementos.length;
      sec.elementos = sec.elementos.filter(e => e.id !== elementId);
      if (sec.elementos.length !== before) removed = true;
    });
    if (state.selection?.id === elementId) state.selection = null;
    if (removed) {
      pushSnapshot();
      markDirty();
      notify('sections');
      notify('selection');
    }
  }

  function updateElementGrid(sectionId, elementId, grid) {
    const sec = state.sections.find(s => s.id === sectionId);
    if (!sec) return;
    const el = sec.elementos.find(e => e.id === elementId);
    if (!el) return;
    el.grid = { ...el.grid, ...grid };
    pushSnapshot();
    markDirty();
    notify('sections');
  }

  function updateElementProp(elementId, key, value) {
    const el = findElement(elementId);
    if (!el) return;
    el.props[key] = value;
    debouncedSnapshot(elementId + ':props:' + key);
    markDirty();
    notify('sections');
  }

  function updateElementStyle(elementId, key, value) {
    const el = findElement(elementId);
    if (!el) return;
    el.estilo[key] = value;
    debouncedSnapshot(elementId + ':estilo:' + key);
    markDirty();
    notify('sections');
  }

  function findElement(elementId) {
    for (const sec of state.sections) {
      const el = sec.elementos.find(e => e.id === elementId);
      if (el) return el;
    }
    return null;
  }

  function findSection(sectionId) {
    return state.sections.find(s => s.id === sectionId) || null;
  }

  // ============================================================
  // Selection
  // ============================================================
  function select(tipo, id) {
    state.selection = { tipo, id };
    notify('selection');
  }

  function deselect() {
    state.selection = null;
    notify('selection');
  }

  // ============================================================
  // Snapshots (undo/redo)
  // ============================================================
  function pushSnapshot() {
    state.snapshots = state.snapshots.slice(0, state.snapshotIdx + 1);
    const snap = {
      sections: structuredClone(state.sections),
      theme: structuredClone(state.theme),
    };
    state.snapshots.push(snap);
    state.snapshotIdx = state.snapshots.length - 1;
    if (state.snapshots.length > MAX_SNAPSHOTS) {
      state.snapshots.shift();
      state.snapshotIdx--;
    }
  }

  function debouncedSnapshot(key) {
    clearTimeout(state._typingTimers[key]);
    state._typingTimers[key] = setTimeout(() => {
      pushSnapshot();
      delete state._typingTimers[key];
    }, DEBOUNCE_TYPING_MS);
  }

  function undo() {
    if (state.snapshotIdx <= 0) return false;
    state.snapshotIdx--;
    restoreFromSnapshot();
    return true;
  }

  function redo() {
    if (state.snapshotIdx >= state.snapshots.length - 1) return false;
    state.snapshotIdx++;
    restoreFromSnapshot();
    return true;
  }

  function restoreFromSnapshot() {
    const snap = state.snapshots[state.snapshotIdx];
    state.sections = structuredClone(snap.sections);
    state.theme = structuredClone(snap.theme);
    state.selection = null;
    state.dirty = true;
    notify('sections');
    notify('selection');
    notify('dirty');
  }

  function canUndo() { return state.snapshotIdx > 0; }
  function canRedo() { return state.snapshotIdx < state.snapshots.length - 1; }

  // ============================================================
  // Dirty + serialize
  // ============================================================
  function markDirty() {
    if (!state.dirty) {
      state.dirty = true;
      notify('dirty');
    }
  }

  function markClean(updated_at) {
    state.dirty = false;
    state.base_updated_at = updated_at;
    state.lastPublishedAt = new Date();
    notify('dirty');
  }

  function markSaving(saving) {
    state.saving = saving;
    notify('saving');
  }

  function serialize() {
    return {
      schema_version: 2,
      theme: state.theme,
      pages: {
        home: {
          version: 1,
          updated_at: new Date().toISOString(),
          sections: structuredClone(state.sections),
        },
      },
    };
  }

  // ============================================================
  // Export public API
  // ============================================================
  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorState = {
    init, subscribe,
    get sections() { return state.sections; },
    get theme() { return state.theme; },
    get selection() { return state.selection; },
    get dirty() { return state.dirty; },
    get saving() { return state.saving; },
    get tienda_id() { return state.tienda_id; },
    get base_updated_at() { return state.base_updated_at; },
    get lastDraftSavedAt() { return state.lastDraftSavedAt; },
    setLastDraftSavedAt(d) { state.lastDraftSavedAt = d; },
    findSection, findElement,
    insertSection, removeSection, reorderSections, duplicateSection, updateSectionProp,
    insertElement, removeElement, updateElementGrid, updateElementProp, updateElementStyle,
    select, deselect,
    undo, redo, canUndo, canRedo, pushSnapshot,
    markDirty, markClean, markSaving,
    serialize,
  };
})(window);
