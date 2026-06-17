/* AIMMA Tienda IA · Editor PRO-MAX · Fase D (2b) · editor-upload-video.js v1
 * Subida de MP4 a Cloudflare R2 por presigned PUT (el navegador sube DIRECTO a R2).
 * Flujo: validar (tipo+tamano, UX) -> presign (EF tienda-presign-video, owner JWT) -> XHR PUT
 * con barra de progreso real -> devuelve la URL publica (videos.aimma.com.co/...). La EF es la
 * autoridad (ownership + cap 15MB firmado + content-type). Marker: editor-2b-upload-video.
 */
(function (window) {
  'use strict';

  const PRESIGN_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-presign-video';
  const MAX_BYTES = 15 * 1024 * 1024; // espejo del cap de la EF (15 MB)

  // Validacion client-side (feedback inmediato). El server vuelve a validar (no se confia en esto).
  function validate(file) {
    if (!file) return { ok: false, error: 'No se eligio ningun archivo.' };
    if (file.type !== 'video/mp4') return { ok: false, error: 'Solo videos MP4 (.mp4).' };
    if (file.size === 0) return { ok: false, error: 'El archivo esta vacio.' };
    if (file.size > MAX_BYTES) return { ok: false, error: 'El video supera 15 MB. Comprimilo o recortalo y volve a intentar.' };
    return { ok: true };
  }

  // Pide a la EF un PUT firmado para SU tienda (owner JWT). Devuelve {put_url, public_url}.
  async function presign(tiendaId, sizeBytes, getAccessToken) {
    const token = getAccessToken ? await getAccessToken() : null;
    if (!token) throw new Error('No pudimos validar tu sesion. Recarga e intenta de nuevo.');
    const r = await fetch(PRESIGN_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tienda_id: tiendaId, content_type: 'video/mp4', size_bytes: sizeBytes }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.put_url) {
      const map = { not_owner: 'No tenes permiso sobre esta tienda.', tienda_not_found: 'Tienda no encontrada.' };
      throw new Error(map[data.error] || 'No se pudo preparar la subida. Intenta de nuevo.');
    }
    return data;
  }

  // PUT directo a R2 con progreso (XHR: fetch no expone upload.onprogress). content-type FIRMADO -> debe
  // ir exacto. Resuelve al 2xx; rechaza si R2 rechaza (firma/cap) o hay error de red.
  function putWithProgress(putUrl, file, onProgress, XHRImpl) {
    return new Promise(function (resolve, reject) {
      const xhr = new (XHRImpl || window.XMLHttpRequest)();
      xhr.open('PUT', putUrl);
      xhr.setRequestHeader('Content-Type', 'video/mp4');
      if (xhr.upload) {
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        };
      }
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error('La subida fue rechazada (codigo ' + xhr.status + ').'));
      };
      xhr.onerror = function () { reject(new Error('Error de conexion durante la subida.')); };
      xhr.send(file);
    });
  }

  // Orquesta: validar -> presign -> subir. onProgress(fraccion 0..1). Devuelve la URL publica.
  async function upload(file, opts) {
    opts = opts || {};
    const v = validate(file);
    if (!v.ok) throw new Error(v.error);
    if (!opts.tiendaId) throw new Error('Falta la tienda.');
    const signed = await presign(opts.tiendaId, file.size, opts.getAccessToken);
    await putWithProgress(signed.put_url, file, opts.onProgress, opts.XHRImpl);
    return signed.public_url;
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorUploadVideo = { validate, presign, putWithProgress, upload, MAX_BYTES };
})(window);
