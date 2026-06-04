import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RICHTEXT_POLICY, toSanitizeHtml, toDOMPurify } from '../../packages/database/src/richtext-policy.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

// Fidelidad: ambos adaptadores derivan FIELMENTE del canonico -> atrapa drift en cualquiera.
test('policy-sync: toSanitizeHtml deriva del canonico', () => {
  const a = toSanitizeHtml(RICHTEXT_POLICY);
  assert.deepEqual(a.allowedTags, RICHTEXT_POLICY.tags, 'allowedTags != policy.tags');
  assert.deepEqual(a.allowedAttributes, RICHTEXT_POLICY.attrs, 'allowedAttributes != policy.attrs');
  assert.deepEqual(a.allowedSchemes, RICHTEXT_POLICY.schemes, 'allowedSchemes != policy.schemes');
  assert.equal(a.disallowedTagsMode, 'discard');
});

test('policy-sync: toDOMPurify deriva del canonico', () => {
  const d = toDOMPurify(RICHTEXT_POLICY);
  assert.deepEqual(d.ALLOWED_TAGS, RICHTEXT_POLICY.tags, 'ALLOWED_TAGS != policy.tags');
  assert.deepEqual(d.ALLOWED_ATTR, ['href'], 'ALLOWED_ATTR != uniq(flatten(attrs))');
  assert.equal(d.ALLOWED_URI_REGEXP.source, '^(https:|mailto:|tel:)', 'regex de schemes drifteo');
  assert.equal(d.ALLOWED_URI_REGEXP.flags, 'i');
  assert.equal(d.ALLOW_DATA_ATTR, false);
});

test('policy-sync: EF richtext-policy.ts es mirror byte-identico del canonico', () => {
  const canonical = readFileSync(resolve(HERE, '../../packages/database/src/richtext-policy.ts'), 'utf8');
  const efCopy = readFileSync(resolve(HERE, '../../supabase/functions/tienda-guardar-layout/richtext-policy.ts'), 'utf8');
  assert.equal(efCopy, canonical,
    'la copia del EF drifteo. Re-sincronizar: cp packages/database/src/richtext-policy.ts supabase/functions/tienda-guardar-layout/richtext-policy.ts');
});
