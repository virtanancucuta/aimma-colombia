import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN = resolve(HERE, '../../iapanel/tienda/admin/views/editor');

// Crea un window jsdom limpio y carga los IIFE del editor en orden.
// files: nombres relativos a /views/editor (ej. 'editor-controls.js').
export function bootWindow(files) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const { window } = dom;
  // Los IIFE usan `window` y `document`; los exponemos al eval como variables.
  const sandboxEval = (code) => {
    // eslint-disable-next-line no-new-func
    const fn = new Function('window', 'document', 'setTimeout', 'clearTimeout', 'console', code);
    fn(window, window.document, window.setTimeout.bind(window), window.clearTimeout.bind(window), console);
  };
  for (const f of files) {
    sandboxEval(readFileSync(resolve(ADMIN, f), 'utf8'));
  }
  return window;
}
