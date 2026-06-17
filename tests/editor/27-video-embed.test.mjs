// AIMMA Fase D · 2a · Video por URL — adversarial del builder server-side + backward-compat.
// La EF es la autoridad: buildEmbedFromUrl parsea SOLO YouTube/Vimeo y construye el iframe canonico
// extrayendo el id seguro hacia un template hardcodeado (anti-XSS). Spotify/Maps/CodePen -> null
// (se usan via paste-iframe legacy). validateAndSanitizeSection construye `html` desde `url` al guardar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbedFromUrl, SectionSchema } from '../../packages/database/src/editor-schema.ts';
import { validateAndSanitizeSection } from '../../packages/database/src/validate-section.ts';

const sec = (props) => ({ id: 'sec_v0001', tipo: 'video', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, padding: 'md', props });
const child = (props) => ({ id: 'sec_h0001', tipo: 'video', ancho: 'contenido', fondo: { tipo: 'transparente', valor: '' }, padding: 'md', columna: 0, props });
const cont = (bloques) => ({ id: 'sec_c0001', tipo: 'contenedor', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, padding: 'md', props: { columnas: 1, gap: 'normal', alineacion_vertical: 'start', bloques } });

// ─────────────────────────────────────────────────────────────
// buildEmbedFromUrl · proveedores soportados -> iframe canonico
// ─────────────────────────────────────────────────────────────
const YT = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"';
const VI = '<iframe src="https://player.vimeo.com/video/123456789"';

test('YouTube: watch / youtu.be / embed / shorts / m. / nocookie -> embed canonico', () => {
  for (const u of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ',
  ]) {
    const out = buildEmbedFromUrl(u);
    assert.ok(out && out.startsWith(YT), `fallo: ${u} -> ${out}`);
  }
});

test('Vimeo: vimeo.com/ID y player.vimeo.com/video/ID -> embed canonico', () => {
  for (const u of ['https://vimeo.com/123456789', 'https://player.vimeo.com/video/123456789']) {
    const out = buildEmbedFromUrl(u);
    assert.ok(out && out.startsWith(VI), `fallo: ${u} -> ${out}`);
  }
});

test('el iframe construido es valido para el schema (pasa EMBED_WHITELIST_REGEX)', () => {
  const html = buildEmbedFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const r = SectionSchema.safeParse(sec({ html, aspect_ratio: '16/9' }));
  assert.ok(r.success, 'el iframe construido deberia validar como html legacy');
});

// ─────────────────────────────────────────────────────────────
// buildEmbedFromUrl · adversarial -> null (frontera de confianza)
// ─────────────────────────────────────────────────────────────
test('rechaza maliciosas / no-proveedor / spoof / fuera de scope -> null', () => {
  for (const u of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',   // spoof de host
    'https://fakeyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v="><script>alert(1)</script>', // id con chars prohibidos
    'https://www.youtube.com/watch?v=',                    // id vacio
    'https://vimeo.com/notanumber',                        // vimeo no-numerico
    'https://vimeo.com/',                                  // sin id
    'https://open.spotify.com/track/abc123',               // Spotify fuera del parser (va por iframe)
    'https://maps.google.com/maps?q=x',                    // Maps fuera del parser
    'no es una url',
    '',
  ]) {
    assert.equal(buildEmbedFromUrl(u), null, `deberia rechazar: ${u}`);
  }
});

// ─────────────────────────────────────────────────────────────
// VideoProps (via SectionSchema) · url / html legacy / backward-compat
// ─────────────────────────────────────────────────────────────
test('schema: {url valida} OK; {url no soportada} 400; {} 400', () => {
  assert.ok(SectionSchema.safeParse(sec({ url: 'https://youtu.be/dQw4w9WgXcQ', aspect_ratio: '16/9' })).success);
  assert.ok(!SectionSchema.safeParse(sec({ url: 'https://evil.com/x', aspect_ratio: '16/9' })).success);
  assert.ok(!SectionSchema.safeParse(sec({ aspect_ratio: '16/9' })).success); // ni url ni html
});

test('schema: backward-compat — html iframe legacy (Maps/Spotify) sigue validando', () => {
  const mapsIframe = '<iframe src="https://maps.google.com/maps?q=cucuta&output=embed" width="600" height="450"></iframe>';
  const spotify = '<iframe src="https://open.spotify.com/embed/track/abc" width="100%" height="152"></iframe>';
  assert.ok(SectionSchema.safeParse(sec({ html: mapsIframe, aspect_ratio: '16/9' })).success, 'Maps legacy deberia validar');
  assert.ok(SectionSchema.safeParse(sec({ html: spotify, aspect_ratio: '16/9' })).success, 'Spotify legacy deberia validar');
});

