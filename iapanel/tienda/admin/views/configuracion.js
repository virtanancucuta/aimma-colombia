/* AIMMA · Tienda IA · views/configuracion.js · v5 · 2026-06-05
   v5 (Tema global): Consolida theming en el panel de Tema del editor.
   - Quita el <select> de paleta + swatches de la seccion Plantilla y paleta.
   - El paleta_id se sigue enviando en el patch (backward-compat con fallback
     de storefront cuando no hay theme.colors). Se trackea internamente en
     cstate.paletaIdSel: al cambiar plantilla, se auto-selecciona la primera
     paleta de esa plantilla (sin select visible) y se avisa al usuario que
     puede ajustar colores en el editor de Tema.
   - Agrega link "Editar colores y fuentes" -> #/editor.
   - Elimina renderSwatchesHTML y refreshSwatchesBox (sin uso).
   v4 (Fase 4 #41 SSL auto): al pasar estado a "publicada" por primera vez,
   guardar() invoca la EF tienda-publicar-subdominio ANTES del UPDATE para
   crear <slug>.tienda.aimma.com.co en Easypanel. Si la EF falla, abortamos
   el cambio de estado y mostramos toast con el detalle. Idempotente: si la
   tienda ya tiene subdominio_publicado_at, saltamos la EF (re-publicar o
   pasar de pausada a publicada no reprovisiona).
   v3 (Fase 3.7.b): nuevo campo "Horario de atencion" (textarea max 300).
   Persiste en tiendas.horario_atencion y se usa como placeholder
   {{HORARIO_ATENCION}} en la pagina legal de Contacto.
   v2 (post-audit): 3 HIGH fixes
   - HIGH #1: removido SVG de allowed_logo_types (bucket lo rechaza + riesgo
     XSS embebido en SVG servido desde bucket publico).
   - HIGH #2: cascade plantilla->paleta ahora selecciona explicitamente la
     primera paleta + toast informativo. Antes guardaba paleta_id=null silencioso.
   - HIGH #3: reset state.viewNavGuards=[] al inicio de wireEvents para no
     acumular confirms apilados en re-renders (descartar/save/logo upload).
   Fase 3.6 - Vista Configuracion. Permite al cliente editar:
   - Datos del negocio: nombre, logo, WhatsApp dueño, idioma, mostrar agotados.
   - Datos legales: nombre legal, NIT, direccion, ciudad, email, telefono.
     Estos campos alimentan los placeholders de paginas legales (Fase 3.7).
   - Plantilla y paleta: cambiar las elegidas en el wizard.
   - Estado de la tienda: borrador / publicada / pausada. */

