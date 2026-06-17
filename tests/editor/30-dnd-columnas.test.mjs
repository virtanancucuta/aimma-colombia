// AIMMA Fase D · DnD entre columnas · op moveChildToColumn (la matematica del move). El DnD en si
// (Sortable) se prueba en vivo; aca testeamos el op: inserta en toIndex ENTRE hermanos de la columna
// destino (no solo append), maneja columna VACIA y clampa la columna. Array plano interleaved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  win.TiendaIA.editorState.init(null, 'tienda-test');
  return win.TiendaIA.editorState;
}
// orden de ids en la columna k (deriva de columna + orden del array plano).
const colIds = (ES, parent, k) => ES.findContenedor(parent).props.bloques.filter(b => (b.columna || 0) === k).map(b => b.id);

// 2 columnas: col0=[A,C], col1=[B] (array plano [A(0), B(1), C(0)]).
function setup(ES) {
  const parent = ES.addSection('contenedor');
  ES.updateSectionProps(parent, { columnas: 2 });
  const A = ES.findContenedor(parent).props.bloques[0].id;
  const B = ES.addChildBlock(parent, 'cita', 1);
  const C = ES.addChildBlock(parent, 'texto', 0);
  return { parent, A, B, C };
}

test('move: a otra columna, APPEND (toIndex al final)', () => {
  const ES = boot();
  const { parent, A, B, C } = setup(ES);
  ES.moveChildToColumn(parent, A, 1, 1);          // A -> col1, despues de B
  assert.deepEqual(colIds(ES, parent, 1), [B, A], 'col1 = [B, A]');
  assert.deepEqual(colIds(ES, parent, 0), [C], 'col0 = [C]');
});

test('move: ENTRE dos hermanos de la columna destino (no append)', () => {
  const ES = boot();
  const { parent, A, B, C } = setup(ES);   // col0=[A,C]
  ES.moveChildToColumn(parent, B, 0, 1);          // B -> col0 en index 1 (ENTRE A y C)
  assert.deepEqual(colIds(ES, parent, 0), [A, B, C], 'col0 = [A, B, C] (B intercalado)');
  assert.deepEqual(colIds(ES, parent, 1), [], 'col1 vacia');
});

test('move: al inicio de la columna destino (toIndex 0)', () => {
  const ES = boot();
  const { parent, A, B } = setup(ES);             // col0=[A,C]
  ES.moveChildToColumn(parent, B, 0, 0);          // B al inicio de col0
  assert.equal(colIds(ES, parent, 0)[0], B, 'B primero en col0');
});

test('move: a una COLUMNA VACIA (caso del gate)', () => {
  const ES = boot();
  const parent = ES.addSection('contenedor');
  ES.updateSectionProps(parent, { columnas: 3 });
  const X = ES.findContenedor(parent).props.bloques[0].id;
  const Y = ES.addChildBlock(parent, 'cita', 0);  // col0 = [X, Y]; col1 y col2 VACIAS
  ES.moveChildToColumn(parent, Y, 2, 0);          // Y -> col2 (vacia)
  assert.deepEqual(colIds(ES, parent, 2), [Y], 'col2 = [Y]');
  assert.deepEqual(colIds(ES, parent, 0), [X], 'col0 = [X]');
  assert.equal(ES.findChild(parent, Y).columna, 2, 'Y.columna = 2');
});

test('move: clamp de columna fuera de rango', () => {
  const ES = boot();
  const { parent, A } = setup(ES);                // 2 columnas (0..1)
  ES.moveChildToColumn(parent, A, 99, 0);         // 99 -> clampa a la ultima (1)
  assert.equal(ES.findChild(parent, A).columna, 1, 'clampa a columna 1');
});

test('move: childId desconocido -> no-op', () => {
  const ES = boot();
  const { parent } = setup(ES);
  const before = ES.findContenedor(parent).props.bloques.map(b => b.id + ':' + (b.columna || 0)).join(',');
  ES.moveChildToColumn(parent, 'sec_zzzzzz', 1, 0);
  assert.equal(ES.findContenedor(parent).props.bloques.map(b => b.id + ':' + (b.columna || 0)).join(','), before);
});

// NOTA (FASE D · A2): el DnD del inspector se removio (el grip duplicaba el del canvas). El test de
// "leak fix" de las instancias Sortable del inspector ya no aplica. moveChildToColumn (probado arriba)
// sigue VIVO: ahora lo dispara el DnD del CANVAS (canvas-dnd -> editor-canvas handleMoveChild), cubierto
// por 30-a1-move-child.test.mjs (admin) y apps/storefront/test/canvas-dnd.test.ts (storefront).
