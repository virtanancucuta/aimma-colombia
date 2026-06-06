// tests/editor/15-shared-sanitize.test.mjs
// AIMMA Fase C · validateAndSanitizeSection · prueba byte-inalterado del save.
// Verifica que validateAndSanitizeSection produce EXACTAMENTE el mismo output de sanitize que
// la EF producia antes del refactor: normalizeVoidEls(sanitizeHtml(h, toSanitizeHtml(RICHTEXT_POLICY))).
// UN byte de diff = fallo. Este test es el gate de correccion de la Task 1 de Fase C.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sanitizeHtml from 'sanitize-html';
import { RICHTEXT_POLICY, toSanitizeHtml, normalizeVoidEls } from '../../packages/database/src/richtext-policy.ts';
import { validateAndSanitizeSection } from '../../packages/database/src/validate-section.ts';

// Expresion canonica: EXACTAMENTE la que la EF producia antes del refactor.
const canonicalSanitize = (h) => normalizeVoidEls(sanitizeHtml(h, toSanitizeHtml(RICHTEXT_POLICY)));

// Mismos payloads e inputs que test 11 (fuente de verdad de seguridad).
const PAYLOADS = [
  '<script>alert(1)</script>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<img src=x onerror=alert(1)>',
  '<iframe src="https://evil"></iframe>',
  '<b onclick="alert(1)">x</b>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<style>*{x}</style>',
  '<svg><script>alert(1)</script></svg>',
  '<svg onload=alert(1)>',
];

const LEGIT = [
  '<b>hola</b> <a href="https://x.com">link</a> <ul><li>a</li><li>b</li></ul>',
  '<p>Parrafo uno.</p><p>Parrafo <strong>dos</strong> con <em>enfasis</em>.</p>',
  'Linea uno<br>Linea dos',
  '<a href="mailto:hola@aimma.com.co">correo</a> y <a href="tel:+573001112233">tel</a>',
];

// Seccion texto minima valida (Zod aplica defaults de ancho/padding/alineacion/tamanio).
function textoSection(contenido) {
  return {
    id: 'sec_aaaa',
    tipo: 'texto',
    fondo: { tipo: 'transparente', valor: '' },
    props: { contenido },
  };
}

// Un output es seguro si no retiene tag/scheme/handler peligroso (lista de test 11).
function assertSafe(out, label) {
  const low = out.toLowerCase();
  for (const bad of ['<script', '<iframe', '<svg', '<style', '<object', '<embed', '<form', '<input',
    'javascript:', 'data:text/html', 'onerror', 'onload', 'onclick']) {
    assert.ok(!low.includes(bad), `${label}: el output retiene "${bad}" -> ${out}`);
  }
}

// 1. BYTE-INALTERADO: para cada input, validateAndSanitizeSection produce EXACTAMENTE
//    lo mismo que la expresion canonica que la EF usaba. UN byte de diff = fallo.
for (const input of [...PAYLOADS, ...LEGIT]) {
  test(`byte-inalterado: ${input}`, () => {
    const result = validateAndSanitizeSection(textoSection(input));
    const expected = canonicalSanitize(input);
    assert.equal(
      result.props.contenido,
      expected,
      `validateAndSanitizeSection produjo un output DISTINTO al canonico para: ${input}`
    );
  });
}

// 2. INYECCION: los payloads pasan la red de seguridad (misma lista que test 11).
for (const payload of PAYLOADS) {
  test(`inyeccion-segura: ${payload}`, () => {
    const result = validateAndSanitizeSection(textoSection(payload));
    assertSafe(result.props.contenido, 'validateAndSanitizeSection');
  });
}

// 3. IDEMPOTENCIA: sanitizar dos veces == sanitizar una vez.
test('idempotencia: validateAndSanitizeSection aplicada dos veces == una vez', () => {
  const input = textoSection(LEGIT[0]);
  const once = validateAndSanitizeSection(input);
  const twice = validateAndSanitizeSection(once);
  assert.deepEqual(twice, once, 're-sanitizar altera el output (deberia ser no-op)');
});

// 4. RECHAZA INVALIDA: Zod debe lanzar si la seccion texto no tiene props.contenido.
test('rechaza invalida: Zod lanza para seccion texto sin props', () => {
  assert.throws(
    () => validateAndSanitizeSection({ tipo: 'texto' }),
    { message: /invalid/i },
    'Zod deberia lanzar ZodError para seccion texto invalida'
  );
});

// 5. NO-TEXTO INTACTO: secciones espacio e imagen pasan sin tocar su contenido.
test('no-texto: seccion espacio pasa sin mutacion', () => {
  const espacio = {
    id: 'sec_bbbb',
    tipo: 'espacio',
    fondo: { tipo: 'transparente', valor: '' },
    props: { altura: 'md' },
  };
  const result = validateAndSanitizeSection(espacio);
  assert.equal(result.tipo, 'espacio');
  assert.equal(result.props.altura, 'md');
});

test('no-texto: seccion imagen pasa sin mutacion de src', () => {
  const imagen = {
    id: 'sec_cccc',
    tipo: 'imagen',
    fondo: { tipo: 'transparente', valor: '' },
    props: {
      src: 'https://example.com/foto.jpg',
      alt: 'foto de prueba',
    },
  };
  const result = validateAndSanitizeSection(imagen);
  assert.equal(result.tipo, 'imagen');
  assert.equal(result.props.src, 'https://example.com/foto.jpg');
  assert.equal(result.props.alt, 'foto de prueba');
});