(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[configuracion.js] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.registerView('configuracion', renderConfiguracion);
  });

  // ============================================================
  // Estado
  // ============================================================
  const cstate = {
    plantillas: [],
    paletas: [],
    paletaIdSel: null,
    dirty: false,
    guardando: false,
    subiendoLogo: false,
  };

  // safe helpers heredados (XSS y CSS injection)
  const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  function safeColor(v, fb) { return (typeof v === 'string' && HEX_COLOR_RE.test(v.trim())) ? v.trim() : (fb || '#888'); }
  function safeImgUrl(url) {
    if (!url) return null;
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? url : null; } catch { return null; }
  }

  // v2 HIGH #1 fix: SVG removido. El bucket tienda-productos NO acepta svg+xml
  // y ademas SVG puede ejecutar scripts embebidos si se sirve desde bucket
  // publico sin sanitizacion.
  const ALLOWED_LOGO_TYPES = ['image/jpeg','image/png','image/webp'];
  const ALLOWED_LOGO_EXTS = ['jpg','jpeg','png','webp'];
  const MAX_LOGO_MB = 2;

  // ============================================================
  // Render principal
  // ============================================================
  async function renderConfiguracion() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    view.innerHTML = '<div class="ta-card"><div class="ta-empty"><div class="ta-loader" style="width:32px;height:32px;margin:0 auto 12px;"></div><p class="ta-empty__text">Cargando configuracion...</p></div></div>';

    try {
      await cargarCatalogos();
      view.innerHTML = renderHTML();
      wireEvents();
    } catch (e) {
      console.error('[configuracion] error', e);
      view.innerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">No pudimos cargar la configuracion</h2><p class="ta-empty__text">' + T.escapeHtml(e.message || String(e)) + '</p></div></div>';
    }
  }

  async function cargarCatalogos() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const [plRes, paRes] = await Promise.all([
      sb.from('plantillas').select('id, slug, nombre, descripcion, orden').eq('activa', true).order('orden'),
      sb.from('paletas').select('id, plantilla_id, slug, nombre, color_primary, color_accent, color_text_base, color_bg_base, orden').order('orden'),
    ]);
    if (plRes.error) throw plRes.error;
    if (paRes.error) throw paRes.error;
    cstate.plantillas = plRes.data || [];
    cstate.paletas = paRes.data || [];
    cstate.dirty = false;
  }

  // ============================================================
  // HTML
  // ============================================================
  function renderHTML() {
    const T = window.TiendaIA;
    const t = T.state.tienda;

    return '' +
      '<header style="margin-bottom:24px;">' +
        '<h1 class="ta-section-title">Configuracion</h1>' +
        '<p class="ta-section-sub">' +
          'Datos del negocio, plantilla, paleta, datos legales (usados en las paginas de garantias, tratamiento de datos y contacto) y estado de la tienda.' +
        '</p>' +
      '</header>' +

      '<div class="ta-cfg-grid">' +
        renderSeccionDatosNegocio(t) +
        renderSeccionPlantillaPaleta(t) +
        renderSeccionDatosLegales(t) +
        renderSeccionEstado(t) +
      '</div>' +

      '<div id="cfg-save-bar" class="ta-cfg-save-bar" hidden>' +
        '<span class="ta-cfg-save-bar__msg">Tienes cambios sin guardar.</span>' +
        '<button type="button" id="cfg-descartar" class="ta-btn">Descartar</button>' +
        '<button type="button" id="cfg-guardar" class="ta-btn ta-btn--primary">Guardar cambios</button>' +
      '</div>';
  }

  function renderSeccionDatosNegocio(t) {
    const T = window.TiendaIA;
    const logoOk = safeImgUrl(t.logo_url);
    return '' +
      '<section class="ta-card ta-cfg-section">' +
        '<h2 class="ta-cfg-section__h">Datos del negocio</h2>' +

        '<div class="ta-cfg-logo-row">' +
          '<div class="ta-cfg-logo-preview">' +
            (logoOk
              ? '<img src="' + T.escapeHtml(logoOk) + '" alt="Logo" />'
              : '<div class="ta-cfg-logo-empty">🏷️</div>') +
          '</div>' +
          '<div style="flex:1;">' +
            '<div class="ta-field__label">Logo de la tienda</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
              '<button type="button" id="cfg-logo-subir" class="ta-btn">Subir logo</button>' +
              (logoOk ? '<button type="button" id="cfg-logo-quitar" class="ta-btn ta-btn--danger">Quitar</button>' : '') +
            '</div>' +
            '<span class="ta-field__hint">JPG, PNG o WebP. Maximo ' + MAX_LOGO_MB + 'MB. Aparece en el header de tu tienda.</span>' +
          '</div>' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="cfg-nombre">Nombre del negocio *</label>' +
          '<input id="cfg-nombre" class="ta-input" type="text" required maxlength="100" value="' + T.escapeHtml(t.nombre_negocio || '') + '">' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="cfg-whatsapp">WhatsApp del dueño *</label>' +
          '<input id="cfg-whatsapp" class="ta-input" type="tel" required maxlength="20" value="' + T.escapeHtml(t.whatsapp_dueno || '') + '" placeholder="ej. +57 3001234567">' +
          '<span class="ta-field__hint">Numero al que llegan los pedidos por WhatsApp. Incluye codigo de pais.</span>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="cfg-idioma">Idioma</label>' +
            '<select id="cfg-idioma" class="ta-select">' +
              '<option value="es"' + (t.idioma === 'es' || !t.idioma ? ' selected' : '') + '>Español</option>' +
            '</select>' +
            '<span class="ta-field__hint">Por ahora solo español. Multi-idioma en Fase 2.</span>' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="cfg-agotados">Productos agotados</label>' +
            '<select id="cfg-agotados" class="ta-select">' +
              '<option value="ocultar"' + (t.mostrar_agotados === 'ocultar' || !t.mostrar_agotados ? ' selected' : '') + '>Ocultar de la tienda</option>' +
              '<option value="mostrar_con_consultar"' + (t.mostrar_agotados === 'mostrar_con_consultar' ? ' selected' : '') + '>Mostrar con boton "Consultar"</option>' +
            '</select>' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="cfg-buscador-header">Buscador en el encabezado</label>' +
            '<label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">' +
              '<input type="checkbox" id="cfg-buscador-header"' + (t.mostrar_buscador_header === false ? '' : ' checked') + ' />' +
              '<span>Mostrar el buscador (lupa) en el encabezado de la tienda</span>' +
            '</label>' +
            '<span class="ta-field__hint">Si lo apagas, el encabezado no muestra el buscador (la pagina /buscar sigue disponible).</span>' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="cfg-hover-segunda-foto">Segunda foto al pasar el mouse</label>' +
            '<label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">' +
              '<input type="checkbox" id="cfg-hover-segunda-foto"' + (t.hover_segunda_foto === false ? '' : ' checked') + ' />' +
              '<span>En el catalogo, al pasar el mouse sobre un producto se muestra su segunda foto</span>' +
            '</label>' +
            '<span class="ta-field__hint">Solo aplica a productos con una segunda foto en su galeria. Si lo apagas, siempre se ve la foto principal.</span>' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="cfg-resenas-productos">Reseñas en los productos</label>' +
            '<label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">' +
              '<input type="checkbox" id="cfg-resenas-productos"' + (t.mostrar_resenas_productos === false ? '' : ' checked') + ' />' +
              '<span>Mostrar la seccion de reseñas en la pagina de cada producto</span>' +
            '</label>' +
            '<span class="ta-field__hint">Si lo apagas, los productos no muestran reseñas ni el formulario para dejarlas. Las reseñas se moderan en la seccion Reseñas.</span>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  function renderSeccionPlantillaPaleta(t) {
    const T = window.TiendaIA;
    // v5: inicializar paletaIdSel al valor actual de la tienda en cada render.
    cstate.paletaIdSel = t.paleta_id || null;

    const plantilla = cstate.plantillas.find(p => p.id === t.plantilla_id);

    const opcionesPlantilla = cstate.plantillas.map(p =>
      '<option value="' + T.escapeHtml(p.id) + '"' + (t.plantilla_id === p.id ? ' selected' : '') + '>' + T.escapeHtml(p.nombre) + '</option>'
    ).join('');

    return '' +
      '<section class="ta-card ta-cfg-section">' +
        '<h2 class="ta-cfg-section__h">Plantilla y colores</h2>' +
        '<p class="ta-cfg-section__desc">Define el look de tu tienda. Puedes cambiarla cuando quieras sin perder productos.</p>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="cfg-plantilla">Plantilla actual</label>' +
          '<select id="cfg-plantilla" class="ta-select">' + opcionesPlantilla + '</select>' +
          (plantilla ? '<span class="ta-field__hint">' + T.escapeHtml(plantilla.descripcion || '') + '</span>' : '') +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label">Colores y tipografia</label>' +
          '<p class="ta-cfg-section__desc" style="margin:4px 0 8px;">La paleta de colores y la tipografia de tu tienda se editan en el editor de Tema, con vista previa en vivo.</p>' +
          '<a href="#/editor" class="ta-btn ta-btn--primary">Editar colores y fuentes</a>' +
        '</div>' +

        '<div style="margin-top:8px;">' +
          '<a href="#/vista-previa" class="ta-btn">Ver vista previa</a>' +
        '</div>' +
      '</section>';
  }

  function renderSeccionDatosLegales(t) {
    const T = window.TiendaIA;
    return '' +
      '<section class="ta-card ta-cfg-section">' +
        '<h2 class="ta-cfg-section__h">Datos legales</h2>' +
        '<p class="ta-cfg-section__desc">Aparecen en las paginas de garantias, tratamiento de datos y contacto. Tambien en el footer y en el mensaje de WhatsApp del checkout.</p>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="cfg-razon-social">Razon social (nombre legal)</label>' +
          '<input id="cfg-razon-social" class="ta-input" type="text" maxlength="150" value="' + T.escapeHtml(t.nombre_legal || '') + '" placeholder="ej. Industrias Maraldo S.A.S.">' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="cfg-nit">NIT</label>' +
            '<input id="cfg-nit" class="ta-input" type="text" maxlength="20" value="' + T.escapeHtml(t.nit || '') + '" placeholder="ej. 900123456-7">' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="cfg-telefono">Telefono fijo / contacto</label>' +
            '<input id="cfg-telefono" class="ta-input" type="tel" maxlength="20" value="' + T.escapeHtml(t.telefono_contacto || '') + '" placeholder="ej. 604 1234567">' +
          '</div>' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="cfg-direccion">Direccion</label>' +
          '<input id="cfg-direccion" class="ta-input" type="text" maxlength="200" value="' + T.escapeHtml(t.direccion || '') + '" placeholder="ej. Carrera 50 # 30-25">' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="cfg-ciudad">Ciudad</label>' +
            '<input id="cfg-ciudad" class="ta-input" type="text" maxlength="60" value="' + T.escapeHtml(t.ciudad_negocio || '') + '" placeholder="ej. Medellin">' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="cfg-email">Email de contacto</label>' +
            '<input id="cfg-email" class="ta-input" type="email" maxlength="100" value="' + T.escapeHtml(t.email_contacto || '') + '" placeholder="ej. contacto@tu-tienda.co">' +
          '</div>' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="cfg-horario">Horario de atencion</label>' +
          '<textarea id="cfg-horario" class="ta-textarea" rows="3" maxlength="300" placeholder="ej.&#10;Lunes a viernes: 8:00 AM - 6:00 PM&#10;Sabados: 9:00 AM - 1:00 PM&#10;Domingos y festivos: cerrado">' + T.escapeHtml(t.horario_atencion || '') + '</textarea>' +
          '<span class="ta-field__hint">Aparece en la pagina de Contacto. Una linea por dia o turno.</span>' +
        '</div>' +
      '</section>';
  }

  function renderSeccionEstado(t) {
    const estados = [
      { v: 'borrador',  label: 'Borrador',  desc: 'Tu tienda no es visible al publico. Sigues editando.', cls: 'ta-pill--info' },
      { v: 'publicada', label: 'Publicada', desc: 'Tu tienda es visible y tus clientes pueden hacer pedidos.', cls: 'ta-pill--ok' },
      { v: 'pausada',   label: 'Pausada',   desc: 'Mostramos un mensaje "volveremos pronto" a los visitantes.', cls: 'ta-pill--warn' },
    ];
    const T = window.TiendaIA;
    return '' +
      '<section class="ta-card ta-cfg-section">' +
        '<h2 class="ta-cfg-section__h">Estado de la tienda</h2>' +
        '<div class="ta-cfg-estados">' +
          estados.map(e =>
            '<label class="ta-cfg-estado' + (t.estado === e.v ? ' is-active' : '') + '">' +
              '<input type="radio" name="cfg-estado" value="' + e.v + '"' + (t.estado === e.v ? ' checked' : '') + '>' +
              '<span class="ta-cfg-estado__head">' +
                '<span class="ta-pill ' + e.cls + '" style="margin-left:0;">' + T.escapeHtml(e.label) + '</span>' +
              '</span>' +
              '<span class="ta-cfg-estado__desc">' + T.escapeHtml(e.desc) + '</span>' +
            '</label>'
          ).join('') +
        '</div>' +
      '</section>';
  }

  // ============================================================
  // Wire
  // ============================================================
  function wireEvents() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    // Track dirty en cualquier input/select/radio
    view.querySelectorAll('input, select').forEach(el => {
      if (el.id === 'cfg-guardar' || el.id === 'cfg-descartar') return;
      el.addEventListener('input', marcarDirty);
      el.addEventListener('change', marcarDirty);
    });

    // Cascade plantilla -> paleta (interno, sin select visible)
    // v5: el select de paleta fue retirado del DOM. Se trackea la paleta_id
    // internamente en cstate.paletaIdSel para seguir mandando paleta_id en
    // el patch (backward-compat con fallback de color del storefront).
    // v2 HIGH #2 fix preservado: se auto-selecciona la primera paleta de la
    // nueva plantilla y se avisa al usuario.
    const selPlantilla = view.querySelector('#cfg-plantilla');
    if (selPlantilla) {
      selPlantilla.addEventListener('change', () => {
        const plantillaId = selPlantilla.value;
        const paletasFiltradas = cstate.paletas.filter(p => p.plantilla_id === plantillaId);
        if (paletasFiltradas.length === 0) {
          cstate.paletaIdSel = null;
          T.toast('Esta plantilla no tiene paletas configuradas todavia.', 'error');
        } else {
          cstate.paletaIdSel = paletasFiltradas[0].id;
          T.toast('Colores base actualizados para la nueva plantilla. Ajustalos en el editor de Tema.', 'success');
        }
        marcarDirty();
      });
    }

    // Estado radio: highlight visual del seleccionado
    view.querySelectorAll('input[name="cfg-estado"]').forEach(r => {
      r.addEventListener('change', () => {
        view.querySelectorAll('.ta-cfg-estado').forEach(l => l.classList.remove('is-active'));
        const label = r.closest('.ta-cfg-estado');
        if (label) label.classList.add('is-active');
        marcarDirty();
      });
    });

    // Logo: subir
    const btnSubir = view.querySelector('#cfg-logo-subir');
    if (btnSubir) btnSubir.addEventListener('click', subirLogo);
    const btnQuitar = view.querySelector('#cfg-logo-quitar');
    if (btnQuitar) btnQuitar.addEventListener('click', quitarLogo);

    // Save bar
    const btnGuardar = view.querySelector('#cfg-guardar');
    if (btnGuardar) btnGuardar.addEventListener('click', guardar);
    const btnDescartar = view.querySelector('#cfg-descartar');
    if (btnDescartar) btnDescartar.addEventListener('click', descartar);

    // v2 HIGH #3 fix: reset navGuards del view en cada wire para no acumular.
    // renderConfiguracion se llama multiples veces (descartar, save success,
    // logo upload, etc) y cada wireEvents agregaba un guard nuevo.
    if (T.state && Array.isArray(T.state.viewNavGuards)) T.state.viewNavGuards = [];
    T.registerNavGuard(() => {
      if (!cstate.dirty) return true;
      return window.confirm('Tienes cambios sin guardar en la configuracion. ¿Salir de todos modos?');
    });
  }

  function marcarDirty() {
    cstate.dirty = true;
    const bar = document.getElementById('cfg-save-bar');
    if (bar) bar.hidden = false;
  }

  function descartar() {
    if (!cstate.dirty) return;
    if (!window.confirm('Descartar los cambios sin guardar?')) return;
    cstate.dirty = false;
    renderConfiguracion();
  }

  // ============================================================
  // Logo upload
  // ============================================================
  function subirLogo() {
    if (cstate.subiendoLogo) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ALLOWED_LOGO_TYPES.join(',');
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await handleLogoUpload(file);
    };
    input.click();
  }

  async function handleLogoUpload(file) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) { T.toast('Tipo de archivo no permitido. Usa JPG, PNG o WebP.', 'error'); return; }
    if (file.size > MAX_LOGO_MB * 1024 * 1024) { T.toast('El logo es muy grande. Maximo ' + MAX_LOGO_MB + 'MB.', 'error'); return; }

    cstate.subiendoLogo = true;
    T.toast('Subiendo logo...');

    try {
      const rawExt = (file.name.split('.').pop() || '').toLowerCase();
      const ext = ALLOWED_LOGO_EXTS.includes(rawExt) ? rawExt : 'png';
      const ts = Date.now();
      // Reuso del bucket tienda-productos con path /logo/ para no crear bucket nuevo.
      const path = tienda.id + '/logo/logo-' + ts + '.' + ext;
      const up = await sb.storage.from('tienda-productos').upload(path, file, { upsert: true, cacheControl: '3600' });
      if (up.error) {
        T.toast('Error al subir: ' + up.error.message, 'error');
        return;
      }
      const { data: pub } = sb.storage.from('tienda-productos').getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      // Persistir directo en BD (es una accion atomica, no espera Guardar)
      const upd = await sb.from('tiendas').update({ logo_url: publicUrl }).eq('id', tienda.id);
      if (upd.error) {
        T.toast('Logo subido pero no se pudo asociar: ' + upd.error.message, 'error');
        return;
      }
      tienda.logo_url = publicUrl;
      T.state.tienda.logo_url = publicUrl;
      T.toast('Logo actualizado', 'success');
      renderConfiguracion();
    } catch (e) {
      console.error('[logo] exception', e);
      T.toast('Error: ' + (e.message || e), 'error');
    } finally {
      cstate.subiendoLogo = false;
    }
  }

  async function quitarLogo() {
    const T = window.TiendaIA;
    if (!window.confirm('Quitar el logo?')) return;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    try {
      const upd = await sb.from('tiendas').update({ logo_url: null }).eq('id', tienda.id);
      if (upd.error) { T.toast('Error al quitar: ' + upd.error.message, 'error'); return; }
      tienda.logo_url = null;
      T.state.tienda.logo_url = null;
      T.toast('Logo quitado', 'success');
      renderConfiguracion();
    } catch (e) {
      T.toast('Error: ' + (e.message || e), 'error');
    }
  }

  // ============================================================
  // Guardar
  // ============================================================
  async function guardar() {
    const T = window.TiendaIA;
    if (cstate.guardando) return;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const view = T.dom.mainView;

    const nombre = view.querySelector('#cfg-nombre').value.trim();
    const whatsapp = view.querySelector('#cfg-whatsapp').value.trim();
    const idioma = view.querySelector('#cfg-idioma').value;
    const mostrarAgotados = view.querySelector('#cfg-agotados').value;
    const mostrarBuscadorHeader = view.querySelector('#cfg-buscador-header').checked;
    const hoverSegundaFoto = view.querySelector('#cfg-hover-segunda-foto').checked;
    const mostrarResenasProductos = view.querySelector('#cfg-resenas-productos').checked;
    const plantillaId = view.querySelector('#cfg-plantilla').value;
    // v5: paletaId se lee del estado interno (no del DOM — el select fue retirado).
    const paletaId = cstate.paletaIdSel || tienda.paleta_id || null;

    const nombreLegal = view.querySelector('#cfg-razon-social').value.trim();
    const nit = view.querySelector('#cfg-nit').value.trim();
    const telefono = view.querySelector('#cfg-telefono').value.trim();
    const direccion = view.querySelector('#cfg-direccion').value.trim();
    const ciudad = view.querySelector('#cfg-ciudad').value.trim();
    const email = view.querySelector('#cfg-email').value.trim();
    const horario = view.querySelector('#cfg-horario').value.trim();

    const estadoRadio = view.querySelector('input[name="cfg-estado"]:checked');
    const estado = estadoRadio ? estadoRadio.value : tienda.estado;

    // Validaciones cliente
    if (!nombre) { T.toast('El nombre del negocio es obligatorio.', 'error'); return; }
    if (!whatsapp) { T.toast('El WhatsApp del dueño es obligatorio.', 'error'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { T.toast('Email de contacto invalido.', 'error'); return; }

    // No publicar sin plantilla/paleta
    if (estado === 'publicada' && (!plantillaId || !paletaId)) {
      T.toast('Para publicar necesitas elegir plantilla y paleta primero.', 'error');
      return;
    }

    cstate.guardando = true;
    const btn = document.getElementById('cfg-guardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    // v4 Fase 4 #41: si estamos publicando por PRIMERA vez (subdominio_publicado_at NULL)
    // creamos el subdominio en Easypanel via EF antes de tocar BD. Si la EF falla,
    // abortamos el cambio de estado para no dejar la tienda "publicada" sin URL real.
    let resultadoPublicacion = null;
    if (estado === 'publicada' && !tienda.subdominio_publicado_at) {
      try {
        if (btn) btn.textContent = 'Publicando tienda...';
        T.toast('Creando dominio publico de tu tienda...');
        const { data: epData, error: epErr } = await sb.functions.invoke('tienda-publicar-subdominio', {
          body: { tienda_id: tienda.id },
        });
        if (epErr || !epData || epData.ok !== true) {
          const detalle = (epData && (epData.detail || epData.message || epData.error)) ||
                          (epErr && epErr.message) ||
                          'No pudimos contactar al servidor.';
          T.toast('No pudimos publicar la tienda: ' + detalle + ' Intenta en 1 minuto.', 'error');
          cstate.guardando = false;
          if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
          return;
        }
        resultadoPublicacion = epData;
      } catch (e) {
        console.error('[cfg v4] EF publicar exception', e);
        T.toast('Error publicando tienda: ' + (e.message || e), 'error');
        cstate.guardando = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
        return;
      }
    }

    const patch = {
      nombre_negocio: nombre,
      whatsapp_dueno: whatsapp,
      idioma,
      mostrar_agotados: mostrarAgotados,
      mostrar_buscador_header: mostrarBuscadorHeader,
      hover_segunda_foto: hoverSegundaFoto,
      mostrar_resenas_productos: mostrarResenasProductos,
      plantilla_id: plantillaId || null,
      paleta_id: paletaId || null,
      nombre_legal: nombreLegal || null,
      nit: nit || null,
      telefono_contacto: telefono || null,
      direccion: direccion || null,
      ciudad_negocio: ciudad || null,
      email_contacto: email || null,
      horario_atencion: horario || null,
      estado,
    };

    try {
      const upd = await sb.from('tiendas').update(patch).eq('id', tienda.id).select().maybeSingle();
      if (upd.error) {
        console.error('[cfg] update error', upd.error);
        let msg = 'No pudimos guardar la configuracion. Intenta de nuevo.';
        if (upd.error.code === '23514') msg = 'Algun valor no cumple las validaciones. Revisa los campos.';
        T.toast(msg, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
        return;
      }
      if (!upd.data) {
        T.toast('No se pudo actualizar. Refresca la pagina e intenta de nuevo.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
        return;
      }
      // Sync state global
      Object.assign(tienda, upd.data);
      Object.assign(T.state.tienda, upd.data);
      cstate.dirty = false;
      cstate.guardando = false;
      if (resultadoPublicacion && resultadoPublicacion.host) {
        // v4 Fase 4: post-publicacion mostramos URL real. Refrescamos state
        // local con los datos que la EF ya persistio para que la BD-read
        // en proximas operaciones tenga subdominio_publicado_at correcto.
        T.state.tienda.easypanel_domain_id = resultadoPublicacion.domain_id;
        T.state.tienda.subdominio_publicado_at = new Date().toISOString();
        tienda.easypanel_domain_id = resultadoPublicacion.domain_id;
        tienda.subdominio_publicado_at = T.state.tienda.subdominio_publicado_at;
        T.toast('Tienda publicada en https://' + resultadoPublicacion.host, 'success');
      } else {
        T.toast('Cambios guardados', 'success');
      }
      renderConfiguracion();
    } catch (e) {
      console.error('[cfg] exception', e);
      T.toast('No pudimos guardar la configuracion. Intenta de nuevo.', 'error');
      cstate.guardando = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    }
  }
})();
