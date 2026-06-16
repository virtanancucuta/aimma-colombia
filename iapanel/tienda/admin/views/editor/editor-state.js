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
    const sec = {
      id: 'sec_' + nanoid(6),
      tipo,
      ancho: defaultAncho(tipo),
      fondo: { tipo: 'transparente', valor: '' },
      padding: defaultPadding(tipo),
      props: defaultProps(tipo),
    };
    // FASE D: el contenedor nuevo respeta el default amarrado (transparente + 1 col + gap normal +
    // align start -> via defaults de section-defs) y nace con 1 hijo texto placeholder (schema min 1,
    // con id GENERADO para no colisionar). createChildDefault esta hoisteada (function declaration).
    if (tipo === 'contenedor') {
      sec.props.bloques = [createChildDefault('texto', 0)];
    }
    return sec;
  }

  // FASE D (D3b): un bloque hijo = una seccion hoja default + indice de columna.
  function createChildDefault(tipo, columna) {
    const c = createSectionDefault(tipo);
    c.columna = (typeof columna === 'number' && columna >= 0) ? columna : 0;
    return c;
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
  // M5.C: tamano de texto del menu. Guarda el preset (sm/md/lg). 'md' es el default; lo guardamos igual
  // para que la UI lo muestre seleccionado (el storefront trata 'md' como sin-var = identico al actual).
  function setThemeNavTextSize(size) {
    if (size === 'sm' || size === 'md' || size === 'lg') { state.theme.nav_text_size = size; }
    else { delete state.theme.nav_text_size; }
    pushSnapshot(); markDirty(); notify('theme');
  }

  // ============================================================
  // M2 · arbol de navegacion (Administrador de Paginas)
  // ============================================================
  function addNavNode(node) { state.nav.push(node); markDirty(); notify('nav'); }
  // M3: inserta varios nodos de una (auto-nest coleccion) con UN solo markDirty/notify.
  function insertNavNodes(nodes) {
    if (!Array.isArray(nodes) || !nodes.length) return;
    nodes.forEach((n) => state.nav.push(n));
    markDirty(); notify('nav');
  }
  function renameNavNode(id, label) {
    const n = state.nav.find((x) => x.id === id);
    if (n) { n.label = label; markDirty(); notify('nav'); }
  }
  function navSlugExists(slug) { return state.nav.some((n) => n.slug === slug); }
  // M4: reordenar un nodo entre sus HERMANOS (mismo parentId; home excluido = siempre primero).
  // dir = -1 sube, +1 baja. Renumera orden 0..n entre los hermanos no-home.
  function moveNavNode(id, dir) {
    const node = state.nav.find((n) => n.id === id);
    if (!node || node.tipo === 'home') return;
    const pid = node.parentId || null;
    const sibs = state.nav.filter((n) => (n.parentId || null) === pid && n.tipo !== 'home').sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const i = sibs.findIndex((n) => n.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sibs.length) return; // borde -> no-op
    sibs.splice(i, 1); sibs.splice(j, 0, node);
    sibs.forEach((n, k) => { n.orden = k; });
    markDirty(); notify('nav');
  }
  // M4: mostrar/ocultar un nodo del menu (M5 lo respeta). No toca home.
  function setNavMostrarEnMenu(id, val) {
    const n = state.nav.find((x) => x.id === id);
    if (n && n.tipo !== 'home' && n.mostrar_en_menu !== !!val) { n.mostrar_en_menu = !!val; markDirty(); notify('nav'); }
  }
  // M4: borrar un nodo + su RAMA (hijos directos; 2 niveles max -> no hay nietos). Home NUNCA se borra.
  // Devuelve los nodos quitados (para que editor.js calcule las pages[pagina:<slug>] a borrar en el EF).
  function removeNavNode(id) {
    const node = state.nav.find((n) => n.id === id);
    if (!node || node.tipo === 'home') return [];
    const removed = [node].concat(state.nav.filter((n) => n.parentId === id));
    const ids = new Set(removed.map((n) => n.id));
    state.nav = state.nav.filter((n) => !ids.has(n.id));
    markDirty(); notify('nav');
    return removed;
  }
  // M3: ya existe un nodo coleccion que referencia esta categoria?
  function navHasCategoria(catId) { return state.nav.some((n) => n.tipo === 'coleccion' && n.categoria_id === catId); }
  // M3: id del nodo coleccion que referencia esta categoria (para colgar subpaginas), o null.
  function navNodeIdForCategoria(catId) { const n = state.nav.find((x) => x.tipo === 'coleccion' && x.categoria_id === catId); return n ? n.id : null; }

  function findSection(sectionId) {
    return state.sections.find(s => s.id === sectionId) || null;
  }

  // ============================================================
  // FASE D (D3b) · bloques HIJOS de un contenedor (parentId + childId)
  // Cada mutacion emite lastOp = {kind:'replace', sectionId: PADRE} -> el carril de patch existente
  // re-renderiza el contenedor entero (con sus hijos, via la recursion de D2). Undo/redo: los snapshots
  // ya clonan state.sections en profundidad (los hijos viajan adentro). Autosave: notify('sections').
  // ============================================================
  function findContenedor(parentId) {
    const s = state.sections.find(x => x.id === parentId);
    return (s && s.tipo === 'contenedor' && s.props && Array.isArray(s.props.bloques)) ? s : null;
  }
  function _colsDe(sec) { return sec.props.columnas || 1; }
  function _colDe(b, cols) { return Math.min(Math.max(b.columna || 0, 0), cols - 1); }
  function _notifyChild(parentId) {
    state.lastOp = { kind: 'replace', sectionId: parentId };
    notify('sections'); notify('patch');
  }
  function addChildBlock(parentId, tipo, columna) {
    const sec = findContenedor(parentId);
    if (!sec) return null;
    if (sec.props.bloques.length >= 8) {
      if (window.TiendaIA?.toast) window.TiendaIA.toast('Maximo 8 bloques por contenedor', 'error');
      return null;
    }
    const cols = _colsDe(sec);
    const col = Math.min(Math.max(typeof columna === 'number' ? columna : 0, 0), cols - 1);
    const child = createChildDefault(tipo, col);
    sec.props.bloques.push(child);
    pushSnapshot(); markDirty(); _notifyChild(parentId);
    return child.id;
  }
  function removeChildBlock(parentId, childId) {
    const sec = findContenedor(parentId);
    if (!sec) return;
    if (sec.props.bloques.length <= 1) return; // schema min(1): no se borra el ultimo hijo
    sec.props.bloques = sec.props.bloques.filter(b => b.id !== childId);
    pushSnapshot(); markDirty(); _notifyChild(parentId);
  }
  function updateChildProps(parentId, childId, patch) {
    const sec = findContenedor(parentId);
    if (!sec) return;
    const child = sec.props.bloques.find(b => b.id === childId);
    if (!child) return;
    child.props = { ...child.props, ...patch };
    debouncedSnapshot(parentId + ':' + childId + ':props'); // coalescing de tipeo (== updateSectionProps)
    markDirty(); _notifyChild(parentId);
  }
  function updateChildBase(parentId, childId, key, value) {
    const sec = findContenedor(parentId);
    if (!sec) return;
    const child = sec.props.bloques.find(b => b.id === childId);
    if (!child) return;
    child[key] = value;
    pushSnapshot(); markDirty(); _notifyChild(parentId);
  }
  // Reordena un hijo entre sus HERMANOS de la MISMA columna (dir -1 sube / +1 baja), via swap en bloques.
  function reorderChildBlock(parentId, childId, dir) {
    const sec = findContenedor(parentId);
    if (!sec) return;
    const cols = _colsDe(sec);
    const child = sec.props.bloques.find(b => b.id === childId);
    if (!child) return;
    const k = _colDe(child, cols);
    const sibIdx = sec.props.bloques.map((b, i) => ({ b, i })).filter(o => _colDe(o.b, cols) === k).map(o => o.i);
    const pos = sibIdx.indexOf(sec.props.bloques.indexOf(child));
    const tgt = pos + dir;
    if (pos < 0 || tgt < 0 || tgt >= sibIdx.length) return;
    const a = sibIdx[pos], b = sibIdx[tgt];
    const tmp = sec.props.bloques[a]; sec.props.bloques[a] = sec.props.bloques[b]; sec.props.bloques[b] = tmp;
    pushSnapshot(); markDirty(); _notifyChild(parentId);
  }
  function findChild(parentId, childId) {
    const sec = findContenedor(parentId);
    if (!sec) return null;
    return sec.props.bloques.find(b => b.id === childId) || null;
  }

  // FASE D (D4): resuelve un id (de un clic en el canvas) a su target. El id-space es UNICO por
  // construccion (top-level Y hijos usan 'sec_'+nanoid(6)), asi que: top-level primero; si no, en
  // los bloques de los contenedores -> {sectionId:padre, childId}. null si no existe.
  function findTarget(id) {
    if (!id) return null;
    if (findSection(id)) return { sectionId: id, childId: undefined };
    for (const s of state.sections) {
      if (s.tipo === 'contenedor' && s.props && Array.isArray(s.props.bloques)) {
        if (s.props.bloques.some(b => b.id === id)) return { sectionId: s.id, childId: id };
      }
    }
    return null;
  }

  // FASE D (D4): duplica un hijo (clon con id nuevo, MISMA columna) insertado JUSTO DESPUES del
  // original en el array plano. lastOp=replace al PADRE (via _notifyChild) -> re-render del contenedor.
  function duplicateChildBlock(parentId, childId) {
    const sec = findContenedor(parentId);
    if (!sec) return null;
    if (sec.props.bloques.length >= 8) {
      if (window.TiendaIA?.toast) window.TiendaIA.toast('Maximo 8 bloques por contenedor', 'error');
      return null;
    }
    const idx = sec.props.bloques.findIndex(b => b.id === childId);
    if (idx < 0) return null;
    const copy = structuredClone(sec.props.bloques[idx]); // structuredClone preserva copy.columna
    copy.id = 'sec_' + nanoid(6);
    sec.props.bloques.splice(idx + 1, 0, copy);
    pushSnapshot(); markDirty(); _notifyChild(parentId);
    return copy.id;
  }

  // ============================================================
  // Selection (solo seccion en v3)
  // ============================================================
  function select(sectionId, childId) {
    // FASE D: childId opcional (lo usa el chrome de canvas de D4 para seleccionar un hijo; en D3b el
    // inspector renderiza los hijos inline). Aditivo: los callers existentes pasan solo sectionId.
    state.selection = sectionId ? { sectionId, childId: childId || null } : null;
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
    setThemeColors, setThemePalette, setThemeFontPairing, setThemeNavTextSize,
    addNavNode, insertNavNodes, renameNavNode, navSlugExists, navHasCategoria, navNodeIdForCategoria,
    moveNavNode, setNavMostrarEnMenu, removeNavNode,
    findSection, findChild, findContenedor, findTarget,
    addSection, removeSection, reorderSections, duplicateSection,
    updateSectionProps, updateSectionBase,
    addChildBlock, removeChildBlock, updateChildProps, updateChildBase, reorderChildBlock, duplicateChildBlock,
    select, deselect,
    undo, redo, canUndo, canRedo, pushSnapshot,
    markDirty, markClean, markSaving, setDraftSaveStatus,
    serialize,
  };
})(window);
