import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAndSanitizeSection } from '../../packages/database/src/validate-section.ts';

// ============================================================
// FASE D · D3a: sanitize RECURSIVO del rich-text de los hijos `texto` de un contenedor.
// Capa 2 (EF al guardar) de la disciplina de 3 capas; misma policy que el texto top-level.
// ============================================================

const TRANSP = { tipo: 'transparente', valor: '' };
const XSS = '<script>alert(1)</script><b>bold</b><img src=x onerror=alert(2)><a href="javascript:alert(3)">x</a>';

const hijoTexto = (id, columna, contenido) => ({
  id, tipo: 'texto', ancho: 'contenido', fondo: TRANSP, padding: 'md', columna,
  props: { contenido, alineacion: 'left', tamanio: 'md' },
});
const hijoCita = (id, columna, texto) => ({
  id, tipo: 'cita', ancho: 'contenido', fondo: TRANSP, padding: 'md', columna,
  props: { texto, alineacion: 'center' },
});
const contenedor = (bloques) => ({
  id: 'sec_cont01', tipo: 'contenedor', ancho: 'contenido', fondo: TRANSP, padding: 'md',
  props: { columnas: 2, gap: 'normal', alineacion_vertical: 'start', bloques },
});

test('contenedor: el rich-text de un hijo texto se SANITIZA (script/img/onerror/javascript fuera)', () => {
  const out = validateAndSanitizeSection(contenedor([hijoTexto('sec_h00001', 0, XSS)]));
  const c = out.props.bloques[0].props.contenido;
  assert.ok(!/<script/i.test(c), 'no debe quedar <script>');
  assert.ok(!/onerror/i.test(c), 'no debe quedar onerror');
  assert.ok(!/javascript:/i.test(c), 'no debe quedar javascript:');
  assert.ok(!/<img/i.test(c), 'no debe quedar <img>');
  assert.ok(/<b>bold<\/b>/.test(c), 'debe conservar el tag permitido <b>');
});

test('contenedor: el hijo texto saneado == el texto top-level saneado (misma policy)', () => {
  const topTexto = { id: 'sec_t00001', tipo: 'texto', ancho: 'contenido', fondo: TRANSP, padding: 'md',
    props: { contenido: XSS, alineacion: 'left', tamanio: 'md' } };
  const top = validateAndSanitizeSection(topTexto).props.contenido;
  const child = validateAndSanitizeSection(contenedor([hijoTexto('sec_h00001', 0, XSS)])).props.bloques[0].props.contenido;
  assert.equal(child, top);
});

test('contenedor: hijo NO-texto (cita) no se toca; rich-text crudo en cita queda tal cual (se escapa al render)', () => {
  const raw = '<b>no es rich-text</b>';
  const out = validateAndSanitizeSection(contenedor([hijoCita('sec_h00001', 0, raw)]));
  assert.equal(out.props.bloques[0].props.texto, raw); // cita.texto es plano -> no se sanitiza aca
});

test('contenedor: sanitize idempotente (SH(SH(x)) == SH(x))', () => {
  const once = validateAndSanitizeSection(contenedor([hijoTexto('sec_h00001', 0, XSS)]));
  const twice = validateAndSanitizeSection(once);
  assert.equal(twice.props.bloques[0].props.contenido, once.props.bloques[0].props.contenido);
});

test('contenedor: hijo texto ya limpio no cambia', () => {
  const limpio = '<b>hola</b> y <a href="https://aimma.com.co">link</a>';
  const out = validateAndSanitizeSection(contenedor([hijoTexto('sec_h00001', 0, limpio)]));
  assert.equal(out.props.bloques[0].props.contenido, limpio);
});

test('regresion: el texto top-level sigue sanitizando (sin tocar)', () => {
  const top = { id: 'sec_t00002', tipo: 'texto', ancho: 'contenido', fondo: TRANSP, padding: 'md',
    props: { contenido: XSS, alineacion: 'left', tamanio: 'md' } };
  const c = validateAndSanitizeSection(top).props.contenido;
  assert.ok(!/<script/i.test(c) && /<b>bold<\/b>/.test(c));
});

test('multiples hijos: cada hijo texto se sanea; otros tipos intactos', () => {
  const out = validateAndSanitizeSection(contenedor([
    hijoTexto('sec_h00001', 0, XSS),
    hijoCita('sec_h00002', 1, 'frase'),
    hijoTexto('sec_h00003', 0, '<i>ok</i><script>x</script>'),
  ]));
  assert.ok(!/<script/i.test(out.props.bloques[0].props.contenido));
  assert.equal(out.props.bloques[1].props.texto, 'frase');
  assert.ok(!/<script/i.test(out.props.bloques[2].props.contenido) && /<i>ok<\/i>/.test(out.props.bloques[2].props.contenido));
});
