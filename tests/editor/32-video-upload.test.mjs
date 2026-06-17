// AIMMA Fase D (2b) · UI del editor para subir MP4 a R2. (a) validate() client-side (tipo+tamano);
// (b) el control video-upload renderiza los 3 estados (vacio / con-valor) y "Quitar" limpia el valor.
// La subida real (presign + XHR PUT) se prueba en el E2E live; aca el wiring del control + la validacion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

function boot() {
  return bootWindow(['editor-controls.js', 'editor-upload-video.js']);
}

// ── (a) validate(): solo video/mp4 hasta 15 MB ──────────────────────────────
test('validate: acepta MP4 <=15MB; rechaza otro tipo / vacio / >15MB / null', () => {
  const U = boot().TiendaIA.editorUploadVideo;
  const stub = (size, type = 'video/mp4') => ({ type, size });
  assert.equal(U.validate(stub(100)).ok, true, 'mp4 chico OK');
  assert.equal(U.validate(stub(U.MAX_BYTES)).ok, true, 'exactamente 15MB OK');
  assert.equal(U.validate(stub(100, 'video/webm')).ok, false, 'webm rechazado');
  assert.equal(U.validate(stub(100, 'image/png')).ok, false, 'png rechazado');
  assert.equal(U.validate(stub(0)).ok, false, 'vacio rechazado');
  assert.equal(U.validate(stub(U.MAX_BYTES + 1)).ok, false, '>15MB rechazado');
  assert.equal(U.validate(null).ok, false, 'null rechazado');
});

// ── (b) control video-upload: estados + Quitar ──────────────────────────────
test('control: estado VACIO -> boton "Subir video MP4", Quitar oculto, status "Sin video"', () => {
  const win = boot();
  const wrap = win.TiendaIA.editorControls.videoUpload('Video', '', () => {}, { tiendaId: 't1' });
  win.document.body.appendChild(wrap);
  assert.match(wrap.querySelector('.ed-vidup__btn').textContent, /Subir video MP4/);
  assert.equal(wrap.querySelector('.ed-vidup__remove').hidden, true, 'Quitar oculto sin video');
  assert.match(wrap.querySelector('.ed-vidup__status').textContent, /Sin video/);
  assert.equal(wrap.querySelector('.ed-vidup__bar').hidden, true, 'barra oculta sin subir');
  assert.equal(wrap.querySelector('input[type="file"]').accept, 'video/mp4');
});

test('control: estado CON-VALOR -> "Reemplazar", Quitar visible, status "Video subido"', () => {
  const win = boot();
  const wrap = win.TiendaIA.editorControls.videoUpload('Video', 'https://videos.aimma.com.co/a/b.mp4', () => {}, {});
  assert.match(wrap.querySelector('.ed-vidup__btn').textContent, /Reemplazar/);
  assert.equal(wrap.querySelector('.ed-vidup__remove').hidden, false, 'Quitar visible con video');
  assert.match(wrap.querySelector('.ed-vidup__status').textContent, /Video subido/);
});

test('control: "Quitar" llama onChange(undefined) y vuelve al estado vacio', () => {
  const win = boot();
  let val = 'https://videos.aimma.com.co/a/b.mp4';
  const wrap = win.TiendaIA.editorControls.videoUpload('Video', val, (v) => { val = v; }, {});
  wrap.querySelector('.ed-vidup__remove').click();
  assert.equal(val, undefined, 'onChange recibio undefined');
  assert.match(wrap.querySelector('.ed-vidup__btn').textContent, /Subir video MP4/, 'volvio a estado vacio');
});
