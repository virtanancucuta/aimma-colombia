import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// Fase B-controles · piloto image-picker (Clase A: swap de widget, mismo shape URL).
// Cubre el DoD: el control esta registry-driven, renderea en el inspector, y el valor
// hace round-trip guardar->recargar idEntico (es un string URL en props, como urlInput).

const NEW_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co/storage/v1/object/public/tienda-productos/T1/editor/170001.jpg';

function imagenSection(src) {
  return {
    id: 'sec_img001', tipo: 'imagen', ancho: 'completo',
    fondo: { tipo: 'transparente', valor: '' }, padding: 'md',
    props: { src, alt: 'Imagen', objeto: 'cover' },
  };
}
function persWith(section) {
  return { pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [section] } } };
}

test('image-picker: imagen.src es registry-driven con control "image"', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js']);
  const campo = win.TiendaIA.editorSectionDefs.defs.imagen.campos.find((c) => c.key === 'src');
  assert.equal(campo.control, 'image', 'imagen.src debe usar control "image"');
  assert.equal(typeof win.TiendaIA.editorControls.imagePicker, 'function', 'editorControls debe exponer imagePicker');
});

test('image-picker: el inspector renderea el widget (no urlInput) para imagen', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
  const T = win.TiendaIA;
  T.editorState.init(persWith(imagenSection('https://placehold.co/1200x600')), 'tienda-test');
  const container = win.document.createElement('div');
  T.editorInspector.render(container, {});
  T.editorState.select('sec_img001');
  T.editorInspector.rebuild();
  assert.ok(container.querySelector('.ed-imgpicker'), 'debe renderear el image-picker');
  assert.ok(container.querySelector('.ed-imgpicker__thumb'), 'debe mostrar preview de la imagen actual');
});

test('image-picker: round-trip guardar->recargar->valor idEntico (Clase A)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  const ES = win.TiendaIA.editorState;
  ES.init(persWith(imagenSection('https://placehold.co/1200x600')), 'tienda-test');
  // El image-picker, al elegir/subir, hace exactamente esto (setProp -> updateSectionProps):
  ES.updateSectionProps('sec_img001', { src: NEW_URL });
  const saved = ES.serialize();              // guardar
  ES.init(saved, 'tienda-test');             // recargar
  const reloaded = ES.findSection('sec_img001');
  assert.equal(reloaded.props.src, NEW_URL, 'la URL elegida debe sobrevivir guardar->recargar idEntica');
});
