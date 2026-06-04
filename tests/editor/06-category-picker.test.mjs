import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// Fase B-controles · category-picker (Clase A: swap de widget, mismo shape uuid|null).
const CAT_ID = '90083701-a401-464f-9689-5f3efb374ee1';

function productosSection(categoria_id) {
  return {
    id: 'sec_prod01', tipo: 'productos', ancho: 'completo',
    fondo: { tipo: 'transparente', valor: '' }, padding: 'md',
    props: { categoria_id, limite: 8, orden: 'recientes', columnas: 'auto', mostrar_precio: true },
  };
}
function persWith(s) { return { pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [s] } } }; }

test('category-picker: productos.categoria_id es registry-driven con control "category"', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js']);
  const campo = win.TiendaIA.editorSectionDefs.defs.productos.campos.find((c) => c.key === 'categoria_id');
  assert.equal(campo.control, 'category');
  assert.equal(typeof win.TiendaIA.editorControls.categoryPicker, 'function');
});

test('category-picker: el inspector renderea el widget (no text input) para productos', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
  const T = win.TiendaIA;
  T.editorState.init(persWith(productosSection(null)), 'tienda-test');
  const container = win.document.createElement('div');
  T.editorInspector.render(container, {});
  T.editorState.select('sec_prod01');
  T.editorInspector.rebuild();
  assert.ok(container.querySelector('.ed-catpicker'), 'debe renderear el category-picker');
});

test('category-picker: round-trip guardar->recargar (uuid y null=Todas)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  const ES = win.TiendaIA.editorState;
  ES.init(persWith(productosSection(null)), 'tienda-test');
  ES.updateSectionProps('sec_prod01', { categoria_id: CAT_ID });
  let saved = ES.serialize(); ES.init(saved, 'tienda-test');
  assert.equal(ES.findSection('sec_prod01').props.categoria_id, CAT_ID, 'uuid debe sobrevivir guardar->recargar');
  ES.updateSectionProps('sec_prod01', { categoria_id: null });
  saved = ES.serialize(); ES.init(saved, 'tienda-test');
  assert.equal(ES.findSection('sec_prod01').props.categoria_id, null, 'null (Todas) debe sobrevivir');
});
