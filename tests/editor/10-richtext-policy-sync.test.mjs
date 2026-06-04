import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RICHTEXT_POLICY, toSanitizeHtml } from '../../packages/database/src/richtext-policy.ts';
import { bootWindow } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// Fidelidad: UN solo adaptador (toSanitizeHtml) deriva FIELMENTE del canonico. Lo usan la EF
// (autoritativa) Y el storefront (defensa en profundidad), ambos con sanitize-html. DOMPurify
// no corre en Worker/Deno -> no hay toDOMPurify en el canonico (el admin tiene el suyo en browser).
test('policy-sync: toSanitizeHtml deriva del canonico', () => {
  const a = toSanitizeHtml(RICHTEXT_POLICY);
  assert.deepEqual(a.allowedTags, RICHTEXT_POLICY.tags, 'allowedTags != policy.tags');
  assert.deepEqual(a.allowedAttributes, RICHTEXT_POLICY.attrs, 'allowedAttributes != policy.attrs');
  assert.deepEqual(a.allowedSchemes, RICHTEXT_POLICY.schemes, 'allowedSchemes != policy.schemes');
  assert.equal(a.disallowedTagsMode, 'discard');
});

test('policy-sync: EF richtext-policy.ts es mirror byte-identico del canonico', () => {
  const canonical = readFileSync(resolve(HERE, '../../packages/database/src/richtext-policy.ts'), 'utf8');
  const efCopy = readFileSync(resolve(HERE, '../../supabase/functions/tienda-guardar-layout/richtext-policy.ts'), 'utf8');
  assert.equal(efCopy, canonical,
    'la copia del EF drifteo. Re-sincronizar: cp packages/database/src/richtext-policy.ts supabase/functions/tienda-guardar-layout/richtext-policy.ts');
});

test('policy-sync: el mirror JS del admin (POLICY) coincide en valores con el canonico', () => {
  const win = bootWindow(['richtext-policy.js']);
  const P = win.TiendaIA.richtextPolicy;
  assert.ok(P, 'window.TiendaIA.richtextPolicy no existe');
  // La POLICY del admin (la parte de seguridad) DEBE coincidir con el canonico.
  assert.deepEqual(P.POLICY.tags, RICHTEXT_POLICY.tags, 'tags del admin difieren');
  assert.deepEqual(P.POLICY.attrs, RICHTEXT_POLICY.attrs, 'attrs del admin difieren');
  assert.deepEqual(P.POLICY.schemes, RICHTEXT_POLICY.schemes, 'schemes del admin difieren');
  // El admin usa DOMPurify-CDN en el navegador (best-effort UX). Su toDOMPurify NO se compara
  // contra un canonico (ya no existe) sino que debe ser auto-consistente con SU propia POLICY.
  const adm = P.toDOMPurify();
  assert.deepEqual(adm.ALLOWED_TAGS, P.POLICY.tags, 'admin toDOMPurify.ALLOWED_TAGS != su POLICY.tags');
  assert.deepEqual(adm.ALLOWED_ATTR, ['href'], 'admin ALLOWED_ATTR != href');
  assert.equal(adm.ALLOWED_URI_REGEXP.source, '^(https:|mailto:|tel:)', 'admin regex de schemes drifteo');
  assert.equal(adm.ALLOW_DATA_ATTR, false);
});

test('richtext: el control renderea toolbar (5 botones) + contenteditable con el valor', () => {
  const win = bootWindow(['richtext-policy.js', 'editor-controls.js']);
  const C = win.TiendaIA.editorControls;
  let changed = null;
  const node = C.richText('Contenido', '<b>hola</b>', (v) => { changed = v; }, { maxLength: 5000 });
  const editor = node.querySelector('.ed-ctrl__richtext');
  assert.ok(editor, 'no renderizo el contenteditable');
  assert.equal(editor.getAttribute('contenteditable'), 'true');
  const toolbar = node.querySelector('.ed-rt__toolbar');
  assert.ok(toolbar, 'no renderizo la toolbar');
  // Los 5 botones: negrita, italica, enlace, lista vinetas, lista numerada.
  const btns = toolbar.querySelectorAll('.ed-rt__btn');
  assert.equal(btns.length, 5, `la toolbar debe tener 5 botones, tiene ${btns.length}`);
  // El runtime (bold-on-seleccion, estado activo) NO es testeable en jsdom (sin execCommand/seleccion
  // reales) -> validacion final en vivo. Aca cubrimos la regresion estructural del markup.
  // En jsdom no hay window.DOMPurify -> normalize cae al fallback (devuelve el valor tal cual).
  assert.ok(editor.innerHTML.includes('hola'), 'no cargo el valor inicial');
});
