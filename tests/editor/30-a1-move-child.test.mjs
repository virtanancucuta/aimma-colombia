// AIMMA Fase D · A1 · DnD de hijos EN EL CANVAS — wiring admin (handleMoveChild).
// El iframe (preview) postea {type:'move-child', parentId, childId, toCol, toIndex} al SOLTAR un bloque.
// handleMoveChild aplica el MISMO gate G3 que add-child (origin ya validado en messageHandler): ids en
// el regex + contenedor CONOCIDO + el hijo pertenece a ESE contenedor + indices enteros >=0, y recien
// llama moveChildToColumn INTACTO. Aca testeamos ese dispatcher (no el storefront: eso va en canvas-dnd.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-canvas.js']);
  win.TiendaIA.editorState.init(null, 'tienda-test');
  return win;
}

// Contenedor 2 columnas: col0=[c0,c2], col1=[c1] (array plano [c0(0), c1(1), c2(0)]).
function cont2col(win) {
  const ES = win.TiendaIA.editorState;
  const parent = ES.addSection('contenedor');     // nace con 1 hijo texto en col 0
  ES.updateSectionProps(parent, { columnas: 2 });
  const c0 = ES.findContenedor(parent).props.bloques[0].id;
  const c1 = ES.addChildBlock(parent, 'cita', 1);  // col 1
  const c2 = ES.addChildBlock(parent, 'texto', 0); // col 0
  return { ES, parent, c0, c1, c2 };
}

const MC = (win) => win.TiendaIA.editorCanvas.handleMoveChild;

// ── camino feliz ──────────────────────────────────────────────────────────
test('move-child: mueve el hijo a otra columna en la posicion entre hermanos', () => {
  const win = boot();
  const { ES, parent, c0, c1 } = cont2col(win);
  MC(win)({ parentId: parent, childId: c0, toCol: 1, toIndex: 1 }); // c0 -> col1, despues de c1
  const bloques = ES.findContenedor(parent).props.bloques;
  const moved = bloques.find(b => b.id === c0);
  assert.equal(moved.columna, 1, 'c0 quedo en la columna 1');
  const col1 = bloques.filter(b => b.columna === 1).map(b => b.id);
  assert.deepEqual(col1, [c1, c0], 'c0 quedo DESPUES de c1 en col1');
});

test('move-child: dispara el carril patch (lastOp=replace al padre -> re-render)', () => {
  const win = boot();
  const { ES, parent, c0 } = cont2col(win);
  MC(win)({ parentId: parent, childId: c0, toCol: 1, toIndex: 0 });
  assert.deepEqual(ES.lastOp, { kind: 'replace', sectionId: parent });
});

test('move-child: reordenar al FRENTE de la otra columna (toIndex 0)', () => {
  const win = boot();
  const { ES, parent, c2, c1 } = cont2col(win);
  MC(win)({ parentId: parent, childId: c2, toCol: 1, toIndex: 0 }); // c2 -> col1, al frente
  const col1 = ES.findContenedor(parent).props.bloques.filter(b => b.columna === 1).map(b => b.id);
  assert.deepEqual(col1, [c2, c1], 'c2 quedo ANTES de c1');
});

// ── gate G3: rechazos (no muta) ───────────────────────────────────────────
function snapshot(ES, parent) {
  return ES.findContenedor(parent).props.bloques.map(b => b.id + ':' + b.columna).join(',');
}

test('move-child: parentId que NO pasa el regex -> no-op', () => {
  const win = boot();
  const { ES, parent, c0 } = cont2col(win);
  const before = snapshot(ES, parent);
  MC(win)({ parentId: 'BAD', childId: c0, toCol: 1, toIndex: 0 });
  assert.equal(snapshot(ES, parent), before);
});

test('move-child: childId que NO pasa el regex -> no-op', () => {
  const win = boot();
  const { ES, parent } = cont2col(win);
  const before = snapshot(ES, parent);
  MC(win)({ parentId: parent, childId: 'nope', toCol: 1, toIndex: 0 });
  assert.equal(snapshot(ES, parent), before);
});

test('move-child: parentId con forma valida pero contenedor DESCONOCIDO -> no-op', () => {
  const win = boot();
  const { ES, parent, c0 } = cont2col(win);
  const before = snapshot(ES, parent);
  MC(win)({ parentId: 'sec_zzzzzz', childId: c0, toCol: 1, toIndex: 0 });
  assert.equal(snapshot(ES, parent), before);
});

test('move-child: childId valido pero de OTRO contenedor -> no-op (no cruza contenedores)', () => {
  const win = boot();
  const { ES, parent } = cont2col(win);
  const otro = ES.addSection('contenedor');
  const ajeno = ES.findContenedor(otro).props.bloques[0].id; // hijo del OTRO contenedor
  const before = snapshot(ES, parent);
  MC(win)({ parentId: parent, childId: ajeno, toCol: 1, toIndex: 0 });
  assert.equal(snapshot(ES, parent), before, 'no movio nada en el contenedor destino');
});

test('move-child: toCol negativo -> no-op', () => {
  const win = boot();
  const { ES, parent, c0 } = cont2col(win);
  const before = snapshot(ES, parent);
  MC(win)({ parentId: parent, childId: c0, toCol: -1, toIndex: 0 });
  assert.equal(snapshot(ES, parent), before);
});

test('move-child: toIndex negativo -> no-op', () => {
  const win = boot();
  const { ES, parent, c0 } = cont2col(win);
  const before = snapshot(ES, parent);
  MC(win)({ parentId: parent, childId: c0, toCol: 1, toIndex: -1 });
  assert.equal(snapshot(ES, parent), before);
});

test('move-child: toCol no-entero -> no-op', () => {
  const win = boot();
  const { ES, parent, c0 } = cont2col(win);
  const before = snapshot(ES, parent);
  MC(win)({ parentId: parent, childId: c0, toCol: 1.5, toIndex: 0 });
  assert.equal(snapshot(ES, parent), before);
});
