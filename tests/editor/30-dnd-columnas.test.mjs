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

// ── Leak fix: las instancias Sortable previas se destruyen en cada rebuild (no se acumulan) ──
test('leak fix: tras N rebuilds del inspector, solo las instancias actuales viven (las previas destruidas)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
  const ES = win.TiendaIA.editorState;
  ES.init(null, 'tienda-test');
  const parent = ES.addSection('contenedor');
  ES.updateSectionProps(parent, { columnas: 2 });   // 2 columnas -> 2 colBox -> 2 Sortable por render
  ES.select(parent);

  // Mock de Sortable: registra instancias + flag de destroy.
  const created = [];
  win.Sortable = function (el) { this.el = el; this.destroyed = false; created.push(this); };
  win.Sortable.prototype.destroy = function () { this.destroyed = true; };

  const container = win.document.createElement('div');
  win.TiendaIA.editorInspector.render(container, {});   // 1er render -> 2 instancias
  const N = 5;
  for (let i = 0; i < N; i++) win.TiendaIA.editorInspector.rebuild();

  const alive = created.filter((s) => !s.destroyed);
  assert.equal(alive.length, 2, 'solo las 2 instancias del render actual quedan vivas');
  assert.ok(created.length >= 2 * (N + 1) - 2, 'se crearon instancias nuevas en cada rebuild (no se reusan)');
  assert.equal(created.length - alive.length, created.filter((s) => s.destroyed).length, 'el resto esta destruido');
});
