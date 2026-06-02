/* AIMMA Editor PRO-MAX Plan 3 · editor-first-use.js v1
 * Modal first-use (Starter / Desde Cero) + tour overlay 3 pasos.
 */
(function(window) {
  'use strict';

  function showFirstUseModal(onPick) {
    const E = window.TiendaIA.editorControls.el;
    const backdrop = E('div', { class: 'ed-modal-backdrop', role: 'dialog' });
    const modal = E('div', { class: 'ed-modal' });

    const close = () => {
      backdrop.remove();
    };

    const header = E('div', { class: 'ed-modal__header' }, [
      E('h3', { class: 'ed-modal__title' }, 'Diseñá tu página de inicio'),
    ]);

    const body = E('div', { class: 'ed-modal__body' }, [
      E('p', { style: 'margin: 0 0 1.5rem 0; color: #4b5563' }, '¿Cómo querés arrancar?'),
      E('div', { class: 'ed-first-use__cards' }, [
        E('button', {
          type: 'button',
          class: 'ed-first-use__card ed-first-use__card--recommended',
          onClick: () => { close(); onPick('starter'); },
        }, [
          E('span', { class: 'ed-first-use__badge' }, 'Recomendado'),
          E('div', { style: 'font-size: 32px; margin-bottom: 0.5rem' }, '✨'),
          E('h4', { class: 'ed-first-use__card-title' }, 'Plantilla starter'),
          E('p', { class: 'ed-first-use__card-desc' },
            '3 secciones listas para editar: encabezado, productos y contacto. ' +
            'Reemplazá los textos placeholder y publicá.'),
        ]),
        E('button', {
          type: 'button',
          class: 'ed-first-use__card',
          onClick: () => { close(); onPick('cero'); },
        }, [
          E('div', { style: 'font-size: 32px; margin-bottom: 0.5rem' }, '⬜'),
          E('h4', { class: 'ed-first-use__card-title' }, 'Desde cero'),
          E('p', { class: 'ed-first-use__card-desc' },
            'Canvas vacío. Vos agregás las secciones que quieras desde un catálogo de 8 tipos.'),
        ]),
      ]),
    ]);

    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  // ============================================================
  // Starter JSON
  // ============================================================
  function createStarterPage() {
    const nano = () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)] +
                       'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)] +
                       'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)] +
                       'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)];

    return [
      {
        id: 'sec_' + nano(),
        tipo: 'hero',
        altura_filas: 10,
        fondo: { tipo: 'transparente', valor: '' },
        padding: 'lg',
        elementos: [
          {
            id: 'el_' + nano(),
            tipo: 'texto',
            grid: { col_start: 1, col_end: 17, row_start: 3, row_end: 6 },
            estilo: { alineacion: 'left', tamaño: '3xl', peso: 'bold' },
            props: { contenido: '[Tu título aquí]' },
          },
          {
            id: 'el_' + nano(),
            tipo: 'texto',
            grid: { col_start: 1, col_end: 17, row_start: 6, row_end: 8 },
            estilo: { alineacion: 'left', tamaño: 'lg', peso: 'normal' },
            props: { contenido: '[Describí tu negocio en una frase]' },
          },
          {
            id: 'el_' + nano(),
            tipo: 'boton',
            grid: { col_start: 1, col_end: 7, row_start: 8, row_end: 10 },
            estilo: { alineacion: 'left', tamaño: 'lg', peso: 'semibold' },
            props: { texto: 'Ver productos', url: '#productos', estilo_visual: 'primary', target: '_self' },
          },
        ],
      },
      {
        id: 'sec_' + nano(),
        tipo: 'productos',
        altura_filas: 10,
        fondo: { tipo: 'transparente', valor: '' },
        padding: 'md',
        elementos: [
          {
            id: 'el_' + nano(),
            tipo: 'productos',
            grid: { col_start: 1, col_end: 25, row_start: 1, row_end: 10 },
            estilo: { alineacion: 'center', tamaño: 'md', peso: 'normal' },
            props: {
              categoria_id: null, limite: 8, orden: 'recientes',
              columnas: 'auto', mostrar_precio: true,
            },
          },
        ],
      },
      {
        id: 'sec_' + nano(),
        tipo: 'botones',
        altura_filas: 3,
        fondo: { tipo: 'transparente', valor: '' },
        padding: 'md',
        elementos: [
          {
            id: 'el_' + nano(),
            tipo: 'boton',
            grid: { col_start: 9, col_end: 17, row_start: 1, row_end: 3 },
            estilo: { alineacion: 'center', tamaño: 'md', peso: 'semibold' },
            props: {
              texto: '[Contactanos por WhatsApp]',
              url: 'https://wa.me/57XXXXXXXXXX',
              estilo_visual: 'primary', target: '_blank', icono: 'whatsapp',
            },
          },
        ],
      },
    ];
  }

  // ============================================================
  // Tour overlay 3 pasos
  // ============================================================
  const TOUR_STEPS = [
    { selector: '#editor-canvas', body: 'Este es tu canvas. Las secciones se ordenan verticalmente y podés moverlas con el icono ⋮⋮ a la izquierda de cada una.', position: 'left' },
    { selector: '#editor-inspector', body: 'El panel de la derecha edita la sección o el elemento que tengas seleccionado. Hacé click en algo del canvas para empezar.', position: 'left' },
    { selector: '#ed-toolbar-save', body: 'Cuando estés conforme, guardá con este botón o con Ctrl+S. Tu tienda se actualiza en pocos segundos.', position: 'bottom' },
  ];

  function showTour(onDone) {
    let stepIdx = 0;
    const backdrop = document.createElement('div');
    backdrop.className = 'ed-tour-backdrop';
    document.body.appendChild(backdrop);

    const tooltip = document.createElement('div');
    tooltip.className = 'ed-tour-tooltip';
    document.body.appendChild(tooltip);

    function renderStep() {
      const step = TOUR_STEPS[stepIdx];
      const target = document.querySelector(step.selector);

      tooltip.innerHTML =
        '<div class="ed-tour-tooltip__step">Paso ' + (stepIdx + 1) + ' de ' + TOUR_STEPS.length + '</div>' +
        '<div class="ed-tour-tooltip__body">' + step.body + '</div>' +
        '<div class="ed-tour-tooltip__actions">' +
          '<button type="button" class="ed-btn ed-btn--danger" data-action="skip">Saltar</button>' +
          '<button type="button" class="ed-btn ed-btn--primary" data-action="next">' +
            (stepIdx < TOUR_STEPS.length - 1 ? 'Siguiente →' : 'Listo') +
          '</button>' +
        '</div>';

      // Posicionar tooltip relativo al target
      if (target) {
        const r = target.getBoundingClientRect();
        if (step.position === 'left') {
          tooltip.style.top = (r.top + r.height / 2 - 60) + 'px';
          tooltip.style.left = Math.max(20, r.left - 340) + 'px';
        } else if (step.position === 'bottom') {
          tooltip.style.top = (r.bottom + 12) + 'px';
          tooltip.style.left = Math.max(20, r.left + r.width / 2 - 160) + 'px';
        }
      } else {
        tooltip.style.top = '50%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translate(-50%, -50%)';
      }

      tooltip.querySelector('[data-action="skip"]').onclick = () => finish();
      tooltip.querySelector('[data-action="next"]').onclick = () => {
        stepIdx++;
        if (stepIdx >= TOUR_STEPS.length) finish();
        else renderStep();
      };
    }

    function finish() {
      backdrop.remove();
      tooltip.remove();
      onDone && onDone();
    }

    function onKey(e) {
      if (e.key === 'Escape') finish();
    }
    document.addEventListener('keydown', onKey);
    renderStep();
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorFirstUse = {
    showFirstUseModal, createStarterPage, showTour,
  };
})(window);