test('schema: html iframe NO-proveedor -> 400', () => {
  const evil = '<iframe src="https://evil.com/x"></iframe>';
  assert.ok(!SectionSchema.safeParse(sec({ html: evil, aspect_ratio: '16/9' })).success);
});

// ─────────────────────────────────────────────────────────────
// FASE D (2b) · VideoProps.mp4_url (MP4 subido a R2) · regex anti-SSRF
// ─────────────────────────────────────────────────────────────
const UU = '123e4567-e89b-12d3-a456-426614174000';
const MP4_OK = `https://videos.aimma.com.co/${UU}/${UU}.mp4`;

test('schema: {mp4_url valido del dominio R2} OK (top-level + hijo de contenedor)', () => {
  assert.ok(SectionSchema.safeParse(sec({ mp4_url: MP4_OK, aspect_ratio: '16/9' })).success, 'mp4_url valido top-level');
  assert.ok(SectionSchema.safeParse(cont([child({ mp4_url: MP4_OK, aspect_ratio: '16/9' })])).success, 'mp4_url valido en hijo');
});

test('schema: mp4_url solo (sin url ni html) es fuente valida', () => {
  const r = SectionSchema.safeParse(sec({ mp4_url: MP4_OK }));
  assert.ok(r.success, 'mp4_url solo deberia bastar como fuente');
});

test('schema: mp4_url adversarial (anti-SSRF) -> 400', () => {
  for (const bad of [
    `https://evil.com/${UU}/${UU}.mp4`,                          // host ajeno
    `https://videos.aimma.com.co.evil.com/${UU}/${UU}.mp4`,      // spoof de host
    `https://evil.videos.aimma.com.co/${UU}/${UU}.mp4`,          // subdominio prefijado
    `http://videos.aimma.com.co/${UU}/${UU}.mp4`,                // http (no https)
    `https://videos.aimma.com.co/${UU}/${UU}.exe`,               // no .mp4
    `https://videos.aimma.com.co/../../etc/passwd.mp4`,          // path traversal (no uuid)
    `https://videos.aimma.com.co/${UU}/${UU}.mp4?x=1`,           // query extra (no anclado)
    `https://videos.aimma.com.co/${UU}/${UU}.mp4/evil`,          // sufijo de ruta
    `https://videos.aimma.com.co/${UU}.mp4`,                     // falta el segmento tienda
    `javascript:alert(1)//videos.aimma.com.co/${UU}/${UU}.mp4`,  // esquema raro
  ]) {
    assert.ok(!SectionSchema.safeParse(sec({ mp4_url: bad, aspect_ratio: '16/9' })).success, `deberia rechazar: ${bad}`);
  }
});

// ─────────────────────────────────────────────────────────────
// validateAndSanitizeSection · la EF construye html desde url (autoridad)
// ─────────────────────────────────────────────────────────────
test('validate: video top-level con url -> html construido', () => {
  const out = validateAndSanitizeSection(sec({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', aspect_ratio: '16/9' }));
  assert.ok(out.props.html && out.props.html.startsWith(YT), 'deberia construir el iframe');
});

test('validate: video legacy (solo html) -> html intacto (backward-compat)', () => {
  const legacy = '<iframe src="https://maps.google.com/maps?q=x&output=embed"></iframe>';
  const out = validateAndSanitizeSection(sec({ html: legacy, aspect_ratio: '16/9' }));
  assert.equal(out.props.html, legacy, 'no debe tocar el iframe legacy');
});

test('validate: hijo video de un contenedor con url -> html construido', () => {
  const out = validateAndSanitizeSection(cont([child({ url: 'https://vimeo.com/123456789', aspect_ratio: '16/9' })]));
  assert.ok(out.props.bloques[0].props.html && out.props.bloques[0].props.html.startsWith(VI), 'el hijo video deberia construir su iframe');
});

// FASE D (2b): precedencia mp4_url -> con un MP4, NO se construye html desde url (el render muestra el <video>).
test('validate: con mp4_url + url, NO construye html (mp4 precede)', () => {
  const out = validateAndSanitizeSection(sec({ mp4_url: MP4_OK, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', aspect_ratio: '16/9' }));
  assert.equal(out.props.mp4_url, MP4_OK, 'mp4_url preservado');
  assert.ok(!out.props.html, 'no construye html desde url cuando hay mp4_url');
});

test('validate: hijo video con mp4_url -> tampoco construye html (precedencia)', () => {
  const out = validateAndSanitizeSection(cont([child({ mp4_url: MP4_OK, url: 'https://vimeo.com/123456789', aspect_ratio: '16/9' })]));
  const b = out.props.bloques[0];
  assert.equal(b.props.mp4_url, MP4_OK);
  assert.ok(!b.props.html, 'el hijo con mp4_url no construye html');
});
