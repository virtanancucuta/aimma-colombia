import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// Fase B-controles · color (wire-only): el widget colorPicker YA existia; este control
// solo lo enchufa al registry via case 'color' en renderCampo. Ningun section-def real lo
// usa aun (su payoff llega en B-tema). Se prueba el wiring con un campo SINTETICO en memoria.

test('color: colorPicker existe y el case "color" lo renderea via renderCampo', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
  const T = win.TiendaIA;
  assert.equal(typeof T.editorControls.colorPicker, 'function', 'colorPicker debe existir');

  // Inyecto un campo control:'color' en un tipo (solo en este window) para ejercitar el wiring.
  T.editorSectionDefs.defs.texto.campos.push({ key: '__color_test', control: 'color', label: 'Color de prueba', default: '#1a1a1a' });
  T.editorState.init({ pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z',
    sections: [{ id: 'sec_txt01', tipo: 'texto', ancho: 'contenido', fondo: { tipo: 'transparente', valor: '' }, padding: 'md',
      props: { contenido: 'x', alineacion: 'left', tamanio: 'md', __color_test: '#ff0000' } }] } } }, 'tienda-test');
  const container = win.document.createElement('div');
  T.editorInspector.render(container, {});
  T.editorState.select('sec_txt01');
  T.editorInspector.rebuild();

  assert.ok(container.querySelector('.ed-ctrl__color'), 'el case "color" debe renderear el colorPicker');
  const hex = container.querySelector('.ed-ctrl__color-hex');
  assert.ok(hex && hex.value === '#ff0000', 'debe mostrar el color actual del campo');

  T.editorSectionDefs.defs.texto.campos.pop(); // limpieza del campo sintetico
});
