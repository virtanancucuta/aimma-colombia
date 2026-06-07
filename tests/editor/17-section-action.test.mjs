import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// C.2 Paso 1 B1 — handler section-action (entrante del iframe). El guard de ORIGIN vive en
// messageHandler (=== tenantOrigin exacto; se ejercita adversarialmente en chromium-real, Fase C).
// Aca testeamos el dispatcher handleSectionAction: validacion enum + seccion CONOCIDA ANTES de mutar,
// guard funcional de limites en up/down (no confiar en el gris cosmetico del iframe), duplicate ->
// agenda set-selection post-drain a la copia, remove -> SOLO abre el modal (no borra directo).

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-canvas.js']);
  win.TiendaIA.editorState.init(null, 'tienda-test');
  return win;
}
function setup3(win) {
  const ES = win.TiendaIA.editorState;
  const a = ES.addSection('texto');
  const b = ES.addSection('texto');
  const c = ES.addSection('texto');
  return { ES, a, b, c };
}

test('section-action: action fuera de enum -> ignorado (no muta)', () => {
  const win = boot();
  const { ES, a } = setup3(win);
  const before = ES.sections.map(s => s.id).join(',');
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'pwn', sectionId: a });
  assert.equal(ES.sections.map(s => s.id).join(','), before);
});

test('section-action: sectionId desconocido -> ignorado', () => {
  const win = boot();
  const { ES } = setup3(win);
  const before = ES.sections.length;
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'duplicate', sectionId: 'sec_zzzzzz' });
  assert.equal(ES.sections.length, before);
});

test('section-action: sectionId mal formado -> ignorado', () => {
  const win = boot();
  const { ES } = setup3(win);
  const before = ES.sections.length;
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'duplicate', sectionId: 'no-es-id' });
  assert.equal(ES.sections.length, before);
});

test('section-action up/down: guard funcional de limites (no-op en extremos)', () => {
  const win = boot();
  const { ES, a, c } = setup3(win); // [a,b,c]
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'up', sectionId: a });
  assert.equal(ES.sections[0].id, a, 'up en idx 0 no debe mover');
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'down', sectionId: c });
  assert.equal(ES.sections[2].id, c, 'down en la ultima no debe mover');
});

test('section-action up/down: validos reordenan', () => {
  const win = boot();
  const { ES, a, b } = setup3(win); // [a,b,c]
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'down', sectionId: a });
  assert.equal(ES.sections[1].id, a);
  assert.equal(ES.sections[0].id, b);
});

test('section-action duplicate: duplica + agenda set-selection a la copia (post-drain)', () => {
  const win = boot();
  const { ES, a } = setup3(win);
  const pending = [];
  win.TiendaIA.editorMain = { pendingSelectAfterPatch: (id) => pending.push(id) };
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'duplicate', sectionId: a });
  assert.equal(ES.sections.length, 4);
  assert.equal(pending.length, 1, 'debe agendar 1 select post-drain');
  assert.equal(ES.lastOp.kind, 'insert');
  assert.equal(pending[0], ES.lastOp.sectionId, 'agenda la copia recien insertada');
});

test('section-action remove: SOLO abre el modal, NO borra directo', () => {
  const win = boot();
  const { ES, a } = setup3(win);
  const opened = [];
  win.TiendaIA.editorConfirm = { removeSection: (id) => opened.push(id) };
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'remove', sectionId: a });
  assert.equal(ES.sections.length, 3, 'la seccion NO debe borrarse por el mensaje');
  assert.equal(opened.length, 1, 'debe abrir el modal de confirmacion');
  assert.equal(opened[0], a);
});

// Punto de gate (hotfix): el camino de DESELECCION (label con sectionId null) NO debe tirar.
test('selectionLabel: null y desconocido -> "" sin tirar; conocido -> label del def', () => {
  const win = boot();
  const { a } = setup3(win);
  const C = win.TiendaIA.editorCanvas;
  assert.equal(C.selectionLabel(null), '', 'deseleccion: nunca accede defs[tipo] con tipo undefined');
  assert.equal(C.selectionLabel(undefined), '');
  assert.equal(C.selectionLabel('sec_zzzzzz'), '', 'seccion desconocida -> "" sin tirar');
  const lbl = C.selectionLabel(a);
  assert.equal(typeof lbl, 'string');
  assert.ok(lbl.length > 0, 'seccion conocida -> label no vacio desde sectionDefs');
});
