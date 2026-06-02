/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-first-use.js v2 (SCHEMA v3)
 * Modal de primer uso (Plantilla starter / Desde cero).
 * createStarterPage() devuelve SECCIONES v3 (banner + productos + botones).
 * Marker: editor-plan4-v3-firstuse.
 */
(function(window) {
  'use strict';

  function nano() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function showFirstUseModal(onPick) {
    const E = window.TiendaIA.editorControls.el;
    const backdrop = E('div', { class: 'ed-modal-backdrop', role: 'dialog', 'aria-modal': 'true' });
    const modal = E('div', { class: 'ed-modal' });

    const close = () => { backdrop.remove(); };

    const header = E('div', { class: 'ed-modal__header' }, [
      E('h3', { class: 'ed-modal__title' }, 'Disena tu pagina de inicio'),
    ]);

    const body = E('div', { class: 'ed-modal__body' }, [
      E('p', { style: 'margin: 0 0 1.5rem 0; color: #4b5563' }, 'Como queres arrancar?'),
      E('div', { class: 'ed-first-use__cards' }, [
        E('button', {
          type: 'button',
          class: 'ed-first-use__card ed-first-use__card--recommended',
          onClick: () => { close(); onPick('starter'); },
        }, [
          E('span', { class: 'ed-first-use__badge' }, 'Recomendado'),
          E('h4', { class: 'ed-first-use__card-title' }, 'Plantilla starter'),
          E('p', { class: 'ed-first-use__card-desc' },
            '3 secciones listas para editar: banner, productos y contacto. ' +
            'Reemplaza los textos de ejemplo y publica.'),
        ]),
        E('button', {
          type: 'button',
          class: 'ed-first-use__card',
          onClick: () => { close(); onPick('cero'); },
        }, [
          E('h4', { class: 'ed-first-use__card-title' }, 'Desde cero'),
          E('p', { class: 'ed-first-use__card-desc' },
            'Pagina vacia. Vos agregas las secciones que quieras desde el catalogo.'),
        ]),
      ]),
    ]);

    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  // ============================================================
  // Starter SECCIONES v3
  // ============================================================
  function createStarterPage() {
    return [
      {
        id: 'sec_' + nano(),
        tipo: 'banner',
        ancho: 'completo',
        fondo: { tipo: 'transparente', valor: '' },
        padding: 'lg',
        props: {
          titulo: 'Bienvenido a tu tienda',
          subtitulo: 'Describi tu negocio en una frase corta.',
          boton: { texto: 'Ver productos', url: '#productos', estilo_visual: 'primary', target: '_self', icono: 'arrow' },
          alineacion: 'left',
        },
      },
      {
        id: 'sec_' + nano(),
        tipo: 'productos',
        ancho: 'completo',
        fondo: { tipo: 'transparente', valor: '' },
        padding: 'md',
        props: {
          categoria_id: null,
          limite: 8,
          orden: 'recientes',
          columnas: 'auto',
          mostrar_precio: true,
        },
      },
      {
        id: 'sec_' + nano(),
        tipo: 'botones',
        ancho: 'contenido',
        fondo: { tipo: 'transparente', valor: '' },
        padding: 'md',
        props: {
          items: [
            {
              texto: 'Escribinos por WhatsApp',
              url: 'https://wa.me/57XXXXXXXXXX',
              estilo_visual: 'primary',
              target: '_blank',
              icono: 'whatsapp',
            },
          ],
        },
      },
    ];
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorFirstUse = {
    showFirstUseModal, createStarterPage,
  };
})(window);
