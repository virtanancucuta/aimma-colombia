// AIMMA Fase D · D4 · Chrome en canvas para hijos. Testea el wiring admin (no el storefront):
// (a) findTarget resuelve un id clickeado -> {sectionId, childId}; (b) handleSectionAction rutea el
// caso HIJO a las ops de hijo (reorden SAME-COLUMN, duplicar, borrar) con parentId+childId; (c)
// handleAddChild inserta el tipo elegido en el contenedor + columna correctos (incl. COLUMNA VACIA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-canvas.js']);
  win.TiendaIA.editorState.init(null, 'tienda-test');
  return win;
}

// Contenedor de 2 columnas: col0=[c0,c2], col1=[c1] (array plano [c0(0), c1(1), c2(0)]).
function cont2col(win) {
  const ES = win.TiendaIA.editorState;
  const parent = ES.addSection('contenedor');     // nace con 1 hijo texto en col 0
  ES.updateSectionProps(parent, { columnas: 2 });
  const c0 = ES.findContenedor(parent).props.bloques[0].id;
  const c1 = ES.addChildBlock(parent, 'cita', 1);  // col 1
  const c2 = ES.addChildBlock(parent, 'texto', 0); // col 0
  return { ES, parent, c0, c1, c2 };
}

// ── (a) findTarget resuelve ───────────────────────────────────────────────
test('(a) findTarget: top-level / hijo / desconocido', () => {
  const win = boot();
  const ES = win.TiendaIA.editorState;
  const top = ES.addSection('texto');
  const { parent, c1 } = cont2col(win);
  assert.deepEqual(ES.findTarget(top), { sectionId: top, childId: undefined });
  assert.deepEqual(ES.findTarget(parent), { sectionId: parent, childId: undefined });
  assert.deepEqual(ES.findTarget(c1), { sectionId: parent, childId: c1 });
  assert.equal(ES.findTarget('sec_zzzzzz'), null);
});

// ── (b) handleSectionAction rutea a ops de hijo ───────────────────────────
test('(b) section-action hijo: down reordena SAME-COLUMN (no cruza columnas)', () => {
  const win = boot();
  const { ES, parent, c0, c1, c2 } = cont2col(win);
  ES.select(parent, c0);                            // selecciona el hijo c0 (col 0, primero)
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'down', sectionId: c0 });
  const ids = ES.findContenedor(parent).props.bloques.map(b => b.id);
  assert.deepEqual(ids, [c2, c1, c0], 'c0 baja dentro de col0 (c1 de col1 intacto)');
});

test('(b) section-action hijo: reorden no cruza columna (unico en su col -> no-op)', () => {
  const win = boot();
  const { ES, parent, c1 } = cont2col(win);
  ES.select(parent, c1);                            // c1 es el unico de col1
  const before = ES.findContenedor(parent).props.bloques.map(b => b.id).join(',');
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'down', sectionId: c1 });
  assert.equal(ES.findContenedor(parent).props.bloques.map(b => b.id).join(','), before);
});

test('(b) section-action hijo: duplicate clona SAME-COLUMN justo despues', () => {
  const win = boot();
  const { ES, parent, c0 } = cont2col(win);
  ES.select(parent, c0);
  const n = ES.findContenedor(parent).props.bloques.length;
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'duplicate', sectionId: c0 });
  const bloques = ES.findContenedor(parent).props.bloques;
  assert.equal(bloques.length, n + 1);
  assert.equal(bloques[1].id !== c0, true, 'la copia tiene id nuevo');
  assert.equal(bloques[1].columna, bloques[0].columna, 'misma columna que el original');
  assert.equal(bloques[1].tipo, bloques[0].tipo, 'mismo tipo que el original');
});

test('(b) section-action hijo: remove borra el hijo (parentId+childId)', () => {
  const win = boot();
  const { ES, parent, c2 } = cont2col(win);
  ES.select(parent, c2);
  const n = ES.findContenedor(parent).props.bloques.length;
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'remove', sectionId: c2 });
  const ids = ES.findContenedor(parent).props.bloques.map(b => b.id);
  assert.equal(ids.length, n - 1);
  assert.equal(ids.includes(c2), false);
});

test('(b) section-action: sin hijo seleccionado un id de hijo NO dispara op de seccion', () => {
  const win = boot();
  const { ES, parent, c1 } = cont2col(win);
  ES.select(parent);                                // selecciona el CONTENEDOR (sin childId)
  const before = ES.sections.length;
  win.TiendaIA.editorCanvas.handleSectionAction({ action: 'remove', sectionId: c1 });
  // c1 no es top-level -> findSection null -> no-op (ni borra seccion ni hijo).
  assert.equal(ES.sections.length, before);
  assert.equal(ES.findContenedor(parent).props.bloques.some(b => b.id === c1), true);
});

// ── (c) handleAddChild inserta en el contenedor + columna ─────────────────
test('(c) add-child: inserta el tipo elegido en la columna indicada', () => {
  const win = boot();
  const { ES, parent } = cont2col(win);
  win.TiendaIA.editorModalCatalog = { open: (onPick) => onPick('cita') };
  const n = ES.findContenedor(parent).props.bloques.length;
  win.TiendaIA.editorCanvas.handleAddChild({ parentId: parent, column: 1 });
  const bloques = ES.findContenedor(parent).props.bloques;
  assert.equal(bloques.length, n + 1);
  const nuevo = bloques[bloques.length - 1];
  assert.equal(nuevo.tipo, 'cita');
  assert.equal(nuevo.columna, 1);
  assert.equal(ES.selection.childId, nuevo.id, 'selecciona el hijo nuevo');
});

test('(c) add-child: a una COLUMNA VACIA inserta con el columna correcto (caso descubribilidad)', () => {
  const win = boot();
  const ES = win.TiendaIA.editorState;
  const parent = ES.addSection('contenedor');       // 1 hijo en col 0
  ES.updateSectionProps(parent, { columnas: 3 });    // col1 y col2 quedan VACIAS
  win.TiendaIA.editorModalCatalog = { open: (onPick) => onPick('texto') };
  win.TiendaIA.editorCanvas.handleAddChild({ parentId: parent, column: 2 });
  const bloques = ES.findContenedor(parent).props.bloques;
  const enCol2 = bloques.filter(b => b.columna === 2);
  assert.equal(enCol2.length, 1, 'la columna vacia ahora tiene 1 hijo');
  assert.equal(enCol2[0].tipo, 'texto');
});

test('(c) add-child: parentId desconocido -> no abre catalogo / no inserta', () => {
  const win = boot();
  let opened = 0;
  win.TiendaIA.editorModalCatalog = { open: () => { opened++; } };
  win.TiendaIA.editorCanvas.handleAddChild({ parentId: 'sec_zzzzzz', column: 0 });
  assert.equal(opened, 0);
});
