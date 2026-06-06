import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const canonical = readFileSync(resolve(HERE, '../../packages/database/src/editor-schema.ts'), 'utf8');
const efCopy = readFileSync(resolve(HERE, '../../supabase/functions/tienda-guardar-layout/editor-schema.ts'), 'utf8');

// NOTA: font-pairings.ts NO se mirror-ea al EF — el editor-schema inlinea los IDs del enum (Deno
// exige extension .ts en imports relativos, que rompe el bundle). El drift IDs<->allowlist se cubre en 12.

// Dedupe del Zod: una sola fuente autorada (packages/database). El EF necesita el schema
// como archivo Deno en su carpeta (el deploy MCP no resuelve imports fuera del dir). Esa
// copia es un MIRROR byte-identico, NO hand-maintained: este test falla si driftea.
test('EF editor-schema.ts es mirror byte-identico del canonical', () => {
  assert.equal(
    efCopy, canonical,
    'la copia del EF drifteo. Re-sincronizar: cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts'
  );
});

// validate-section: mirror EF == canonico modulo la extension .ts en imports relativos.
// El UNICO diff permitido entre el canonico (Node/Vite, sin extension) y el mirror (Deno, con .ts)
// es exactamente esa extension en los 2 imports relativos. Este test normaliza el canonico agregando
// la extension y luego compara byte-a-byte. Cualquier otro drift (logica, comentarios, espacios) falla.
test('EF validate-section.ts es mirror del canonico modulo extension .ts en imports', () => {
  const canonicalVS = readFileSync(resolve(HERE, '../../packages/database/src/validate-section.ts'), 'utf8');
  const efVS = readFileSync(resolve(HERE, '../../supabase/functions/tienda-guardar-layout/validate-section.ts'), 'utf8');
  // Normalizar el canonico: agregar .ts a los 2 imports relativos (editor-schema y richtext-policy).
  const canonicalNormalized = canonicalVS
    .replace("from './editor-schema'", "from './editor-schema.ts'")
    .replace("from './richtext-policy'", "from './richtext-policy.ts'");
  assert.equal(
    efVS, canonicalNormalized,
    'el mirror EF de validate-section drifteo del canonico. El unico diff permitido es la extension .ts en imports relativos (exigencia Deno). Re-sincronizar y ajustar solo la extension.'
  );
});
