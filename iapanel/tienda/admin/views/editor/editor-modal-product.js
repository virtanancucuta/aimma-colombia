/* AIMMA Tienda IA · Editor PRO-MAX · B-secciones Lote 3 · editor-modal-product.js v1
 * Modal del product-picker: lista los productos ACTIVOS de la tienda. Devuelve onPick(producto_id, nombre).
 * Espejo de editor-modal-category: supabase (factory) se invoca en el open (click), no en el render del control.
 * TENANT-SCOPED: .eq('tienda_id', tiendaId) -> nunca lista productos de otra tienda. SIN opcion "Todas"
 * (la referencia es un pick unico requerido). Marker: editor-b-modal-product.
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
      if (window.TiendaIA && window.TiendaIA.toast) window.TiendaIA.toast('No se pudo abrir el selector de productos', 'error');
      return;
    }
    if (modalEl) close();
    const E = window.TiendaIA.editorControls.el;

    const grid = E('div', { class: 'ed-cat-grid' });
    const status = E('p', { class: 'ed-img-status' }, 'Cargando productos...');

    const modal = E('div', { class: 'ed-modal' }, [
      E('div', { class: 'ed-modal__header' }, [
        E('h3', { class: 'ed-modal__title' }, 'Elegir producto'),
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

    client.from('productos').select('id, nombre, foto_principal_url, precio_venta, precio_promo, estado')
      .eq('tienda_id', tiendaId).eq('estado', 'activo').order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { status.textContent = 'No se pudieron cargar los productos.'; return; }
        if (!data || !data.length) { status.textContent = 'Aun no tenes productos activos.'; return; }
        status.remove();
        data.forEach((prod) => {
          grid.appendChild(E('button', {
            type: 'button',
            class: 'ed-cat-card' + (opts.current === prod.id ? ' ed-cat-card--active' : ''),
            title: prod.nombre,
            onClick: () => { onPick(prod.id, prod.nombre); close(); },
          }, [
            prod.foto_principal_url ? E('img', { class: 'ed-cat-card__img', src: prod.foto_principal_url, alt: '', loading: 'lazy' }) : null,
            E('span', { class: 'ed-cat-card__name' }, prod.nombre),
          ]));
        });
      })
      .catch(() => { status.textContent = 'No se pudieron cargar los productos.'; });
  }

  function close() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) { if (e.key === 'Escape') close(); }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorModalProduct = { open, close };
})(window);
