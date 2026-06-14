import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// ============================================================
// FASE D · D3b: ops de bloques HIJOS en editor-state (parentId + childId).
// Cada mutacion emite lastOp={kind:'replace', sectionId:PADRE} (el carril de patch re-renderiza
// el contenedor entero). Default amarrado del contenedor nuevo. Selection con childId opcional.
// ============================================================

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  win.TiendaIA.editorState.init(
    { pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [] } } },
    'tienda-test'
  );
  return win.TiendaIA.editorState;
}

test('contenedor nuevo: default amarrado (transparente+1col+gap normal+start) + 1 hijo texto con id generado', () => {
  const ES = boot();
  const id = ES.addSection('contenedor');
  const sec = ES.findSection(id);
  assert.equal(sec.fondo.tipo, 'transparente');
  assert.equal(sec.props.columnas, 1);
  assert.equal(sec.props.gap, 'normal');
  assert.equal(sec.props.alineacion_vertical, 'start');
  assert.equal(sec.props.bloques.length, 1);
  assert.equal(sec.props.bloques[0].tipo, 'texto');
  assert.equal(sec.props.bloques[0].columna, 0);
  assert.match(sec.props.bloques[0].id, /^sec_[a-z0-9]{4,}$/);
});

test('addChildBlock agrega un hijo + lastOp replace al PADRE', () => {
  const ES = boot();
  const pid = ES.addSection('contenedor');
  const cid = ES.addChildBlock(pid, 'cita', 0);
  assert.ok(cid);
  const sec = ES.findSection(pid);
  assert.equal(sec.props.bloques.length, 2);
  assert.equal(sec.props.bloques[1].tipo, 'cita');
  assert.deepEqual(ES.lastOp, { kind: 'replace', sectionId: pid });
});

test('updateChildProps mergea props del hijo (lastOp replace al padre)', () => {
  const ES = boot();
  const pid = ES.addSection('contenedor');
  const child = ES.findSection(pid).props.bloques[0];
  ES.updateChildProps(pid, child.id, { contenido: 'nuevo texto' });
  assert.equal(ES.findChild(pid, child.id).props.contenido, 'nuevo texto');
  assert.equal(ES.lastOp.sectionId, pid);
});

test('updateChildBase setea columna del hijo', () => {
  const ES = boot();
  const pid = ES.addSection('contenedor');
  const child = ES.findSection(pid).props.bloques[0];
  ES.updateChildBase(pid, child.id, 'columna', 2);
  assert.equal(ES.findChild(pid, child.id).columna, 2);
});

test('removeChildBlock respeta min 1 (no borra el ultimo)', () => {
  const ES = boot();
  const pid = ES.addSection('contenedor');
  const c1 = ES.findSection(pid).props.bloques[0].id;
  ES.removeChildBlock(pid, c1);                       // unico -> no se borra
  assert.equal(ES.findSection(pid).props.bloques.length, 1);
  const c2 = ES.addChildBlock(pid, 'cita', 0);
  ES.removeChildBlock(pid, c2);
  assert.equal(ES.findSection(pid).props.bloques.length, 1);
});

test('reorderChildBlock reordena entre hermanos de la MISMA columna (no cruza columnas)', () => {
  const ES = boot();
  const pid = ES.addSection('contenedor');
  const a = ES.findSection(pid).props.bloques[0].id;   // texto col0
  const b = ES.addChildBlock(pid, 'cita', 0);          // col0
  const c = ES.addChildBlock(pid, 'botones', 1);       // col1
  ES.reorderChildBlock(pid, b, -1);                    // sube b dentro de col0 -> [b,a,...]
  const ord = ES.findSection(pid).props.bloques.map(x => x.id);
  assert.deepEqual(ord.slice(0, 2), [b, a]);
  assert.equal(ord[2], c);                             // c (col1) intacto
});

test('tope 8 hijos por contenedor', () => {
  const ES = boot();
  const pid = ES.addSection('contenedor');
  for (let i = 0; i < 10; i++) ES.addChildBlock(pid, 'cita', 0);
  assert.equal(ES.findSection(pid).props.bloques.length, 8);
});

test('select lleva childId opcional (aditivo)', () => {
  const ES = boot();
  const pid = ES.addSection('contenedor');
  ES.select(pid, 'sec_hzzzz');
  assert.equal(ES.selection.sectionId, pid);
  assert.equal(ES.selection.childId, 'sec_hzzzz');
  ES.select(pid);
  assert.equal(ES.selection.childId, null);
});

test('ops de hijo sobre una seccion NO-contenedor son no-op (defensivo)', () => {
  const ES = boot();
  const tid = ES.addSection('texto');
  assert.equal(ES.addChildBlock(tid, 'cita', 0), null);
  assert.equal(ES.findChild(tid, 'x'), null);
});
