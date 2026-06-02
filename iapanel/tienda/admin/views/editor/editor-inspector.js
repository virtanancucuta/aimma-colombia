/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-inspector.js v2 (SCHEMA v3)
 * Panel derecho contextual: edita la SECCION seleccionada (no hay elementos en v3).
 * Formularios de props por tipo usando helpers de editor-controls.js.
 * Sub-editores de lista para arrays: botones.items, galeria.imagenes, formulario.campos.
 * Marker: editor-plan4-v3-inspector.
 */
(function(window) {
  'use strict';

  const state = { container: null, callbacks: {} };

  const SECTION_LABEL = {
    banner: 'Banner principal', texto: 'Texto', imagen: 'Imagen',
    botones: 'Botones', productos: 'Productos', galeria: 'Galeria',
    formulario: 'Formulario', espacio: 'Espacio en blanco', video: 'Video o mapa',
  };

  const ALIGN_OPTS = [
    { v: 'left', l: 'Izquierda' }, { v: 'center', l: 'Centro' }, { v: 'right', l: 'Derecha' },
  ];
  const TAMANIO_OPTS = [
    { v: 'sm', l: 'Pequeno' }, { v: 'md', l: 'Mediano' },
    { v: 'lg', l: 'Grande' }, { v: 'xl', l: 'Extra grande' },
  ];
  const PADDING_OPTS = [
    { v: 'sm', l: 'Pequeno' }, { v: 'md', l: 'Medio' },
    { v: 'lg', l: 'Grande' }, { v: 'xl', l: 'Extra grande' },
  ];
  const ANCHO_OPTS = [
    { v: 'completo', l: 'Ancho completo (borde a borde)' },
    { v: 'contenido', l: 'Centrado (con margenes)' },
  ];
  const ESTILO_VISUAL_OPTS = [
    { v: 'primary', l: 'Principal' }, { v: 'secondary', l: 'Secundario' },
    { v: 'ghost', l: 'Fantasma' }, { v: 'outline', l: 'Borde' },
  ];
  const TARGET_OPTS = [
    { v: '_self', l: 'Misma pestana' }, { v: '_blank', l: 'Nueva pestana' },
  ];
  const ICONO_OPTS = [
    { v: '', l: 'Sin icono' }, { v: 'arrow', l: 'Flecha' }, { v: 'whatsapp', l: 'WhatsApp' },
    { v: 'email', l: 'Email' }, { v: 'phone', l: 'Telefono' },
    { v: 'location', l: 'Ubicacion' }, { v: 'link', l: 'Link' },
  ];
  const CAMPO_TIPO_OPTS = [
    { v: 'text', l: 'Texto corto' }, { v: 'email', l: 'Email' }, { v: 'tel', l: 'Telefono' },
    { v: 'textarea', l: 'Texto largo' }, { v: 'select', l: 'Lista de opciones' },
    { v: 'checkbox', l: 'Casilla de verificacion' },
  ];

  function render(container, callbacks) {
    state.container = container;
    state.callbacks = callbacks || {};
    rebuild();
    bindStateListeners();
  }

  function rebuild() {
    const ES = window.TiendaIA.editorState;
    const sel = ES.selection;
    state.container.innerHTML = '';

    if (!sel) {
      state.container.appendChild(renderEmpty());
      return;
    }
    const sec = ES.findSection(sel.sectionId);
    if (!sec) {
      state.container.appendChild(renderEmpty());
      return;
    }
    state.container.appendChild(renderForSection(sec));
  }

  function renderEmpty() {
    const C = window.TiendaIA.editorControls;
    return C.infoBox(
      'Selecciona una seccion para editarla. ' +
      'Tip: haz click sobre cualquier seccion de la vista previa, o elige una en la lista de la izquierda.'
    );
  }

  // ============================================================
  // SECTION (props por tipo + base)
  // ============================================================
  function renderForSection(sec) {
    const C = window.TiendaIA.editorControls;
    const ES = window.TiendaIA.editorState;
    const wrap = C.el('div', { class: 'ed-inspector__body' });

    // Header con boton cerrar drawer (mobile).
    const header = C.el('div', { class: 'ed-inspector__head' }, [
      C.el('h4', { class: 'ed-inspector__header' }, 'Seccion: ' + (SECTION_LABEL[sec.tipo] || sec.tipo)),
      C.el('button', {
        type: 'button',
        class: 'ed-inspector__close',
        'aria-label': 'Cerrar panel',
        onClick: () => closeDrawer(),
      }, '×'),
    ]);
    wrap.appendChild(header);

    // ── Props especificas por tipo ──
    const tipoRenderer = {
      banner: renderBannerProps,
      texto: renderTextoProps,
      imagen: renderImagenProps,
      botones: renderBotonesProps,
      productos: renderProductosProps,
      galeria: renderGaleriaProps,
      formulario: renderFormularioProps,
      espacio: renderEspacioProps,
      video: renderVideoProps,
    };
    if (tipoRenderer[sec.tipo]) {
      tipoRenderer[sec.tipo](wrap, sec, C, ES);
    }

    // ── Apariencia (base: ancho, fondo, padding) colapsable ──
    wrap.appendChild(C.collapsibleSection('Apariencia de la seccion', buildBaseControls(sec, C, ES)));

    // ── Acciones ──
    wrap.appendChild(C.primaryButton('Duplicar seccion', () => ES.duplicateSection(sec.id)));
    wrap.appendChild(C.dangerButton('Eliminar seccion', () => {
      if (confirm('Eliminar esta seccion?')) ES.removeSection(sec.id);
    }));

    return wrap;
  }

  function buildBaseControls(sec, C, ES) {
    const ctrls = [];
    ctrls.push(C.select('Ancho', sec.ancho || 'completo', ANCHO_OPTS,
      v => ES.updateSectionBase(sec.id, 'ancho', v)));
    ctrls.push(C.select('Espacio interno (padding)', sec.padding || 'md', PADDING_OPTS,
      v => ES.updateSectionBase(sec.id, 'padding', v)));

    const fondo = sec.fondo || { tipo: 'transparente', valor: '' };
    ctrls.push(C.select('Tipo de fondo', fondo.tipo, [
      { v: 'transparente', l: 'Transparente' },
      { v: 'color', l: 'Color' },
      { v: 'imagen', l: 'Imagen' },
      { v: 'gradient', l: 'Degradado CSS' },
    ], v => {
      ES.updateSectionBase(sec.id, 'fondo', { tipo: v, valor: '' });
      rebuild();
    }));

    if (fondo.tipo === 'color') {
      ctrls.push(C.colorPicker('Color de fondo', fondo.valor || '#ffffff',
        v => ES.updateSectionBase(sec.id, 'fondo', { ...fondo, valor: v })));
    } else if (fondo.tipo === 'imagen') {
      ctrls.push(C.urlInput('URL imagen de fondo (https)', fondo.valor || '',
        v => ES.updateSectionBase(sec.id, 'fondo', { ...fondo, valor: v })));
    } else if (fondo.tipo === 'gradient') {
      ctrls.push(C.textarea('Degradado CSS', fondo.valor || 'linear-gradient(135deg, #1B4965, #5FA8D3)',
        v => ES.updateSectionBase(sec.id, 'fondo', { ...fondo, valor: v })));
    }
    return ctrls;
  }

  // ============================================================
  // Renderers de props por tipo
  // ============================================================
  function renderBannerProps(wrap, sec, C, ES) {
    const p = sec.props || {};
    wrap.appendChild(C.textInput('Titulo', p.titulo || '',
      v => ES.updateSectionProps(sec.id, { titulo: v }), { maxLength: 200 }));
    wrap.appendChild(C.textarea('Subtitulo (opcional)', p.subtitulo || '',
      v => ES.updateSectionProps(sec.id, { subtitulo: v || undefined }), { maxLength: 500, rows: 3 }));
    wrap.appendChild(C.select('Alineacion', p.alineacion || 'left', ALIGN_OPTS,
      v => ES.updateSectionProps(sec.id, { alineacion: v })));

    // Imagen de fondo del banner (opcional).
    const tieneImg = !!p.imagen_fondo;
    wrap.appendChild(C.switch('Usar imagen de fondo', tieneImg, on => {
      if (on) {
        ES.updateSectionProps(sec.id, { imagen_fondo: { src: 'https://placehold.co/1600x900', alt: '', objeto: 'cover' } });
      } else {
        ES.updateSectionProps(sec.id, { imagen_fondo: undefined });
      }
      rebuild();
    }));
    if (tieneImg) {
      const img = p.imagen_fondo;
      wrap.appendChild(C.urlInput('URL imagen (https)', img.src || '',
        v => ES.updateSectionProps(sec.id, { imagen_fondo: { ...img, src: v } })));
      wrap.appendChild(C.textInput('Texto alternativo (alt)', img.alt || '',
        v => ES.updateSectionProps(sec.id, { imagen_fondo: { ...img, alt: v } }), { maxLength: 200 }));
    }

    // Boton del banner (opcional).
    const tieneBoton = !!p.boton;
    wrap.appendChild(C.switch('Mostrar boton', tieneBoton, on => {
      if (on) {
        ES.updateSectionProps(sec.id, { boton: { texto: 'Ver productos', url: '#productos', estilo_visual: 'primary', target: '_self', icono: 'arrow' } });
      } else {
        ES.updateSectionProps(sec.id, { boton: undefined });
      }
      rebuild();
    }));
    if (tieneBoton) {
      const b = p.boton;
      const updateBoton = (patch) => ES.updateSectionProps(sec.id, { boton: { ...b, ...patch } });
      wrap.appendChild(C.textInput('Texto del boton', b.texto || '',
        v => updateBoton({ texto: v }), { maxLength: 80 }));
      wrap.appendChild(C.urlInput('URL (https / mailto / tel / # / /)', b.url || '',
        v => updateBoton({ url: v })));
      wrap.appendChild(C.select('Estilo del boton', b.estilo_visual || 'primary', ESTILO_VISUAL_OPTS,
        v => updateBoton({ estilo_visual: v })));
      wrap.appendChild(C.select('Icono', b.icono || '', ICONO_OPTS,
        v => updateBoton({ icono: v || undefined })));
      wrap.appendChild(C.select('Abrir en', b.target || '_self', TARGET_OPTS,
        v => updateBoton({ target: v })));
    }
  }

  function renderTextoProps(wrap, sec, C, ES) {
    const p = sec.props || {};
    wrap.appendChild(C.textarea('Contenido', p.contenido || '',
      v => ES.updateSectionProps(sec.id, { contenido: v }), { maxLength: 5000, rows: 5 }));
    wrap.appendChild(C.select('Alineacion', p.alineacion || 'left', ALIGN_OPTS,
      v => ES.updateSectionProps(sec.id, { alineacion: v })));
    wrap.appendChild(C.select('Tamano del texto', p.tamanio || 'md', TAMANIO_OPTS,
      v => ES.updateSectionProps(sec.id, { tamanio: v })));
  }

  function renderImagenProps(wrap, sec, C, ES) {
    const p = sec.props || {};
    wrap.appendChild(C.urlInput('URL imagen (https)', p.src || '',
      v => ES.updateSectionProps(sec.id, { src: v }), { placeholder: 'https://...' }));
    wrap.appendChild(C.textInput('Texto alternativo (alt)', p.alt || '',
      v => ES.updateSectionProps(sec.id, { alt: v }), { maxLength: 200 }));
    wrap.appendChild(C.select('Ajuste', p.objeto || 'cover', [
      { v: 'cover', l: 'Cubrir (recorta si hace falta)' },
      { v: 'contain', l: 'Contener (sin recorte)' },
    ], v => ES.updateSectionProps(sec.id, { objeto: v })));
    wrap.appendChild(C.select('Proporcion', p.aspect_ratio || '', [
      { v: '', l: 'Automatica' },
      { v: '16/9', l: '16:9' }, { v: '4/3', l: '4:3' }, { v: '1/1', l: '1:1 (cuadrada)' },
      { v: '3/4', l: '3:4 (vertical)' }, { v: '4/5', l: '4:5 (vertical)' },
    ], v => ES.updateSectionProps(sec.id, { aspect_ratio: v || undefined })));
    wrap.appendChild(C.urlInput('Link al hacer click (opcional)', p.link_url || '',
      v => ES.updateSectionProps(sec.id, { link_url: v || undefined })));
  }

  function renderProductosProps(wrap, sec, C, ES) {
    const p = sec.props || {};
    wrap.appendChild(C.textInput('ID de categoria (vacio = todas)', p.categoria_id || '',
      v => ES.updateSectionProps(sec.id, { categoria_id: v || null })));
    wrap.appendChild(C.slider('Cantidad de productos', p.limite || 8, 1, 12, 1,
      v => ES.updateSectionProps(sec.id, { limite: v })));
    wrap.appendChild(C.select('Ordenar por', p.orden || 'recientes', [
      { v: 'recientes', l: 'Mas recientes' },
      { v: 'precio_asc', l: 'Precio: menor a mayor' },
      { v: 'precio_desc', l: 'Precio: mayor a menor' },
      { v: 'manual', l: 'Manual' },
    ], v => ES.updateSectionProps(sec.id, { orden: v })));
    wrap.appendChild(C.select('Columnas', p.columnas == null ? 'auto' : p.columnas, [
      { v: 'auto', l: 'Automatico' }, { v: 2, l: '2 columnas' },
      { v: 3, l: '3 columnas' }, { v: 4, l: '4 columnas' },
    ], v => ES.updateSectionProps(sec.id, { columnas: v })));
    wrap.appendChild(C.switch('Mostrar precio', p.mostrar_precio !== false,
      v => ES.updateSectionProps(sec.id, { mostrar_precio: v })));
  }

  function renderEspacioProps(wrap, sec, C, ES) {
    const p = sec.props || {};
    wrap.appendChild(C.select('Altura del espacio', p.altura || 'md', TAMANIO_OPTS,
      v => ES.updateSectionProps(sec.id, { altura: v })));
  }

  function renderVideoProps(wrap, sec, C, ES) {
    const p = sec.props || {};
    wrap.appendChild(C.textarea('Codigo del video (iframe)', p.html || '',
      v => ES.updateSectionProps(sec.id, { html: v }),
      { maxLength: 2000, rows: 6, placeholder: '<iframe src="https://www.youtube.com/embed/..."></iframe>' }));
    wrap.appendChild(C.infoBox('Solo se permiten videos o mapas de: YouTube, Vimeo, CodePen, CodeSandbox, Google Maps o Spotify.'));
    wrap.appendChild(C.select('Proporcion', p.aspect_ratio || '16/9', [
      { v: '16/9', l: '16:9 (video)' }, { v: '4/3', l: '4:3' }, { v: '1/1', l: '1:1 (cuadrado)' },
    ], v => ES.updateSectionProps(sec.id, { aspect_ratio: v })));
  }

  // ── Botones: sub-editor de lista (items 1..6) ──
  function renderBotonesProps(wrap, sec, C, ES) {
    const items = Array.isArray(sec.props?.items) ? sec.props.items : [];

    const replaceItems = (next) => ES.updateSectionProps(sec.id, { items: next });

    items.forEach((it, idx) => {
      const card = listItemCard(C, 'Boton ' + (idx + 1), {
        idx, total: items.length,
        onUp: () => { replaceItems(moveItem(items, idx, idx - 1)); rebuild(); },
        onDown: () => { replaceItems(moveItem(items, idx, idx + 1)); rebuild(); },
        onRemove: items.length > 1 ? () => { replaceItems(items.filter((_, i) => i !== idx)); rebuild(); } : null,
      });
      const update = (patch) => {
        const next = items.map((x, i) => i === idx ? { ...x, ...patch } : x);
        replaceItems(next);
      };
      card.body.appendChild(C.textInput('Texto', it.texto || '',
        v => update({ texto: v }), { maxLength: 80 }));
      card.body.appendChild(C.urlInput('URL', it.url || '',
        v => update({ url: v })));
      card.body.appendChild(C.select('Estilo', it.estilo_visual || 'primary', ESTILO_VISUAL_OPTS,
        v => update({ estilo_visual: v })));
      card.body.appendChild(C.select('Icono', it.icono || '', ICONO_OPTS,
        v => update({ icono: v || undefined })));
      card.body.appendChild(C.select('Abrir en', it.target || '_self', TARGET_OPTS,
        v => update({ target: v })));
      wrap.appendChild(card.root);
    });

    if (items.length < 6) {
      wrap.appendChild(C.primaryButton('+ Agregar boton', () => {
        replaceItems(items.concat([{ texto: 'Nuevo boton', url: '#', estilo_visual: 'secondary', target: '_self' }]));
        rebuild();
      }));
    } else {
      wrap.appendChild(C.infoBox('Maximo 6 botones por seccion.'));
    }
  }

  // ── Galeria: sub-editor de imagenes (3..12) ──
  function renderGaleriaProps(wrap, sec, C, ES) {
    const p = sec.props || {};
    const imgs = Array.isArray(p.imagenes) ? p.imagenes : [];

    wrap.appendChild(C.select('Disposicion', p.layout || 'grid', [
      { v: 'grid', l: 'Grilla uniforme' },
      { v: 'carrusel', l: 'Carrusel horizontal' },
      { v: 'mosaico', l: 'Mosaico' },
    ], v => ES.updateSectionProps(sec.id, { layout: v })));
    wrap.appendChild(C.select('Espaciado', p.gap || 'normal', [
      { v: 'tight', l: 'Compacto' }, { v: 'normal', l: 'Normal' }, { v: 'loose', l: 'Aireado' },
    ], v => ES.updateSectionProps(sec.id, { gap: v })));

    const replaceImgs = (next) => ES.updateSectionProps(sec.id, { imagenes: next });

    imgs.forEach((im, idx) => {
      const card = listItemCard(C, 'Imagen ' + (idx + 1), {
        idx, total: imgs.length,
        onUp: () => { replaceImgs(moveItem(imgs, idx, idx - 1)); rebuild(); },
        onDown: () => { replaceImgs(moveItem(imgs, idx, idx + 1)); rebuild(); },
        onRemove: imgs.length > 3 ? () => { replaceImgs(imgs.filter((_, i) => i !== idx)); rebuild(); } : null,
      });
      const update = (patch) => {
        const next = imgs.map((x, i) => i === idx ? { ...x, ...patch } : x);
        replaceImgs(next);
      };
      card.body.appendChild(C.urlInput('URL imagen (https)', im.src || '',
        v => update({ src: v })));
      card.body.appendChild(C.textInput('Texto alternativo (alt)', im.alt || '',
        v => update({ alt: v }), { maxLength: 200 }));
      wrap.appendChild(card.root);
    });

    if (imgs.length < 12) {
      wrap.appendChild(C.primaryButton('+ Agregar imagen', () => {
        replaceImgs(imgs.concat([{ src: 'https://placehold.co/800x800/eee/666?text=' + (imgs.length + 1), alt: '' }]));
        rebuild();
      }));
    } else {
      wrap.appendChild(C.infoBox('Maximo 12 imagenes en la galeria.'));
    }
    if (imgs.length < 3) {
      wrap.appendChild(C.infoBox('La galeria necesita al menos 3 imagenes para verse bien.'));
    }
  }

  // ── Formulario: titulo + boton + sub-editor de campos (1..8) ──
  function renderFormularioProps(wrap, sec, C, ES) {
    const p = sec.props || {};
    const campos = Array.isArray(p.campos) ? p.campos : [];

    wrap.appendChild(C.textInput('Titulo (opcional)', p.titulo || '',
      v => ES.updateSectionProps(sec.id, { titulo: v || undefined }), { maxLength: 200 }));
    wrap.appendChild(C.textInput('Texto del boton', p.boton_texto || 'Enviar',
      v => ES.updateSectionProps(sec.id, { boton_texto: v }), { maxLength: 80 }));

    const replaceCampos = (next) => ES.updateSectionProps(sec.id, { campos: next });

    campos.forEach((cp, idx) => {
      const card = listItemCard(C, 'Campo ' + (idx + 1), {
        idx, total: campos.length,
        onUp: () => { replaceCampos(moveItem(campos, idx, idx - 1)); rebuild(); },
        onDown: () => { replaceCampos(moveItem(campos, idx, idx + 1)); rebuild(); },
        onRemove: campos.length > 1 ? () => { replaceCampos(campos.filter((_, i) => i !== idx)); rebuild(); } : null,
      });
      const update = (patch) => {
        const next = campos.map((x, i) => i === idx ? { ...x, ...patch } : x);
        replaceCampos(next);
      };
      card.body.appendChild(C.textInput('Etiqueta', cp.label || '',
        v => update({ label: v }), { maxLength: 120 }));
      card.body.appendChild(C.select('Tipo de campo', cp.tipo_campo || 'text', CAMPO_TIPO_OPTS,
        v => { update({ tipo_campo: v }); rebuild(); }));
      card.body.appendChild(C.textInput('Placeholder (opcional)', cp.placeholder || '',
        v => update({ placeholder: v || undefined }), { maxLength: 200 }));
      if (cp.tipo_campo === 'select') {
        const opciones = Array.isArray(cp.opciones) ? cp.opciones : [];
        card.body.appendChild(C.textarea('Opciones (una por linea)', opciones.join('\n'),
          v => update({ opciones: v.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20) }),
          { rows: 3, placeholder: 'Opcion 1\nOpcion 2' }));
      }
      card.body.appendChild(C.switch('Requerido', !!cp.requerido,
        v => update({ requerido: v })));
      wrap.appendChild(card.root);
    });

    if (campos.length < 8) {
      wrap.appendChild(C.primaryButton('+ Agregar campo', () => {
        replaceCampos(campos.concat([{ tipo_campo: 'text', label: 'Nuevo campo', requerido: false }]));
        rebuild();
      }));
    } else {
      wrap.appendChild(C.infoBox('Maximo 8 campos en el formulario.'));
    }
  }

  // ============================================================
  // Helpers de sub-editor de lista
  // ============================================================
  function moveItem(arr, from, to) {
    if (to < 0 || to >= arr.length) return arr.slice();
    const next = arr.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    return next;
  }

  // Devuelve { root, body } — root es la tarjeta con cabecera (titulo + mover/quitar).
  function listItemCard(C, title, opts) {
    const body = C.el('div', { class: 'ed-list-item__body' });
    const actions = [];
    if (opts.idx > 0) {
      actions.push(C.el('button', { type: 'button', class: 'ed-list-item__act', title: 'Subir', onClick: opts.onUp }, '↑'));
    }
    if (opts.idx < opts.total - 1) {
      actions.push(C.el('button', { type: 'button', class: 'ed-list-item__act', title: 'Bajar', onClick: opts.onDown }, '↓'));
    }
    if (opts.onRemove) {
      actions.push(C.el('button', { type: 'button', class: 'ed-list-item__act ed-list-item__act--danger', title: 'Quitar', onClick: opts.onRemove }, '×'));
    }
    const head = C.el('div', { class: 'ed-list-item__head' }, [
      C.el('span', { class: 'ed-list-item__title' }, title),
      C.el('div', { class: 'ed-list-item__acts' }, actions),
    ]);
    const root = C.el('div', { class: 'ed-list-item' }, [head, body]);
    return { root, body };
  }

  function closeDrawer() {
    const insp = document.getElementById('editor-inspector');
    if (insp) insp.classList.remove('ed-inspector--open');
  }

  function bindStateListeners() {
    const ES = window.TiendaIA.editorState;
    // Solo reconstruir al cambiar la seleccion. Los cambios de props que origina
    // el propio inspector NO deben reconstruirlo (perderia el foco del input
    // mientras se escribe). Los cambios estructurales (agregar/quitar/mover item)
    // llaman rebuild() explicitamente. Tras undo/redo se limpia selection -> rebuild.
    ES.subscribe('selection', rebuild);
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorInspector = { render, rebuild };
})(window);
