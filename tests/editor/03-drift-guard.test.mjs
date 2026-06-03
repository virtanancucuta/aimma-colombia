import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';
// Import del Zod canonical (TS) via tsx loader. Resuelve 'zod' desde packages/database/node_modules (3.25.76).
import { SectionSchema } from '../../packages/database/src/editor-schema.ts';

// Drift-guard (adicion de Jorge, cierra Pilar 2):
// sectionDefs (admin) y el Zod (paquete) son 2 archivos -> pueden driftear en silencio.
// Este test FALLA si divergen en: (a) set de tipos, (b) set de campos por tipo,
// (c) opcionalidad por campo. Con eso quedan forzados a estar de acuerdo = 1 fuente.

// "Optional" se define IGUAL en ambos lados = OMITIBLE de verdad:
//   Zod: el campo es ZodOptional (.optional()). Los .default() NO cuentan (siempre
//        presentes en el output) -> alineados con como sectionDefs marca optional:true.
//   defs: campo.optional === true.

function zodByTipo() {
  const out = {};
  for (const opt of SectionSchema._def.options) {
    const tipo = opt.shape.tipo._def.value;          // z.literal('banner') -> 'banner'
    const propsShape = opt.shape.props.shape;          // shape de Props
    const fields = {};
    for (const [k, v] of Object.entries(propsShape)) {
      fields[k] = v._def.typeName === 'ZodOptional';   // optional = omitible real
    }
    out[tipo] = fields;
  }
  return out;
}

function defsByTipo(win) {
  const D = win.TiendaIA.editorSectionDefs.defs;
  const out = {};
  for (const [tipo, def] of Object.entries(D)) {
    const fields = {};
    for (const c of def.campos) {
      if (c.__info) continue;
      fields[c.key] = c.optional === true;
    }
    out[tipo] = fields;
  }
  return out;
}

test('drift-guard: sectionDefs y Zod coinciden (tipos + campos + opcionalidad)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js']);
  const zod = zodByTipo();
  const defs = defsByTipo(win);

  assert.deepEqual(Object.keys(defs).sort(), Object.keys(zod).sort(), 'el set de TIPOS difiere entre sectionDefs y Zod');

  for (const tipo of Object.keys(zod)) {
    assert.deepEqual(
      Object.keys(defs[tipo]).sort(),
      Object.keys(zod[tipo]).sort(),
      `los CAMPOS difieren en tipo "${tipo}"`
    );
    for (const k of Object.keys(zod[tipo])) {
      assert.equal(
        defs[tipo][k], zod[tipo][k],
        `OPCIONALIDAD difiere en "${tipo}.${k}" (defs=${defs[tipo][k]} zod=${zod[tipo][k]})`
      );
    }
  }
});
