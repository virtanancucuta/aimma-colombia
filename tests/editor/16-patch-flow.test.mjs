import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// Fase C Task 6 — base del carril patch: cada mutacion de SECCION registra editorState.lastOp
// {kind,...} y dispara notify('patch'); el dispatcher (editor.js onPatch, integracion -> live Task 7)
// mapea kind->op. Theme NO toca lastOp (otro carril). Aca fijamos lastOp + el canal.

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  win.TiendaIA.editorState.init(null, 'tienda-test');
  return win.TiendaIA.editorState;
}

test("lastOp: addSection -> kind 'insert' + dispara 'patch'", () => {
  const ES = boot();
  let patchCount = 0, seen = null;
  ES.subscribe('patch', () => { patchCount++; seen = ES.lastOp; });
  const id = ES.addSection('texto');
  assert.equal(ES.lastOp.kind, 'insert');
  assert.equal(ES.lastOp.sectionId, id);
  assert.equal(typeof ES.lastOp.index, 'number');
  assert.equal(patchCount, 1, "notify('patch') debe dispararse 1 vez por mutacion");
  assert.equal(seen.kind, 'insert');
});

test("lastOp: removeSection -> 'remove' (op sin-fetch)", () => {
  const ES = boot();
  const id = ES.addSection('texto');
  ES.removeSection(id);
  assert.equal(ES.lastOp.kind, 'remove');
  assert.equal(ES.lastOp.sectionId, id);
});

test("lastOp: reorderSections -> 'move' con toIndex (op sin-fetch)", () => {
  const ES = boot();
  const a = ES.addSection('texto');
  ES.addSection('texto');
  ES.reorderSections(0, 1);
  assert.equal(ES.lastOp.kind, 'move');
  assert.equal(ES.lastOp.sectionId, a); // la que se movio (estaba en 0)
  assert.equal(ES.lastOp.toIndex, 1);
});

test("lastOp: duplicateSection -> 'insert'", () => {
  const ES = boot();
  const id = ES.addSection('texto');
  const copy = ES.duplicateSection(id);
  assert.equal(ES.lastOp.kind, 'insert');
  assert.equal(ES.lastOp.sectionId, copy);
});

test("lastOp: updateSectionProps + updateSectionBase -> 'replace'", () => {
  const ES = boot();
  const id = ES.addSection('texto');
  ES.updateSectionProps(id, { contenido: 'hola' });
  assert.equal(ES.lastOp.kind, 'replace');
  assert.equal(ES.lastOp.sectionId, id);
  ES.updateSectionBase(id, 'padding', 'lg');
  assert.equal(ES.lastOp.kind, 'replace');
});

test("lastOp: undo/redo (restoreFromSnapshot) -> 'reload'", () => {
  const ES = boot();
  ES.addSection('texto');
  ES.undo();
  assert.equal(ES.lastOp.kind, 'reload');
});

test("carriles: un cambio de TEMA NO toca lastOp ni dispara 'patch'", () => {
  const ES = boot();
  const id = ES.addSection('texto'); // lastOp = insert
  const before = ES.lastOp;
  let patchCount = 0;
  ES.subscribe('patch', () => { patchCount++; });
  ES.setThemeColors({ primary: '#111111' });
  ES.setThemeFontPairing('impacto');
  assert.equal(ES.lastOp, before, 'el tema NO debe cambiar lastOp (otro carril)');
  assert.equal(patchCount, 0, "el tema NO debe disparar notify('patch')");
});
