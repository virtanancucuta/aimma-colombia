import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// Hotfix autosave robusto. La PERDIDA SILENCIOSA venia de suscribir el autosave a 'dirty',
// que solo notifica en la transicion false->true -> tras el primer save los cambios no
// re-armaban el debounce (sub-guardado). El fix suscribe a 'sections'/'theme', que notifican
// en CADA mutacion. Estos tests fijan esa base + el estado del chip de guardado.

function boot() {
  return bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
}

// ============================================================
// TEST 1: 'theme' notifica por CADA cambio; 'dirty' una sola vez (raiz del latch)
// ============================================================
test("latch: 'theme' notifica por cada cambio, 'dirty' solo en la transicion", () => {
  const win = boot();
  const ES = win.TiendaIA.editorState;
  ES.init(null, 'tienda-test');

  let themeCount = 0;
  let dirtyCount = 0;
  ES.subscribe('theme', () => themeCount++);
  ES.subscribe('dirty', () => dirtyCount++);

  ES.setThemeColors({ primary: '#111111' });
  ES.setThemeColors({ accent: '#222222' });
  ES.setThemeFontPairing('impacto');

  // El autosave nuevo se engancha a 'theme'/'sections' -> 3 re-armes (uno por cambio).
  assert.equal(themeCount, 3, "'theme' debe notificar por CADA cambio (base del fix)");
  // El viejo autosave se enganchaba a 'dirty' -> 1 sola vez -> por eso sub-guardaba.
  assert.equal(dirtyCount, 1, "'dirty' notifica solo en la transicion false->true");
});

// ============================================================
// TEST 2: 'sections' tambien notifica por cada mutacion
// ============================================================
test("latch: 'sections' notifica por cada add (no solo el primero)", () => {
  const win = boot();
  const ES = win.TiendaIA.editorState;
  ES.init(null, 'tienda-test');

  let secCount = 0;
  ES.subscribe('sections', () => secCount++);

  ES.addSection('texto');
  ES.addSection('texto');

  assert.equal(secCount, 2, "'sections' debe notificar por cada add -> el autosave se re-arma");
});

// ============================================================
// TEST 3: draftSaveStatus + canal 'draftsave' (alimenta el chip de la toolbar)
// ============================================================
test("chip: draftSaveStatus arranca 'idle', setDraftSaveStatus notifica 'draftsave'", () => {
  const win = boot();
  const ES = win.TiendaIA.editorState;
  ES.init(null, 'tienda-test');

  assert.equal(ES.draftSaveStatus, 'idle', 'arranca en idle');

  let dsCount = 0;
  let lastSeen = null;
  ES.subscribe('draftsave', () => { dsCount++; lastSeen = ES.draftSaveStatus; });

  ES.setDraftSaveStatus('saving');
  assert.equal(ES.draftSaveStatus, 'saving');
  ES.setDraftSaveStatus('error');
  assert.equal(ES.draftSaveStatus, 'error');
  ES.setDraftSaveStatus('saved');

  assert.equal(dsCount, 3, "cada setDraftSaveStatus notifica 'draftsave'");
  assert.equal(lastSeen, 'saved', 'el subscriber ve el estado actual');
});

// ============================================================
// TEST 4: el estado del chip es INDEPENDIENTE de dirty (no se pisan)
// ============================================================
test("chip: draftSaveStatus no toca dirty (cambios-sin-publicar)", () => {
  const win = boot();
  const ES = win.TiendaIA.editorState;
  ES.init(null, 'tienda-test');

  ES.setThemeColors({ primary: '#333333' }); // dirty -> true
  assert.equal(ES.dirty, true, 'una edicion ensucia');

  ES.setDraftSaveStatus('saved'); // "borrador guardado" NO debe limpiar dirty
  assert.equal(ES.dirty, true, 'guardar borrador deja dirty=true (sigue habiendo cambios sin PUBLICAR)');
});
