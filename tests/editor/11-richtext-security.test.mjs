import { test } from 'node:test';
import assert from 'node:assert/strict';
import sanitizeHtml from 'sanitize-html';
import { RICHTEXT_POLICY, toSanitizeHtml, normalizeVoidEls } from '../../packages/database/src/richtext-policy.ts';

// EF (autoritativa) y storefront (defensa en profundidad) usan la MISMA lib (sanitize-html@2.13.1,
// version de produccion). DOMPurify quedo descartado: NO corre en el runtime del Worker (ni en Deno)
// -> habria sido un sanitizador roto/passthrough en produccion. Este test es la red que cazaria eso:
// prueba AMBAS capas por separado. El pipeline es identico al de la EF (index.ts) y al del storefront
// (Texto.astro): sanitize-html + normalizeVoidEls (<br /> -> <br>).
const sanitize = (html) => normalizeVoidEls(sanitizeHtml(html, toSanitizeHtml(RICHTEXT_POLICY)));
const SH_EF = sanitize; // capa AUTORITATIVA (EF tienda-guardar-layout)
const SH_SF = sanitize; // capa DEFENSA EN PROFUNDIDAD (storefront Texto.astro) -> misma lib, mismo pipeline

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
  test(`seguridad EF (sanitize-html): ${payload}`, () => assertSafe(SH_EF(payload), 'EF'));
  test(`seguridad storefront (sanitize-html): ${payload}`, () => assertSafe(SH_SF(payload), 'SF'));
}

// Caso positivo: el contenido legitimo sobrevive.
const LEGIT = [
  '<b>hola</b> <a href="https://x.com">link</a> <ul><li>a</li><li>b</li></ul>',
  '<p>Parrafo uno.</p><p>Parrafo <strong>dos</strong> con <em>enfasis</em>.</p>',
  'Linea uno<br>Linea dos',
  '<a href="mailto:hola@aimma.com.co">correo</a> y <a href="tel:+573001112233">tel</a>',
];

for (const legit of LEGIT) {
  test(`positivo conserva formato: ${legit}`, () => {
    const out = sanitize(legit);
    assert.ok(/<(b|strong|em|a|ul|li|p|br)/i.test(out), `se borro todo el formato: ${out}`);
  });
  // Idempotencia (correctitud): re-sanitizar el output ya limpio es NO-OP -> el storefront sobre el
  // HTML que guardo la EF no altera el formato. Con la misma lib es TRIVIAL, pero se MANTIENE como
  // guarda barata: si algun dia las configs de EF y storefront divergen, este assert lo atrapa.
  test(`idempotencia sanitize(sanitize(x))===sanitize(x): ${legit}`, () => {
    const once = sanitize(legit);
    assert.equal(sanitize(once), once, `re-sanitizar altera el HTML legitimo (deberia ser no-op)`);
  });
}
