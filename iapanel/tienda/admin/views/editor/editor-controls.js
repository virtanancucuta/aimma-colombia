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
    // 2a-polish: validacion inline opcional (opts.validate(v) -> mensaje | null). Es solo UX (hint
    // permisivo); el server sigue siendo la autoridad. Corre INMEDIATO en cada input; el commit
    // (onChange) sigue debounced. El valor SIEMPRE se commitea (no bloquea), solo muestra el aviso.
    const validate = typeof opts.validate === 'function' ? opts.validate : null;
    const showValidation = (v) => {
      if (!validate) return;
      const msg = validate(v);
      if (msg) { errorEl.textContent = msg; errorEl.hidden = false; }
      else { errorEl.hidden = true; }
    };
    const fire = debounce(v => {
      onChange(v);
      if (!validate) errorEl.hidden = true;
    }, DEBOUNCE_MS);
    input.addEventListener('input', e => { showValidation(e.target.value); fire(e.target.value); });
    showValidation(value || '');
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

  // category picker (Fase B-controles): elige una categoria (o "Todas") visualmente
  // en vez de tipear el uuid. El VALOR es categoria_id (uuid|null, mismo shape que el
  // control 'text' de hoy -> Clase A). Patron bendecido: el modal (y supabase) se abren
  // en el click, no en el render. El nombre real aparece tras elegir / al abrir el modal.
  function categoryPicker(label, value, onChange, opts) {
    opts = opts || {};
    // allowAll: ofrecer "Todas las categorias" (valor null). Default true (productos.categoria_id).
    // En categorias_destacadas se pasa false: un card DEBE apuntar a una categoria concreta.
    const allowAll = opts.allowAll !== false;
    const noneLabel = allowAll ? 'Todas las categorias' : 'Sin categoria';
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const current = el('span', { class: 'ed-catpicker__current' },
      value ? 'Categoria seleccionada' : noneLabel);
    const btn = el('button', {
      type: 'button',
      class: 'ed-btn ed-btn--secondary ed-catpicker__btn',
      onClick: () => {
        const modal = window.TiendaIA && window.TiendaIA.editorModalCategory;
        if (!modal) return;
        modal.open({ tiendaId: opts.tiendaId, current: value || null, allowAll }, (id, nombre) => {
          current.textContent = id ? (nombre || 'Categoria seleccionada') : noneLabel;
          onChange(id || null);
        });
      },
    }, 'Elegir categoria');
    return fieldWrapper(label, el('div', { class: 'ed-catpicker' }, [current, btn]), errorEl);
  }

  // product picker (Lote 3): elige UN producto activo de la tienda (sin "Todas"). VALOR = producto_id (uuid).
  // Mismo patron que categoryPicker: el modal (y supabase) se abren en el click, no en el render.
  function productPicker(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const current = el('span', { class: 'ed-prodpicker__current' },
      value ? 'Producto seleccionado' : 'Sin producto');
    const btn = el('button', {
      type: 'button',
      class: 'ed-btn ed-btn--secondary ed-prodpicker__btn',
      onClick: () => {
        const modal = window.TiendaIA && window.TiendaIA.editorModalProduct;
        if (!modal) return;
        modal.open({ tiendaId: opts.tiendaId, current: value || null }, (id, nombre) => {
          current.textContent = id ? (nombre || 'Producto seleccionado') : 'Sin producto';
          onChange(id || '');
        });
      },
    }, 'Elegir producto');
    return fieldWrapper(label, el('div', { class: 'ed-prodpicker' }, [current, btn]), errorEl);
  }

  // Iconos SVG de la toolbar rich-text (estilo Notion/Docs, currentColor, sin deps). Modulo-level
  // para no recrear strings por render.
  const RT_ICONS = {
    bold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h7a4 4 0 0 1 0 8H6z"/><path d="M6 12h8a4 4 0 0 1 0 8H6z"/></svg>',
    italic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    ul: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>',
    ol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4" stroke-width="1.8"/><path d="M4 10h2" stroke-width="1.8"/><path d="M4.2 16.2a1 1 0 1 1 1.6 1.2L4 20h2" stroke-width="1.6"/></svg>',
  };

  // richText (Fase B-controles #4): toolbar + contenteditable -> HTML.
  // Normaliza con DOMPurify (CDN, window.DOMPurify) + la policy del admin para que el WYSIWYG sea
  // honesto (lo que se ve == lo que la EF guardara). La EF es la capa AUTORITATIVA al guardar.
  // No llama nada async en el render; en jsdom (sin DOMPurify) normalize() cae al fallback.
  function richText(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });

    function normalize(html) {
      const P = window.TiendaIA && window.TiendaIA.richtextPolicy;
      const DP = window.DOMPurify;
      if (DP && P) return DP.sanitize(html || '', P.toDOMPurify());
      return html || ''; // fallback: la EF sanitiza autoritativamente igual
    }

    const editor = el('div', {
      class: 'ed-ctrl__richtext',
      contenteditable: 'true',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': label,
      'data-placeholder': 'Escribí aquí tu texto.',
    });
    editor.innerHTML = normalize(value);

    const fire = debounce(() => {
      const clean = normalize(editor.innerHTML);
      onChange(clean);
    }, DEBOUNCE_MS);

    function cmd(command) {
      document.execCommand(command, false, null);
      editor.focus();
      fire();
      syncActive();
    }
    function addLink() {
      const url = window.prompt('URL del enlace (https / mailto / tel):', 'https://');
      if (!url) return;
      if (!/^(https:|mailto:|tel:)/i.test(url)) {
        errorEl.textContent = 'URL no permitida (solo https / mailto / tel)';
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      document.execCommand('createLink', false, url);
      editor.focus();
      fire();
    }

    // preventDefault en mousedown: el contenteditable conserva foco+seleccion al ejecutar el comando
    // (sin esto el click roba el foco y la seleccion colapsa -> el comando corre sin seleccion).
    // Aplica a los 5 (incluido link). data-cmd = comando para el estado activo (queryCommandState).
    const mkBtn = (svg, title, onClick, cmdName) => {
      const b = el('button', {
        type: 'button', class: 'ed-rt__btn', title, 'aria-label': title,
        'data-cmd': cmdName || false,
        onMousedown: (e) => e.preventDefault(),
        onClick,
      });
      b.innerHTML = svg;
      return b;
    };
    const sep = () => el('span', { class: 'ed-rt__sep', 'aria-hidden': 'true' });

    const btnBold = mkBtn(RT_ICONS.bold, 'Negrita', () => cmd('bold'), 'bold');
    const btnItalic = mkBtn(RT_ICONS.italic, 'Itálica', () => cmd('italic'), 'italic');
    const btnLink = mkBtn(RT_ICONS.link, 'Insertar enlace', addLink);
    const btnUl = mkBtn(RT_ICONS.ul, 'Lista con viñetas', () => cmd('insertUnorderedList'), 'insertUnorderedList');
    const btnOl = mkBtn(RT_ICONS.ol, 'Lista numerada', () => cmd('insertOrderedList'), 'insertOrderedList');

    const toolbar = el('div', { class: 'ed-rt__toolbar' }, [
      btnBold, btnItalic, sep(), btnLink, sep(), btnUl, btnOl,
    ]);

    // Estado activo: refleja el formato de la seleccion. Listeners EN EL EDITOR (no document) para
    // no leakear al re-renderear el inspector. Link no tiene queryCommandState -> no se marca.
    const activeBtns = [btnBold, btnItalic, btnUl, btnOl];
    function syncActive() {
      const selObj = window.getSelection && window.getSelection();
      const inEditor = !!(selObj && selObj.anchorNode && editor.contains(selObj.anchorNode));
      activeBtns.forEach((b) => {
        let on = false;
        if (inEditor) { try { on = document.queryCommandState(b.getAttribute('data-cmd')); } catch (_) { on = false; } }
        b.classList.toggle('is-active', on);
      });
    }
    editor.addEventListener('keyup', syncActive);
    editor.addEventListener('mouseup', syncActive);
    editor.addEventListener('focus', syncActive);

    // Pegar como texto plano: evita traer markup sucio de Word/web (la EF igual sanitiza).
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    editor.addEventListener('input', fire);
    // Al perder foco, normalizar el DOM visible para que coincida con lo que se guardara + limpiar activo.
    editor.addEventListener('blur', () => {
      editor.innerHTML = normalize(editor.innerHTML);
      activeBtns.forEach((b) => b.classList.remove('is-active'));
    });

    return fieldWrapper(label, el('div', { class: 'ed-richtext' }, [toolbar, editor]), errorEl);
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
    colorPicker, imagePicker, categoryPicker, productPicker, richText, slider,
    switch: switchCtrl,
    headerLabel, primaryButton, dangerButton, collapsibleSection, infoBox,
    ALIGN_OPTIONS,
    el,
  };
})(window);
