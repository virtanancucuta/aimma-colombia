/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor.js v3 (carril patch)
 * Entry/wiring. Monta UI 3 paneles (sidebar | iframe | inspector).
 * Autosave draft debounced (~1.5s) via guardar-layout mode:draft.
 * Carril patch: cada edit de seccion -> renderFragment(stash+render) -> applyPatch al iframe,
 * SIN recargar. remove/move = inmediato sin fetch; replace = debounced 300ms; insert = fetch inmediato.
 * restoreFromSnapshot (undo/redo) = reloadFull. saveDraft ya NO recarga el iframe.
 * savePublish conserva refresh() (punto de sync explicito).
 * Guardar = publish. Maneja 409 stale_layout.
 * registerView('editor', mountEditor) — funcion directa (fix Plan 3).
 * Marker: editor-plan4-v3-entry.
 */
(function(window) {
  'use strict';

  const EF_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-guardar-layout';
  const AUTOSAVE_DEBOUNCE_MS = 1500;
  const ERROR_RETRY_MS = 4000;
  const PATCH_DEBOUNCE_MS = 300;
  const EDITING_TIMEOUT_MS = 20000; // C.2 Paso 2: auto-recupera el suspend si se pierde el commit/cancel

  const state = {
    autoSaveTimer: null,
    errorRetryTimer: null,
    resaveQueued: false,    // hubo un cambio mientras un save estaba in-flight -> re-guardar al terminar
    saveErrorRetried: false, // ya se hizo el reintento auto tras un error (no loopear)
    mounted: false,
    unsubs: [],
    patchTimers: {},        // debounce por sectionId para ops 'replace'
    patchQueue: [],         // cola FIFO de patches -> drain SERIAL (aplican EN ORDEN al iframe, sin drift cross-op)
    patchDraining: false,
    pendingSelect: null,    // C.2: id a seleccionar DESPUES de drenar la cola (duplicate -> salta a la copia)
    editingSection: null,   // C.2 Paso 2: seccion con patches SUSPENDIDOS (edicion inline en curso)
    editingTimer: null,     // auto-recuperacion del suspend (timeout, evita congelado silencioso)
    clearEditingAfterDrain: false, // liberar el suspend tras drenar el patch (salteado) del commit
    sampleCategory: null,   // L3: {slug} de la categoria-muestra para preview de Coleccion (null = sin categorias)
    categorias: [],         // M3: catalogo de categorias de la tienda ({id,nombre,slug,parent_id,orden}) para el arbol/picker
    activePageKey: 'home',  // M3: seleccion del switcher (separada de ES.pageId; nodos coleccion -> 'col:<slug>' pero pageId='coleccion')
  };

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') {
      cb();
      return;
    }
    if (attempts >= 200) {
      console.error('[editor.js] window.TiendaIA no inicializo en 10s.');
      return;
    }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  function registerEditor() {
    whenReady(() => {
      window.TiendaIA.registerView('editor', mountEditor);
    });
  }

  async function mountEditor() {
    const T = window.TiendaIA;
    const tienda = T.state.tienda;
    const container = T.dom.mainView;
    if (!tienda) {
      container.innerHTML = '<div style="padding:2rem">No hay tienda asociada.</div>';
      return;
    }
    if (typeof T.registerCleanup === 'function') {
      T.registerCleanup(unmountEditor);
    }

    container.innerHTML = '';
    const view = document.createElement('div');
    view.className = 'ed-view';
    view.id = 'editor-root';
    container.appendChild(view);

    const toolbarEl = document.createElement('header');
    toolbarEl.className = 'ed-toolbar';
    toolbarEl.id = 'editor-toolbar';
    view.appendChild(toolbarEl);

    const shell = document.createElement('div');
    shell.className = 'ed-shell';
    view.appendChild(shell);

    const sidebarEl = document.createElement('aside');
    sidebarEl.className = 'ed-sidebar';
    sidebarEl.id = 'editor-sidebar';
    shell.appendChild(sidebarEl);

    const canvasEl = document.createElement('main');
    canvasEl.className = 'ed-canvas';
    canvasEl.id = 'editor-canvas';
    canvasEl.setAttribute('data-device', 'desktop');
    shell.appendChild(canvasEl);

    const inspectorEl = document.createElement('aside');
    inspectorEl.className = 'ed-inspector';
    inspectorEl.id = 'editor-inspector';
    shell.appendChild(inspectorEl);

    // Init state v3
    window.TiendaIA.editorState.init(tienda.personalizaciones, tienda.id);
    state.activePageKey = 'home';
    // M3: cargar el catalogo de categorias (arbol nav + picker) y derivar la categoria-muestra.
    await resolveCategorias();
    // Autosave re-armado en CADA cambio de contenido (fix del latch: antes solo se
    // suscribia a 'dirty', que notifica solo en la transicion false->true -> sub-guardaba).
    // 'sections'/'theme' notifican en cada mutacion; 'dirty' cubre el primer cambio / starter.
    state.unsubs.push(window.TiendaIA.editorState.subscribe('sections', scheduleAutosave));
    state.unsubs.push(window.TiendaIA.editorState.subscribe('theme', scheduleAutosave));
    state.unsubs.push(window.TiendaIA.editorState.subscribe('dirty', scheduleAutosave));
    // M2: cambios del arbol (agregar/renombrar pagina) tambien re-arman el autosave.
    state.unsubs.push(window.TiendaIA.editorState.subscribe('nav', scheduleAutosave));
    // Carril patch: cada mutacion de seccion notifica 'patch' -> actualiza iframe sin reload.
    state.unsubs.push(window.TiendaIA.editorState.subscribe('patch', onPatch));
    // C.2 Paso 2: auto-recuperacion on-next-interaction -> si la seleccion cambia a OTRA seccion
    // mientras hay un suspend inline en curso, liberarlo (el edit se abandono).
    state.unsubs.push(window.TiendaIA.editorState.subscribe('selection', function () {
      const sel = window.TiendaIA.editorState.selection;
      if (state.editingSection && (!sel || sel.sectionId !== state.editingSection)) clearEditingSection();
    }));

    // Render paneles
    window.TiendaIA.editorToolbar.render(toolbarEl, {
      onBack: () => handleBack(),
      onUndo: () => window.TiendaIA.editorState.undo(),
      onRedo: () => window.TiendaIA.editorState.redo(),
      onSave: () => savePublish(),
      onPreview: () => openPreviewTab(),
      onDeselect: () => window.TiendaIA.editorState.deselect(),
      onTheme: () => window.TiendaIA.editorThemePanel.toggle(),
    });

    window.TiendaIA.editorSidebar.render(sidebarEl, {
      onAddSection: () => openCatalog(),
      onSwitchPage: (key) => switchPage(key),
      getPages: () => buildPageList(),
      onAddBlankPage: (parentNodeId) => addBlankPage(parentNodeId),
      onAddColeccion: (catId, parentNodeId) => addColeccionPage(catId, parentNodeId),
      getCategoriasSinPagina: () => getCategoriasSinPagina(),
      onRenamePage: (nodeId, label) => renamePage(nodeId, label),
      onMoveNode: (nodeId, dir) => window.TiendaIA.editorState.moveNavNode(nodeId, dir),
      onToggleMostrar: (nodeId, val) => window.TiendaIA.editorState.setNavMostrarEnMenu(nodeId, val),
      onDeleteNode: (nodeId) => deleteNode(nodeId),
    });

    window.TiendaIA.editorCanvas.render(canvasEl, {});

    window.TiendaIA.editorInspector.render(inspectorEl, {});

    window.TiendaIA.editorThemePanel.render(shell);

    // First-use: si la pagina NO tiene secciones, ofrecer starter o desde cero.
    // (Mas robusto que depender de la columna editor_first_choice_at, que no
    //  siempre viene en el SELECT del admin.)
    if (window.TiendaIA.editorState.sections.length === 0) {
      window.TiendaIA.editorFirstUse.showFirstUseModal((choice) => {
        if (choice === 'starter') {
          const starter = window.TiendaIA.editorFirstUse.createStarterPage();
          starter.forEach(sec => window.TiendaIA.editorState.sections.push(sec));
          window.TiendaIA.editorState.pushSnapshot();
          window.TiendaIA.editorState.markDirty();
          // markDirty -> notify('dirty') -> scheduleAutosave (el starter se persiste).
          window.TiendaIA.editorState.select(starter[0].id);
          // Starter mete varias secciones de una -> reload completo (no N inserts individuales).
          if (window.TiendaIA?.editorCanvas?.reloadFull) window.TiendaIA.editorCanvas.reloadFull();
        }
        markFirstChoice();
      });
    }

    state.mounted = true;
    window.addEventListener('beforeunload', beforeUnloadGuard);
  }

  function unmountEditor() {
    state.mounted = false;
    if (state.autoSaveTimer) { clearTimeout(state.autoSaveTimer); state.autoSaveTimer = null; }
    if (state.errorRetryTimer) { clearTimeout(state.errorRetryTimer); state.errorRetryTimer = null; }
    Object.keys(state.patchTimers).forEach(function(k) { clearTimeout(state.patchTimers[k]); });
    state.patchTimers = {};
    state.patchQueue = [];
    state.patchDraining = false;
    state.pendingSelect = null;
    clearEditingSection(); // C.2 Paso 2: limpiar suspend + timer
    state.unsubs.forEach(u => { try { u(); } catch (e) {} });
    state.unsubs = [];
    window.removeEventListener('beforeunload', beforeUnloadGuard);
    if (window.TiendaIA?.editorCanvas?.destroy) window.TiendaIA.editorCanvas.destroy();
    if (window.TiendaIA?.editorToolbar?.unbindKeyboard) window.TiendaIA.editorToolbar.unbindKeyboard();
  }

  function beforeUnloadGuard(e) {
    if (window.TiendaIA.editorState.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  // ============================================================
  // Carril patch (Task 5 Fase C): dispatcher + async fetch
  // ============================================================
  // onPatch: ENCOLA el op (replace debounced por seccion; resto inmediato) -> drain SERIAL en orden.
  function onPatch() {
    const ES = window.TiendaIA.editorState;
    const op = ES.lastOp;
    if (!op) return;
    if (op.kind === 'replace') {
      clearTimeout(state.patchTimers[op.sectionId]);
      state.patchTimers[op.sectionId] = setTimeout(function() {
        enqueuePatch({ kind: 'replace', sectionId: op.sectionId });
      }, PATCH_DEBOUNCE_MS);
    } else {
      // insert/remove/move/reload: encolar AHORA (preserva el orden relativo entre ops estructurales)
      enqueuePatch({ kind: op.kind, sectionId: op.sectionId, index: op.index, toIndex: op.toIndex });
    }
  }

  function enqueuePatch(item) {
    state.patchQueue.push(item);
    drainPatches();
  }

  // Drain SERIAL: un patch a la vez, EN ORDEN. El iframe converge al estado de editorState sin races
  // ni drift cross-op (los ops estructurales aplican secuencial sobre un DOM consistente).
  async function drainPatches() {
    if (state.patchDraining) return;
    state.patchDraining = true;
    try {
      while (state.patchQueue.length) {
        await applyOnePatch(state.patchQueue.shift());
      }
    } finally {
      state.patchDraining = false;
      // C.2 (condicion c): set-selection DIFERIDO. Tras drenar TODA la cola, anclar el chrome al
      // nodo recien patcheado (no a uno viejo). Lo usa duplicate -> selecciona la copia ya renderizada.
      if (state.pendingSelect) {
        const sid = state.pendingSelect;
        state.pendingSelect = null;
        try { window.TiendaIA.editorState.select(sid); } catch (e) {}
      }
      // C.2 Paso 2: tras drenar el patch (salteado) del commit inline, liberar el suspend.
      if (state.clearEditingAfterDrain) { clearEditingSection(); }
    }
  }

  // C.2 Paso 2: SUSPEND de patches de la seccion en edicion inline + auto-recuperacion (timeout).
  // No toca la cola serial ni el hotfix: solo un flag que applyOnePatch consulta para saltear.
  function setEditingSection(sectionId) {
    if (typeof sectionId !== 'string') return;
    state.editingSection = sectionId;            // un nuevo start para otra seccion libera la anterior
    if (state.editingTimer) clearTimeout(state.editingTimer);
    state.editingTimer = setTimeout(function () { clearEditingSection(); }, EDITING_TIMEOUT_MS);
  }
  function clearEditingSection() {
    state.editingSection = null;
    state.clearEditingAfterDrain = false;
    if (state.editingTimer) { clearTimeout(state.editingTimer); state.editingTimer = null; }
  }
  // commit inline: MISMA RUTA que el inspector (updateSectionProps via setByPath) -> autosave/undo del
  // hotfix; el patch que dispara se SALTEA (el suspend sigue activo) y el suspend se libera tras drenarlo.
  function commitInlineEdit(sectionId, fieldPath, value) {
    const ES = window.TiendaIA.editorState;
    const IF = window.TiendaIA.editorInlineFields;
    const sec = ES.findSection(sectionId);
    if (!sec || !IF) { clearEditingSection(); return; }
    const nextProps = IF.setByPath(sec.props, fieldPath, value);
    if (!nextProps) { clearEditingSection(); return; } // ruta invalida/campo inexistente -> no mutar
    state.clearEditingAfterDrain = true;
    ES.updateSectionProps(sectionId, nextProps);
  }

  // C.2: agenda una seleccion para DESPUES de que drene el patch (la emite set-selection via el
  // canal 'selection'). Si no hay drain ni cola, selecciona ya (no hay patch que esperar).
  function pendingSelectAfterPatch(id) {
    if (!id) return;
    if (!state.patchDraining && state.patchQueue.length === 0) {
      try { window.TiendaIA.editorState.select(id); } catch (e) {} // defensivo: no propagar al caller
    } else {
      state.pendingSelect = id;
    }
  }

  async function applyOnePatch(item) {
    const ES = window.TiendaIA.editorState;
    const canvas = window.TiendaIA.editorCanvas;
    if (!canvas) return;
    // C.2 Paso 2: SUSPEND -> saltear patches de la seccion en edicion inline (el DOM ya muestra lo
    // tipeado; un replace la reemplazaria con el SSR y perderia cursor/texto). Acople minimo, sin tocar la cola.
    if (state.editingSection && item.sectionId === state.editingSection) return;
    if (item.kind === 'reload') { state.patchQueue.length = 0; if (canvas.reloadFull) canvas.reloadFull(); return; }
    if (item.kind === 'remove') { if (canvas.applyPatch) canvas.applyPatch('remove', { sectionId: item.sectionId }); return; }
    if (item.kind === 'move')   { if (canvas.applyPatch) canvas.applyPatch('move', { sectionId: item.sectionId, toIndex: item.toIndex }); return; }
    // replace / insert: render del estado ACTUAL (findSection al PROCESAR -> lo mas reciente) + apply
    const section = ES.findSection(item.sectionId);
    if (!section || !canvas.renderFragment) return;
    try {
      const html = await canvas.renderFragment(section);
      canvas.applyPatch(item.kind === 'insert' ? 'insert' : 'replace', { sectionId: item.sectionId, html: html, index: item.index });
    } catch (e) {
      console.warn('[editor] patch fallo -> reload', e && e.message);
      state.patchQueue.length = 0;
      if (canvas.reloadFull) canvas.reloadFull();
    }
  }

  // Autosave debounced, re-armado en CADA cambio (no solo en la transicion dirty).
  // Coalescing: el timer se reinicia con cada cambio -> 1 save ~1.5s tras quedar inactivo.
  function scheduleAutosave() {
    if (!window.TiendaIA.editorState.dirty) return; // markClean (publish) tambien notifica 'dirty'
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = setTimeout(saveDraft, AUTOSAVE_DEBOUNCE_MS);
  }

  // Un reintento auto tras un error (blip de red). Si vuelve a fallar queda en 'error'
  // y el proximo cambio del usuario re-arma. saveErrorRetried evita el loop infinito.
  function scheduleErrorRetry() {
    if (state.saveErrorRetried) return;
    state.saveErrorRetried = true;
    if (state.errorRetryTimer) clearTimeout(state.errorRetryTimer);
    state.errorRetryTimer = setTimeout(() => {
      if (window.TiendaIA.editorState.dirty) saveDraft();
    }, ERROR_RETRY_MS);
  }

  // ============================================================
  // Page switcher (L3)
  // ============================================================
  // Categoria-muestra (primera por orden) para previsualizar Coleccion (plantilla GLOBAL).
  // null -> la tienda no tiene categorias -> Coleccion deshabilitada en el switcher.
  async function resolveCategorias() {
    state.categorias = [];
    state.sampleCategory = null;
    const sb = window.TiendaIA.supabase && window.TiendaIA.supabase();
    const ES = window.TiendaIA.editorState;
    if (!sb || !ES.tienda_id) return;
    try {
      const { data } = await sb.from('categorias')
        .select('id,nombre,slug,parent_id,orden').eq('tienda_id', ES.tienda_id)
        .order('orden', { ascending: true });
      state.categorias = (data || []).filter((c) => c && c.slug);
      // Categoria-muestra (primera por orden, top-level si hay) para el fallback de Coleccion.
      const sample = state.categorias.find((c) => !c.parent_id) || state.categorias[0];
      if (sample && sample.slug) state.sampleCategory = { slug: sample.slug };
    } catch (e) { /* sin categorias -> Coleccion deshabilitada / sin nodos */ }
  }

  // M3: un nodo nav -> item del switcher. id = clave UNICA del switcher; pageId = target de edicion;
  // previewPath = ruta a previsualizar. Nodos coleccion -> pageId='coleccion' (plantilla GLOBAL) +
  // preview /c/<slug>; comparten target, se distinguen por id 'col:<slug>' (activePageKey marca cual).
  function navToItem(n, depth) {
    const mostrar = n.mostrar_en_menu !== false; // default true
    if (n.tipo === 'home') return { id: 'home', label: 'Inicio', tipo: 'home', pageId: 'home', previewPath: '/', depth: depth, enabled: true, mostrar: true };
    if (n.tipo === 'coleccion') return { id: 'col:' + n.slug, label: n.label, tipo: 'coleccion', pageId: 'coleccion', previewPath: '/c/' + n.slug, depth: depth, enabled: true, nodeId: n.id, mostrar: mostrar };
    if (n.tipo === 'blanco') return { id: 'pagina:' + n.slug, label: n.label, tipo: 'blanco', pageId: 'pagina:' + n.slug, previewPath: '/pagina/' + n.slug, depth: depth, enabled: true, nodeId: n.id, mostrar: mostrar };
    return null;
  }

  // El switcher lista el ARBOL nav completo: Inicio + nodos coleccion anidados (2 niveles) + paginas en blanco.
  function buildPageList() {
    const ES = window.TiendaIA.editorState;
    const nav = ES.nav || [];
    const byOrden = (a, b) => (a.orden || 0) - (b.orden || 0);
    const childrenOf = (id) => nav.filter((n) => (n.parentId || null) === id).sort(byOrden);
    const list = [];
    // Inicio SIEMPRE primero (del nodo home si existe; si no, sintetizado).
    const homeNode = nav.find((n) => n.tipo === 'home');
    list.push(navToItem(homeNode || { tipo: 'home' }, 0));
    // Top-level no-home, por orden, cada uno + sus hijos directos (profundidad 2 max).
    nav.filter((n) => (n.parentId || null) === null && n.tipo !== 'home').sort(byOrden).forEach((n) => {
      const it = navToItem(n, 0); if (!it) return;
      list.push(it);
      childrenOf(n.id).forEach((c) => { const ci = navToItem(c, 1); if (ci) list.push(ci); });
    });
    // Fallback "Coleccion" suelta SOLO si NO hay nodos coleccion en el arbol (tienda sin sembrar) pero hay categorias.
    if (!list.some((i) => i.tipo === 'coleccion')) {
      list.splice(1, 0, {
        id: 'coleccion', label: 'Coleccion', tipo: 'coleccion', pageId: 'coleccion',
        previewPath: state.sampleCategory ? ('/c/' + state.sampleCategory.slug) : null, depth: 0,
        enabled: !!state.sampleCategory,
        hint: state.sampleCategory ? '' : 'Necesitas al menos una categoria para editar la pagina de Coleccion',
      });
    }
    const active = state.activePageKey || 'home';
    return list.map((p) => Object.assign({}, p, { active: p.id === active }));
  }

  // Flush del borrador de la pagina ACTUAL antes de cambiar. Reusa saveDraft (hotfix-14 intacto).
  // CLAVE: dirty NO se limpia al guardar borrador -> el flush NO espera dirty=false; espera a que el
  // save en vuelo termine y fuerza un ultimo saveDraft awaited. Si falla -> false (el caller ABORTA
  // el switch). Sin carrera de mutacion concurrente (el click de cambiar pagina no coincide con tipeo).
  async function flushDraft() {
    const ES = window.TiendaIA.editorState;
    if (state.autoSaveTimer) { clearTimeout(state.autoSaveTimer); state.autoSaveTimer = null; }
    let guard = 0;
    while (ES.saving && guard++ < 100) { await new Promise((r) => setTimeout(r, 50)); } // <=5s
    if (ES.dirty) { await saveDraft(); } // no-op si !dirty
    if (state.autoSaveTimer) { clearTimeout(state.autoSaveTimer); state.autoSaveTimer = null; }
    return ES.draftSaveStatus !== 'error';
  }

  // Limpia el carril patch + el suspend inline (apuntan al iframe de la pagina vieja).
  function clearPatchState() {
    Object.keys(state.patchTimers).forEach((k) => clearTimeout(state.patchTimers[k]));
    state.patchTimers = {};
    state.patchQueue = [];
    state.patchDraining = false;
    state.pendingSelect = null;
    clearEditingSection();
  }

  // M3: deriva {pageId target, previewPath} desde la clave del switcher. Nodos coleccion ('col:<slug>')
  // y la entrada suelta 'coleccion' editan la MISMA plantilla GLOBAL (pageId='coleccion'); el preview
  // cambia segun la categoria. null = clave de coleccion sin categoria disponible.
  function resolvePageTarget(key) {
    if (key === 'home') return { pageId: 'home', previewPath: '/', coleccion: false };
    if (key === 'coleccion') {
      if (!state.sampleCategory) return null;
      return { pageId: 'coleccion', previewPath: '/c/' + state.sampleCategory.slug, coleccion: true };
    }
    if (key.indexOf('col:') === 0) return { pageId: 'coleccion', previewPath: '/c/' + key.slice(4), coleccion: true };
    if (key.indexOf('pagina:') === 0) return { pageId: 'pagina:' + key.slice(7), previewPath: '/pagina/' + key.slice(7), coleccion: false };
    return null;
  }

  // Cambia de pagina: GUARD anti-perdida (flush) -> init(target) -> canvas recarga a su preview.
  // `key` = clave del switcher (home / coleccion / col:<slug> / pagina:<slug>).
  async function switchPage(key) {
    const ES = window.TiendaIA.editorState;
    if (!key || key === (state.activePageKey || 'home')) return;
    const target = resolvePageTarget(key);
    if (!target) {
      toast('Necesitas al menos una categoria para editar la pagina de Coleccion.', 'info');
      return;
    }
    // 1) GUARD ANTI-PERDIDA: si no se pudo guardar el borrador, NO cambiamos (el usuario queda aca).
    const ok = await flushDraft();
    if (!ok) {
      toast('No pudimos guardar tu borrador. Reintenta antes de cambiar de pagina.', 'error');
      return;
    }
    // 2) limpiar el carril patch (apunta al iframe viejo)
    clearPatchState();
    // 3) marcar la seleccion del switcher ANTES de init (el rebuild por 'sections' lee activePageKey).
    state.activePageKey = key;
    // 4) cargar la pagina target (nodos coleccion comparten la plantilla GLOBAL 'coleccion')
    const T = window.TiendaIA;
    ES.init(T.state.tienda.personalizaciones, ES.tienda_id, target.pageId);
    // 5) recargar el canvas al preview correspondiente (token page-agnostic)
    if (T.editorCanvas) {
      T.editorCanvas.setPagePath(target.previewPath);
      T.editorCanvas.reloadFull();
    }
  }

  // ============================================================
  // M2 · Paginas EN BLANCO (CRUD del Administrador de Paginas)
  // ============================================================
  // Slugs reservados (rutas del storefront + claves internas). El slug es INMUTABLE post-creacion.
  const SLUGS_RESERVADOS = ['c', 'p', 'buscar', 'carrito', 'checkout', 'legales', 'internal', 'robots', 'sitemap', 'pagina', 'api', 'home'];

  function slugify(nombre) {
    return (nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  }
  function navId() {
    const c = '0123456789abcdefghijklmnopqrstuvwxyz'; let s = '';
    for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }
  // Valida el slug: url-safe (== NAV_SLUG_RE del schema) + no reservado + unico (nav + pages).
  function validarSlug(slug) {
    const ES = window.TiendaIA.editorState;
    if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(slug)) return 'El nombre genera un identificador invalido. Usa al menos 2 letras o numeros.';
    if (SLUGS_RESERVADOS.indexOf(slug) >= 0) return 'Ese nombre esta reservado por el sistema. Elegi otro.';
    if (ES.navSlugExists(slug)) return 'Ya tenes una pagina con ese nombre.';
    const pers = window.TiendaIA?.state?.tienda?.personalizaciones || {};
    if (pers.pages && (pers.pages['pagina:' + slug] || pers.pages['pagina:' + slug + '_draft'])) return 'Ya existe una pagina con ese identificador.';
    return null;
  }

  // Crear pagina EN BLANCO. parentNodeId (M4) -> nace como SUBpagina del nodo dado (2 niveles max:
  // el sidebar solo lo ofrece en nodos top-level). null -> top-level. Persiste nav + switch a la nueva.
  async function addBlankPage(parentNodeId) {
    const ES = window.TiendaIA.editorState;
    const pid = parentNodeId || null;
    const nombre = (window.prompt(pid ? 'Nombre de la subpagina nueva:' : 'Nombre de la pagina nueva:', '') || '').trim();
    if (!nombre) return;
    const slug = slugify(nombre);
    const err = validarSlug(slug);
    if (err) { toast(err, 'error'); return; }
    const orden = (ES.nav || []).filter((n) => (n.parentId || null) === pid).length;
    ES.addNavNode({
      id: 'nav_' + navId(), tipo: 'blanco', label: nombre.slice(0, 80), slug,
      parentId: pid, orden, mostrar_en_menu: true,
    });
    // Persistir el nav (con el nodo nuevo) antes de cambiar -> flushDraft guarda la pagina actual + nav.
    const ok = await flushDraft();
    if (!ok) { toast('No pudimos crear la pagina. Reintenta.', 'error'); return; }
    await switchPage('pagina:' + slug); // nace vacia -> /pagina/<slug> preview muestra el contenedor editable
  }

  // Renombrar una pagina (label del nodo nav). El slug/ruta NO cambia (inmutable).
  function renamePage(nodeId, labelActual) {
    const ES = window.TiendaIA.editorState;
    const nombre = (window.prompt('Nuevo nombre de la pagina:', labelActual || '') || '').trim();
    if (!nombre || nombre === labelActual) return;
    ES.renameNavNode(nodeId, nombre.slice(0, 80)); // markDirty + notify('nav') -> autosave (subscrito) persiste
  }

  // M4: borrar un nodo del arbol con REGLAS. Inicio NO se borra (sin nodeId/no llega). Categoria (coleccion)
  // -> solo lo saca del arbol (NO toca la categoria ni la plantilla). En blanco -> lo saca Y borra su
  // contenido (pages[pagina:slug]+draft via EF deletePages). Padre con hijos -> confirma (borra la rama).
  // Si la pagina activa esta en la rama borrada -> vuelve a Inicio.
  async function deleteNode(id) {
    const T = window.TiendaIA;
    const ES = T.editorState;
    const node = (ES.nav || []).find((n) => n.id === id);
    if (!node || node.tipo === 'home') return;
    const children = (ES.nav || []).filter((n) => (n.parentId || null) === id);
    const esBlanco = node.tipo === 'blanco';
    const msg = esBlanco
      ? ('Borrar la pagina "' + node.label + '"' + (children.length ? ' y sus ' + children.length + ' subpagina(s)' : '') + '?\n\nNo se puede deshacer.')
      : ('Quitar "' + node.label + '" del menu?\n\nNO borra la categoria ni sus productos' + (children.length ? '. Tambien quita sus ' + children.length + ' subpagina(s).' : '.'));
    if (!window.confirm(msg)) return;
    const removed = [node].concat(children);
    const deletePages = removed.filter((n) => n.tipo === 'blanco' && n.slug).map((n) => 'pagina:' + n.slug);
    const removedKeys = removed.map((n) => n.tipo === 'blanco' ? ('pagina:' + n.slug) : ('col:' + n.slug));
    const activeRemoved = removedKeys.indexOf(state.activePageKey || 'home') >= 0;
    // 1) si la pagina activa esta en la rama -> ir a Inicio PRIMERO (deletePages limpia el draft re-flusheado).
    if (activeRemoved) await switchPage('home');
    // 2) sacar el nodo + su rama del nav
    ES.removeNavNode(id);
    // 3) guardar: nav reducido + deletePages. Cancela autosave pendiente (evita doble guardado).
    if (state.autoSaveTimer) { clearTimeout(state.autoSaveTimer); state.autoSaveTimer = null; }
    await saveDraft(deletePages.length ? deletePages : undefined);
    toast(esBlanco ? 'Pagina borrada.' : 'Quitada del menu.', 'success');
  }

  // ============================================================
  // M3 · Paginas de COLECCION (referencian una categoria existente) + auto-nest
  // ============================================================
  // D3: categorias que TODAVIA no tienen nodo en el arbol -> el dueno las puede sumar (no se pierde ninguna).
  function getCategoriasSinPagina() {
    const ES = window.TiendaIA.editorState;
    return (state.categorias || [])
      .filter((c) => !ES.navHasCategoria(c.id))
      .map((c) => ({ id: c.id, nombre: c.nombre || c.slug, slug: c.slug, esSub: !!c.parent_id }));
  }

  // Nodos a insertar al agregar una categoria como Coleccion: el nodo principal + AUTO-NEST de sus
  // subcategorias SIN nodo. Respeta 2 niveles (solo anida si el principal queda top-level) y no duplica.
  function buildColeccionNodes(catId) {
    const ES = window.TiendaIA.editorState;
    const cats = state.categorias || [];
    const cat = cats.find((c) => c.id === catId);
    if (!cat || ES.navHasCategoria(catId)) return [];
    // parentId del nuevo nodo: si la categoria tiene padre Y el padre ya es nodo -> colgar ahi; si no, top-level.
    const parentNodeId = cat.parent_id ? ES.navNodeIdForCategoria(cat.parent_id) : null;
    const ordenBase = (ES.nav || []).reduce((m, n) => Math.max(m, (n.orden || 0)), 0) + 1;
    const mainId = 'nav_' + navId();
    const nodes = [{
      id: mainId, tipo: 'coleccion', label: (cat.nombre || cat.slug).slice(0, 80), slug: cat.slug,
      categoria_id: cat.id, parentId: parentNodeId, orden: ordenBase, mostrar_en_menu: true,
    }];
    // AUTO-NEST: subcategorias directas sin nodo, SOLO si el principal es top-level (sus hijos = nivel 2 -> ok).
    if (!parentNodeId) {
      cats.filter((c) => c.parent_id === catId && !ES.navHasCategoria(c.id)).forEach((sub, i) => {
        nodes.push({
          id: 'nav_' + navId(), tipo: 'coleccion', label: (sub.nombre || sub.slug).slice(0, 80), slug: sub.slug,
          categoria_id: sub.id, parentId: mainId, orden: i + 1, mostrar_en_menu: true,
        });
      });
    }
    return nodes;
  }

  // Agregar pagina de CATEGORIA (categoria existente). parentNodeId (M4) -> cuelga explicito del padre
  // SIN auto-nest (ya es nivel 2). null -> top-level + auto-nest de subcategorias (M3). Switch al nodo nuevo.
  async function addColeccionPage(catId, parentNodeId) {
    const ES = window.TiendaIA.editorState;
    let nodes;
    if (parentNodeId) {
      const cat = (state.categorias || []).find((c) => c.id === catId);
      if (!cat || ES.navHasCategoria(catId)) { toast('Esa categoria ya tiene pagina.', 'info'); return; }
      const orden = (ES.nav || []).filter((n) => (n.parentId || null) === parentNodeId).length;
      nodes = [{ id: 'nav_' + navId(), tipo: 'coleccion', label: (cat.nombre || cat.slug).slice(0, 80), slug: cat.slug, categoria_id: cat.id, parentId: parentNodeId, orden, mostrar_en_menu: true }];
    } else {
      nodes = buildColeccionNodes(catId);
    }
    if (!nodes.length) { toast('Esa categoria ya tiene pagina.', 'info'); return; }
    ES.insertNavNodes(nodes);
    const ok = await flushDraft();
    if (!ok) { toast('No pudimos agregar la pagina. Reintenta.', 'error'); return; }
    await switchPage('col:' + nodes[0].slug); // selecciona el nodo nuevo (preview /c/<slug>)
  }

  function openCatalog() {
    window.TiendaIA.editorModalCatalog.open(async (tipo) => {
      const ES = window.TiendaIA.editorState;
      const wasEmpty = ES.sections.length === 0;
      const id = ES.addSection(tipo);
      if (!id) return;
      ES.select(id);
      // L3-fix: coleccion vacia tiene el contenedor [data-ed-sections] -> el patch-rail inserta la
      // primera seccion LIVE (sin recarga). Home vacio muestra el fallback (sin contenedor) -> guardamos
      // el draft (await) y recien recargamos, para que el reload lea el draft fresco (no el stale).
      if (wasEmpty && ES.pageId === 'home') {
        await flushDraft();
        if (window.TiendaIA?.editorCanvas?.reloadFull) window.TiendaIA.editorCanvas.reloadFull();
      }
      // Secciones que referencian datos del catalogo nacen con un placeholder all-zeros (Zod-valido).
      // Lo reemplazamos por data REAL de ESTA tienda para que la seccion no nazca vacia. Si falla o no
      // hay data, el placeholder queda -> degradacion graciosa (publico no muestra nada; preview hint).
      try { await resolveLiveDefault(tipo, id, ES); } catch (_) { /* placeholder queda */ }
    });
  }

  // Resolver de default en vivo, TENANT-SCOPED (.eq('tienda_id') -> nunca data de otra tienda).
  async function resolveLiveDefault(tipo, id, ES) {
    const sb = window.TiendaIA.supabase && window.TiendaIA.supabase();
    if (!sb || !ES.tienda_id) return;
    if (tipo === 'categorias_destacadas') {
      const { data } = await sb.from('categorias')
        .select('id').eq('tienda_id', ES.tienda_id).order('orden', { ascending: true }).limit(3);
      if (data && data.length) ES.updateSectionProps(id, { items: data.map((c) => ({ categoria_id: c.id })) });
    } else if (tipo === 'producto_destacado') {
      const { data } = await sb.from('productos')
        .select('id').eq('tienda_id', ES.tienda_id).eq('estado', 'activo')
        .order('updated_at', { ascending: false }).limit(1);
      if (data && data.length) ES.updateSectionProps(id, { producto_id: data[0].id });
    }
  }

  function openPreviewTab() {
    const url = window.TiendaIA?.editorCanvas?.previewUrl;
    if (url) {
      window.open(url, '_blank', 'noopener');
    } else {
      toast('La vista previa aun no esta lista. Espera unos segundos.', 'info');
    }
  }

  // ============================================================
  // Save
  // ============================================================
  async function saveDraft(deletePages) {
    const ES = window.TiendaIA.editorState;
    const hasDeletes = Array.isArray(deletePages) && deletePages.length > 0; // M4: borrar paginas
    if (!ES.dirty && !hasDeletes) return;
    // Si hay un save in-flight, NO lo descartamos: encolamos un re-guardado para no perder
    // el cambio que llego durante el save (antes 'return' silencioso = perdida de datos).
    if (ES.saving) { state.resaveQueued = true; return; }
    ES.markSaving(true);
    ES.setDraftSaveStatus('saving');
    try {
      const body = {
        tienda_id: ES.tienda_id,
        page_id: ES.pageId,
        mode: 'draft',
        personalizaciones: ES.serialize(),
        base_updated_at: ES.base_updated_at,
      };
      if (hasDeletes) body.deletePages = deletePages; // M4: el EF borra pages[pagina:<slug>] + _draft
      const r = await callEF(body);
      if (r && r.success) {
        ES.setLastDraftSavedAt(new Date());
        ES.setDraftSaveStatus('saved');
        state.saveErrorRetried = false;
        syncTiendaCache('draft', r.home, hasDeletes ? deletePages : null); // refresca state.tienda
        // El carril patch mantiene el iframe en sync: NO refrescamos aqui (evita reload cada autosave).
        // Tocar toolbar para actualizar "Borrador guardado hace ..."
        if (window.TiendaIA?.editorToolbar?.updateButtons) window.TiendaIA.editorToolbar.updateButtons();
      } else if (r && r.error === 'stale_layout') {
        handleStale(r);
        ES.setDraftSaveStatus('saved'); // resuelto el stale, no dejamos el chip en error
      } else {
        // VISIBLE, no silencioso. callEF ya reintento 1x el 401 con token fresco.
        // dirty sigue true -> el cambio NO se pierde; reintento auto + re-arme en proximo cambio.
        ES.setDraftSaveStatus('error');
        console.warn('[editor] saveDraft error', r && r.error);
        scheduleErrorRetry();
      }
    } catch (err) {
      ES.setDraftSaveStatus('error');
      console.error('saveDraft error', err);
      scheduleErrorRetry();
    } finally {
      ES.markSaving(false);
      // Cambio llegado durante el save -> re-guardar ahora (cero perdida por concurrencia).
      if (state.resaveQueued) { state.resaveQueued = false; scheduleAutosave(); }
    }
  }

  async function savePublish() {
    const ES = window.TiendaIA.editorState;
    if (ES.saving) return;
    ES.markSaving(true);
    try {
      const body = {
        tienda_id: ES.tienda_id,
        page_id: ES.pageId,
        mode: 'publish',
        personalizaciones: ES.serialize(),
        base_updated_at: ES.base_updated_at,
      };
      const r = await callEF(body);
      if (r && r.success) {
        ES.markClean(r.updated_at);
        ES.setDraftSaveStatus('saved');
        state.saveErrorRetried = false;
        syncTiendaCache('publish', r.home); // refresca state.tienda para re-entrar sin recargar
        if (window.TiendaIA?.editorCanvas?.refresh) window.TiendaIA.editorCanvas.refresh();
        toast('Tienda actualizada ✓', 'success');
      } else if (r && r.error === 'stale_layout') {
        handleStale(r);
      } else {
        toast('No pudimos guardar. Intenta de nuevo.', 'error');
      }
    } catch (err) {
      console.error('savePublish error', err);
      toast('No pudimos guardar. Intenta de nuevo.', 'error');
    } finally {
      ES.markSaving(false);
    }
  }

  // _retry: en el reintento fuerza un refresh REAL del token (getAccessToken(true)).
  async function callEF(body, _retry) {
    const token = window.TiendaIA?.getAccessToken
      ? await window.TiendaIA.getAccessToken(_retry === true)
      : null;
    if (!token) {
      if (!_retry) return callEF(body, true); // sin token -> forzar refresh + reintentar 1x
      console.error('callEF: sin token');
      return { error: 'unauthorized' };
    }
    const r = await fetch(EF_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    // retry-on-401: token stale/expirado en la ventana de carrera -> token fresco + 1 reintento.
    if (r.status === 401 && !_retry) {
      return callEF(body, true);
    }
    return await r.json().catch(() => ({ error: 'parse_error' }));
  }

  // Mantiene T.state.tienda.personalizaciones en sync con lo recien guardado, para que
  // re-entrar al editor en la misma sesion (sin recargar la pagina) cargue el dato fresco
  // en vez del valor de carga del admin. savedPage = r.home (pagina autoritativa de la EF,
  // con su updated_at -> evita falsos 409 en el siguiente guardado). draft toca home_draft;
  // publish reemplaza home y borra home_draft (igual que la EF).
  function syncTiendaCache(mode, savedPage, deletePages) {
    const T = window.TiendaIA;
    if (!T || !T.state || !T.state.tienda || !savedPage) return;
    const pageId = T.editorState.pageId;          // pagina activa (default 'home')
    const draftKey = pageId + '_draft';
    const cur = T.state.tienda.personalizaciones || { schema_version: 3, pages: {} };
    const draftTheme = T.editorState.serialize().theme; // el theme que se edita ES el borrador
    const draftNav = T.editorState.serialize().nav;     // M2: el arbol que se edita
    const next = { schema_version: 3, pages: { ...(cur.pages || {}) } };
    // M4: borrar paginas (key pagina:<slug>) + su _draft del cache, igual que el EF (guardrail: solo pagina:<slug>).
    if (Array.isArray(deletePages)) {
      deletePages.forEach((k) => {
        if (typeof k === 'string' && /^pagina:[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(k)) { delete next.pages[k]; delete next.pages[k + '_draft']; }
      });
    }
    // M2: preservar nav/nav_draft existentes (mirror del EF buildNext) antes de aplicar el del cliente.
    if (cur.nav !== undefined) next.nav = cur.nav;
    if (cur.nav_draft !== undefined) next.nav_draft = cur.nav_draft;
    if (mode === 'publish') {
      next.theme = draftTheme;          // promueve
      // theme_draft se elimina (no se copia)
      next.pages[pageId] = savedPage;
      delete next.pages[draftKey];
      if (draftNav !== undefined) { next.nav = draftNav; delete next.nav_draft; } // promueve nav
    } else {
      next.theme = cur.theme;           // preserva el publicado intacto
      next.theme_draft = draftTheme;    // borrador
      next.pages[draftKey] = savedPage;
      if (draftNav !== undefined) next.nav_draft = draftNav; // nav_draft
    }
    T.state.tienda.personalizaciones = next;
  }

  // 409 stale_layout: otro dispositivo publico. Avisar y recargar del server.
  function handleStale(r) {
    const ES = window.TiendaIA.editorState;
    const serverPers = r.server_personalizaciones;
    const ok = confirm(
      'Otro dispositivo modifico esta tienda mientras editabas.\n\n' +
      'Aceptar = cargar la version del servidor (perdes los cambios locales sin publicar).\n' +
      'Cancelar = seguir editando (podras reintentar publicar luego).'
    );
    if (ok) {
      if (serverPers) {
        ES.init(serverPers, ES.tienda_id, ES.pageId);
        if (window.TiendaIA?.editorCanvas?.reloadFull) window.TiendaIA.editorCanvas.reloadFull();
        toast('Cargamos la version del servidor.', 'info');
      } else {
        toast('No recibimos la version del servidor. Recarga la pagina.', 'error');
      }
    }
  }

  async function markFirstChoice() {
    // window.TiendaIA.supabase es factory: invocar con ?.()
    const supabase = window.TiendaIA?.supabase?.();
    if (!supabase) return;
    const ES = window.TiendaIA.editorState;
    try {
      await supabase
        .from('tiendas')
        .update({ editor_first_choice_at: new Date().toISOString() })
        .eq('id', ES.tienda_id);
    } catch (e) { /* columna opcional; no bloquear */ }
  }

  function handleBack() {
    const ES = window.TiendaIA.editorState;
    if (ES.dirty) {
      if (!confirm('Tenes cambios sin publicar.\n\nTu borrador queda guardado y podras retomarlo cuando vuelvas. Salir igual?')) return;
    }
    window.TiendaIA.navigateTo ? window.TiendaIA.navigateTo('') : (window.location.hash = '#/');
  }

  function toast(msg, kind) {
    if (window.TiendaIA?.toast) window.TiendaIA.toast(msg, kind);
    else console.log('[toast]', kind, msg);
  }

  // C.2: seam de seleccion post-drain, consumido por el carril section-action (editor-canvas).
  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorMain = { pendingSelectAfterPatch, setEditingSection, clearEditingSection, commitInlineEdit };

  // Auto-register
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerEditor);
  } else {
    registerEditor();
  }
})(window);
