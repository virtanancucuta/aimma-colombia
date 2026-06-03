import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootWindow } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(HERE, 'golden/default-props.json'), 'utf8'));
const TIPOS = Object.keys(golden);
const norm = (h) => h.replace(/sec_[a-z0-9]{4,}/g, 'sec_X').trim();

for (const tipo of TIPOS) {
  test(`inspector DOM identico al golden — ${tipo}`, () => {
    const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
    const T = win.TiendaIA;
    T.editorState.init({ pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z',
      sections: [{ ...golden[tipo], id: 'sec_golden0' }] } } }, 'tienda-test');
    const container = win.document.createElement('div');
    T.editorInspector.render(container, {});
    T.editorState.select('sec_golden0');
    T.editorInspector.rebuild();
    const expected = norm(readFileSync(resolve(HERE, `golden/inspector-${tipo}.html`), 'utf8'));
    assert.equal(norm(container.innerHTML), expected, `inspector DOM drift en ${tipo}`);
  });
}
