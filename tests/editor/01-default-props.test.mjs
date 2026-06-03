import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootWindow } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(HERE, 'golden/default-props.json'), 'utf8'));
const TIPOS = Object.keys(golden);

test('createSectionDefault identico al golden (9 tipos)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  const T = win.TiendaIA;
  T.editorState.init({}, 'tienda-test');
  for (const tipo of TIPOS) {
    const id = T.editorState.addSection(tipo);
    const sec = JSON.parse(JSON.stringify(T.editorState.findSection(id)));
    sec.id = 'sec_GOLDEN';
    assert.deepEqual(sec, golden[tipo], `defaultProps drift en tipo ${tipo}`);
    T.editorState.removeSection(id);
  }
});
