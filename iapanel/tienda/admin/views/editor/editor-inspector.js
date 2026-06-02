/* AIMMA Editor PRO-MAX Plan 3 · editor-inspector.js v1
 * Panel derecho contextual: edita la cosa seleccionada (section o element).
 * Composicion hand-coded por tipo usando helpers de editor-controls.js.
 */
(function(window) {
  'use strict';

  const state = { container: null, callbacks: {} };

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
    if (sel.tipo === 'section') {
      const sec = ES.findSection(sel.id);
      if (!sec) return;
      state.container.appendChild(renderForSection(sec));
    } else if (sel.tipo === 'element') {
      const el = ES.findElement(sel.id);
      if (!el) return;
      state.container.appendChild(renderForElement(el));
    }
  }

  function renderEmpty() {
    const C = window.TiendaIA.editorControls;
    return C.infoBox(
      'Seleccioná una sección o un elemento para editarlo. ' +
      'Tip: hacé click en cualquier parte del canvas para empezar.'
    );
  }

  // ============================================================
  // SECTION
  // ============================================================
  function renderForSection(sec) {
    const C = window.TiendaIA.editorControls;
    const ES = window.TiendaIA.editorState;
    const wrap = C.el('div', { class: 'ed-inspector__body' });
    const SECTION_LABEL_MAP = {
      hero: 'Banner principal', texto: 'Texto', imagen: 'Imagen',
      botones: 'Botones', productos: 'Productos', galeria: 'Galería',
      espaciador: 'Espacio en blanco', formulario: 'Formulario',
    };

    wrap.appendChild(C.headerLabel('Sección · ' + (SECTION_LABEL_MAP[sec.tipo] || sec.tipo)));

    // Fondo: select tipo
    wrap.appendChild(C.select('Tipo de fondo', sec.fondo.tipo, [
      { v: 'transparente', l: 'Transparente' },
      { v: 'color', l: 'Color' },
      { v: 'imagen', l: 'Imagen' },
      { v: 'gradient', l: 'Degradado CSS' },
    ], v => {
      ES.updateSectionProp(sec.id, 'fondo', { tipo: v, valor: '' });
      rebuild();
    }));

    // Fondo: input segun tipo
    if (sec.fondo.tipo === 'color') {
      wrap.appendChild(C.colorPicker('Color de fondo', sec.fondo.valor || '#ffffff',
        v => ES.updateSectionProp(sec.id, 'fondo', { ...sec.fondo, valor: v })));
    } else if (sec.fondo.tipo === 'imagen') {
      wrap.appendChild(C.urlInput('URL imagen (https)', sec.fondo.valor || '',
        v => ES.updateSectionProp(sec.id, 'fondo', { ...sec.fondo, valor: v })));
    } else if (sec.fondo.tipo === 'gradient') {
      wrap.appendChild(C.textarea('CSS gradient', sec.fondo.valor || 'linear-gradient(135deg, #1B4965, #5FA8D3)',
        v => ES.updateSectionProp(sec.id, 'fondo', { ...sec.fondo, valor: v })));
    }

    wrap.appendChild(C.select('Padding', sec.padding, [
      { v: 'sm', l: 'Pequeño' }, { v: 'md', l: 'Medio' },
      { v: 'lg', l: 'Grande' }, { v: 'xl', l: 'Extra grande' },
    ], v => ES.updateSectionProp(sec.id, 'padding', v)));

    wrap.appendChild(C.slider('Altura (filas de 60px)', sec.altura_filas, 1, 50, 1,
      v => ES.updateSectionProp(sec.id, 'altura_filas', v)));

    // Boton agregar elemento dentro de section
    wrap.appendChild(C.primaryButton('+ Agregar elemento', () => {
      state.callbacks.onAddElement && state.callbacks.onAddElement(sec.id);
    }));

    wrap.appendChild(C.dangerButton('Duplicar sección',
      () => ES.duplicateSection(sec.id)));
    wrap.appendChild(C.dangerButton('Eliminar sección', () => {
      if (confirm('¿Eliminar esta sección? No se puede deshacer fácilmente.')) {
        ES.removeSection(sec.id);
      }
    }));

    return wrap;
  }

  // ============================================================
  // ELEMENT
  // ============================================================
  const TYPE_LABEL_MAP = {
    texto: 'Texto', imagen: 'Imagen', boton: 'Botón',
    productos: 'Productos', galeria: 'Galería',
    form_field: 'Campo del formulario', embed: 'Video o mapa', divisor: 'Divisor',
  };

  function renderForElement(el) {
    const C = window.TiendaIA.editorControls;
    const ES = window.TiendaIA.editorState;
    const wrap = C.el('div', { class: 'ed-inspector__body' });

    wrap.appendChild(C.headerLabel('Elemento · ' + (TYPE_LABEL_MAP[el.tipo] || el.tipo)));

    // Props específicas por tipo
    const tipoRenderer = {
      texto: renderTextoProps,
      imagen: renderImagenProps,
      boton: renderBotonProps,
      productos: renderProductosProps,
      galeria: renderGaleriaProps,
      form_field: renderFormFieldProps,
      embed: renderEmbedProps,
      divisor: renderDivisorProps,
    };
    if (tipoRenderer[el.tipo]) {
      tipoRenderer[el.tipo](wrap, el, C, ES);
    }

    // Estilo colapsable (excepto divisor + espaciador-like)
    if (el.tipo !== 'divisor') {
      wrap.appendChild(C.collapsibleSection('Estilo',
        C.commonStyleControls(el, (key, value) => ES.updateElementStyle(el.id, key, value))));
    }

    // Posición colapsable
    wrap.appendChild(C.collapsibleSection('Posición en grilla',
      C.commonGridControls(el, (delta) => {
        // sectionId: buscar el section que contiene este element
        const sec = ES.sections.find(s => s.elementos.some(e => e.id === el.id));
        if (sec) ES.updateElementGrid(sec.id, el.id, delta);
      })));

    wrap.appendChild(C.dangerButton('Eliminar elemento', () => {
      if (confirm('¿Eliminar este elemento?')) ES.removeElement(el.id);
    }));

    return wrap;
  }

  // ============================================================
  // Props renderers por tipo
  // ============================================================
  function renderTextoProps(wrap, el, C, ES) {
    wrap.appendChild(C.textarea('Contenido', el.props.contenido || '',
      v => ES.updateElementProp(el.id, 'contenido', v),
      { maxLength: 5000, rows: 4 }));
  }

  function renderImagenProps(wrap, el, C, ES) {
    wrap.appendChild(C.urlInput('URL imagen (https)', el.props.src || '',
      v => ES.updateElementProp(el.id, 'src', v),
      { placeholder: 'https://...' }));
    wrap.appendChild(C.textInput('Texto alternativo (alt)', el.props.alt || '',
      v => ES.updateElementProp(el.id, 'alt', v),
      { maxLength: 200 }));
    wrap.appendChild(C.select('Ajuste', el.props.objeto || 'cover', [
      { v: 'cover', l: 'Cubrir (recorta si necesario)' },
      { v: 'contain', l: 'Contener (sin recorte)' },
    ], v => ES.updateElementProp(el.id, 'objeto', v)));
    wrap.appendChild(C.urlInput('Link al hacer click (opcional)', el.props.link_url || '',
      v => ES.updateElementProp(el.id, 'link_url', v || null)));
  }

  function renderBotonProps(wrap, el, C, ES) {
    wrap.appendChild(C.textInput('Texto del botón', el.props.texto || '',
      v => ES.updateElementProp(el.id, 'texto', v),
      { maxLength: 80 }));
    wrap.appendChild(C.urlInput('URL (https / mailto / tel / wa.me / # / /)',
      el.props.url || '',
      v => ES.updateElementProp(el.id, 'url', v)));
    wrap.appendChild(C.select('Estilo visual', el.props.estilo_visual || 'primary', [
      { v: 'primary', l: 'Principal' },
      { v: 'secondary', l: 'Secundario' },
      { v: 'ghost', l: 'Fantasma' },
      { v: 'outline', l: 'Borde' },
    ], v => ES.updateElementProp(el.id, 'estilo_visual', v)));
    wrap.appendChild(C.select('Abrir en', el.props.target || '_self', [
      { v: '_self', l: 'Misma pestaña' },
      { v: '_blank', l: 'Nueva pestaña' },
    ], v => ES.updateElementProp(el.id, 'target', v)));
    wrap.appendChild(C.select('Icono (opcional)', el.props.icono || '', [
      { v: '', l: 'Sin icono' },
      { v: 'arrow', l: 'Flecha →' },
      { v: 'whatsapp', l: 'WhatsApp' },
      { v: 'email', l: 'Email' },
      { v: 'phone', l: 'Teléfono' },
      { v: 'location', l: 'Ubicación' },
      { v: 'link', l: 'Link' },
    ], v => ES.updateElementProp(el.id, 'icono', v || undefined)));
  }

  function renderProductosProps(wrap, el, C, ES) {
    wrap.appendChild(C.textInput('ID categoría (UUID o vacío para todas)',
      el.props.categoria_id || '',
      v => ES.updateElementProp(el.id, 'categoria_id', v || null)));
    wrap.appendChild(C.slider('Cantidad', el.props.limite || 8, 1, 12, 1,
      v => ES.updateElementProp(el.id, 'limite', v)));
    wrap.appendChild(C.select('Ordenar por', el.props.orden || 'recientes', [
      { v: 'recientes', l: 'Más recientes' },
      { v: 'precio_asc', l: 'Precio ↑' },
      { v: 'precio_desc', l: 'Precio ↓' },
      { v: 'manual', l: 'Manual' },
    ], v => ES.updateElementProp(el.id, 'orden', v)));
    wrap.appendChild(C.select('Columnas', el.props.columnas || 'auto', [
      { v: 'auto', l: 'Auto' }, { v: 2, l: '2' }, { v: 3, l: '3' }, { v: 4, l: '4' },
    ], v => ES.updateElementProp(el.id, 'columnas', v)));
    wrap.appendChild(C.switch('Mostrar precio', !!el.props.mostrar_precio,
      v => ES.updateElementProp(el.id, 'mostrar_precio', v)));
  }

  function renderGaleriaProps(wrap, el, C, ES) {
    wrap.appendChild(C.infoBox('La galería tiene ' + (el.props.imagenes?.length || 0) +
      ' imágenes. Edición avanzada de imágenes individuales: próximamente.'));
    wrap.appendChild(C.select('Layout', el.props.layout || 'grid', [
      { v: 'grid', l: 'Grilla uniforme' },
      { v: 'carrusel', l: 'Carrusel horizontal' },
      { v: 'mosaico', l: 'Mosaico bento' },
    ], v => ES.updateElementProp(el.id, 'layout', v)));
    wrap.appendChild(C.select('Espaciado', el.props.gap || 'normal', [
      { v: 'tight', l: 'Compacto' },
      { v: 'normal', l: 'Normal' },
      { v: 'loose', l: 'Aireado' },
    ], v => ES.updateElementProp(el.id, 'gap', v)));
  }

  function renderFormFieldProps(wrap, el, C, ES) {
    wrap.appendChild(C.textInput('Etiqueta (label)', el.props.label || '',
      v => ES.updateElementProp(el.id, 'label', v),
      { maxLength: 120 }));
    wrap.appendChild(C.select('Tipo de campo', el.props.tipo_campo || 'text', [
      { v: 'text', l: 'Texto corto' },
      { v: 'email', l: 'Email' },
      { v: 'tel', l: 'Teléfono' },
      { v: 'textarea', l: 'Texto largo' },
      { v: 'select', l: 'Lista de opciones' },
      { v: 'checkbox', l: 'Casilla de verificación' },
    ], v => ES.updateElementProp(el.id, 'tipo_campo', v)));
    wrap.appendChild(C.textInput('Placeholder (texto guía)', el.props.placeholder || '',
      v => ES.updateElementProp(el.id, 'placeholder', v),
      { maxLength: 200 }));
    wrap.appendChild(C.switch('Es requerido', !!el.props.requerido,
      v => ES.updateElementProp(el.id, 'requerido', v)));
  }

  function renderEmbedProps(wrap, el, C, ES) {
    wrap.appendChild(C.textarea('HTML del embed (iframe)', el.props.html || '',
      v => ES.updateElementProp(el.id, 'html', v),
      { maxLength: 2000, rows: 6, placeholder: '<iframe src="https://www.youtube.com/embed/..."></iframe>' }));
    wrap.appendChild(C.infoBox('Solo se permiten iframes de: YouTube, Vimeo, CodePen, CodeSandbox, Google Maps, Spotify.'));
    wrap.appendChild(C.select('Proporción', el.props.aspect_ratio || '16/9', [
      { v: '16/9', l: '16:9 (video)' },
      { v: '4/3', l: '4:3' },
      { v: '1/1', l: '1:1 (cuadrado)' },
    ], v => ES.updateElementProp(el.id, 'aspect_ratio', v)));
  }

  function renderDivisorProps(wrap, el, C, ES) {
    wrap.appendChild(C.select('Estilo', el.props.estilo || 'linea', [
      { v: 'linea', l: 'Línea' },
      { v: 'punto', l: 'Puntos' },
      { v: 'icono', l: 'Icono' },
    ], v => ES.updateElementProp(el.id, 'estilo', v)));
    wrap.appendChild(C.colorPicker('Color', el.props.color || '',
      v => ES.updateElementProp(el.id, 'color', v || null)));
  }

  function bindStateListeners() {
    const ES = window.TiendaIA.editorState;
    ES.subscribe('selection', rebuild);
    ES.subscribe('sections', rebuild);
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorInspector = { render, rebuild };
})(window);
