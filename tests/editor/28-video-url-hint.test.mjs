// AIMMA Fase D · 2a-polish B · Validacion inline (UX) del campo URL del video.
// Boot del inspector real (jsdom) -> tipear en el input de url -> el <p> de error muestra/oculta
// el aviso. Es PERMISIVO (solo hint; el server valida la autoridad). No bloquea el commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
  win.TiendaIA.editorState.init({ pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [] } } }, 'tienda-test');
  return win;
}

test('video url hint: no-proveedor avisa; YouTube/Vimeo oculta; vacio oculta', () => {
  const win = boot();
  const T = win.TiendaIA;
  const id = T.editorState.addSection('video');
  const container = win.document.createElement('div');
  T.editorInspector.render(container, {});
  T.editorState.select(id);
  T.editorInspector.rebuild();

  const input = container.querySelector('.ed-ctrl__input'); // primer input = campo url
  assert.ok(input, 'no se encontro el input de url');
  const errorEl = input.closest('.ed-ctrl').querySelector('.ed-ctrl__error');
  assert.ok(errorEl, 'no se encontro el <p> de error');

  const setVal = (v) => { input.value = v; input.dispatchEvent(new win.Event('input', { bubbles: true })); };

  setVal('https://open.spotify.com/track/abc');          // no soportado por el parser
  assert.equal(errorEl.hidden, false, 'Spotify deberia avisar');
  assert.match(errorEl.textContent, /YouTube o Vimeo/);

  setVal('esto no es una url');                            // malformada
  assert.equal(errorEl.hidden, false, 'url malformada deberia avisar');

  setVal('https://youtu.be/dQw4w9WgXcQ');                  // valido
  assert.equal(errorEl.hidden, true, 'YouTube valido no deberia avisar');

  setVal('https://vimeo.com/76979871');                   // valido
  assert.equal(errorEl.hidden, true, 'Vimeo valido no deberia avisar');

  setVal('');                                             // vacio -> opcional
  assert.equal(errorEl.hidden, true, 'vacio no deberia avisar');
});
