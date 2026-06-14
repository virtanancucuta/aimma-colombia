import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// ============================================================
// FASE D · D3b: wiring del catalogo de bloques hijos (click-test jsdom).
// El inspector del contenedor renderiza "+ Agregar bloque" -> abre el catalogo FILTRADO a tipos hoja
// (sin contenedor/banner/productos) -> elegir agrega un hijo via addChildBlock.
// ============================================================

function bootContenedorInspector() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js', 'editor-modal-catalog.js']);
  const T = win.TiendaIA;
  T.editorState.init({ pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [] } } }, 'tienda-test');
  const pid = T.editorState.addSection('contenedor');
  const container = win.document.createElement('div');
  T.editorInspector.render(container, {});
  T.editorState.select(pid);
  T.editorInspector.rebuild();
  return { win, T, pid, container };
}

test('Agregar bloque abre el catalogo FILTRADO (solo tipos hoja; sin contenedor/banner/productos)', () => {
  const { win, container } = bootContenedorInspector();
  const btn = [...container.querySelectorAll('button')].find(b => /Agregar bloque/.test(b.textContent || ''));
  assert.ok(btn, 'no se renderizo el boton "Agregar bloque"');
  btn.click();

  const cards = [...win.document.querySelectorAll('.ed-catalog-card[data-tipo]')];
  const tipos = cards.map(c => c.getAttribute('data-tipo'));
  assert.ok(tipos.length > 0, 'el catalogo no muestra cards');
  // Tipos hoja permitidos presentes; tipos NO permitidos ausentes.
  for (const t of ['texto', 'imagen', 'cita', 'botones', 'producto_destacado', 'espacio', 'video', 'imagen_con_texto']) {
    assert.ok(tipos.includes(t), `falta el tipo hijo permitido "${t}"`);
  }
  for (const t of ['contenedor', 'banner', 'productos', 'galeria', 'formulario', 'categorias_destacadas']) {
    assert.ok(!tipos.includes(t), `el tipo NO permitido "${t}" no deberia estar en el catalogo de bloques`);
  }
});

test('elegir un tipo en el catalogo agrega el hijo al contenedor y cierra el modal', () => {
  const { win, T, pid, container } = bootContenedorInspector();
  const antes = T.editorState.findSection(pid).props.bloques.length;
  [...container.querySelectorAll('button')].find(b => /Agregar bloque/.test(b.textContent || '')).click();
  const citaCard = [...win.document.querySelectorAll('.ed-catalog-card[data-tipo="cita"]')][0];
  assert.ok(citaCard, 'no aparecio la card de cita');
  citaCard.click();

  const bloques = T.editorState.findSection(pid).props.bloques;
  assert.equal(bloques.length, antes + 1);
  assert.equal(bloques[bloques.length - 1].tipo, 'cita');
  assert.equal(win.document.querySelector('.ed-modal-backdrop'), null, 'el modal deberia cerrarse al elegir');
});

test('catalogo SIN filtro (agregar seccion top-level) SI incluye contenedor', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-modal-catalog.js']);
  win.TiendaIA.editorModalCatalog.open(() => {});
  // El boton "Mas opciones" inyecta los avanzados (incl. contenedor) al hacer click.
  const more = win.document.querySelector('#ed-catalog-more');
  assert.ok(more, 'falta el boton "Mas opciones"');
  more.click();
  const tipos = [...win.document.querySelectorAll('.ed-catalog-card[data-tipo]')].map(c => c.getAttribute('data-tipo'));
  assert.ok(tipos.includes('contenedor'), 'el catalogo general debe incluir contenedor');
});
