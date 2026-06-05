import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const canonical = readFileSync(resolve(HERE, '../../packages/database/src/editor-schema.ts'), 'utf8');
const efCopy = readFileSync(resolve(HERE, '../../supabase/functions/tienda-guardar-layout/editor-schema.ts'), 'utf8');

const canonicalFP = readFileSync(resolve(HERE, '../../packages/database/src/font-pairings.ts'), 'utf8');
const efCopyFP = readFileSync(resolve(HERE, '../../supabase/functions/tienda-guardar-layout/font-pairings.ts'), 'utf8');

// Dedupe del Zod: una sola fuente autorada (packages/database). El EF necesita el schema
// como archivo Deno en su carpeta (el deploy MCP no resuelve imports fuera del dir). Esa
// copia es un MIRROR byte-identico, NO hand-maintained: este test falla si driftea.
test('EF editor-schema.ts es mirror byte-identico del canonical', () => {
  assert.equal(
    efCopy, canonical,
    'la copia del EF drifteo. Re-sincronizar: cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts'
  );
});

test('EF font-pairings.ts es mirror byte-identico del canonical', () => {
  assert.equal(
    efCopyFP, canonicalFP,
    'la copia del EF drifteo. Re-sincronizar: cp packages/database/src/font-pairings.ts supabase/functions/tienda-guardar-layout/font-pairings.ts'
  );
});
