import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SectionSchema, HijoSchema, PersonalizacionesSchema } from '../../packages/database/src/editor-schema.ts';
import { buildNextPersonalizaciones } from '../../packages/database/src/build-next-personalizaciones.ts';

// ============================================================
// FASE D · D1: bloques anidables (contenedor + union hija RESTRINGIDA, profundidad 2).
// Aditivo a SectionSchema; sin bump de schema_version. Cubre: contenedor valido /
// rechaza contenedor-en-contenedor / rechaza tipo-hijo desconocido / retrocompat sin
// contenedor / tope 8 hijos / buildNext preserva contenedor. EF mirror dormido (D2 lo despliega).
// ============================================================

const TRANSP = { tipo: 'transparente', valor: '' };

// Hoja generica (texto): SectionBase + columna + props de texto.
const hijoTexto = (id, columna = 0) => ({
  id, tipo: 'texto', ancho: 'contenido', fondo: TRANSP, padding: 'md', columna,
  props: { contenido: 'Hola mundo', alineacion: 'left', tamanio: 'md' },
});
const hijoCita = (id, columna = 0) => ({
  id, tipo: 'cita', ancho: 'contenido', fondo: TRANSP, padding: 'md', columna,
  props: { texto: 'Una frase', alineacion: 'center' },
});

const contenedor = (bloques, columnas = 2) => ({
  id: 'sec_cont01', tipo: 'contenedor', ancho: 'contenido', fondo: TRANSP, padding: 'md',
  props: { columnas, gap: 'normal', alineacion_vertical: 'start', bloques },
});

