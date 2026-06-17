// AIMMA Fase F (Franja de imagenes) · F-1 · schema dormant + sanitize. Valida la forma (slides 1..3 ->
// imagenes 1..3, overlay opcional, link allowlist, colores acotados), defaults, retrocompat (aditivo) y
// el sanitize write-side del overlay.texto (texto PLANO -> strip de HTML). El render/UI llegan en F-2..F-4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SectionSchema } from '../../packages/database/src/editor-schema.ts';
import { validateAndSanitizeSection } from '../../packages/database/src/validate-section.ts';

const sec = (props) => ({ id: 'sec_f00001', tipo: 'franja', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, padding: 'md', props });
const img = (overlay) => overlay ? { url: 'https://cdn.x/a.jpg', overlay } : { url: 'https://cdn.x/a.jpg' };
const slide = (imgs) => ({ imagenes: imgs });

test('valido: 1 slide / 1 imagen', () => {
  assert.ok(SectionSchema.safeParse(sec({ slides: [slide([img()])] })).success);
});

test('valido: 3 slides x 3 imagenes (tope 9) + gap/autorotar/intervalo', () => {
  const s = slide([img(), img(), img()]);
  assert.ok(SectionSchema.safeParse(sec({ slides: [s, s, s], gap: 'none', autorotar: true, intervalo_seg: 5 })).success);
});

test('valido: overlay completo + link https / mailto / tel', () => {
  for (const link of ['https://x.com', 'mailto:a@b.com', 'tel:+57300123456']) {
    const r = SectionSchema.safeParse(sec({ slides: [slide([{ url: 'https://cdn.x/a.jpg', alt: 'foto', link,
      overlay: { texto: 'Hola', posicion: 'abajo-centro', color_texto: '#ffffff', color_fondo: 'rgba(0,0,0,0.5)', borde: 'fino' } }])] }));
    assert.ok(r.success, 'deberia aceptar link ' + link);
  }
});

test('rechaza: >3 slides / >3 imagenes / vacios', () => {
  const s = slide([img()]);
  assert.ok(!SectionSchema.safeParse(sec({ slides: [s, s, s, s] })).success, '4 slides');
  assert.ok(!SectionSchema.safeParse(sec({ slides: [slide([img(), img(), img(), img()])] })).success, '4 imagenes');
  assert.ok(!SectionSchema.safeParse(sec({ slides: [] })).success, '0 slides');
  assert.ok(!SectionSchema.safeParse(sec({ slides: [slide([])] })).success, '0 imagenes');
});

test('rechaza (anti-XSS/SSRF): imagen no-https / link malicioso / color inyeccion CSS', () => {
  assert.ok(!SectionSchema.safeParse(sec({ slides: [slide([{ url: 'http://cdn.x/a.jpg' }])] })).success, 'imagen http');
  for (const link of ['javascript:alert(1)', '//evil.com', 'data:text/html,x', 'ftp://x']) {
    assert.ok(!SectionSchema.safeParse(sec({ slides: [slide([{ url: 'https://cdn.x/a.jpg', link }])] })).success, 'link ' + link);
  }
  assert.ok(!SectionSchema.safeParse(sec({ slides: [slide([{ url: 'https://cdn.x/a.jpg',
    overlay: { texto: 'x', color_texto: 'red; background:url(http://x)', color_fondo: '#000' } }])] })).success, 'color inyeccion');
});

test('defaults: gap=min, autorotar=false, overlay colores/posicion', () => {
  const r = SectionSchema.safeParse(sec({ slides: [slide([img({ texto: 'x' })])] }));
  assert.equal(r.success, true);
  assert.equal(r.data.props.gap, 'min');
  assert.equal(r.data.props.autorotar, false);
  const ov = r.data.props.slides[0].imagenes[0].overlay;
  assert.equal(ov.color_texto, '#ffffff');
  assert.equal(ov.color_fondo, 'rgba(0,0,0,0.4)');
  assert.equal(ov.posicion, 'centro');
  assert.equal(ov.borde, 'ninguno');
});

test('overlay: las 9 posiciones de la grilla 3x3 validan', () => {
  for (const posicion of [
    'arriba-izquierda', 'arriba-centro', 'arriba-derecha',
    'medio-izquierda', 'centro', 'medio-derecha',
    'abajo-izquierda', 'abajo-centro', 'abajo-derecha',
  ]) {
    assert.ok(SectionSchema.safeParse(sec({ slides: [slide([img({ texto: 'x', posicion })])] })).success, posicion);
  }
  assert.ok(!SectionSchema.safeParse(sec({ slides: [slide([img({ texto: 'x', posicion: 'centro-centro' })])] })).success, 'posicion invalida');
});

test('retrocompat: una seccion existente (sin franja) valida igual (aditivo)', () => {
  assert.ok(SectionSchema.safeParse({ id: 'sec_t00001', tipo: 'texto', ancho: 'completo',
    fondo: { tipo: 'transparente', valor: '' }, padding: 'md', props: { contenido: '<p>hola</p>' } }).success);
});

test('sanitize: overlay.texto strip de TODO HTML (rotulo plano)', () => {
  const out = validateAndSanitizeSection(sec({ slides: [slide([{ url: 'https://cdn.x/a.jpg',
    overlay: { texto: '<img src=x onerror=alert(1)>Hola <b>mundo</b>', color_texto: '#ffffff', color_fondo: '#000000' } }])] }));
  const t = out.props.slides[0].imagenes[0].overlay.texto;
  assert.ok(!/[<>]/.test(t), 'sin tags HTML: ' + t);
  assert.ok(t.includes('Hola'), 'conserva el texto plano');
});
