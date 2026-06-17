// AIMMA Fase D · A1 (QoL) · scroll del inspector al hijo seleccionado.
// Cuando se selecciona un bloque HIJO de un contenedor (click/chrome en el canvas), el inspector se
// reconstruye desde arriba; el sub-editor de ese hijo puede quedar bajo el fold. bindStateListeners
// scrollea la tarjeta --sel a la vista. Aca verificamos: (a) seleccionar un hijo llama scrollIntoView
// sobre SU tarjeta; (b) seleccionar una seccion top-level NO scrollea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js', 'editor-modal-catalog.js']);
  const T = win.TiendaIA;
  T.editorState.init(null, 'tienda-test');
  const container = win.document.createElement('div');
  container.id = 'editor-inspector';
  win.document.body.appendChild(container);
  T.editorInspector.render(container, {});
  win.requestAnimationFrame = (cb) => cb();   // forzar el camino sincrono (jsdom no garantiza rAF)
  return { win, T };
}

test('seleccionar un HIJO scrollea su sub-editor a la vista (scrollIntoView en la tarjeta --sel)', () => {
  const { win, T } = boot();
  const calls = [];
  win.Element.prototype.scrollIntoView = function (opts) { calls.push({ el: this, opts }); };

  const parent = T.editorState.addSection('contenedor');
  T.editorState.updateSectionProps(parent, { columnas: 2 });
  const c1 = T.editorState.addChildBlock(parent, 'imagen', 1);

  T.editorState.select(parent, c1);   // como hace el canvas al clickear/soltar un hijo

  assert.ok(calls.length >= 1, 'no se llamo scrollIntoView al seleccionar el hijo');
  const last = calls[calls.length - 1];
  assert.equal(last.el.getAttribute('data-child-id'), c1, 'scrolleo la tarjeta del hijo seleccionado');
  assert.ok(last.el.classList.contains('ed-list-item--sel'), 'la tarjeta scrolleada es la resaltada');
  assert.equal(last.opts && last.opts.block, 'nearest', 'usa block:nearest (scroll minimo)');
});

test('seleccionar una seccion TOP-LEVEL no scrollea (no hay hijo)', () => {
  const { win, T } = boot();
  const calls = [];
  win.Element.prototype.scrollIntoView = function () { calls.push(this); };

  const sec = T.editorState.addSection('texto');
  T.editorState.select(sec);   // sin childId

  assert.equal(calls.length, 0, 'no deberia scrollear para una seccion top-level');
});

test('re-seleccionar otro hijo scrollea al NUEVO hijo', () => {
  const { win, T } = boot();
  const calls = [];
  win.Element.prototype.scrollIntoView = function (opts) { calls.push({ el: this, opts }); };

  const parent = T.editorState.addSection('contenedor');
  T.editorState.updateSectionProps(parent, { columnas: 2 });
  const c1 = T.editorState.addChildBlock(parent, 'imagen', 0);
  const c2 = T.editorState.addChildBlock(parent, 'texto', 1);

  T.editorState.select(parent, c1);
  T.editorState.select(parent, c2);

  const last = calls[calls.length - 1];
  assert.equal(last.el.getAttribute('data-child-id'), c2, 'scrolleo al segundo hijo tras re-seleccionar');
});