// ---- 1) contenedor valido ----
test('contenedor valido: 2 columnas con bloques hoja (texto + cita)', () => {
  const r = SectionSchema.safeParse(contenedor([hijoTexto('sec_h00001', 0), hijoCita('sec_h00002', 1)], 2));
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test('HijoSchema valida un bloque hoja permitido', () => {
  assert.ok(HijoSchema.safeParse(hijoTexto('sec_h00003')).success);
});

// ---- 2) rechaza contenedor-en-contenedor (profundidad 2 por construccion) ----
test('RECHAZA contenedor dentro de contenedor (la union hija no incluye contenedor)', () => {
  const anidado = contenedor([hijoTexto('sec_h00001', 0)], 1);          // un contenedor...
  const padre = contenedor([anidado], 1);                               // ...como bloque hijo de otro
  assert.equal(SectionSchema.safeParse(padre).success, false);
  assert.equal(HijoSchema.safeParse(anidado).success, false);          // y directo como hijo, tambien
});

// ---- 3) rechaza tipo-hijo desconocido / no permitido ----
test('RECHAZA tipo-hijo no permitido (banner, productos, galeria, formulario, categorias_destacadas)', () => {
  for (const tipo of ['banner', 'productos', 'galeria', 'formulario', 'categorias_destacadas']) {
    const hijoProhibido = { id: 'sec_bad001', tipo, ancho: 'completo', fondo: TRANSP, padding: 'md', columna: 0, props: {} };
    assert.equal(HijoSchema.safeParse(hijoProhibido).success, false, `${tipo} NO deberia validar como hijo`);
    assert.equal(SectionSchema.safeParse(contenedor([hijoProhibido], 1)).success, false, `contenedor con ${tipo} NO deberia validar`);
  }
});

test('RECHAZA tipo-hijo inexistente (tipo basura)', () => {
  const basura = { id: 'sec_bad002', tipo: 'no_existe', ancho: 'completo', fondo: TRANSP, padding: 'md', columna: 0, props: {} };
  assert.equal(HijoSchema.safeParse(basura).success, false);
});

// ---- 4) retrocompat: sin contenedor todo sigue validando (la union no se rompio) ----
test('retrocompat: los 17 tipos previos siguen validando (texto top-level)', () => {
  const texto = { id: 'sec_old001', tipo: 'texto', ancho: 'contenido', fondo: TRANSP, padding: 'md',
    props: { contenido: 'viejo', alineacion: 'left', tamanio: 'md' } };
  assert.ok(SectionSchema.safeParse(texto).success);
});

test('retrocompat: PersonalizacionesSchema valida una pagina SIN contenedor (data vieja intacta)', () => {
  const base = { schema_version: 3, pages: { home: { version: 2, updated_at: '2026-06-14T00:00:00.000Z', sections: [
    { id: 'sec_old002', tipo: 'texto', ancho: 'contenido', fondo: TRANSP, padding: 'md', props: { contenido: 'x', alineacion: 'left', tamanio: 'md' } },
  ] } } };
  assert.ok(PersonalizacionesSchema.safeParse(base).success);
});

test('PersonalizacionesSchema valida una pagina CON contenedor', () => {
  const base = { schema_version: 3, pages: { home: { version: 2, updated_at: '2026-06-14T00:00:00.000Z', sections: [
    contenedor([hijoTexto('sec_h00001', 0), hijoCita('sec_h00002', 1)], 2),
  ] } } };
  const r = PersonalizacionesSchema.safeParse(base);
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

// ---- 5) tope 8 hijos / min 1 ----
test('tope hijos: 8 valida, 9 rechaza, 0 rechaza', () => {
  const ocho = Array.from({ length: 8 }, (_, i) => hijoTexto('sec_h0000' + i, i % 4));
  const nueve = Array.from({ length: 9 }, (_, i) => hijoTexto('sec_h000' + i, i % 4));
  assert.ok(SectionSchema.safeParse(contenedor(ocho, 4)).success);
  assert.equal(SectionSchema.safeParse(contenedor(nueve, 4)).success, false);
  assert.equal(SectionSchema.safeParse(contenedor([], 1)).success, false);
});

test('columnas fuera de rango (5) rechaza; columna de hijo fuera de rango (4) rechaza', () => {
  assert.equal(SectionSchema.safeParse(contenedor([hijoTexto('sec_h00001')], 5)).success, false);
  assert.equal(SectionSchema.safeParse(contenedor([hijoTexto('sec_h00001', 4)], 2)).success, false);
});

// ---- 6) buildNext preserva contenedor (write path multi-pagina) ----
const NOW = '2026-06-14T20:00:00.000Z';
const emptyPage = { version: 2, updated_at: '2026-06-01T10:00:00.000Z', sections: [] };

test('buildNext: guardar OTRA pagina NO pisa la pagina con contenedor', () => {
  const pageConCont = { version: 2, updated_at: '2026-06-01T10:00:00.000Z',
    sections: [contenedor([hijoTexto('sec_h00001', 0), hijoCita('sec_h00002', 1)], 2)] };
  const current = { schema_version: 3, pages: { home: pageConCont } };
  const next = buildNextPersonalizaciones(current, 'coleccion', 'publish', emptyPage, undefined, undefined, NOW);
  assert.equal(JSON.stringify(next.pages.home), JSON.stringify(pageConCont)); // contenedor + hijos intactos
  assert.ok(PersonalizacionesSchema.safeParse(next).success);
});

test('buildNext: publicar una pagina CON contenedor la escribe y borra su _draft', () => {
  const pageConCont = { version: 2, updated_at: NOW,
    sections: [contenedor([hijoTexto('sec_h00001', 0)], 1)] };
  const current = { schema_version: 3, pages: { home: emptyPage, home_draft: pageConCont } };
  const next = buildNextPersonalizaciones(current, 'home', 'publish', pageConCont, undefined, undefined, NOW);
  assert.equal(next.pages.home.sections[0].tipo, 'contenedor');
  assert.equal(next.pages.home.sections[0].props.bloques.length, 1);
  assert.equal(next.pages.home_draft, undefined);
  assert.ok(PersonalizacionesSchema.safeParse(next).success);
});
