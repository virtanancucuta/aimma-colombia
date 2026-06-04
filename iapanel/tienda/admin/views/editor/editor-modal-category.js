/* AIMMA Tienda IA · Editor PRO-MAX · Fase B-controles · editor-modal-category.js v1
 * Modal del category-picker: lista las categorias de la tienda + opcion "Todas".
 * Devuelve onPick(categoria_id | null, nombre | null). Mismo patron que editor-modal-image:
 * supabase (factory) se invoca en el open (click), no en el render del control.
 * Marker: editor-b-modal-category.
 */
(function (window) {
  'use strict';

  let modalEl = null;

  function sb() {
    return window.TiendaIA && window.TiendaIA.supabase && window.TiendaIA.supabase();
  }

  function open(opts, onPick) {
    opts = opts || {};
    const tiendaId = opts.tiendaId;
    const client = sb();
    if (!client || !tiendaId) {
      if (window.TiendaIA && window.TiendaIA.toast) window.TiendaIA.toast('No se pudo abrir el selector de categorias', 'error');
      return;
    }
    if (modalEl) close();
    const E = window.TiendaIA.editorControls.el;

    const grid = E('div', { class: 'ed-cat-grid' });
    const status = E('p', { class: 'ed-img-status' }, 'Cargando categorias...');

    // Opcion "Todas las categorias" (valor null) — siempre presente.
    grid.appendChild(E('button', {
      type: 'button',
      class: 'ed-cat-card' + (opts.current ? '' : ' ed-cat-card--active'),
      onClick: () => { onPick(null, null); close(); },
    }, [E('span', { class: 'ed-cat-card__name' }, 'Todas las categorias')]));

    const modal = E('div', { class: 'ed-modal' }, [
      E('div', { class: 'ed-modal__header' }, [
        E('h3', { class: 'ed-modal__title' }, 'Elegir categoria'),
        E('button', { type: 'button', class: 'ed-modal__close', 'aria-label': 'Cerrar', onClick: close }, '×'),
      ]),
      E('div', { class: 'ed-modal__body' }, [status, grid]),
    ]);

    modalEl = E('div', {
      class: 'ed-modal-backdrop', role: 'dialog', 'aria-modal': 'true',
      onClick: (e) => { if (e.target === modalEl) close(); },
    }, [modal]);
    document.body.appendChild(modalEl);
    document.addEventListener('keydown', onEsc);

    client.from('categorias').select('id, nombre, foto_url').eq('tienda_id', tiendaId).order('orden', { ascending: true })
      .then(({ data, error }) => {
        if (error) { status.textContent = 'No se pudieron cargar las categorias.'; return; }
        if (!data || !data.length) { status.textContent = 'Aun no tenes categorias. Se mostraran todos los productos.'; return; }
        status.remove();
        data.forEach((cat) => {
          grid.appendChild(E('button', {
            type: 'button',
            class: 'ed-cat-card' + (opts.current === cat.id ? ' ed-cat-card--active' : ''),
            title: cat.nombre,
            onClick: () => { onPick(cat.id, cat.nombre); close(); },
          }, [
            cat.foto_url ? E('img', { class: 'ed-cat-card__img', src: cat.foto_url, alt: '', loading: 'lazy' }) : null,
            E('span', { class: 'ed-cat-card__name' }, cat.nombre),
          ]));
        });
      })
      .catch(() => { status.textContent = 'No se pudieron cargar las categorias.'; });
  }

  function close() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) { if (e.key === 'Escape') close(); }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorModalCategory = { open, close };
})(window);
