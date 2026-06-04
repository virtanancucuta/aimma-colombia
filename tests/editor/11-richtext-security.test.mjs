import { test } from 'node:test';
import assert from 'node:assert/strict';
import sanitizeHtml from 'sanitize-html';
import DOMPurify from 'isomorphic-dompurify';
import { RICHTEXT_POLICY, toSanitizeHtml, toDOMPurify, normalizeVoidEls } from '../../packages/database/src/richtext-policy.ts';

// EF (autoritativa) y storefront (defensa en profundidad) usan las MISMAS versiones que produccion
// (sanitize-html@2.13.1, isomorphic-dompurify@2.36.0/dompurify@3.4.7). Este test es la red que
// habria atrapado el passthrough de linkedom: prueba AMBAS capas por separado.
// SH replica EXACTAMENTE el pipeline de la EF: sanitize-html + normalizeVoidEls (<br /> -> <br>)
// para que el HTML almacenado sea punto fijo de la DOMPurify del storefront (idempotencia).
const SH = (html) => normalizeVoidEls(sanitizeHtml(html, toSanitizeHtml(RICHTEXT_POLICY)));
const DP = (html) => DOMPurify.sanitize(html, toDOMPurify(RICHTEXT_POLICY));

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

// Un output es seguro si no retiene tag/scheme/handler peligroso.
function assertSafe(out, label) {
  const low = out.toLowerCase();
  for (const bad of ['<script', '<iframe', '<svg', '<style', '<object', '<embed', '<form', '<input',
    'javascript:', 'data:text/html', 'onerror', 'onload', 'onclick']) {
    assert.ok(!low.includes(bad), `${label}: el output retiene "${bad}" -> ${out}`);
  }
}

for (const payload of PAYLOADS) {
  test(`seguridad EF (sanitize-html): ${payload}`, () => assertSafe(SH(payload), 'EF'));
  test(`seguridad storefront (DOMPurify): ${payload}`, () => assertSafe(DP(payload), 'SF'));
}

// Caso positivo: el contenido legitimo sobrevive en AMBAS capas.
const LEGIT = [
  '<b>hola</b> <a href="https://x.com">link</a> <ul><li>a</li><li>b</li></ul>',
  '<p>Parrafo uno.</p><p>Parrafo <strong>dos</strong> con <em>enfasis</em>.</p>',
  'Linea uno<br>Linea dos',
  '<a href="mailto:hola@aimma.com.co">correo</a> y <a href="tel:+573001112233">tel</a>',
];

for (const legit of LEGIT) {
  test(`positivo EF conserva formato: ${legit}`, () => {
    const out = SH(legit);
    assert.ok(/<(b|strong|em|a|ul|li|p|br)/i.test(out), `EF borro todo el formato: ${out}`);
  });
  // Idempotencia (correctitud): el storefront sobre el output de la EF es NO-OP en contenido legitimo
  // -> el formato que el usuario guardo (y vio guardado) no desaparece al renderear.
  test(`idempotencia DP(SH(x))===SH(x): ${legit}`, () => {
    const stored = SH(legit);
    assert.equal(DP(stored), stored, `el storefront altera el HTML almacenado legitimo`);
  });
  // Direccion complementaria (acuerdo admin/EF): SH sobre el output de DOMPurify tambien NO-OP.
  test(`idempotencia SH(DP(x))===DP(x): ${legit}`, () => {
    const norm = DP(legit);
    assert.equal(SH(norm), norm, `la EF altera el HTML que el admin/DOMPurify produjo`);
  });
}
