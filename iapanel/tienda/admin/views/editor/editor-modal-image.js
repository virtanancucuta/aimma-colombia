/* AIMMA Tienda IA · Editor PRO-MAX · Fase B-controles · editor-modal-image.js v1
 * Modal del image-picker: navegar imagenes ya subidas (<tienda_id>/editor/) + subir
 * una nueva. Devuelve la URL publica via onPick(url). Bucket tienda-productos (publico).
 * Seguridad: (1) tipo+tamano validados client-side (UX) + bucket enforce server-side
 * (file_size_limit 5MB + allowed_mime_types image/*); (2) RLS de Storage solo permite
 * escribir bajo <tienda_id>/ del tenant autenticado (policy tienda_productos_insert_dueno).
 * supabase es factory: window.TiendaIA.supabase(). Marker: editor-b-modal-image.
 */
(function (window) {
  'use strict';

  const BUCKET = 'tienda-productos';
  const MAX_BYTES = 5 * 1024 * 1024; // espejo del file_size_limit del bucket
  const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  let modalEl = null;

  function sb() {
    return window.TiendaIA && window.TiendaIA.supabase && window.TiendaIA.supabase();
  }

  function open(opts, onPick) {
    opts = opts || {};
    const tiendaId = opts.tiendaId;
    const client = sb();
    if (!client || !tiendaId) {
      if (window.TiendaIA && window.TiendaIA.toast) window.TiendaIA.toast('No se pudo abrir el selector de imagen', 'error');
      return;
    }
    if (modalEl) close();
    const E = window.TiendaIA.editorControls.el;
    const prefix = tiendaId + '/editor';

    const grid = E('div', { class: 'ed-img-grid' });
    const status = E('p', { class: 'ed-img-status' }, 'Cargando tus imagenes...');

    const fileInput = E('input', { type: 'file', accept: ALLOWED.join(','), class: 'ed-img-file' });
    const uploadBtn = E('button', {
      type: 'button', class: 'ed-btn ed-btn--primary',
      onClick: () => fileInput.click(),
    }, 'Subir imagen nueva');

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (ALLOWED.indexOf(file.type) === -1) { status.textContent = 'Solo imagenes JPG, PNG o WEBP.'; return; }
      if (file.size > MAX_BYTES) { status.textContent = 'La imagen supera el limite de 5 MB.'; return; }
      status.textContent = 'Subiendo...';
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = prefix + '/' + Date.now() + '.' + (ext || 'jpg');
      try {
        const { error } = await client.storage.from(BUCKET).upload(path, file, {
          upsert: false, cacheControl: '3600', contentType: file.type,
        });
        if (error) { status.textContent = 'Error al subir: ' + (error.message || 'intenta de nuevo'); return; }
        const url = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        onPick(url);
        close();
      } catch (err) {
        status.textContent = 'Error de conexion al subir.';
      }
    });

    const modal = E('div', { class: 'ed-modal' }, [
      E('div', { class: 'ed-modal__header' }, [
        E('h3', { class: 'ed-modal__title' }, 'Elegir imagen'),
        E('button', { type: 'button', class: 'ed-modal__close', 'aria-label': 'Cerrar', onClick: close }, '×'),
      ]),
      E('div', { class: 'ed-modal__body' }, [
        E('div', { class: 'ed-img-upload' }, [
          uploadBtn, fileInput,
          E('span', { class: 'ed-img-hint' }, 'JPG, PNG o WEBP, hasta 5 MB.'),
        ]),
        status,
        grid,
      ]),
    ]);

    modalEl = E('div', {
      class: 'ed-modal-backdrop', role: 'dialog', 'aria-modal': 'true',
      onClick: (e) => { if (e.target === modalEl) close(); },
    }, [modal]);
    document.body.appendChild(modalEl);
    document.addEventListener('keydown', onEsc);

    // Browse: listar <tienda_id>/editor/
    client.storage.from(BUCKET).list(prefix, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
      .then(({ data, error }) => {
        if (error) { status.textContent = 'No se pudieron cargar tus imagenes.'; return; }
        const files = (data || []).filter((o) => o.name && o.name.indexOf('.') > -1);
        if (!files.length) { status.textContent = 'Aun no subiste imagenes. Subi una nueva arriba.'; return; }
        status.remove();
        files.forEach((o) => {
          const url = client.storage.from(BUCKET).getPublicUrl(prefix + '/' + o.name).data.publicUrl;
          grid.appendChild(E('button', {
            type: 'button', class: 'ed-img-thumb', title: o.name,
            onClick: () => { onPick(url); close(); },
          }, [E('img', { src: url, alt: '', loading: 'lazy' })]));
        });
      })
      .catch(() => { status.textContent = 'No se pudieron cargar tus imagenes.'; });
  }

  function close() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) { if (e.key === 'Escape') close(); }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorModalImage = { open, close };
})(window);
