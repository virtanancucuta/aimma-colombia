/* AIMMA Tienda IA · Editor PRO-MAX · Fase A.1 · editor-inspector.js v3 (schema-driven)
 * Panel derecho contextual: edita la SECCION seleccionada. El form se AUTOGENERA
 * leyendo window.TiendaIA.editorSectionDefs.defs[tipo].campos y mapeando cada campo
 * a un control de editor-controls.js. Reemplaza los 9 renderXxxProps hardcodeados.
 * Sub-generadores: renderToggleObject (objeto opcional) + renderList (sub-editor de arrays).
 * FASE D (D3b): el generador es TARGET-AGNOSTICO ({props, setProps, tiendaId, id}) -> el MISMO
 *   renderCampo edita una seccion top-level O un bloque hijo de un contenedor (control child-blocks).
 * Bloque "Apariencia" base y acciones (Duplicar/Eliminar) sin cambios.
 * Marker: editor-a1-inspector-generator.
 */
(function(window) {
  'use strict';

  const state = { container: null, callbacks: {} };

  // FASE D: tipos hoja permitidos dentro de un contenedor (== HijoSchema). El catalogo de
  // "Agregar bloque" se filtra a esta lista; el orden replica el catalogo general.
  // FASE D · P2-2: 'espacio' removido de los hijos (redundante con el row-gap de la columna; 0 en prod).
  const CHILD_TIPOS = ['texto', 'imagen_con_texto', 'imagen', 'cita', 'botones', 'producto_destacado', 'video'];

  // Solo se conservan las opciones del bloque base "Apariencia" (no migrado a sectionDefs).
  const PADDING_OPTS = [
    { v: 'sm', l: 'Pequeno' }, { v: 'md', l: 'Medio' },
    { v: 'lg', l: 'Grande' }, { v: 'xl', l: 'Extra grande' },
  ];
  const ANCHO_OPTS = [
    { v: 'completo', l: 'Ancho completo (borde a borde)' },
    { v: 'contenido', l: 'Centrado (con margenes)' },
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
  // Helpers de acceso al registro
  // ============================================================
  function defsFor(tipo) {
    return window.TiendaIA.editorSectionDefs.defs[tipo];
  }
  function optList(ref) {
    return Array.isArray(ref) ? ref : window.TiendaIA.editorSectionDefs.OPTS[ref];
  }

  // ============================================================
  // Targets (FASE D): abstraen DONDE se escriben las props.
  //  - sectionTarget: una seccion top-level -> ES.updateSectionProps(sec.id, ...)
  //  - childTarget:   un bloque hijo de un contenedor -> ES.updateChildProps(parentId, child.id, ...)
  // El generador (renderCampo/renderToggleObject/renderList) solo usa target.{props,setProps,tiendaId,id}.
  // ============================================================
  function sectionTarget(sec, ES) {
    return { id: sec.id, props: sec.props || {}, tiendaId: ES.tienda_id,
      setProps: (patch) => ES.updateSectionProps(sec.id, patch) };
  }
  function childTarget(parentId, child, ES) {
    return { id: child.id, props: child.props || {}, tiendaId: ES.tienda_id,
      setProps: (patch) => ES.updateChildProps(parentId, child.id, patch) };
  }

  // ============================================================
  // SECTION (props por tipo, generadas desde sectionDefs + base)
  // ============================================================
  function renderForSection(sec) {
    const C = window.TiendaIA.editorControls;
    const ES = window.TiendaIA.editorState;
    const def = defsFor(sec.tipo);
    const wrap = C.el('div', { class: 'ed-inspector__body' });

    // Header con boton cerrar drawer (mobile).
    const header = C.el('div', { class: 'ed-inspector__head' }, [
      C.el('h4', { class: 'ed-inspector__header' }, 'Seccion: ' + (def ? def.label : sec.tipo)),
      C.el('button', {
        type: 'button',
        class: 'ed-inspector__close',
        'aria-label': 'Cerrar panel',
        onClick: () => closeDrawer(),
      }, '×'),
    ]);
    wrap.appendChild(header);

    // ── Props especificas por tipo (autogeneradas desde campos[]) ──
    // Los campos con after_base:true se renderizan DESPUES del grupo "Apariencia de la
    // seccion" (p.ej. la lista de Imagenes de la galeria: toda la config junta primero,
    // el contenido al final). El resto va antes, como siempre.
    const afterBase = [];
    if (def) {
      const target = sectionTarget(sec, ES);
      def.campos.forEach((campo) => {
        if (campo.after_base) { afterBase.push({ campo, target }); return; }
        renderCampo(wrap, target, campo, C);
      });
    }

    // ── Apariencia (base: ancho, fondo, padding) colapsable ──
    wrap.appendChild(C.collapsibleSection('Apariencia de la seccion', buildBaseControls(sec, C, ES)));

    // ── Campos diferidos (after_base): van al final, despues de Apariencia ──
    afterBase.forEach(({ campo, target }) => renderCampo(wrap, target, campo, C));

    // ── Acciones ──
    wrap.appendChild(C.primaryButton('Duplicar seccion', () => ES.duplicateSection(sec.id)));
    wrap.appendChild(C.dangerButton('Eliminar seccion', () => {
      // Mismo modal estilizado que el chrome del canvas (UX de borrado consistente, doble red).
      if (window.TiendaIA.editorConfirm && window.TiendaIA.editorConfirm.removeSection) {
        window.TiendaIA.editorConfirm.removeSection(sec.id);
      } else if (confirm('Eliminar esta seccion?')) {
        ES.removeSection(sec.id); // fallback defensivo si el modal no cargo
      }
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
  // Generador de UN campo -> control del toolkit (TARGET-AGNOSTICO)
  // ============================================================
  function setProp(target, key, value, campo) {
    if (campo && campo.empty_to_undefined && !value) value = undefined;
    if (campo && campo.empty_to_null && !value) value = null;
    target.setProps({ [key]: value });
  }

  function selectCurrent(p, campo) {
    const v = p[campo.key];
    return v == null ? (campo.default != null ? campo.default : '') : v;
  }

  function renderCampo(wrap, target, campo, C) {
    if (campo.__info) { wrap.appendChild(C.infoBox(campo.__info)); return; }
    const p = target.props || {};
    switch (campo.control) {
      case 'text':
        wrap.appendChild(C.textInput(campo.label, p[campo.key] || campo.display_fallback || '',
          v => setProp(target, campo.key, v, campo), campo.opts || {}));
        break;
      case 'textarea':
        wrap.appendChild(C.textarea(campo.label, p[campo.key] || campo.display_fallback || '',
          v => setProp(target, campo.key, v, campo), campo.opts || {}));
        break;
      case 'richtext':
        wrap.appendChild(C.richText(campo.label, p[campo.key] || campo.display_fallback || '',
          v => setProp(target, campo.key, v, campo), campo.opts || {}));
        break;
      case 'url':
        wrap.appendChild(C.urlInput(campo.label, p[campo.key] || '',
          v => setProp(target, campo.key, v, campo), campo.opts || {}));
        break;
      case 'image':
        wrap.appendChild(C.imagePicker(campo.label, p[campo.key] || '',
          v => setProp(target, campo.key, v, campo), { ...(campo.opts || {}), tiendaId: target.tiendaId }));
        break;
      case 'video-upload':
        // FASE D (2b): sube un MP4 a R2; el valor es la URL publica. La precedencia mp4_url>url/html
        // la maneja el render (Video.astro) y validate-section -> no hace falta limpiar url/html aca.
        wrap.appendChild(C.videoUpload(campo.label, p[campo.key] || '',
          v => setProp(target, campo.key, v, campo), { tiendaId: target.tiendaId }));
        break;
      case 'category':
        wrap.appendChild(C.categoryPicker(campo.label, p[campo.key] || null,
          v => setProp(target, campo.key, v, campo), { tiendaId: target.tiendaId }));
        break;
      case 'product':
        wrap.appendChild(C.productPicker(campo.label, p[campo.key] || '',
          v => setProp(target, campo.key, v, campo), { tiendaId: target.tiendaId }));
        break;
      case 'color':
        wrap.appendChild(C.colorPicker(campo.label, p[campo.key] || campo.default || '#000000',
          v => setProp(target, campo.key, v, campo), campo.opts || {}));
        break;
      case 'select':
        wrap.appendChild(C.select(campo.label, selectCurrent(p, campo), optList(campo.opts.options),
          v => { setProp(target, campo.key, campo.empty_to_undefined ? (v || undefined) : v, campo); if (campo.rebuild_on_change) rebuild(); }));
        break;
      case 'switch':
        wrap.appendChild(C.switch(campo.label, p[campo.key] !== false,
          v => setProp(target, campo.key, v, campo)));
        break;
      case 'slider':
        wrap.appendChild(C.slider(campo.label, p[campo.key] || campo.default, campo.opts.min, campo.opts.max, campo.opts.step,
          v => setProp(target, campo.key, v, campo)));
        break;
      case 'toggle-object':
        renderToggleObject(wrap, target, campo, C);
        break;
      case 'list':
        renderList(wrap, target, campo, C);
        break;
      case 'child-blocks':
        renderChildBlocks(wrap, target, campo, C);
        break;
      case 'franja-slides':
        renderFranjaSlides(wrap, target, campo, C);
        break;
      default:
        break;
    }
    // Fase 1a: nota guia opcional bajo el control. campo.note puede ser string o fn(props) para
    // texto dinamico (con rebuild_on_change en el campo, se refresca al cambiar el valor).
    if (campo.note) {
      const txt = typeof campo.note === 'function' ? campo.note(target.props || {}) : campo.note;
      if (txt) wrap.appendChild(C.el('p', { class: 'ed-ctrl__hint' }, txt));
    }
  }

  // ── toggle-object: switch ON/OFF de un objeto opcional + subcampos ──
  function renderToggleObject(wrap, target, campo, C) {
    const p = target.props || {};
    const obj = p[campo.key];
    const tiene = !!obj;
    wrap.appendChild(C.switch(campo.label, tiene, on => {
      target.setProps({ [campo.key]: on ? structuredClone(campo.on_default) : undefined });
      rebuild();
    }));
    if (!tiene) return;
    const upd = (patch) => target.setProps({ [campo.key]: { ...obj, ...patch } });
    campo.subfields.forEach((sf) => {
      const val = obj[sf.key] || '';
      if (sf.control === 'url') {
        wrap.appendChild(C.urlInput(sf.label, val, v => upd({ [sf.key]: v }), sf.opts || {}));
      } else if (sf.control === 'image') {
        wrap.appendChild(C.imagePicker(sf.label, val, v => upd({ [sf.key]: v }), { tiendaId: target.tiendaId }));
      } else if (sf.control === 'text') {
        wrap.appendChild(C.textInput(sf.label, val, v => upd({ [sf.key]: v }), sf.opts || {}));
      } else if (sf.control === 'select') {
        wrap.appendChild(C.select(sf.label, obj[sf.key] || (sf.fallback || ''), optList(sf.opts.options),
          v => upd({ [sf.key]: sf.empty_to_undefined ? (v || undefined) : v })));
      }
    });
  }

  // ── list: sub-editor de array (botones/galeria/formulario) ──
  function renderList(wrap, target, campo, C) {
    const arr = Array.isArray(target.props && target.props[campo.key]) ? target.props[campo.key] : [];
    const replace = (next) => target.setProps({ [campo.key]: next });

    arr.forEach((it, idx) => {
      const card = listItemCard(C, campo.item_label + ' ' + (idx + 1), {
        idx, total: arr.length,
        onUp: () => { replace(moveItem(arr, idx, idx - 1)); rebuild(); },
        onDown: () => { replace(moveItem(arr, idx, idx + 1)); rebuild(); },
        onRemove: arr.length > campo.min ? () => { replace(arr.filter((_, i) => i !== idx)); rebuild(); } : null,
      });
      const upd = (patch) => replace(arr.map((x, i) => i === idx ? { ...x, ...patch } : x));
      campo.item.forEach((sf) => {
        if (sf.when && it[sf.when.field] !== sf.when.eq) return;
        if (sf.control === 'text') {
          card.body.appendChild(C.textInput(sf.label, it[sf.key] || '',
            v => upd({ [sf.key]: sf.empty_to_undefined ? (v || undefined) : v }), sf.opts || {}));
        } else if (sf.control === 'url') {
          card.body.appendChild(C.urlInput(sf.label, it[sf.key] || '', v => upd({ [sf.key]: v }), sf.opts || {}));
        } else if (sf.control === 'image') {
          card.body.appendChild(C.imagePicker(sf.label, it[sf.key] || '', v => upd({ [sf.key]: sf.empty_to_undefined ? (v || undefined) : v }), { tiendaId: target.tiendaId }));
        } else if (sf.control === 'textarea' && sf.transform === 'lines') {
          card.body.appendChild(C.textarea(sf.label, (Array.isArray(it[sf.key]) ? it[sf.key] : []).join('\n'),
            v => upd({ [sf.key]: v.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20) }), sf.opts || {}));
        } else if (sf.control === 'textarea') {
          // textarea PLANO (string multi-linea): respuesta FAQ, resena testimonio, texto caracteristica.
          card.body.appendChild(C.textarea(sf.label, it[sf.key] || '',
            v => upd({ [sf.key]: sf.empty_to_undefined ? (v || undefined) : v }), sf.opts || {}));
        } else if (sf.control === 'select') {
          card.body.appendChild(C.select(sf.label, it[sf.key] || '', optList(sf.opts.options),
            v => { upd({ [sf.key]: sf.empty_to_undefined ? (v || undefined) : v }); if (sf.rebuild_on_change) rebuild(); }));
        } else if (sf.control === 'switch') {
          card.body.appendChild(C.switch(sf.label, !!it[sf.key], v => upd({ [sf.key]: v })));
        } else if (sf.control === 'category') {
          // categorias_destacadas: cada item referencia UNA categoria (allowAll:false -> sin "Todas").
          card.body.appendChild(C.categoryPicker(sf.label, it[sf.key] || null,
            v => upd({ [sf.key]: v }), { tiendaId: target.tiendaId, allowAll: false }));
        }
      });
      wrap.appendChild(card.root);
    });

    if (arr.length < campo.max) {
      wrap.appendChild(C.primaryButton(campo.add_label, () => {
        const item = campo.add_default_fn === 'galeria_img'
          ? { src: 'https://placehold.co/800x800/eee/666?text=' + (arr.length + 1), alt: '' }
          : structuredClone(campo.add_default);
        replace(arr.concat([item]));
        rebuild();
      }));
    } else {
      wrap.appendChild(C.infoBox(campo.max_note));
    }
    if (campo.min_note && arr.length < campo.min) {
      wrap.appendChild(C.infoBox(campo.min_note));
    }
  }

  // ── child-blocks (FASE D D3b): sub-editor de los BLOQUES HIJOS de un contenedor, por columna.
  //   Reusa el MISMO renderCampo (target hijo) para editar cada hijo segun su tipo. Agregar (catalogo
  //   filtrado a CHILD_TIPOS) / quitar / reordenar (entre hermanos de la misma columna) / mover de columna.
  function renderChildBlocks(wrap, target, campo, C) {
    const ES = window.TiendaIA.editorState;
    const parentId = target.id;
    const p = target.props || {};
    const columnas = p.columnas || 1;
    const bloques = Array.isArray(p.bloques) ? p.bloques : [];
    const MAX = (campo.opts && campo.opts.max) || 8;

    wrap.appendChild(C.el('h5', { class: 'ed-inspector__subhead' }, 'Bloques'));

    const colOf = (b) => Math.min(Math.max(b.columna || 0, 0), columnas - 1);
    const colOpts = [];
    for (let i = 0; i < columnas; i++) colOpts.push({ v: String(i), l: 'Columna ' + (i + 1) });

    for (let k = 0; k < columnas; k++) {
      if (columnas > 1) wrap.appendChild(C.el('div', { class: 'ed-col-label' }, 'Columna ' + (k + 1)));
      // FASE D (A2): el sub-editor YA NO arrastra. El reorden en la MISMA columna es por ↑↓; mover ENTRE
      // columnas es por el selector "Columna" (abajo) o arrastrando en el CANVAS (canvas-dnd). data-col se
      // conserva como dato estructural de la columna.
      const colBox = C.el('div', { class: 'ed-childcol', 'data-col': String(k) });
      const enCol = bloques.filter((b) => colOf(b) === k);
      enCol.forEach((child, ci) => {
        const def = defsFor(child.tipo);
        const card = listItemCard(C, (def ? def.label : child.tipo), {
          idx: ci, total: enCol.length,
          onUp: () => { ES.reorderChildBlock(parentId, child.id, -1); rebuild(); },
          onDown: () => { ES.reorderChildBlock(parentId, child.id, +1); rebuild(); },
          onRemove: bloques.length > 1 ? () => { ES.removeChildBlock(parentId, child.id); rebuild(); } : null,
        });
        card.root.setAttribute('data-child-id', child.id);   // lo usa scrollSelectedChildIntoView (scroll al seleccionado)
        if (columnas > 1) {
          card.body.appendChild(C.select('Columna', String(colOf(child)), colOpts,
            v => { ES.updateChildBase(parentId, child.id, 'columna', parseInt(v, 10) || 0); rebuild(); }));
        }
        // D4: resalta el hijo seleccionado (chrome en canvas + sub-editor en sync = mismo target).
        if (ES.selection && ES.selection.childId === child.id) card.root.classList.add('ed-list-item--sel');
        const ct = childTarget(parentId, child, ES);
        if (def) def.campos.forEach((cf) => renderCampo(card.body, ct, cf, C));
        colBox.appendChild(card.root);
      });
      wrap.appendChild(colBox);
      if (bloques.length < MAX) {
        wrap.appendChild(C.primaryButton('+ Agregar bloque', () => {
          window.TiendaIA.editorModalCatalog.open((tipo) => { ES.addChildBlock(parentId, tipo, k); rebuild(); }, CHILD_TIPOS);
        }));
      }
    }
    if (bloques.length >= MAX) wrap.appendChild(C.infoBox('Maximo ' + MAX + ' bloques por contenedor.'));
  }

  // ── franja-slides (FASE F): sub-editor ANIDADO slide -> imagen -> overlay. Estructura FIJA (no catalogo).
  //   Slides 1-3 (↑↓✕ + agregar) -> imagenes 1-3 (image-picker + alt + link + overlay colapsable) (↑↓✕ +
  //   agregar). Edicion de campos = debounced (sin rebuild); cambios estructurales = rebuild. Reusa los
  //   controles del toolkit (image-picker, color, select) + las ops de editor-state (find/add/remove/reorder).
  // ── Refinamientos franja: hint de formato (#2) + aviso por imagen (#3) ──
  // Ratio objetivo de CADA celda = ancho_celda / alto_banda. ancho = 1440/Nimgs (el full-bleed se reparte
  // entre las imagenes del slide); alto = cap del preset. Depende de altura Y cantidad -> recalcula en cada
  // rebuild (la altura dispara rebuild via rebuild_on_change; add/remove imagen ya rebuildea).
  const FRANJA_CAPS = { corto: 300, medio: 460, alto: 680 };
  // adaptarse -> 'natural' SOLO si es hero (1 slide / 1 imagen); si no cae a 'medio' (igual que el render C-3b).
  function franjaEffAltura(altura, nSlides, nImgs) {
    if (altura === 'adaptarse') return (nSlides === 1 && nImgs === 1) ? 'natural' : 'medio';
    return altura || 'medio';
  }
  function franjaTargetRatio(effAltura, nImgs) {
    if (effAltura === 'natural') return null;
    return (1440 / nImgs) / (FRANJA_CAPS[effAltura] || 460);
  }
  const FRANJA_RATIOS = [
    { r: 5.0, l: '5:1', o: 'panoramica' }, { r: 3.0, l: '3:1', o: 'panoramica' },
    { r: 2.0, l: '2:1', o: 'apaisada' }, { r: 1.78, l: '16:9', o: 'apaisada' },
    { r: 1.5, l: '3:2', o: 'apaisada' }, { r: 1.33, l: '4:3', o: 'apaisada' },
    { r: 1.0, l: '1:1', o: 'cuadrada' }, { r: 0.75, l: '3:4', o: 'vertical' },
    { r: 0.67, l: '2:3', o: 'vertical' }, { r: 0.56, l: '9:16', o: 'vertical' },
  ];
  function franjaRatioLabel(ratio) {
    let best = FRANJA_RATIOS[0], bestD = Infinity;
    for (const x of FRANJA_RATIOS) { const d = Math.abs(Math.log(ratio / x.r)); if (d < bestD) { bestD = d; best = x; } }
    return best;
  }
  function franjaIdealPx(effAltura, nImgs) {
    const round10 = (n) => Math.round(n / 10) * 10;
    return { w: round10((1440 / nImgs) * 1.5), h: round10((FRANJA_CAPS[effAltura] || 460) * 1.5) };
  }
  function franjaHintText(altura, nSlides, nImgs) {
    const eff = franjaEffAltura(altura, nSlides, nImgs);
    if (eff === 'natural') return 'Se adapta a la imagen (sin recorte) — ideal para fotos horizontales.';
    const r = franjaTargetRatio(eff, nImgs), lab = franjaRatioLabel(r), px = franjaIdealPx(eff, nImgs);
    return 'Cada imagen se ve en ~' + lab.l + ' (' + lab.o + ') · ideal subir ~' + px.w + '×' + px.h + 'px';
  }
  // Umbral de aviso (#3): desajuste de ratio 1.5x = la imagen pierde ~1/3 por cover (recorte notorio).
  const FRANJA_WARN_THRESHOLD = 1.5;
  function franjaWarnText(natW, natH, targetRatio) {
    const real = natW / natH;
    const mismatch = Math.max(real / targetRatio, targetRatio / real);
    if (mismatch <= FRANJA_WARN_THRESHOLD) return null;
    const objLabel = franjaRatioLabel(targetRatio).l;
    const masVertical = real < targetRatio;
    return 'Esta imagen (' + natW + '×' + natH + ') es ' + (masVertical ? 'mucho mas vertical' : 'mucho mas apaisada') +
      ' que el espacio (~' + objLabel + '); se va a recortar fuerte. Usa el punto focal, cambia la altura a "Adaptarse", o subi ' +
      (masVertical ? 'una mas apaisada' : 'una mas vertical o cuadrada') + '.';
  }
  // Carga la imagen REAL (client-side, naturalWidth/Height; NO se guarda) y pinta/limpia el aviso.
  function franjaAttachWarning(warnEl, imgUrl, targetRatio, suppress) {
    warnEl.hidden = true; warnEl.textContent = '';
    if (suppress || !targetRatio || !imgUrl) return;
    const probe = new window.Image();
    probe.onload = () => {
      if (!probe.naturalWidth || !probe.naturalHeight) return;
      const txt = franjaWarnText(probe.naturalWidth, probe.naturalHeight, targetRatio);
      if (txt) { warnEl.textContent = txt; warnEl.hidden = false; } else { warnEl.hidden = true; }
    };
    probe.src = imgUrl;
  }

  function renderFranjaSlides(wrap, target, campo, C) {
    const ES = window.TiendaIA.editorState;
    const secId = target.id;
    const s = ES.findFranja(secId);
    const slides = (s && s.props.slides) || [];
    const altura = (s && s.props && s.props.altura) || 'medio';
    const nSlides = slides.length;

    wrap.appendChild(C.el('h5', { class: 'ed-inspector__subhead' }, 'Slides e imagenes'));

    slides.forEach((slide, si) => {
      const slideCard = listItemCard(C, 'Slide ' + (si + 1), {
        idx: si, total: slides.length,
        onUp: () => { ES.reorderSlide(secId, si, -1); rebuild(); },
        onDown: () => { ES.reorderSlide(secId, si, +1); rebuild(); },
        onRemove: slides.length > 1 ? () => { ES.removeSlide(secId, si); rebuild(); } : null,
      });
      const imgs = Array.isArray(slide.imagenes) ? slide.imagenes : [];
      // #2 hint de formato (por slide): ratio objetivo por celda segun altura + cantidad de imagenes.
      slideCard.body.appendChild(C.el('p', { class: 'ed-franja-hint' }, franjaHintText(altura, nSlides, imgs.length)));
      const effAltura = franjaEffAltura(altura, nSlides, imgs.length);
      const slideTargetRatio = franjaTargetRatio(effAltura, imgs.length);
      const warnSuppress = (effAltura === 'natural');   // adaptarse-hero: no recorta -> sin aviso
      imgs.forEach((img, ii) => {
        const imgCard = listItemCard(C, 'Imagen ' + (ii + 1), {
          idx: ii, total: imgs.length,
          onUp: () => { ES.reorderImagen(secId, si, ii, -1); rebuild(); },
          onDown: () => { ES.reorderImagen(secId, si, ii, +1); rebuild(); },
          onRemove: imgs.length > 1 ? () => { ES.removeImagen(secId, si, ii); rebuild(); } : null,
        });
        // #3 aviso por imagen: al cambiar la imagen, recalcula contra el ratio objetivo del slide (sin
        // rebuild -> no pierde scroll). El alto/cantidad SI rebuildean (recomputan slideTargetRatio).
        const warnEl = C.el('p', { class: 'ed-franja-warn', hidden: true });
        imgCard.body.appendChild(C.imagePicker('Imagen', img.url || '',
          v => { ES.updateImagenFranja(secId, si, ii, { url: v }); franjaAttachWarning(warnEl, v, slideTargetRatio, warnSuppress); },
          { tiendaId: target.tiendaId }));
        imgCard.body.appendChild(warnEl);
        franjaAttachWarning(warnEl, img.url, slideTargetRatio, warnSuppress);
        imgCard.body.appendChild(C.textInput('Texto alternativo (alt)', img.alt || '',
          v => ES.updateImagenFranja(secId, si, ii, { alt: v || undefined }), { maxLength: 160 }));
        imgCard.body.appendChild(C.urlInput('Link al hacer clic (opcional)', img.link || '',
          v => ES.updateImagenFranja(secId, si, ii, { link: v || undefined }), { placeholder: 'https://...' }));
        // C-5: punto focal por imagen -> object-position. Mismo vocabulario 3x3 que la posicion del
        // texto. Aplica solo cuando la franja recorta (presets o adaptarse-vertical que topa el cap).
        imgCard.body.appendChild(C.select('Punto focal (que parte se ve si se recorta)', img.foco || 'centro', optList('FRANJA_POSICION'),
          v => ES.updateImagenFranja(secId, si, ii, { foco: v })));
        // Overlay colapsable. El velo+texto SOLO se rinde si hay texto (sin texto = imagen limpia).
        const ov = img.overlay || {};
        const ovCtrls = [
          C.textInput('Texto sobre la imagen', ov.texto || '',
            v => ES.updateOverlayFranja(secId, si, ii, { texto: v || undefined }), { maxLength: 160, placeholder: 'Ej: Nueva coleccion' }),
          C.select('Posicion del texto', ov.posicion || 'centro', optList('FRANJA_POSICION'),
            v => ES.updateOverlayFranja(secId, si, ii, { posicion: v })),
          C.colorPicker('Color del texto', ov.color_texto || '#ffffff',
            v => ES.updateOverlayFranja(secId, si, ii, { color_texto: v })),
          C.select('Velo detras del texto', ov.color_fondo || 'rgba(0,0,0,0.4)', optList('FRANJA_SCRIM'),
            v => ES.updateOverlayFranja(secId, si, ii, { color_fondo: v })),
          C.select('Borde del recuadro', ov.borde || 'ninguno', optList('FRANJA_BORDE'),
            v => ES.updateOverlayFranja(secId, si, ii, { borde: v })),
        ];
        imgCard.body.appendChild(C.collapsibleSection('Texto sobre la imagen (opcional)', ovCtrls));
        slideCard.body.appendChild(imgCard.root);
      });
      if (imgs.length < 3) {
        slideCard.body.appendChild(C.primaryButton('+ Agregar imagen', () => { ES.addImagen(secId, si); rebuild(); }));
      }
      wrap.appendChild(slideCard.root);
    });
    if (slides.length < 3) {
      wrap.appendChild(C.primaryButton('+ Agregar slide', () => { ES.addSlide(secId); rebuild(); }));
    }
  }

  // ============================================================
  // Helpers de sub-editor de lista (sin cambios respecto a v2)
  // ============================================================
  function moveItem(arr, from, to) {
    if (to < 0 || to >= arr.length) return arr.slice();
    const next = arr.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    return next;
  }

  // FASE D (A2): el DnD del sub-editor se removio (el grip duplicaba el DnD del canvas y arrastrar las
  // tarjetas altas era incomodo). Mover hijos: ↑↓ (misma columna), selector "Columna" (entre columnas) o
  // arrastrar en el CANVAS (apps/storefront canvas-dnd -> editor-canvas handleMoveChild -> moveChildToColumn).

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
    const headKids = [
      C.el('span', { class: 'ed-list-item__title' }, title),
      C.el('div', { class: 'ed-list-item__acts' }, actions),
    ];
    const head = C.el('div', { class: 'ed-list-item__head' }, headKids);
    const root = C.el('div', { class: 'ed-list-item' }, [head, body]);
    return { root, body };
  }

  function closeDrawer() {
    const insp = document.getElementById('editor-inspector');
    if (insp) insp.classList.remove('ed-inspector--open');
  }

  // FASE D (A1 QoL): tras seleccionar un HIJO de contenedor (click/chrome en el canvas), el inspector se
  // reconstruye desde arriba -> el sub-editor del hijo elegido puede quedar bajo el "fold". Lo trae a la
  // vista DENTRO del panel (.ed-inspector tiene overflow:auto). Solo hijos (childId); una seccion top-level
  // ya queda arriba tras el rebuild. block:'nearest' = scroll minimo (no salta si ya esta visible).
  function scrollSelectedChildIntoView() {
    const ES = window.TiendaIA.editorState;
    const sel = ES.selection;
    if (!sel || !sel.childId || !state.container) return;
    const card = state.container.querySelector('.ed-list-item--sel') ||
                 state.container.querySelector('[data-child-id="' + sel.childId + '"]');
    if (!card || typeof card.scrollIntoView !== 'function') return;
    try { card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    catch (_e) { try { card.scrollIntoView(); } catch (_e2) { /* noop */ } }
  }

  function bindStateListeners() {
    const ES = window.TiendaIA.editorState;
    ES.subscribe('selection', function () {
      rebuild();
      // tras reconstruir, traer el sub-editor del hijo seleccionado a la vista (rAF = post-layout si existe).
      if (window.requestAnimationFrame) window.requestAnimationFrame(scrollSelectedChildIntoView);
      else scrollSelectedChildIntoView();
    });
  }

  window.TiendaIA = window.TiendaIA || {};
  // D4: editor-canvas reusa CHILD_TIPOS para filtrar el catalogo del "+ agregar bloque" del canvas.
  window.TiendaIA.editorInspector = { render, rebuild, CHILD_TIPOS };
})(window);
