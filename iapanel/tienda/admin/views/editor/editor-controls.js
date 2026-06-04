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

  // image-picker (Fase B-controles): preview + boton que abre editorModalImage
  // (browse Storage + upload). El VALOR es una URL https (mismo shape que urlInput
  // -> Clase A: sin cambio de Zod/storefront). NO llama supabase en el render (solo
  // el modal, en el click) para que el inspector renderee sin cliente (tests jsdom).
  function imagePicker(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const preview = el('div', { class: 'ed-imgpicker__preview' });
    const renderPreview = (url) => {
      preview.innerHTML = '';
      preview.appendChild(url
        ? el('img', { class: 'ed-imgpicker__thumb', src: url, alt: '' })
        : el('span', { class: 'ed-imgpicker__empty' }, 'Sin imagen'));
    };
    renderPreview(value);
    const btn = el('button', {
      type: 'button',
      class: 'ed-btn ed-btn--secondary ed-imgpicker__btn',
      onClick: () => {
        const modal = window.TiendaIA && window.TiendaIA.editorModalImage;
        if (!modal) return;
        modal.open({ tiendaId: opts.tiendaId }, (url) => {
          renderPreview(url);
          btn.textContent = 'Cambiar imagen';
          onChange(url);
        });
      },
    }, value ? 'Cambiar imagen' : 'Elegir o subir imagen');
    return fieldWrapper(label, el('div', { class: 'ed-imgpicker' }, [preview, btn]), errorEl);
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

  const ALIGN_OPTIONS = [
    { v: 'left', l: 'Izquierda' },
    { v: 'center', l: 'Centro' },
    { v: 'right', l: 'Derecha' },
  ];

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorControls = {
    textInput, textarea, urlInput,
    select: selectCtrl,
    colorPicker, imagePicker, slider,
    switch: switchCtrl,
    headerLabel, primaryButton, dangerButton, collapsibleSection, infoBox,
    ALIGN_OPTIONS,
    el,
  };
})(window);
