import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// Refinamientos franja: #2 hint de formato (ratio objetivo por celda, recalcula al cambiar altura/cantidad)
// y #3 aviso por imagen (la imagen real desencaja del espacio). Corre el editor-inspector.js REAL en jsdom.
// El aviso (#3) usa new window.Image() async; aca mockeamos window.Image para fijar naturalWidth/Height.

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
  win.TiendaIA.editorState.init(
    { pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [] } } }, 'tienda-test');
  return win;
}
function renderFranja(win) {
  const T = win.TiendaIA;
  const id = T.editorState.addSection('franja');
  const cont = win.document.createElement('div');
  T.editorInspector.render(cont, {});
  T.editorState.select(id);
  T.editorInspector.rebuild();
  return { T, id, cont };
}
const hintText = (cont) => { const h = cont.querySelector('.ed-franja-hint'); return h ? (h.textContent || '') : null; };
const alturaSelect = (win, cont) => [...cont.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'adaptarse'));
function setAltura(win, cont, v) {
  const sel = alturaSelect(win, cont);
  sel.value = v;
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
}
// Image mock: al asignar src, fija naturalWidth/Height y dispara onload (sincronico para el test).
function mockImage(win, w, h) {
  win.Image = class { set src(_v) { this.naturalWidth = w; this.naturalHeight = h; if (this.onload) this.onload(); } };
}

// ── #2 hint de formato ──
test('#2 hint: default (medio, 1 imagen) -> ~3:1 panoramica + px ideal', () => {
  const win = boot();
  const { cont } = renderFranja(win);
  const t = hintText(cont);
  assert.ok(t, 'falta el hint .ed-franja-hint');
  assert.match(t, /~3:1 \(panoramica\)/);
  assert.match(t, /ideal subir ~\d+×\d+px/);
});

test('#2 hint RECALCULA al cambiar altura (rebuild_on_change): corto->~5:1, alto->~2:1, adaptarse->se adapta', () => {
  const win = boot();
  const { cont } = renderFranja(win);
  setAltura(win, cont, 'corto');
  assert.match(hintText(cont), /~5:1/, 'corto 1-img = (1440/1)/300 = 4.8 -> 5:1');
  setAltura(win, cont, 'alto');
  assert.match(hintText(cont), /~2:1/, 'alto 1-img = (1440/1)/680 = 2.12 -> 2:1');
  setAltura(win, cont, 'adaptarse');
  assert.match(hintText(cont), /Se adapta a la imagen \(sin recorte\)/, 'adaptarse hero -> texto natural, sin ratio');
});

// ── #3 aviso por imagen ──
test('#3 aviso: imagen muy vertical (40x60) en medio (objetivo ~3:1) -> aviso visible', () => {
  const win = boot();
  mockImage(win, 40, 60);
  const { cont } = renderFranja(win);
  const warn = cont.querySelector('.ed-franja-warn');
  assert.ok(warn && !warn.hidden, 'el aviso deberia mostrarse');
  assert.match(warn.textContent, /mucho mas vertical/);
  assert.match(warn.textContent, /40×60/);
});

test('#3 SIN aviso: imagen acorde al espacio (1440x460 ~ objetivo medio 1-img) -> oculto', () => {
  const win = boot();
  mockImage(win, 1440, 460);
  const { cont } = renderFranja(win);
  const warn = cont.querySelector('.ed-franja-warn');
  assert.ok(!warn || warn.hidden, 'imagen acorde -> sin aviso');
});

test('#3 adaptarse + hero: aviso SUPRIMIDO aunque la imagen sea vertical (no recorta)', () => {
  const win = boot();
  mockImage(win, 40, 60);
  const { cont } = renderFranja(win);
  setAltura(win, cont, 'adaptarse');   // 1 slide / 1 imagen -> natural -> sin recorte -> sin aviso
  const warn = cont.querySelector('.ed-franja-warn');
  assert.ok(!warn || warn.hidden, 'adaptarse-hero no avisa');
});
