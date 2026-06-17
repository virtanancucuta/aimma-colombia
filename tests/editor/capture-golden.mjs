// Captura el output ACTUAL de createSectionDefault (9 tipos) y del inspector (9 tipos).
// Corre con el editor-state.js y editor-inspector.js ACTUALES (pre-refactor).
import { bootWindow } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLD = resolve(HERE, 'golden');
mkdirSync(GOLD, { recursive: true });

const TIPOS = ['banner', 'texto', 'imagen', 'botones', 'productos', 'galeria', 'formulario', 'espacio', 'video', 'contenedor', 'franja'];

const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
const T = win.TiendaIA;

const norm = (h) => h.replace(/sec_[a-z0-9]{4,}/g, 'sec_X').trim();

// --- Golden A: createSectionDefault por tipo (id normalizado) ---
T.editorState.init({}, 'tienda-test');
const defaults = {};
for (const tipo of TIPOS) {
  const id = T.editorState.addSection(tipo);
  // Normaliza TODOS los ids sec_ (top-level + hijos de contenedor con id generado).
  const sec = JSON.parse(JSON.stringify(T.editorState.findSection(id)).replace(/sec_[a-z0-9]{4,}/g, 'sec_GOLDEN'));
  defaults[tipo] = sec;
  T.editorState.removeSection(id);
}
writeFileSync(resolve(GOLD, 'default-props.json'), JSON.stringify(defaults, null, 2));

// --- Golden B: innerHTML del inspector por tipo ---
for (const tipo of TIPOS) {
  T.editorState.init({ pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z',
    sections: [{ ...defaults[tipo], id: 'sec_golden0' }] } } }, 'tienda-test');
  const container = win.document.createElement('div');
  T.editorInspector.render(container, {});
  T.editorState.select('sec_golden0');
  T.editorInspector.rebuild();
  writeFileSync(resolve(GOLD, `inspector-${tipo}.html`), norm(container.innerHTML));
}

console.log('golden capturado:', TIPOS.length, 'tipos');
