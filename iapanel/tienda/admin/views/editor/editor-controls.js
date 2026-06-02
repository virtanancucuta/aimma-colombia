/* AIMMA Tienda IA · Editor PRO-MAX Plan 3 · editor-controls.js v1
 * Helpers reusables para inspector forms.
 * Cada helper devuelve un HTMLElement listo para insertar.
 * Debounce 200ms interno para no spammear state updates.
 */

(function(window) {
  'use strict';

  const DEBOUNCE_MS = 200;
  const URL_REGEX = /^(https:\/\/|mailto:|tel:|wa\.me\/|#|\/).+/i;
  const COLOR_HEX_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

  function debounce(fn, ms) {
    let t;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function el(tag, props, children) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') e.className = v;
        else if (k === 'style') e.setAttribute('style', v);
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) e.setAttribute(k, '');
        else if (v === false || v == null) { /* skip */ }
        else e.setAttribute(k, String(v));
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }

  function fieldWrapper(label, control, errorEl) {
    return el('div', { class: 'ed-ctrl' }, [
      el('label', { class: 'ed-ctrl__label' }, label),
      control,
      errorEl,
    ]);
  }

  function textInput(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const input = el('input', {
      type: opts.type || 'text',
      class: 'ed-ctrl__input',
      value: value || '',
      maxlength: opts.maxLength,
      placeholder: opts.placeholder || '',
    });
    const fire = debounce(v => {
      onChange(v);
      errorEl.hidden = true;
    }, DEBOUNCE_MS);
    input.addEventListener('input', e => fire(e.target.value));
    return fieldWrapper(label, input, errorEl);
  }

  function textarea(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const ta = el('textarea', {
      class: 'ed-ctrl__textarea',
      rows: opts.rows || 4,
      maxlength: opts.maxLength,
      placeholder: opts.placeholder || '',
    });
    ta.value = value || '';
    const fire = debounce(v => { onChange(v); }, DEBOUNCE_MS);
    ta.addEventListener('input', e => fire(e.target.value));
    return fieldWrapper(label, ta, errorEl);
  }

  function urlInput(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const input = el('input', {
      type: 'text',
      class: 'ed-ctrl__input',
      value: value || '',
      placeholder: opts.placeholder || 'https://...',
    });
    const fire = debounce(v => {
      if (v && !URL_REGEX.test(v)) {
        errorEl.textContent = 'URL no válida (https / mailto / tel / wa.me / # / / )';
        errorEl.hidden = false;
      } else {
        errorEl.hidden = true;
      }
      onChange(v);
    }, DEBOUNCE_MS);
    input.addEventListener('input', e => fire(e.target.value));
    return fieldWrapper(label, input, errorEl);
  }

  function selectCtrl(label, value, options, onChange) {
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const sel = el('select', { class: 'ed-ctrl__select' });
    options.forEach(opt => {
      const o = el('option', { value: String(opt.v) }, opt.l);
      if (String(opt.v) === String(value)) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', e => {
      const v = e.target.value;
      const opt = options.find(o => String(o.v) === v);
      onChange(opt && typeof opt.v === 'number' ? Number(v) : v);
    });
    return fieldWrapper(label, sel, errorEl);
  }

  function colorPicker(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const wrap = el('div', { class: 'ed-ctrl__color-wrap' });
    const pick = el('input', {
      type: 'color',
      class: 'ed-ctrl__color',
      value: (value && COLOR_HEX_REGEX.test(value)) ? value.slice(0, 7) : '#000000',
    });
    const hex = el('input', {
      type: 'text',
      class: 'ed-ctrl__input ed-ctrl__color-hex',
      value: value || '',
      placeholder: '#RRGGBB',
      maxlength: 9,
    });
    const fire = debounce(v => {
      if (v && !COLOR_HEX_REGEX.test(v)) {
        errorEl.textContent = 'Color hex inválido (#RRGGBB)';
        errorEl.hidden = false;
      } else {
        errorEl.hidden = true;
        if (v) pick.value = v.slice(0, 7);
      }
      onChange(v);
    }, DEBOUNCE_MS);
    pick.addEventListener('input', e => {
      hex.value = e.target.value;
      fire(e.target.value);
    });
    hex.addEventListener('input', e => fire(e.target.value));
    wrap.appendChild(pick);
    wrap.appendChild(hex);
    return fieldWrapper(label, wrap, errorEl);
  }

  function slider(label, value, min, max, step, onChange) {
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const wrap = el('div', { class: 'ed-ctrl__slider-wrap' });
    const range = el('input', {
      type: 'range',
      class: 'ed-ctrl__range',
      min, max, step,
      value: value,
    });
    const num = el('span', { class: 'ed-ctrl__slider-num' }, String(value));
    const fire = debounce(v => { onChange(Number(v)); }, DEBOUNCE_MS);
    range.addEventListener('input', e => {
      num.textContent = e.target.value;
      fire(e.target.value);
    });
    wrap.appendChild(range);
    wrap.appendChild(num);
    return fieldWrapper(label, wrap, errorEl);
  }

  function switchCtrl(label, value, onChange) {
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const wrap = el('label', { class: 'ed-ctrl__switch' });
    const input = el('input', { type: 'checkbox' });
    if (value) input.checked = true;
    const sliderEl = el('span', { class: 'ed-ctrl__switch-slider' });
    wrap.appendChild(input);
    wrap.appendChild(sliderEl);
    input.addEventListener('change', e => onChange(e.target.checked));
    return el('div', { class: 'ed-ctrl ed-ctrl--switch' }, [
      el('label', { class: 'ed-ctrl__label' }, label),
      wrap,
      errorEl,
    ]);
  }

  function headerLabel(text) {
    return el('h4', { class: 'ed-inspector__header' }, text);
  }

  function primaryButton(text, onClick) {
    return el('button', {
      type: 'button',
      class: 'ed-btn ed-btn--primary',
      onClick,
    }, text);
  }

  function dangerButton(text, onClick) {
    return el('button', {
      type: 'button',
      class: 'ed-btn ed-btn--danger',
      onClick,
    }, text);
  }

  function collapsibleSection(title, children) {
    const wrap = el('details', { class: 'ed-collapse' });
    const sum = el('summary', { class: 'ed-collapse__summary' }, title);
    const body = el('div', { class: 'ed-collapse__body' }, children);
    wrap.appendChild(sum);
    wrap.appendChild(body);
    return wrap;
  }

  function infoBox(text) {
    return el('div', { class: 'ed-inspector__info' }, text);
  }

  const SIZE_OPTIONS = [
    { v: 'xs', l: 'Extra pequeño' }, { v: 'sm', l: 'Pequeño' },
    { v: 'md', l: 'Mediano' }, { v: 'lg', l: 'Grande' },
    { v: 'xl', l: 'Extra grande' }, { v: '2xl', l: '2x grande' },
    { v: '3xl', l: '3x grande' },
  ];

  const WEIGHT_OPTIONS = [
    { v: 'normal', l: 'Normal' }, { v: 'medium', l: 'Media' },
    { v: 'semibold', l: 'Semi negrita' }, { v: 'bold', l: 'Negrita' },
  ];

  const ALIGN_OPTIONS = [
    { v: 'left', l: 'Izquierda' },
    { v: 'center', l: 'Centro' },
    { v: 'right', l: 'Derecha' },
  ];

  function commonStyleControls(el_, onUpdate) {
    return [
      selectCtrl('Tamaño', el_.estilo.tamaño || el_.estilo.tamano || 'md', SIZE_OPTIONS,
        v => onUpdate('tamaño', v)),
      selectCtrl('Peso', el_.estilo.peso || 'normal', WEIGHT_OPTIONS,
        v => onUpdate('peso', v)),
      selectCtrl('Alineación', el_.estilo.alineacion || 'left', ALIGN_OPTIONS,
        v => onUpdate('alineacion', v)),
      colorPicker('Color texto', el_.estilo.color_texto || '',
        v => onUpdate('color_texto', v || null)),
    ];
  }

  function commonGridControls(el_, onUpdate) {
    return [
      slider('Columna inicio', el_.grid.col_start || 1, 1, 24, 1,
        v => onUpdate({ col_start: v })),
      slider('Columna fin', el_.grid.col_end || 13, 2, 25, 1,
        v => onUpdate({ col_end: v })),
      slider('Fila inicio', el_.grid.row_start || 1, 1, 50, 1,
        v => onUpdate({ row_start: v })),
      slider('Fila fin', el_.grid.row_end || 4, 2, 51, 1,
        v => onUpdate({ row_end: v })),
    ];
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorControls = {
    textInput, textarea, urlInput,
    select: selectCtrl,
    colorPicker, slider,
    switch: switchCtrl,
    headerLabel, primaryButton, dangerButton, collapsibleSection, infoBox,
    commonStyleControls, commonGridControls,
    SIZE_OPTIONS, WEIGHT_OPTIONS, ALIGN_OPTIONS,
    el,
  };
})(window);
