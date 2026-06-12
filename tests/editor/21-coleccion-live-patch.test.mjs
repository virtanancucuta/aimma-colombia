import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

// ============================================================
// L3-fix · live-patch en COLECCION. Ejerce el CODIGO REAL del bridge (EditorPreviewBridge.astro):
// extrae su <script is:inline>, lo evalua en jsdom, dispara un 'section-patch' y verifica que el
// insert/replace/remove/move ancla en el contenedor estable [data-ed-sections] -> la primera seccion
// de una coleccion VACIA aparece LIVE (sin recarga). Canario: el fallback (sin contenedor) sigue
// usando first.parentElement. Bug original: coleccion vacia no tenia [data-section-id] -> sin ancla.
// (ids con 4+ chars tras 'sec_' -> el bridge valida /^sec_[a-z0-9]{4,}$/.)
// ============================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIDGE = readFileSync(resolve(HERE, '../../apps/storefront/src/components/EditorPreviewBridge.astro'), 'utf8');

const m = BRIDGE.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no se encontro el <script is:inline> en EditorPreviewBridge.astro');
const SCRIPT_BODY = m[1];
const VARS = "const ADMIN_ORIGIN='https://aimma.com.co'; const PAIRINGS={}; const COLOR_RE='^#[0-9a-fA-F]{6}$';\n";
const ORIGIN = 'https://aimma.com.co';

function boot(html) {
  const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', { runScripts: 'outside-only' });
  dom.window.eval(VARS + SCRIPT_BODY); // corre el bridge real -> registra el listener de 'message'
  const patch = (msg) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: msg, origin: ORIGIN }));
  return { doc: dom.window.document, patch };
}
const sec = (id, txt) => '<section data-section-id="' + id + '">' + (txt || id) + '</section>';

test('COLECCION VACIA: insert ancla en [data-ed-sections] -> la 1ra seccion aparece LIVE', () => {
  const { doc, patch } = boot('<main><div data-ed-sections></div><header>cabecera</header><div>grid</div></main>');
  patch({ type: 'section-patch', op: 'insert', sectionId: 'sec_nueva1', html: sec('sec_nueva1', 'NUEVA'), index: 0 });
  const cont = doc.querySelector('[data-ed-sections]');
  const node = cont.querySelector('[data-section-id="sec_nueva1"]');
  assert.ok(node, 'la seccion deberia estar DENTRO de [data-ed-sections]');
  assert.equal(node.textContent, 'NUEVA');
  assert.equal(cont.children.length, 1);
  assert.ok(doc.querySelector('header')); // header/grid intactos afuera del contenedor
});

test('COLECCION con secciones: insert respeta el index dentro del contenedor', () => {
  const { doc, patch } = boot('<main><div data-ed-sections>' + sec('sec_aaaa', 'A') + sec('sec_bbbb', 'B') + '</div><header>h</header></main>');
  patch({ type: 'section-patch', op: 'insert', sectionId: 'sec_midd', html: sec('sec_midd', 'M'), index: 1 });
  const ids = Array.from(doc.querySelectorAll('[data-ed-sections] > [data-section-id]')).map((e) => e.getAttribute('data-section-id'));
  assert.deepEqual(ids, ['sec_aaaa', 'sec_midd', 'sec_bbbb']);
});

test('replace: reemplaza la seccion por su id (contenido nuevo, mismo lugar)', () => {
  const { doc, patch } = boot('<main><div data-ed-sections>' + sec('sec_aaaa', 'A') + sec('sec_bbbb', 'B') + '</div></main>');
  patch({ type: 'section-patch', op: 'replace', sectionId: 'sec_aaaa', html: sec('sec_aaaa', 'A-EDITADA') });
  assert.equal(doc.querySelector('[data-section-id="sec_aaaa"]').textContent, 'A-EDITADA');
  const ids = Array.from(doc.querySelectorAll('[data-ed-sections] > [data-section-id]')).map((e) => e.getAttribute('data-section-id'));
  assert.deepEqual(ids, ['sec_aaaa', 'sec_bbbb']); // orden intacto
});

test('move: reordena dentro del contenedor (splice semantics)', () => {
  const { doc, patch } = boot('<main><div data-ed-sections>' + sec('sec_aaaa') + sec('sec_bbbb') + sec('sec_cccc') + '</div></main>');
  patch({ type: 'section-patch', op: 'move', sectionId: 'sec_aaaa', toIndex: 2 });
  const ids = Array.from(doc.querySelectorAll('[data-ed-sections] > [data-section-id]')).map((e) => e.getAttribute('data-section-id'));
  assert.deepEqual(ids, ['sec_bbbb', 'sec_cccc', 'sec_aaaa']);
});

test('remove: borra la seccion por id', () => {
  const { doc, patch } = boot('<main><div data-ed-sections>' + sec('sec_aaaa') + sec('sec_bbbb') + '</div></main>');
  patch({ type: 'section-patch', op: 'remove', sectionId: 'sec_aaaa' });
  assert.equal(doc.querySelector('[data-section-id="sec_aaaa"]'), null);
  assert.ok(doc.querySelector('[data-section-id="sec_bbbb"]'));
});

test('CANARIO: sin [data-ed-sections], el insert cae a first.parentElement (compat)', () => {
  const { doc, patch } = boot('<main><section data-section-id="sec_xxxx">X</section></main>');
  patch({ type: 'section-patch', op: 'insert', sectionId: 'sec_yyyy', html: sec('sec_yyyy', 'Y'), index: 1 });
  const ids = Array.from(doc.querySelectorAll('main > [data-section-id]')).map((e) => e.getAttribute('data-section-id'));
  assert.deepEqual(ids, ['sec_xxxx', 'sec_yyyy']);
});

test('seguridad intacta: section-patch con origin ajeno NO toca el DOM', () => {
  const dom = new JSDOM('<!doctype html><html><body><main><div data-ed-sections></div></main></body></html>', { runScripts: 'outside-only' });
  dom.window.eval(VARS + SCRIPT_BODY);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'section-patch', op: 'insert', sectionId: 'sec_evil1', html: sec('sec_evil1'), index: 0 }, origin: 'https://evil.example.com' }));
  assert.equal(dom.window.document.querySelector('[data-section-id="sec_evil1"]'), null);
});
