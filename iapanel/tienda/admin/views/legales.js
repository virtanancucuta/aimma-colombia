/* AIMMA · Tienda IA · views/legales.js · v3 · 2026-05-30
   v3 (Fase 3.7.b feedback Jorge): refactor completo a editor por SECCIONES.
   El cliente NO toca HTML nunca. Cada pagina legal se compone de N
   secciones predefinidas (titulo + contenido como texto plano). El sistema
   genera el HTML automaticamente al guardar combinando las secciones.
   - Secciones con auto:true reflejan datos de la tienda (no editables).
   - Cliente puede editar/borrar secciones no-auto y agregar custom.
   - Vista previa muestra el HTML compuesto en iframe sandbox.
   - Cero requirement de HTML knowledge.
   v2 (post-audit): srcdoc -> data:URL + tarea sanitize storefront. */

(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[legales.js] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.registerView('legales', renderLegales);
  });

  const TIPOS = ['garantias', 'tratamiento_datos', 'contacto'];
  const LABELS = {
    'garantias': 'Garantías',
    'tratamiento_datos': 'Tratamiento de datos',
    'contacto': 'Contacto',
  };

  // ============================================================
  // Estado
  // ============================================================
  const lstate = {
    templates: {},        // { tipo: { titulo, secciones_template: [...] } }
    paginas: {},          // { tipo: { id, titulo, secciones, ultima_actualiz } }
    tabActivo: 'garantias',
    editor: {             // { tipo: { titulo, secciones: [...] } }
      garantias: { titulo: '', secciones: [] },
      tratamiento_datos: { titulo: '', secciones: [] },
      contacto: { titulo: '', secciones: [] },
    },
    dirty: { garantias: false, tratamiento_datos: false, contacto: false },
    guardando: false,
    mostrandoPreview: false,
  };

  // ============================================================
  // Render principal
  // ============================================================
  async function renderLegales() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    view.innerHTML = '<div class="ta-card"><div class="ta-empty"><div class="ta-loader" style="width:32px;height:32px;margin:0 auto 12px;"></div><p class="ta-empty__text">Cargando paginas legales...</p></div></div>';

    try {
      await cargarData();
      view.innerHTML = renderHTML();
      wireEvents();
    } catch (e) {
      console.error('[legales] error', e);
      view.innerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">No pudimos cargar las paginas legales</h2><p class="ta-empty__text">' + T.escapeHtml(e.message || String(e)) + '</p></div></div>';
    }
  }

  async function cargarData() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;

    const [tplRes, pagRes] = await Promise.all([
      sb.from('tienda_paginas_legales_templates').select('tipo, titulo, contenido_html, secciones_template'),
      sb.from('paginas_legales').select('id, tipo, titulo, contenido_html, secciones, ultima_actualiz').eq('tienda_id', tienda.id),
    ]);
    if (tplRes.error) throw tplRes.error;
    if (pagRes.error) throw pagRes.error;

    lstate.templates = {};
    for (const r of tplRes.data || []) lstate.templates[r.tipo] = r;
    lstate.paginas = {};
    for (const r of pagRes.data || []) lstate.paginas[r.tipo] = r;

    for (const tipo of TIPOS) {
      const guardada = lstate.paginas[tipo];
      const tpl = lstate.templates[tipo];
      if (guardada && Array.isArray(guardada.secciones) && guardada.secciones.length > 0) {
        lstate.editor[tipo] = {
          titulo: guardada.titulo,
          secciones: guardada.secciones.map(s => ({ ...s })),
        };
      } else if (tpl) {
        lstate.editor[tipo] = {
          titulo: tpl.titulo,
          secciones: (tpl.secciones_template || []).map(s => ({ ...s })),
        };
      } else {
        lstate.editor[tipo] = { titulo: '', secciones: [] };
      }
      lstate.dirty[tipo] = false;
    }
  }

  // ============================================================
  // Placeholders
  // ============================================================
  function aplicarPlaceholders(texto, tienda) {
    const fechaPub = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const mapping = {
      '{{NOMBRE_NEGOCIO}}': tienda.nombre_negocio || tienda.nombre_legal || '',
      '{{NIT}}': tienda.nit || '',
      '{{DIRECCION}}': tienda.direccion || '',
      '{{CIUDAD}}': tienda.ciudad_negocio || '',
      '{{EMAIL_CONTACTO}}': tienda.email_contacto || '',
      '{{TELEFONO}}': tienda.telefono_contacto || '',
      '{{HORARIO_ATENCION}}': tienda.horario_atencion || '',
      '{{FECHA_PUBLICACION}}': fechaPub,
    };
    let out = String(texto || '');
    for (const k of Object.keys(mapping)) {
      out = out.split(k).join(mapping[k]);
    }
    return out;
  }

  function camposFaltantes() {
    const T = window.TiendaIA;
    const t = T.state.tienda;
    const falt = [];
    if (!t.nombre_negocio) falt.push('Nombre del negocio');
    if (!t.nit) falt.push('NIT');
    if (!t.direccion) falt.push('Direccion');
    if (!t.ciudad_negocio) falt.push('Ciudad');
    if (!t.email_contacto) falt.push('Email de contacto');
    if (!t.telefono_contacto) falt.push('Telefono');
    if (!t.horario_atencion) falt.push('Horario de atencion');
    return falt;
  }

  // ============================================================
  // HTML generation (texto plano -> HTML)
  // ============================================================
  // Convierte texto plano a HTML simple. Reglas:
  // - Lineas vacias separan parrafos
  // - Lineas que empiezan con "- " o "* " son items de lista
  // - El resto es <p>
  function textoAHtml(texto) {
    if (!texto) return '';
    const lineas = String(texto).replace(/\r\n/g, '\n').split('\n');
    const bloques = [];
    let buf = [];
    let enLista = false;
    let listaItems = [];

    function flushParrafo() {
      if (buf.length > 0) {
        bloques.push('<p>' + escHtml(buf.join(' ').trim()) + '</p>');
        buf = [];
      }
    }
    function flushLista() {
      if (listaItems.length > 0) {
        bloques.push('<ul>' + listaItems.map(it => '<li>' + escHtml(it) + '</li>').join('') + '</ul>');
        listaItems = [];
      }
    }

    for (const linea of lineas) {
      const trimmed = linea.trim();
      const esItem = /^[-*]\s+/.test(trimmed);
      if (trimmed === '') {
        flushParrafo();
        flushLista();
        enLista = false;
      } else if (esItem) {
        flushParrafo();
        enLista = true;
        listaItems.push(trimmed.replace(/^[-*]\s+/, ''));
      } else {
        if (enLista) {
          flushLista();
          enLista = false;
        }
        buf.push(trimmed);
      }
    }
    flushParrafo();
    flushLista();
    return bloques.join('\n');
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Genera el HTML completo de la pagina combinando todas las secciones
  function generarHtmlPagina(editor, tienda) {
    const titulo = aplicarPlaceholders(editor.titulo || '', tienda);
    let html = '<h1>' + escHtml(titulo) + '</h1>';
    for (const sec of editor.secciones) {
      const contenido = aplicarPlaceholders(sec.contenido || '', tienda);
      if (!contenido.trim() && !sec.auto) continue; // saltar secciones vacias no-auto
      const tituloSec = aplicarPlaceholders(sec.titulo || '', tienda);
      html += '<h2>' + escHtml(tituloSec) + '</h2>';
      html += textoAHtml(contenido);
    }
    return html;
  }

  // ============================================================
  // HTML del editor
  // ============================================================
  function renderHTML() {
    const T = window.TiendaIA;
    const tipo = lstate.tabActivo;
    const editor = lstate.editor[tipo] || { titulo: '', secciones: [] };
    const falt = camposFaltantes();
    const guardada = lstate.paginas[tipo];

    const tabs = TIPOS.map(t => {
      const d = lstate.dirty[t];
      const g = lstate.paginas[t];
      const dot = d
        ? '<span class="ta-legal-tab__dot" style="background:var(--ta-warn);" title="Cambios sin guardar"></span>'
        : (g ? '<span class="ta-legal-tab__dot" style="background:var(--ta-success);" title="Guardada"></span>' : '');
      return '<button type="button" class="ta-legal-tab' + (tipo === t ? ' is-active' : '') + '" data-tab="' + T.escapeHtml(t) + '">' +
        T.escapeHtml(LABELS[t]) + dot + '</button>';
    }).join('');

    const bannerFaltantes = falt.length > 0
      ? '<div class="ta-banner ta-banner--warn">' +
          '<div class="ta-banner__icon">⚠️</div>' +
          '<div class="ta-banner__body">' +
            '<strong>Faltan datos legales para que las paginas sean validas:</strong> ' +
            T.escapeHtml(falt.join(', ')) + '. ' +
            'Ve a <a href="#/configuracion">Configuracion</a> y completalos.' +
          '</div>' +
        '</div>'
      : '';

    return '' +
      '<header style="margin-bottom:20px;">' +
        '<h1 class="ta-section-title">Paginas legales</h1>' +
        '<p class="ta-section-sub">' +
          'Editor por secciones - sin necesidad de saber HTML. Cada pagina tiene secciones predefinidas con titulo y contenido. ' +
          'Puedes editar el texto, borrar secciones o agregar nuevas. El sistema arma la pagina final al guardar.' +
        '</p>' +
      '</header>' +

      bannerFaltantes +

      '<div class="ta-legal-tabs">' + tabs + '</div>' +

      '<div class="ta-card" style="padding:20px;">' +

        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">' +
          '<div>' +
            '<h2 style="margin:0 0 4px;font-size:17px;">' + T.escapeHtml(LABELS[tipo]) + '</h2>' +
            (guardada
              ? '<span style="font-size:12px;color:var(--ta-text-mut);">Ultima actualizacion: ' + T.escapeHtml(formatFecha(guardada.ultima_actualiz)) + '</span>'
              : '<span style="font-size:12px;color:var(--ta-warn);">No guardada todavia</span>') +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" id="leg-restaurar" class="ta-btn">⟲ Restaurar plantilla</button>' +
            '<button type="button" id="leg-preview-toggle" class="ta-btn">' + (lstate.mostrandoPreview ? '✏️ Volver al editor' : '👁️ Vista previa') + '</button>' +
            '<button type="button" id="leg-guardar" class="ta-btn ta-btn--primary"' + (lstate.dirty[tipo] ? '' : ' disabled') + '>' + (lstate.guardando ? 'Guardando...' : 'Guardar') + '</button>' +
          '</div>' +
        '</div>' +

        (lstate.mostrandoPreview ? renderPreview(editor) : renderEditorSecciones(editor)) +

      '</div>';
  }

  function renderEditorSecciones(editor) {
    const T = window.TiendaIA;
    const seccionesHtml = editor.secciones.map((sec, idx) => renderSeccionItem(sec, idx)).join('');
    return '' +
      '<div class="ta-field">' +
        '<label class="ta-field__label" for="leg-titulo">Titulo de la pagina</label>' +
        '<input id="leg-titulo" class="ta-input" type="text" maxlength="200" value="' + T.escapeHtml(editor.titulo) + '">' +
      '</div>' +

      '<div id="leg-secciones-list">' + seccionesHtml + '</div>' +

      '<div style="margin-top:12px;padding-top:14px;border-top:1px dashed var(--ta-border);">' +
        '<button type="button" id="leg-add-seccion" class="ta-btn">+ Agregar nueva seccion</button>' +
      '</div>';
  }

  function renderSeccionItem(sec, idx) {
    const T = window.TiendaIA;
    const auto = !!sec.auto;
    const tipo = lstate.tabActivo;
    const t = window.TiendaIA.state.tienda;
    // Si es auto, el contenido es read-only y se muestra el placeholder aplicado.
    const previewAuto = auto ? aplicarPlaceholders(sec.contenido || '', t) : '';

    return '' +
      '<div class="ta-legal-sec' + (auto ? ' ta-legal-sec--auto' : '') + '" data-idx="' + idx + '">' +
        '<div class="ta-legal-sec__head">' +
          '<input type="text" class="ta-input ta-legal-sec__titulo" data-field="titulo" maxlength="100" value="' + T.escapeHtml(sec.titulo || '') + '" placeholder="Titulo de la seccion"' + (auto ? ' readonly' : '') + '>' +
          (auto
            ? '<span class="ta-pill ta-pill--info" title="Esta seccion se llena automaticamente desde Configuracion">auto</span>'
            : '<button type="button" class="ta-btn ta-btn--xs ta-btn--danger" data-action="del-seccion" data-idx="' + idx + '">Eliminar</button>') +
        '</div>' +
        (auto
          ? '<div class="ta-legal-sec__auto">' +
              '<div style="white-space:pre-wrap;font-size:13px;color:var(--ta-text-soft);background:var(--ta-bg-soft);padding:10px 12px;border-radius:var(--ta-radius-sm);border:1px dashed var(--ta-border);">' +
                T.escapeHtml(previewAuto || '(falta llenar en Configuracion)') +
              '</div>' +
              '<span class="ta-field__hint">Editar en <a href="#/configuracion">Configuracion</a>.</span>' +
            '</div>'
          : '<textarea class="ta-textarea ta-legal-sec__contenido" data-field="contenido" rows="5" placeholder="Texto de esta seccion. Separa parrafos con linea vacia. Usa - al inicio para listas.">' +
              T.escapeHtml(sec.contenido || '') +
            '</textarea>') +
      '</div>';
  }

  function renderPreview(editor) {
    const T = window.TiendaIA;
    const tienda = T.state.tienda;
    const htmlPagina = generarHtmlPagina(editor, tienda);
    const wrapped = '<!doctype html><html><head><meta charset="utf-8"><style>' +
      'body{font-family:system-ui,sans-serif;color:#1a1a1a;background:#fff;padding:24px;line-height:1.6;max-width:780px;margin:0 auto;}' +
      'h1{font-size:26px;margin-top:0;color:#0a172a;}h2{font-size:18px;margin-top:28px;color:#1B4965;}' +
      'ul,ol{padding-left:22px;}p{margin:10px 0;}a{color:#0066ff;}' +
      '</style></head><body>' + htmlPagina + '</body></html>';
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(wrapped);
    return '<div class="ta-legal-preview-wrap">' +
      '<iframe class="ta-legal-preview" src="' + dataUrl + '" sandbox=""></iframe>' +
    '</div>';
  }

  function formatFecha(iso) {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return String(iso); }
  }

  // ============================================================
  // Wire events
  // ============================================================
  function wireEvents() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    // Tabs
    view.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nuevoTab = btn.getAttribute('data-tab');
        if (nuevoTab === lstate.tabActivo) return;
        if (lstate.mostrandoPreview) lstate.mostrandoPreview = false;
        lstate.tabActivo = nuevoTab;
        renderLegales();
      });
    });

    // Titulo de la pagina
    const inputTitulo = view.querySelector('#leg-titulo');
    if (inputTitulo) {
      inputTitulo.addEventListener('input', () => {
        const tipo = lstate.tabActivo;
        lstate.editor[tipo].titulo = inputTitulo.value;
        marcarDirty();
      });
    }

    // Inputs de secciones (titulo y contenido) - delegated
    view.querySelectorAll('.ta-legal-sec [data-field]').forEach(el => {
      el.addEventListener('input', () => {
        const sec = el.closest('.ta-legal-sec');
        const idx = parseInt(sec.getAttribute('data-idx'), 10);
        const field = el.getAttribute('data-field');
        const tipo = lstate.tabActivo;
        if (!lstate.editor[tipo].secciones[idx]) return;
        lstate.editor[tipo].secciones[idx][field] = el.value;
        marcarDirty();
      });
    });

    // Eliminar seccion
    view.querySelectorAll('[data-action="del-seccion"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const tipo = lstate.tabActivo;
        if (!window.confirm('Eliminar esta seccion?')) return;
        lstate.editor[tipo].secciones.splice(idx, 1);
        marcarDirty();
        renderLegales();
      });
    });

    // Agregar seccion nueva
    const btnAdd = view.querySelector('#leg-add-seccion');
    if (btnAdd) btnAdd.addEventListener('click', () => {
      const tipo = lstate.tabActivo;
      lstate.editor[tipo].secciones.push({ slug: 'custom_' + Date.now(), titulo: 'Nueva seccion', contenido: '' });
      marcarDirty();
      renderLegales();
    });

    // Botones
    const btnRestaurar = view.querySelector('#leg-restaurar');
    if (btnRestaurar) btnRestaurar.addEventListener('click', restaurarTemplate);
    const btnPreview = view.querySelector('#leg-preview-toggle');
    if (btnPreview) btnPreview.addEventListener('click', togglePreview);
    const btnGuardar = view.querySelector('#leg-guardar');
    if (btnGuardar) btnGuardar.addEventListener('click', guardar);

    // Nav guard - reset para no acumular
    if (T.state && Array.isArray(T.state.viewNavGuards)) T.state.viewNavGuards = [];
    T.registerNavGuard(() => {
      const hayDirty = Object.values(lstate.dirty).some(Boolean);
      if (!hayDirty) return true;
      return window.confirm('Tienes cambios sin guardar en alguna pagina legal. ¿Salir de todos modos?');
    });
  }

  function marcarDirty() {
    const tipo = lstate.tabActivo;
    lstate.dirty[tipo] = true;
    const btn = document.getElementById('leg-guardar');
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }

  // ============================================================
  // Acciones
  // ============================================================
  function restaurarTemplate() {
    const T = window.TiendaIA;
    const tipo = lstate.tabActivo;
    const tpl = lstate.templates[tipo];
    if (!tpl) { T.toast('No hay plantilla para este tipo.', 'error'); return; }
    if (!window.confirm('Esto reemplazara las secciones actuales con la plantilla base. Los cambios no guardados se perderan. ¿Continuar?')) return;
    lstate.editor[tipo] = {
      titulo: tpl.titulo,
      secciones: (tpl.secciones_template || []).map(s => ({ ...s })),
    };
    lstate.dirty[tipo] = true;
    renderLegales();
    T.toast('Plantilla restaurada.', 'success');
  }

  function togglePreview() {
    lstate.mostrandoPreview = !lstate.mostrandoPreview;
    renderLegales();
  }

  async function guardar() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const tipo = lstate.tabActivo;
    const editor = lstate.editor[tipo];

    if (!editor.titulo || !editor.titulo.trim()) { T.toast('El titulo es obligatorio.', 'error'); return; }
    if (!editor.secciones || editor.secciones.length === 0) { T.toast('Debe haber al menos una seccion.', 'error'); return; }
    if (lstate.guardando) return;

    lstate.guardando = true;
    const btn = document.getElementById('leg-guardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    // Generar HTML compuesto a partir de las secciones
    const contenido_html = generarHtmlPagina(editor, tienda);

    try {
      const guardada = lstate.paginas[tipo];
      let result;
      const patch = {
        titulo: editor.titulo,
        secciones: editor.secciones,
        contenido_html,
      };
      if (guardada) {
        result = await sb.from('paginas_legales')
          .update({ ...patch, ultima_actualiz: new Date().toISOString() })
          .eq('id', guardada.id).eq('tienda_id', tienda.id)
          .select().maybeSingle();
      } else {
        result = await sb.from('paginas_legales')
          .insert({ tienda_id: tienda.id, tipo, ...patch })
          .select().maybeSingle();
      }

      if (result.error) {
        console.error('[legales] save error', result.error);
        let msg = 'No pudimos guardar. Intenta de nuevo.';
        if (result.error.code === '23505') msg = 'Esta pagina ya existe. Refresca la vista.';
        T.toast(msg, 'error');
        lstate.guardando = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
        return;
      }
      if (guardada && result.data === null) {
        T.toast('No se pudo actualizar. Refresca la vista.', 'error');
        lstate.guardando = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
        return;
      }

      lstate.paginas[tipo] = result.data;
      lstate.dirty[tipo] = false;
      lstate.guardando = false;
      T.toast('Pagina guardada', 'success');
      renderLegales();
    } catch (e) {
      console.error('[legales] exception', e);
      T.toast('No pudimos guardar. Intenta de nuevo.', 'error');
      lstate.guardando = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    }
  }
})();
