// AIMMA Fase F · F-4 · ops de editor-state de la franja (slides -> imagenes -> overlay). Verifica el
// data layer del control 'franja-slides': createSectionDefault, add/remove/reorder de slides e imagenes
// (con los topes 1..3), updateImagen (url/alt/link), updateOverlay (crea+mergea), updateFranjaProps,
// y que cada mutacion deja lastOp=replace (carril de patch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

function boot() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  win.TiendaIA.editorState.init(null, 'tienda-test');
  return win.TiendaIA.editorState;
}
function newFranja(ES) {
  const id = ES.addSection('franja');
  return { id, f: () => ES.findFranja(id) };
}

test('createSectionDefault franja: 1 slide / 1 imagen placeholder + defaults', () => {
  const ES = boot();
  const { f } = newFranja(ES);
  const p = f().props;
  assert.equal(p.slides.length, 1);
  assert.equal(p.slides[0].imagenes.length, 1);
  assert.match(p.slides[0].imagenes[0].url, /^https:\/\//);
  assert.equal(p.gap, 'min');
  assert.equal(p.autorotar, false);
  assert.equal(p.intervalo_seg, 5);
});

test('slides: add (<=3) / remove (>=1) / reorder', () => {
  const ES = boot();
  const { id, f } = newFranja(ES);
  ES.addSlide(id); ES.addSlide(id);
  assert.equal(f().props.slides.length, 3);
  ES.addSlide(id);                                  // tope 3
  assert.equal(f().props.slides.length, 3);
  ES.addImagen(id, 1);                              // marca el slide 1 con 2 imgs -> [1,2,1]
  ES.reorderSlide(id, 0, 1);                        // swap slide 0 y 1
  assert.deepEqual(f().props.slides.map(s => s.imagenes.length), [2, 1, 1]);
  ES.removeSlide(id, 0);
  assert.equal(f().props.slides.length, 2);
  ES.removeSlide(id, 0); ES.removeSlide(id, 0);     // min 1
  assert.equal(f().props.slides.length, 1);
});

test('imagenes por slide: add (<=3) / remove (>=1) / reorder', () => {
  const ES = boot();
  const { id, f } = newFranja(ES);
  ES.addImagen(id, 0); ES.addImagen(id, 0);
  assert.equal(f().props.slides[0].imagenes.length, 3);
  ES.addImagen(id, 0);                              // tope 3
  assert.equal(f().props.slides[0].imagenes.length, 3);
  ES.updateImagenFranja(id, 0, 0, { url: 'https://a/1.jpg' });
  ES.reorderImagen(id, 0, 0, 1);                    // swap img 0 y 1
  assert.equal(f().props.slides[0].imagenes[1].url, 'https://a/1.jpg');
  ES.removeImagen(id, 0, 0);
  assert.equal(f().props.slides[0].imagenes.length, 2);
});

test('updateImagenFranja: url/alt/link; undefined borra alt/link', () => {
  const ES = boot();
  const { id, f } = newFranja(ES);
  ES.updateImagenFranja(id, 0, 0, { url: 'https://x/y.jpg', alt: 'foto', link: 'https://x.com' });
  let img = f().props.slides[0].imagenes[0];
  assert.equal(img.url, 'https://x/y.jpg');
  assert.equal(img.alt, 'foto');
  assert.equal(img.link, 'https://x.com');
  ES.updateImagenFranja(id, 0, 0, { alt: undefined, link: undefined });
  img = f().props.slides[0].imagenes[0];
  assert.equal('alt' in img, false);
  assert.equal('link' in img, false);
});

test('updateOverlayFranja: crea y mergea el overlay', () => {
  const ES = boot();
  const { id, f } = newFranja(ES);
  ES.updateOverlayFranja(id, 0, 0, { texto: 'Hola' });
  assert.equal(f().props.slides[0].imagenes[0].overlay.texto, 'Hola');
  ES.updateOverlayFranja(id, 0, 0, { posicion: 'abajo-derecha', color_texto: '#ffffff' });
  const ov = f().props.slides[0].imagenes[0].overlay;
  assert.equal(ov.texto, 'Hola');                   // mergeado, no pisado
  assert.equal(ov.posicion, 'abajo-derecha');
  assert.equal(ov.color_texto, '#ffffff');
});

test('updateFranjaProps + lastOp=replace (carril de patch)', () => {
  const ES = boot();
  const { id, f } = newFranja(ES);
  ES.updateFranjaProps(id, { gap: 'small', autorotar: true, intervalo_seg: 8 });
  assert.equal(f().props.gap, 'small');
  assert.equal(f().props.autorotar, true);
  assert.equal(f().props.intervalo_seg, 8);
  assert.deepEqual(ES.lastOp, { kind: 'replace', sectionId: id });
});
