import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';
// Import del Zod canonical (TS) via tsx loader. Resuelve 'zod' desde packages/database/node_modules (3.25.76).
import { SectionSchema } from '../../packages/database/src/editor-schema.ts';

// Drift-guard (adicion de Jorge, cierra Pilar 2):
// sectionDefs (admin) y el Zod (paquete) son 2 archivos -> pueden driftear en silencio.
// Este test FALLA si divergen en: (a) set de tipos, (b) set de campos por tipo,
// (c) opcionalidad por campo, (d) [ext 2026-06-08] keys + opcionalidad de los SUB-CAMPOS
// de items de un array (list). Con eso quedan forzados a estar de acuerdo = 1 fuente.
//
// "Optional" se define IGUAL en ambos lados = OMITIBLE de verdad:
//   Zod: el campo es ZodOptional (.optional()). Los .default() NO cuentan (siempre presentes).
//   defs: campo.optional === true.

// Desenvuelve ZodOptional/ZodDefault para llegar al tipo interno (ej. el ZodArray detras de .optional()).
function unwrap(v) {
  let t = v;
  while (t && t._def && (t._def.typeName === 'ZodOptional' || t._def.typeName === 'ZodDefault')) {
    t = t._def.innerType;
  }
  return t;
}
// Si el campo es un array de objetos, devuelve el shape de opcionalidad de sus sub-campos; si no, null.
function itemShape(v) {
  const inner = unwrap(v);
  if (!inner || !inner._def || inner._def.typeName !== 'ZodArray') return null;
  const el = inner._def.type;
  if (!el || !el._def || el._def.typeName !== 'ZodObject') return null;
  const out = {};
  for (const [k, sv] of Object.entries(el.shape)) out[k] = sv._def.typeName === 'ZodOptional';
  return out;
}

// FASE D · D3b: `contenedor` YA tiene def en section-defs (control 'child-blocks' para `bloques`,
// que NO es 'list' -> el drift-guard no lo trata como lista de sub-campos). El guard re-enganchado
// valida que sus campos {columnas,gap,alineacion_vertical,bloques} cuadran con el Zod.

// FASE F: `franja` esta en el Zod (schema dormant listo) pero su def en section-defs + UI del editor
// AUN no existen -> se EXCLUYE del drift hasta F-4 (mismo patron PENDING que el contenedor en D1).
const PENDING_TIPOS = new Set(['franja']);

function zodByTipo() {
  const out = {};
  for (const opt of SectionSchema._def.options) {
    const tipo = opt.shape.tipo._def.value;
    if (PENDING_TIPOS.has(tipo)) continue; // pendiente: section-defs/UI sin construir (re-engancha F-4)
    // FASE D (2a): VideoProps usa .superRefine (XOR url/html) -> ZodEffects, no ZodObject.
    // Unwrap al ZodObject interno para leer su .shape (vale para cualquier props refinada).
    let propsObj = opt.shape.props;
    while (propsObj._def && propsObj._def.typeName === 'ZodEffects') propsObj = propsObj._def.schema;
    const propsShape = propsObj.shape;
    const fields = {}, items = {};
    for (const [k, v] of Object.entries(propsShape)) {
      fields[k] = v._def.typeName === 'ZodOptional';
      const it = itemShape(v);
      if (it) items[k] = it;
    }
    out[tipo] = { fields, items };
  }
  return out;
}

function defsByTipo(win) {
  const D = win.TiendaIA.editorSectionDefs.defs;
  const out = {};
  for (const [tipo, def] of Object.entries(D)) {
    const fields = {}, items = {};
    for (const c of def.campos) {
      if (c.__info) continue;
      fields[c.key] = c.optional === true;
      if (c.control === 'list' && Array.isArray(c.item)) {
        const sub = {};
        for (const sf of c.item) sub[sf.key] = sf.optional === true;
        items[c.key] = sub;
      }
    }
    out[tipo] = { fields, items };
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
      Object.keys(defs[tipo].fields).sort(),
      Object.keys(zod[tipo].fields).sort(),
      `los CAMPOS difieren en tipo "${tipo}"`
    );
    for (const k of Object.keys(zod[tipo].fields)) {
      assert.equal(
        defs[tipo].fields[k], zod[tipo].fields[k],
        `OPCIONALIDAD difiere en "${tipo}.${k}" (defs=${defs[tipo].fields[k]} zod=${zod[tipo].fields[k]})`
      );
    }
  }
});

test('drift-guard (items): sub-campos de arrays coinciden (keys + opcionalidad)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js']);
  const zod = zodByTipo();
  const defs = defsByTipo(win);

  for (const tipo of Object.keys(zod)) {
    const zItems = zod[tipo].items, dItems = defs[tipo].items;
    // todo array de objetos en el Zod debe tener su item en defs (y viceversa)
    assert.deepEqual(
      Object.keys(dItems).sort(), Object.keys(zItems).sort(),
      `los campos-LISTA (array de objetos) difieren en tipo "${tipo}"`
    );
    for (const campoKey of Object.keys(zItems)) {
      assert.deepEqual(
        Object.keys(dItems[campoKey]).sort(),
        Object.keys(zItems[campoKey]).sort(),
        `los SUB-CAMPOS de "${tipo}.${campoKey}[]" difieren (defs vs zod)`
      );
      for (const sk of Object.keys(zItems[campoKey])) {
        assert.equal(
          dItems[campoKey][sk], zItems[campoKey][sk],
          `OPCIONALIDAD de sub-campo difiere en "${tipo}.${campoKey}[].${sk}" (defs=${dItems[campoKey][sk]} zod=${zItems[campoKey][sk]})`
        );
      }
    }
  }
});
