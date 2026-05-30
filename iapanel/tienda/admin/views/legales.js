/* AIMMA · Tienda IA · views/legales.js · v2 · 2026-05-30
   v2 (post-audit): 2 HIGH fixes
   - HIGH #1: XSS diferido en storefront publico documentado como TASK CRITICA
     Fase 4 (#43). El preview en panel ya esta aislado con iframe sandbox vacio.
     El storefront publico (Fase 4) DEBE usar DOMPurify al renderear estos
     HTMLs. El cliente puede guardar <script>/<img onerror> que afectaria
     a visitantes futuros. Allowlist: h1-h3, p, ul/ol/li, strong, a, code.
   - HIGH #2: srcdoc rompia con comillas en HTML del cliente porque escapeHtml
     convierte " a &quot; y srcdoc lo decodifica rompiendo el atributo.
     Migrado a data:text/html con encodeURIComponent que preserva integro.
   Fase 3.7 - Editor de paginas legales (Garantias / Tratamiento de datos / Contacto).
   - Templates base en tabla tienda_paginas_legales_templates (3 filas con
     placeholders {{NOMBRE_NEGOCIO}}, {{NIT}}, {{DIRECCION}}, etc.).
   - Paginas guardadas en paginas_legales (UPSERT por tienda_id + tipo).
   - Al cargar template, reemplaza placeholders con datos de la tienda.
   - Banner si faltan datos legales con link a #/configuracion. */

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
    templates: {},        // por tipo: { titulo, contenido_html }
    paginas: {},          // por tipo: { id, titulo, contenido_html, ultima_actualiz }
    tabActivo: 'garantias',
    editor: {             // contenido del editor por tipo
      garantias: { titulo: '', contenido_html: '' },
      tratamiento_datos: { titulo: '', contenido_html: '' },
      contacto: { titulo: '', contenido_html: '' },
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
      sb.from('tienda_paginas_legales_templates').select('tipo, titulo, contenido_html'),
      sb.from('paginas_legales').select('id, tipo, titulo, contenido_html, ultima_actualiz').eq('tienda_id', tienda.id),
    ]);
    if (tplRes.error) throw tplRes.error;
    if (pagRes.error) throw pagRes.error;

    lstate.templates = {};
    for (const r of tplRes.data || []) lstate.templates[r.tipo] = r;
    lstate.paginas = {};
    for (const r of pagRes.data || []) lstate.paginas[r.tipo] = r;

    // Inicializar el editor con lo que ya existe en BD, sino con template renderizado.
    for (const tipo of TIPOS) {
      const guardada = lstate.paginas[tipo];
      const tpl = lstate.templates[tipo];
      if (guardada) {
        lstate.editor[tipo] = { titulo: guardada.titulo, contenido_html: guardada.contenido_html };
      } else if (tpl) {
        lstate.editor[tipo] = {
          titulo: tpl.titulo,
          contenido_html: aplicarPlaceholders(tpl.contenido_html, tienda),
        };
      } else {
        lstate.editor[tipo] = { titulo: '', contenido_html: '' };
      }
      lstate.dirty[tipo] = false;
    }
  }

  // ============================================================
  // Placeholders
  // ============================================================
  function aplicarPlaceholders(html, tienda) {
    const fechaPub = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const mapping = {
      '{{NOMBRE_NEGOCIO}}': tienda.nombre_negocio || tienda.nombre_legal || '',
      '{{NIT}}': tienda.nit || '',
      '{{DIRECCION}}': tienda.direccion || '',
      '{{CIUDAD}}': tienda.ciudad_negocio || '',
      '{{EMAIL_CONTACTO}}': tienda.email_contacto || '',
      '{{TELEFONO}}': tienda.telefono_contacto || '',
      '{{FECHA_PUBLICACION}}': fechaPub,
    };
    let out = String(html || '');
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
    return falt;
  }

  // ============================================================
  // HTML
  // ============================================================
  function renderHTML() {
    const T = window.TiendaIA;
    const tipo = lstate.tabActivo;
    const editor = lstate.editor[tipo] || { titulo: '', contenido_html: '' };
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
            'Ve a <a href="#/configuracion">Configuracion</a> y completa la seccion "Datos legales" antes de guardar.' +
          '</div>' +
        '</div>'
      : '';

    return '' +
      '<header style="margin-bottom:20px;">' +
        '<h1 class="ta-section-title">Paginas legales</h1>' +
        '<p class="ta-section-sub">' +
          'Estas paginas son obligatorias en Colombia (Ley 1581 + Estatuto del Consumidor). ' +
          'Cada plantilla viene pre-redactada con tus datos. Editala si necesitas y guarda.' +
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

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="leg-titulo">Titulo de la pagina</label>' +
          '<input id="leg-titulo" class="ta-input" type="text" maxlength="200" value="' + T.escapeHtml(editor.titulo) + '">' +
        '</div>' +

        (lstate.mostrandoPreview
          ? renderPreview(editor.contenido_html)
          : '<div class="ta-field">' +
              '<label class="ta-field__label" for="leg-html">Contenido HTML</label>' +
              '<textarea id="leg-html" class="ta-textarea" rows="22" style="font-family:\'JetBrains Mono\',monospace;font-size:12px;line-height:1.5;">' +
                T.escapeHtml(editor.contenido_html) +
              '</textarea>' +
              '<span class="ta-field__hint">Puedes usar HTML basico: &lt;h1&gt;, &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt;. Las paginas se muestran tal cual en tu tienda publica.</span>' +
            '</div>') +
      '</div>';
  }

  function renderPreview(html) {
    // v2 BUG #2 fix: usar data: URL en lugar de srcdoc para evitar el bug de
    // double-escape. escapeHtml convierte " a &quot; y al insertarlo en
    // srcdoc="..." el browser lo decodifica rompiendo el atributo cuando el
    // HTML del cliente contiene comillas (ej. <a href="...">).
    // data: URL con encodeURIComponent mantiene el HTML integro.
    const wrapped = '<!doctype html><html><head><meta charset="utf-8"><style>' +
      'body{font-family:system-ui,sans-serif;color:#1a1a1a;background:#fff;padding:24px;line-height:1.6;}' +
      'h1{font-size:24px;margin-top:0;}h2{font-size:18px;margin-top:24px;}' +
      'ul,ol{padding-left:22px;}p{margin:12px 0;}a{color:#0066ff;}' +
      'code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:13px;}' +
      '</style></head><body>' + html + '</body></html>';
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
        // Si estamos en preview, salir al editor antes de cambiar tab
        if (lstate.mostrandoPreview) lstate.mostrandoPreview = false;
        lstate.tabActivo = nuevoTab;
        renderLegales();
      });
    });

    // Editor inputs
    const inputTitulo = view.querySelector('#leg-titulo');
    if (inputTitulo) {
      inputTitulo.addEventListener('input', () => {
        const tipo = lstate.tabActivo;
        lstate.editor[tipo].titulo = inputTitulo.value;
        lstate.dirty[tipo] = true;
        actualizarBotonGuardar();
      });
    }
    const textareaHtml = view.querySelector('#leg-html');
    if (textareaHtml) {
      textareaHtml.addEventListener('input', () => {
        const tipo = lstate.tabActivo;
        lstate.editor[tipo].contenido_html = textareaHtml.value;
        lstate.dirty[tipo] = true;
        actualizarBotonGuardar();
      });
    }

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

  function actualizarBotonGuardar() {
    const btn = document.getElementById('leg-guardar');
    if (!btn) return;
    btn.disabled = !lstate.dirty[lstate.tabActivo] || lstate.guardando;
    btn.textContent = lstate.guardando ? 'Guardando...' : 'Guardar';
    // Tambien actualizar el dot de la tab activa
    const tab = document.querySelector('[data-tab="' + lstate.tabActivo + '"]');
    if (tab) {
      let dot = tab.querySelector('.ta-legal-tab__dot');
      if (lstate.dirty[lstate.tabActivo] && !dot) {
        dot = document.createElement('span');
        dot.className = 'ta-legal-tab__dot';
        dot.style.background = 'var(--ta-warn)';
        tab.appendChild(dot);
      } else if (lstate.dirty[lstate.tabActivo] && dot) {
        dot.style.background = 'var(--ta-warn)';
      }
    }
  }

  // ============================================================
  // Acciones
  // ============================================================
  function restaurarTemplate() {
    const T = window.TiendaIA;
    const tipo = lstate.tabActivo;
    const tpl = lstate.templates[tipo];
    if (!tpl) { T.toast('No hay plantilla disponible para este tipo.', 'error'); return; }
    const editor = lstate.editor[tipo];
    const tieneCambios = lstate.dirty[tipo] || (editor.contenido_html && editor.contenido_html.length > 0);
    if (tieneCambios && !window.confirm('Esto reemplazara el contenido actual con la plantilla base + tus datos legales. Los cambios no guardados se perderan. ¿Continuar?')) return;

    const tienda = T.state.tienda;
    lstate.editor[tipo] = {
      titulo: tpl.titulo,
      contenido_html: aplicarPlaceholders(tpl.contenido_html, tienda),
    };
    lstate.dirty[tipo] = true;
    renderLegales();
    T.toast('Plantilla restaurada con tus datos actuales.', 'success');
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
    if (!editor.contenido_html || !editor.contenido_html.trim()) { T.toast('El contenido no puede estar vacio.', 'error'); return; }
    if (lstate.guardando) return;

    lstate.guardando = true;
    actualizarBotonGuardar();

    try {
      const guardada = lstate.paginas[tipo];
      let result;
      if (guardada) {
        result = await sb.from('paginas_legales')
          .update({ titulo: editor.titulo, contenido_html: editor.contenido_html, ultima_actualiz: new Date().toISOString() })
          .eq('id', guardada.id).eq('tienda_id', tienda.id)
          .select().maybeSingle();
      } else {
        result = await sb.from('paginas_legales')
          .insert({ tienda_id: tienda.id, tipo, titulo: editor.titulo, contenido_html: editor.contenido_html })
          .select().maybeSingle();
      }

      if (result.error) {
        console.error('[legales] save error', result.error);
        let msg = 'No pudimos guardar la pagina. Intenta de nuevo.';
        if (result.error.code === '23505') msg = 'Esta pagina ya existe. Refresca la vista e intenta de nuevo.';
        T.toast(msg, 'error');
        lstate.guardando = false;
        actualizarBotonGuardar();
        return;
      }
      if (guardada && result.data === null) {
        T.toast('No se pudo actualizar. Refresca la vista.', 'error');
        lstate.guardando = false;
        actualizarBotonGuardar();
        return;
      }

      lstate.paginas[tipo] = result.data;
      lstate.dirty[tipo] = false;
      lstate.guardando = false;
      T.toast('Pagina guardada', 'success');
      renderLegales();
    } catch (e) {
      console.error('[legales] exception', e);
      T.toast('No pudimos guardar la pagina. Intenta de nuevo.', 'error');
      lstate.guardando = false;
      actualizarBotonGuardar();
    }
  }
})();
