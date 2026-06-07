import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// C.2 Paso 2 B1 — handleInlineMessage (entrante del iframe). El guard de ORIGIN vive en messageHandler
// (=== tenantOrigin; adversarial chromium-real en Fase C). Aca: G3 = sectionId conocido + fieldPath EN EL
// REGISTRO + value string ANTES de despachar al editorMain (suspend/commit, mockeado).

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'inline-fields.js', 'editor-state.js', 'editor-canvas.js']);
  win.TiendaIA.editorState.init(null, 'tienda-test');
  return win;
}
function mockMain(win) {
  const calls = { start: [], clear: 0, commit: [] };
  win.TiendaIA.editorMain = {
    setEditingSection: (id) => calls.start.push(id),
    clearEditingSection: () => { calls.clear++; },
    commitInlineEdit: (id, fp, v) => calls.commit.push({ id, fp, v }),
  };
  return calls;
}

test('G3: seccion desconocida -> no despacha', () => {
  const win = boot();
  const calls = mockMain(win);
  win.TiendaIA.editorCanvas.handleInlineMessage({ type: 'inline-edit-start', sectionId: 'sec_zzzzzz', fieldPath: 'titulo' });
  assert.equal(calls.start.length, 0);
});

test('G3: fieldPath fuera del registro -> no despacha', () => {
  const win = boot();
  const id = win.TiendaIA.editorState.addSection('banner');
  const calls = mockMain(win);
  win.TiendaIA.editorCanvas.handleInlineMessage({ type: 'inline-commit', sectionId: id, fieldPath: 'subtitulo', value: 'x' });
  assert.equal(calls.commit.length, 0);
});

test('G3: sectionId mal formado -> no despacha', () => {
  const win = boot();
  win.TiendaIA.editorState.addSection('banner');
  const calls = mockMain(win);
  win.TiendaIA.editorCanvas.handleInlineMessage({ type: 'inline-edit-start', sectionId: 'no-id', fieldPath: 'titulo' });
  assert.equal(calls.start.length, 0);
});

test('edit-start valido -> setEditingSection', () => {
  const win = boot();
  const id = win.TiendaIA.editorState.addSection('banner');
  const calls = mockMain(win);
  win.TiendaIA.editorCanvas.handleInlineMessage({ type: 'inline-edit-start', sectionId: id, fieldPath: 'titulo' });
  assert.deepEqual(calls.start, [id]);
});

test('commit valido -> commitInlineEdit con value LIMPIADO', () => {
  const win = boot();
  const id = win.TiendaIA.editorState.addSection('banner');
  const calls = mockMain(win);
  win.TiendaIA.editorCanvas.handleInlineMessage({ type: 'inline-commit', sectionId: id, fieldPath: 'titulo', value: '  hola\n mundo  ' });
  assert.equal(calls.commit.length, 1);
  assert.equal(calls.commit[0].v, 'hola mundo');
  assert.equal(calls.commit[0].fp, 'titulo');
});

test('commit value no-string -> clearEditingSection, NO commit', () => {
  const win = boot();
  const id = win.TiendaIA.editorState.addSection('banner');
  const calls = mockMain(win);
  win.TiendaIA.editorCanvas.handleInlineMessage({ type: 'inline-commit', sectionId: id, fieldPath: 'titulo', value: 123 });
  assert.equal(calls.commit.length, 0);
  assert.ok(calls.clear >= 1);
});

test('cancel valido -> clearEditingSection', () => {
  const win = boot();
  const id = win.TiendaIA.editorState.addSection('banner');
  const calls = mockMain(win);
  win.TiendaIA.editorCanvas.handleInlineMessage({ type: 'inline-cancel', sectionId: id, fieldPath: 'titulo' });
  assert.ok(calls.clear >= 1);
});
