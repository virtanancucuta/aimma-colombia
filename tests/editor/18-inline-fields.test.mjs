import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bootWindow } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
function IF() { return bootWindow(['inline-fields.js']).TiendaIA.editorInlineFields; }

test('isSimpleTextField (mirror JS): acepta el set, rechaza resto + proto', () => {
  const f = IF();
  assert.equal(f.isSimpleTextField('banner', 'titulo'), true);
  assert.equal(f.isSimpleTextField('banner', 'boton.texto'), true);
  assert.equal(f.isSimpleTextField('botones', 'items.2.texto'), true);
  assert.equal(f.isSimpleTextField('formulario', 'campos.0.label'), true);
  assert.equal(f.isSimpleTextField('botones', 'items.x.texto'), false);
  assert.equal(f.isSimpleTextField('texto', 'contenido'), false);   // rich-text -> inspector
  assert.equal(f.isSimpleTextField('banner', 'subtitulo'), true);   // textarea pero render 1-linea -> inline
  assert.equal(f.isSimpleTextField('banner', '__proto__'), false);
  assert.equal(f.isSimpleTextField('nope', 'titulo'), false);
});

test('setByPath (mirror JS): existente + inmutable + null + anti-pollution', () => {
  const f = IF();
  const props = { titulo: 'v', boton: { texto: 'a' }, items: [{ texto: 'x' }] };
  assert.equal(f.setByPath(props, 'titulo', 'n').titulo, 'n');
  assert.equal(props.titulo, 'v'); // inmutable
  assert.equal(f.setByPath(props, 'boton.texto', 'B').boton.texto, 'B');
  assert.equal(f.setByPath(props, 'items.0.texto', 'X2').items[0].texto, 'X2');
  assert.equal(f.setByPath(props, 'inexistente', 'z'), null);
  assert.equal(f.setByPath({ a: 1 }, '__proto__.x', 'y'), null);
  assert.equal(({}).x, undefined);
});

test('cleanInlineText (mirror JS): texto plano una linea', () => {
  const f = IF();
  assert.equal(f.cleanInlineText('hola  mundo'), 'hola mundo');
  assert.equal(f.cleanInlineText('a\nb\tc'), 'a b c');
  assert.equal(f.cleanInlineText(123), '');
});

test('SYNC: el mirror JS coincide con el registro TS (packages/database/inline-fields.ts)', () => {
  const f = IF();
  const ts = readFileSync(resolve(HERE, '../../packages/database/src/inline-fields.ts'), 'utf8');
  for (const tipo of Object.keys(f.SIMPLE_TEXT_FIELDS)) {
    assert.ok(ts.includes(tipo + ': ['), 'TS no tiene el tipo ' + tipo);
    for (const path of f.SIMPLE_TEXT_FIELDS[tipo]) {
      assert.ok(ts.includes("'" + path + "'"), 'TS no tiene la ruta ' + path);
    }
  }
  assert.deepEqual(Object.keys(f.SIMPLE_TEXT_FIELDS).sort(), ['banner', 'botones', 'formulario']);
});
