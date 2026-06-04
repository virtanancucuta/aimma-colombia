import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// Hotfix carga del editor: el bug era que el SELECT del admin no traia 'personalizaciones'
// (state.tienda.personalizaciones = undefined -> init([]) -> first-use siempre). El fix lo
// agrega al SELECT. Este test cubre el CONSUMIDOR (editorState.init): que cargue bien una
// vez que recibe el dato, con la precedencia correcta y SIN romper el caso first-use.

const sec = (id, tipo) => ({ id, tipo, ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, padding: 'md', props: {} });
const page = (updated, sections) => ({ version: 2, updated_at: updated, sections });

test('carga: con home_draft, init carga el BORRADOR (precedencia draft > publicado)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  const ES = win.TiendaIA.editorState;
  ES.init({
    schema_version: 3,
    pages: {
      home: page('2026-06-04T15:57:27.501Z', [sec('sec_h1', 'banner'), sec('sec_h2', 'productos'), sec('sec_h3', 'botones'), sec('sec_h4', 'productos')]),
      home_draft: page('2026-06-04T15:57:34.556Z', [sec('sec_d1', 'banner'), sec('sec_d2', 'productos'), sec('sec_d3', 'botones')]),
    },
  }, 'tienda-test');
  assert.equal(ES.sections.length, 3, 'debe cargar el draft (3), no el home (4)');
  assert.equal(ES.sections[0].id, 'sec_d1');
});

test('carga: sin draft, init carga el PUBLICADO (home)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  const ES = win.TiendaIA.editorState;
  ES.init({ schema_version: 3, pages: { home: page('2026-06-04T15:57:27.501Z', [sec('sec_h1', 'banner'), sec('sec_h2', 'texto')]) } }, 'tienda-test');
  assert.equal(ES.sections.length, 2, 'debe cargar el home publicado (2)');
  assert.equal(ES.sections[0].id, 'sec_h1');
});

test('carga: personalizaciones null/vacio -> SECCIONES VACIAS (first-use intacto)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  const ES = win.TiendaIA.editorState;
  ES.init(null, 'tienda-test');
  assert.equal(ES.sections.length, 0, 'tienda nueva (null) -> vacio -> first-use modal');
  ES.init({}, 'tienda-test');
  assert.equal(ES.sections.length, 0, '{} -> vacio');
  ES.init({ schema_version: 3, pages: {} }, 'tienda-test');
  assert.equal(ES.sections.length, 0, 'pages:{} -> vacio');
});
