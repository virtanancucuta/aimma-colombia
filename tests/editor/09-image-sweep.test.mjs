import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// Fase B-controles · barrido de imagenes (Clase A): extiende el image-picker a los campos
// de imagen anidados — banner.imagen_fondo.src (toggle-object) y galeria.imagenes[].src (list).
const URL_A = 'https://rsmxklkxqsaptchcjszd.supabase.co/storage/v1/object/public/tienda-productos/T/editor/a.jpg';
const pers = (s) => ({ pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [s] } } });
const banner = (src) => ({ id: 'sec_ban1', tipo: 'banner', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, padding: 'lg',
  props: { titulo: 'x', alineacion: 'left', imagen_fondo: { src, alt: '', objeto: 'cover' } } });
const galeria = (srcs) => ({ id: 'sec_gal1', tipo: 'galeria', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, padding: 'md',
  props: { layout: 'grid', gap: 'normal', imagenes: srcs.map((src) => ({ src, alt: '' })) } });

test('image-sweep: banner.imagen_fondo.src y galeria.imagenes[].src usan control "image"', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js']);
  const D = win.TiendaIA.editorSectionDefs.defs;
  assert.equal(D.banner.campos.find((c) => c.key === 'imagen_fondo').subfields.find((s) => s.key === 'src').control, 'image');
  assert.equal(D.galeria.campos.find((c) => c.key === 'imagenes').item.find((s) => s.key === 'src').control, 'image');
});

test('image-sweep: el inspector renderea image-picker en toggle-object (banner ON) y por item en list (galeria)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
  const T = win.TiendaIA;
  T.editorState.init(pers(banner('https://placehold.co/1600x900')), 'tienda-test');
  let c = win.document.createElement('div');
  T.editorInspector.render(c, {}); T.editorState.select('sec_ban1'); T.editorInspector.rebuild();
  assert.ok(c.querySelector('.ed-imgpicker'), 'banner con imagen_fondo ON -> image-picker');

  T.editorState.init(pers(galeria(['https://placehold.co/1', 'https://placehold.co/2', 'https://placehold.co/3'])), 'tienda-test');
  c = win.document.createElement('div');
  T.editorInspector.render(c, {}); T.editorState.select('sec_gal1'); T.editorInspector.rebuild();
  assert.equal(c.querySelectorAll('.ed-imgpicker').length, 3, 'galeria -> un image-picker por imagen');
});

test('image-sweep: round-trip de los src anidados (banner + galeria)', () => {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js']);
  const ES = win.TiendaIA.editorState;
  ES.init(pers(banner('https://placehold.co/old')), 'tienda-test');
  ES.updateSectionProps('sec_ban1', { imagen_fondo: { src: URL_A, alt: '', objeto: 'cover' } });
  let saved = ES.serialize(); ES.init(saved, 'tienda-test');
  assert.equal(ES.findSection('sec_ban1').props.imagen_fondo.src, URL_A, 'banner imagen_fondo.src debe sobrevivir');

  ES.init(pers(galeria(['a', 'b', 'c'])), 'tienda-test');
  const imgs = ES.findSection('sec_gal1').props.imagenes.slice();
  imgs[1] = { src: URL_A, alt: '' };
  ES.updateSectionProps('sec_gal1', { imagenes: imgs });
  saved = ES.serialize(); ES.init(saved, 'tienda-test');
  assert.equal(ES.findSection('sec_gal1').props.imagenes[1].src, URL_A, 'galeria imagenes[1].src debe sobrevivir');
});
