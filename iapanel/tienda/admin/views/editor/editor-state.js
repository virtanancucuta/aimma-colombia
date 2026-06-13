/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-state.js v3 (carril patch)
 * Singleton state. Modelo Shopify-style: secciones APILADAS (orden = orden vertical).
 * SIN grid 2D, SIN elementos posicionados. Cada seccion: {id,tipo,ancho,fondo,padding,props}.
 * Mantiene: snapshots/undo/redo (structuredClone), dirty, base_updated_at, locking optimista.
 * Observer pattern para listeners de cambios. Canal 'patch' notifica lastOp (kind + meta).
 * Marker: editor-plan4-v3-state.
 */

(function(window) {
  'use strict';

  const MAX_SNAPSHOTS = 20;
  const DEBOUNCE_TYPING_MS = 1000;
  const MAX_SECTIONS = 20;

  const state = {
    tienda_id: null,
    sections: [],
    theme: {},
    selection: null,          // { sectionId } | null
    dirty: false,
    saving: false,
    // Estado del autosave de BORRADOR (separado de dirty=cambios-sin-publicar):
    // 'idle' | 'saving' | 'saved' | 'error'. Lo consume el chip de la toolbar.
    draftSaveStatus: 'idle',
    lastDraftSavedAt: null,
    lastPublishedAt: null,
    base_updated_at: null,
    snapshots: [],
    snapshotIdx: -1,
    lastOp: null,
    _listeners: { sections: [], selection: [], dirty: [], saving: [], theme: [], draftsave: [], patch: [], nav: [] },
    _typingTimers: {},
  };

  // ============================================================
  // NanoID minimo (6 chars, valida /^sec_[a-z0-9]{4,}$/)
  // ============================================================
  function nanoid(len) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let s = '';
    const n = len || 6;
    for (let i = 0; i < n; i++) {
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
                    : channel === 'theme' ? state.theme
                    : channel === 'draftsave' ? state.draftSaveStatus
                    : channel === 'patch' ? state.lastOp
                    : channel === 'nav' ? state.nav
                    : null;
        fn(value);
      } catch (err) { console.error('editor-state listener error', err); }
    });
  }

  // ============================================================
  // Init
  // ============================================================
  function init(personalizaciones, tienda_id, pageId) {
    state.tienda_id = tienda_id;
    // L1: pagina logica que se edita. Default 'home' (comportamiento existente).
    state.pageId = pageId || 'home';
    const pers = personalizaciones || {};
    const draftKey = state.pageId + '_draft';
    // En el editor priorizamos el borrador de ESTA pagina si existe, si no la publicada.
    const page = pers.pages?.[draftKey] || pers.pages?.[state.pageId] || null;
    state.sections = Array.isArray(page?.sections) ? structuredClone(page.sections) : [];
    state.theme = normalizeTheme(pers.theme_draft || pers.theme);
    // M2 (Administrador de Paginas): arbol de navegacion GLOBAL. Prioriza el borrador.
    // Se carga en cada init (page switch) desde la cache sincronizada; serialize lo manda en cada save.
    state.nav = Array.isArray(pers.nav_draft) ? structuredClone(pers.nav_draft)
              : Array.isArray(pers.nav) ? structuredClone(pers.nav) : [];
    // base_updated_at: el de la pagina PUBLICADA para el locking optimista
    // (el draft no participa; guardar-layout compara contra la pagina publicada).
    state.base_updated_at = pers.pages?.[state.pageId]?.updated_at || page?.updated_at || null;
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
  // Factory de props por defecto por tipo (SCHEMA v3)
  // ============================================================
  function sectionDef(tipo) {
    return window.TiendaIA.editorSectionDefs.defs[tipo];
  }

  // Props por defecto DERIVADAS del registro sectionDefs (campo.default por campo).
  // Fase A.1: fuente unica = section-defs.js (antes era un switch hardcodeado aqui).
  function defaultProps(tipo) {
    const def = sectionDef(tipo);
    if (!def) return {};
    const props = {};
    def.campos.forEach((c) => {
      if (c.__info) return;
      if (c.default !== undefined) props[c.key] = structuredClone(c.default);
    });
    return props;
  }

  function defaultPadding(tipo) {
    const d = sectionDef(tipo);
    return d ? d.padding_default : 'md';
  }

  function defaultAncho(tipo) {
    const d = sectionDef(tipo);
    return d ? d.ancho_default : 'completo';
  }

  function createSectionDefault(tipo) {
    return {
      id: 'sec_' + nanoid(6),
      tipo,
      ancho: defaultAncho(tipo),
      fondo: { tipo: 'transparente', valor: '' },
      padding: defaultPadding(tipo),
      props: defaultProps(tipo),
    };
  }

  // ============================================================
  // Section operations
  // ============================================================
  function addSection(tipo, atIndex) {
    if (state.sections.length >= MAX_SECTIONS) {
      if (window.TiendaIA?.toast) window.TiendaIA.toast('Maximo ' + MAX_SECTIONS + ' secciones por pagina', 'error');
      return null;
    }
    const section = createSectionDefault(tipo);
    if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= state.sections.length) {
      state.sections.splice(atIndex, 0, section);
    } else {
      state.sections.push(section);
    }
    pushSnapshot();
    markDirty();
    state.lastOp = { kind: 'insert', sectionId: section.id, index: (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= state.sections.length - 1 ? atIndex : state.sections.length - 1) };
    notify('sections');
    notify('patch');
    return section.id;
  }

  function removeSection(sectionId) {
    state.sections = state.sections.filter(s => s.id !== sectionId);
    if (state.selection?.sectionId === sectionId) state.selection = null;
    pushSnapshot();
    markDirty();
    state.lastOp = { kind: 'remove', sectionId: sectionId };
    notify('sections');
    notify('patch');
    notify('selection');
  }

  function reorderSections(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || fromIdx >= state.sections.length) return;
    if (toIdx < 0 || toIdx >= state.sections.length) return;
    const [moved] = state.sections.splice(fromIdx, 1);
    state.sections.splice(toIdx, 0, moved);
    pushSnapshot();
    markDirty();
    state.lastOp = { kind: 'move', sectionId: moved.id, toIndex: toIdx };
    notify('sections');
    notify('patch');
  }

  function duplicateSection(sectionId) {
    if (state.sections.length >= MAX_SECTIONS) {
      if (window.TiendaIA?.toast) window.TiendaIA.toast('Maximo ' + MAX_SECTIONS + ' secciones por pagina', 'error');
      return null;
    }
    const idx = state.sections.findIndex(s => s.id === sectionId);
    if (idx < 0) return null;
    const copy = structuredClone(state.sections[idx]);
    copy.id = 'sec_' + nanoid(6);
    state.sections.splice(idx + 1, 0, copy);
    pushSnapshot();
    markDirty();
    state.lastOp = { kind: 'insert', sectionId: copy.id, index: idx + 1 };
    notify('sections');
    notify('patch');
    return copy.id;
  }

  // Reemplaza/mergea props de una seccion. partialProps se mergea sobre props.
  function updateSectionProps(sectionId, partialProps) {
    const sec = state.sections.find(s => s.id === sectionId);
    if (!sec) return;
    sec.props = { ...sec.props, ...partialProps };
    debouncedSnapshot(sectionId + ':props');
    markDirty();
    state.lastOp = { kind: 'replace', sectionId: sectionId };
    notify('sections');
    notify('patch');
  }

  // Actualiza una propiedad base de la seccion (fondo, padding, ancho).
  function updateSectionBase(sectionId, key, value) {
    const sec = state.sections.find(s => s.id === sectionId);
    if (!sec) return;
    sec[key] = value;
    debouncedSnapshot(sectionId + ':base:' + key);
    markDirty();
    state.lastOp = { kind: 'replace', sectionId: sectionId };
    notify('sections');
    notify('patch');
  }

  // Backward-compat: conserva SOLO la forma nueva (colors/font_pairing); descarta claves viejas
  // (color_primary/font_*_url del theme vestigial) para que serialize no re-emita muertas.
  function normalizeTheme(t) {
    if (!t || typeof t !== 'object') return {};
    const out = {};
    if (t.colors && typeof t.colors === 'object') out.colors = structuredClone(t.colors);
    if (typeof t.font_pairing === 'string') out.font_pairing = t.font_pairing;
    return out;
  }
  function setThemeColors(partial) { state.theme.colors = { ...(state.theme.colors || {}), ...partial }; pushSnapshot(); markDirty(); notify('theme'); }
  function setThemePalette(colors4) { state.theme.colors = { ...colors4 }; pushSnapshot(); markDirty(); notify('theme'); }
  function setThemeFontPairing(id) { state.theme.font_pairing = id; pushSnapshot(); markDirty(); notify('theme'); }

  // ============================================================
  // M2 · arbol de navegacion (Administrador de Paginas)
  // ============================================================
  function addNavNode(node) { state.nav.push(node); markDirty(); notify('nav'); }
  function renameNavNode(id, label) {
    const n = state.nav.find((x) => x.id === id);
    if (n) { n.label = label; markDirty(); notify('nav'); }
  }
  function navSlugExists(slug) { return state.nav.some((n) => n.slug === slug); }

  function findSection(sectionId) {
    return state.sections.find(s => s.id === sectionId) || null;
  }

  // ============================================================
  // Selection (solo seccion en v3)
  // ============================================================
  function select(sectionId) {
    state.selection = sectionId ? { sectionId } : null;
    notify('selection');
  }

  function deselect() {
    state.selection = null;
    notify('selection');
  }

  // ============================================================
  // Snapshots (undo/redo) — structuredClone preservado de Plan 3
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
    state.lastOp = { kind: 'reload' };
    notify('patch');
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
    if (updated_at) state.base_updated_at = updated_at;
    state.lastPublishedAt = new Date();
    notify('dirty');
  }

  function markSaving(saving) {
    state.saving = saving;
    notify('saving');
  }

  // Estado del autosave de borrador (para el chip de la toolbar). No toca dirty.
  function setDraftSaveStatus(s) {
    state.draftSaveStatus = s;
    notify('draftsave');
  }

  // SCHEMA v3: schema_version:3, page.version:2.
  function serialize() {
    // L1: escribe SOLO la pagina activa (state.pageId). La EF mergea contra el resto
    // de paginas existentes en la BD -> no pisa home/coleccion/otras custom.
    return {
      schema_version: 3,
      theme: state.theme,
      nav: structuredClone(state.nav || []), // M2: el arbol -> la EF escribe nav_draft (draft) / promueve nav (publish)
      pages: {
        [state.pageId || 'home']: {
          version: 2,
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
    get draftSaveStatus() { return state.draftSaveStatus; },
    get tienda_id() { return state.tienda_id; },
    get pageId() { return state.pageId || 'home'; },
    get nav() { return state.nav || []; },
    get base_updated_at() { return state.base_updated_at; },
    get lastDraftSavedAt() { return state.lastDraftSavedAt; },
    get lastOp() { return state.lastOp; },
    setLastDraftSavedAt(d) { state.lastDraftSavedAt = d; },
    setThemeColors, setThemePalette, setThemeFontPairing,
    addNavNode, renameNavNode, navSlugExists,
    findSection,
    addSection, removeSection, reorderSections, duplicateSection,
    updateSectionProps, updateSectionBase,
    select, deselect,
    undo, redo, canUndo, canRedo, pushSnapshot,
    markDirty, markClean, markSaving, setDraftSaveStatus,
    serialize,
  };
})(window);
