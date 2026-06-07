// C.2 Paso 2 — registro de campos texto-simple + setByPath seguro + cleanInlineText.
import { test, expect } from 'vitest';
import { SIMPLE_TEXT_FIELDS, isSimpleTextField, setByPath, getByPath, cleanInlineText } from '@aimma/database';

test('isSimpleTextField: acepta solo el set y rechaza el resto', () => {
  expect(isSimpleTextField('banner', 'titulo')).toBe(true);
  expect(isSimpleTextField('banner', 'boton.texto')).toBe(true);
  expect(isSimpleTextField('botones', 'items.2.texto')).toBe(true);
  expect(isSimpleTextField('formulario', 'campos.0.label')).toBe(true);
  // rechazos:
  expect(isSimpleTextField('botones', 'items.x.texto')).toBe(false);   // indice no numerico
  expect(isSimpleTextField('texto', 'contenido')).toBe(false);          // rich-text -> inspector
  expect(isSimpleTextField('banner', 'subtitulo')).toBe(true);          // textarea pero render 1-linea -> inline
  expect(isSimpleTextField('banner', 'boton.url')).toBe(false);         // no es texto-simple
  expect(isSimpleTextField('productos', 'titulo')).toBe(false);         // tipo sin campos
  expect(isSimpleTextField('banner', '__proto__')).toBe(false);
  expect(isSimpleTextField('nope', 'titulo')).toBe(false);
});

test('setByPath: setea campo EXISTENTE, inmutable, y null si no existe', () => {
  const props = { titulo: 'viejo', boton: { texto: 'a', url: '#' }, items: [{ texto: 'x' }, { texto: 'y' }] };
  const r1 = setByPath(props, 'titulo', 'nuevo');
  expect(r1?.titulo).toBe('nuevo');
  expect(props.titulo).toBe('viejo'); // original intacto (inmutable)
  expect(setByPath(props, 'boton.texto', 'B')?.boton.texto).toBe('B');
  expect(setByPath(props, 'items.1.texto', 'Y2') as any).toMatchObject({ items: [{ texto: 'x' }, { texto: 'Y2' }] });
  // campo inexistente -> null (no crea estructura)
  expect(setByPath(props, 'inexistente', 'z')).toBe(null);
  expect(setByPath(props, 'items.9.texto', 'z')).toBe(null);
});

test('setByPath: guarda contra prototype pollution (defensa en profundidad)', () => {
  expect(setByPath({ a: 1 } as any, '__proto__.polluted', 'x')).toBe(null);
  expect(setByPath({ a: 1 } as any, 'constructor.prototype.polluted', 'x')).toBe(null);
  expect(({} as any).polluted).toBeUndefined(); // Object.prototype NO contaminado
});

test('getByPath: lee y es seguro', () => {
  const o = { boton: { texto: 'hola' }, items: [{ texto: 'a' }] };
  expect(getByPath(o, 'boton.texto')).toBe('hola');
  expect(getByPath(o, 'items.0.texto')).toBe('a');
  expect(getByPath(o, '__proto__')).toBeUndefined();
  expect(getByPath(o, 'nope.nope')).toBeUndefined();
});

test('cleanInlineText: texto plano de una linea sin basura del navegador', () => {
  expect(cleanInlineText('hola  mundo')).toBe('hola mundo');
  expect(cleanInlineText('linea1\nlinea2\t fin')).toBe('linea1 linea2 fin');
  expect(cleanInlineText('  con nbsp  y espacios  ')).toBe('con nbsp y espacios');
  expect(cleanInlineText('')).toBe('');
});

test('SIMPLE_TEXT_FIELDS: solo banner/botones/formulario, sin rich-text', () => {
  expect(Object.keys(SIMPLE_TEXT_FIELDS).sort()).toEqual(['banner', 'botones', 'caracteristicas', 'cita', 'formulario', 'imagen_con_texto']);
  expect(SIMPLE_TEXT_FIELDS.texto).toBeUndefined();
});
