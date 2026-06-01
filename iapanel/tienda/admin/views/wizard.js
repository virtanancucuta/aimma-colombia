/* AIMMA · Tienda IA · views/wizard.js · v2 · 2026-05-30
   v2 (post-audit code-reviewer): 2 HIGH + 2 MEDIUM fixes
   - BUG #1 HIGH: race condition slugTimer sobreescribia paso 2 si user
     escribia rapido y daba Siguiente. Guard `if (wstate.paso !== 1) return`.
   - BUG #2 HIGH: XSS via style="background:<color>" si BD tuviera valor
     malicioso. safeColor() valida hex CSS antes de interpolar.
   - BUG #3 MEDIUM: asumir 23505 = slug colision. Ahora confirma con
     error.message.includes('slug') antes de redirigir al paso 1.
   - BUG #4 MEDIUM: edge case slug inicial vacio + slug valido escrito por
     user. Antes el patch no incluia slug. Ahora si slugInicialVacio || slugCambio.
   Fase 3.4 - Wizard onboarding 3 pasos forzados:
   1) Confirmar/cambiar slug (URL de la tienda)
   2) Elegir plantilla (3 cards: fashion_bold, industrial_clean, minimal_artesanal)
   3) Elegir paleta (5 swatches segun la plantilla elegida)
   Finalizacion: UPDATE tiendas SET slug, plantilla_id, paleta_id, estado='publicada'
   y reload page para re-init SPA en modo app. */

(function () {
  'use strict';

  // ============================================================
  // Bootstrap: registrar startWizard en window.TiendaIA cuando este listo
  // ============================================================
  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.escapeHtml === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[wizard.js] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.startWizard = startWizard;
  });

  // ============================================================
  // Estado del wizard
  // ============================================================
  const wstate = {
    paso: 1,
    slugInicial: '',
    slugActual: '',
    slugValidando: false,
    slugError: null,        // mensaje de error de validacion
    slugOk: false,          // true si formato + reservado pasaron
    plantillas: [],         // catalogo
    paletas: [],            // catalogo (filtrado por plantilla elegida en paso 3)
    plantillaId: null,
    paletaId: null,
    slugsReservadosSet: new Set(),
    guardando: false,
  };

  // ============================================================
  // Constantes de validacion
  // ============================================================
  // CHECK DB: slug ~ '^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$' (3-42 chars)
  const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/;
  const SLUG_MIN = 3;
  const SLUG_MAX = 42;

  // ============================================================
  // Init
  // ============================================================
  async function startWizard() {
    const T = window.TiendaIA;
    const tienda = T.state.tienda;
    if (!tienda) {
      console.error('[wizard] no hay tienda en estado, abort');
      return;
    }
    wstate.paso = 1;
    wstate.slugInicial = tienda.slug || '';
    wstate.slugActual = tienda.slug || '';
    wstate.plantillaId = tienda.plantilla_id || null;
    wstate.paletaId = tienda.paleta_id || null;
    wstate.guardando = false;

    // Loading inicial mientras cargamos catalogos
    setWizardBody('<p style="color:var(--ta-text-soft);text-align:center;">Cargando opciones...</p>');
    try {
      await cargarCatalogos();
    } catch (e) {
      console.error('[wizard] cargarCatalogos', e);
      setWizardBody('<p style="color:var(--ta-danger);">No pudimos cargar las opciones: ' + T.escapeHtml(e.message || String(e)) + '</p>');
      return;
    }
    // Pre-validar el slug inicial para que el boton Siguiente este habilitado
    // si el slug actual ya cumple.
    await validarSlug(wstate.slugActual, /*silent=*/true);
    renderPasoActual();
  }

  async function cargarCatalogos() {
    const sb = window.TiendaIA.supabase();
    const [plRes, paRes, srRes] = await Promise.all([
      sb.from('plantillas').select('id, slug, nombre, descripcion, orden').eq('activa', true).order('orden'),
      sb.from('paletas').select('id, plantilla_id, slug, nombre, color_primary, color_accent, color_text_base, color_bg_base, orden').order('orden'),
      sb.from('tienda_slugs_reservados').select('slug'),
    ]);
    if (plRes.error) throw plRes.error;
    if (paRes.error) throw paRes.error;
    if (srRes.error) throw srRes.error;
    wstate.plantillas = plRes.data || [];
    wstate.paletas = paRes.data || [];
    wstate.slugsReservadosSet = new Set((srRes.data || []).map(r => r.slug));
  }

  // ============================================================
  // Render: shell + step indicator + body por paso
  // ============================================================
  function setWizardBody(html) {
    const body = document.getElementById('wizard-body');
    if (body) body.innerHTML = html;
    const stepEl = document.getElementById('wizard-step');
    if (stepEl) stepEl.textContent = String(wstate.paso);
  }

  function renderPasoActual() {
    if (wstate.paso === 1) renderPaso1();
    else if (wstate.paso === 2) renderPaso2();
    else if (wstate.paso === 3) renderPaso3();
  }

  // --------- PASO 1: slug ---------
  function renderPaso1() {
    const T = window.TiendaIA;
    const slug = wstate.slugActual;
    const errorMsg = wstate.slugError ? '<div class="ta-wizard__error">' + T.escapeHtml(wstate.slugError) + '</div>' : '';
    const okMsg = (!wstate.slugError && wstate.slugOk) ? '<div class="ta-wizard__ok">✓ Disponible</div>' : '';
    const previewUrl = slug ? slug + '.tienda.aimma.com.co' : '<tu-slug>.tienda.aimma.com.co';

    setWizardBody('' +
      '<h3 class="ta-wizard__h3">URL de tu tienda</h3>' +
      '<p class="ta-wizard__hint">Asi te van a encontrar tus clientes en internet. Solo minusculas, numeros y guiones. Entre 3 y 42 caracteres.</p>' +

      '<div class="ta-wizard__field">' +
        '<label class="ta-field__label" for="w-slug">Slug</label>' +
        '<div class="ta-wizard__slug-row">' +
          '<input id="w-slug" type="text" class="ta-input" autocomplete="off" spellcheck="false" maxlength="42" value="' + T.escapeHtml(slug) + '" placeholder="mi-tienda">' +
          '<span class="ta-wizard__slug-suffix">.tienda.aimma.com.co</span>' +
        '</div>' +
        errorMsg +
        okMsg +
      '</div>' +

      '<div class="ta-wizard__preview">' +
        '<span class="ta-wizard__preview-label">Tu URL final:</span>' +
        '<code>' + T.escapeHtml(previewUrl) + '</code>' +
      '</div>' +

      '<div class="ta-wizard__nav">' +
        '<span></span>' +
        '<button type="button" id="w-next" class="ta-btn ta-btn--primary" ' + (wstate.slugOk ? '' : 'disabled') + '>Siguiente →</button>' +
      '</div>'
    );

    const input = document.getElementById('w-slug');
    if (input) {
      input.addEventListener('input', async (e) => {
        wstate.slugActual = String(e.target.value || '').toLowerCase();
        await validarSlugDebounced();
      });
      // Focus al input al entrar
      setTimeout(() => input.focus(), 50);
    }
    const next = document.getElementById('w-next');
    if (next) next.addEventListener('click', () => {
      if (!wstate.slugOk) return;
      wstate.paso = 2;
      renderPasoActual();
    });
  }

  let slugTimer = null;
  function validarSlugDebounced() {
    return new Promise((resolve) => {
      clearTimeout(slugTimer);
      slugTimer = setTimeout(async () => {
        // v1 BUG #1 fix: si el user ya cambio de paso (typing rapido + click
        // Siguiente), abortar para no sobreescribir el DOM del paso actual.
        if (wstate.paso !== 1) { resolve(); return; }
        await validarSlug(wstate.slugActual, /*silent=*/false);
        if (wstate.paso === 1) renderPaso1();
        resolve();
      }, 250);
    });
  }

  // v1 BUG #2 fix: validar que un valor sea un color CSS hex seguro antes
  // de interpolarlo en style attribute. Las paletas son hex (#RRGGBB / #RGB).
  // Si una paleta tiene un valor invalido, fallback a #888.
  const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  function safeColor(v) {
    return (typeof v === 'string' && HEX_COLOR_RE.test(v.trim())) ? v.trim() : '#888';
  }

  // Valida formato + reservado (no hace check de uniqueness contra DB porque
  // RLS no expone tiendas de otros users; el UNIQUE constraint lo cubre al
  // momento del UPDATE final).
  async function validarSlug(slug, silent) {
    wstate.slugError = null;
    wstate.slugOk = false;
    if (!slug) { if (!silent) wstate.slugError = 'Escribe un slug.'; return; }
    if (slug.length < SLUG_MIN) { if (!silent) wstate.slugError = 'Minimo ' + SLUG_MIN + ' caracteres.'; return; }
    if (slug.length > SLUG_MAX) { if (!silent) wstate.slugError = 'Maximo ' + SLUG_MAX + ' caracteres.'; return; }
    if (!SLUG_REGEX.test(slug)) {
      if (!silent) wstate.slugError = 'Solo minusculas, numeros y guion. No puede empezar ni terminar con guion.';
      return;
    }
    if (wstate.slugsReservadosSet.has(slug)) {
      if (!silent) wstate.slugError = '"' + slug + '" esta reservado. Elige otro.';
      return;
    }
    wstate.slugOk = true;
  }

  // --------- PASO 2: plantilla ---------
  function renderPaso2() {
    const T = window.TiendaIA;
    const cards = wstate.plantillas.map(pl => {
      const activa = wstate.plantillaId === pl.id;
      // Previews placeholder por slug (estilo aproximado del look de la plantilla)
      const previewBg = pl.slug === 'fashion_bold' ? 'linear-gradient(135deg, #0F0F10 0%, #E91E63 100%)'
                       : pl.slug === 'industrial_clean' ? 'linear-gradient(135deg, #1B4965 0%, #5FA8D3 100%)'
                       : 'linear-gradient(135deg, #8B6F47 0%, #D4A574 100%)';
      const previewFont = pl.slug === 'minimal_artesanal' ? "'Georgia', serif" : "'Exo 2', sans-serif";
      const previewText = pl.slug === 'fashion_bold' ? 'BOLD' : pl.slug === 'industrial_clean' ? 'CLEAN' : 'artesanal';
      return '' +
        '<button type="button" class="ta-wizard__card' + (activa ? ' is-active' : '') + '" data-plantilla="' + T.escapeHtml(pl.id) + '">' +
          '<div class="ta-wizard__card-preview" style="background:' + previewBg + ';font-family:' + previewFont + ';">' + T.escapeHtml(previewText) + '</div>' +
          '<div class="ta-wizard__card-title">' + T.escapeHtml(pl.nombre) + '</div>' +
          '<div class="ta-wizard__card-desc">' + T.escapeHtml(pl.descripcion || '') + '</div>' +
        '</button>';
    }).join('');

    setWizardBody('' +
      '<h3 class="ta-wizard__h3">Elige la plantilla de tu tienda</h3>' +
      '<p class="ta-wizard__hint">Cada plantilla esta pensada para un tipo de negocio. Despues podras cambiarla cuando quieras.</p>' +

      '<div class="ta-wizard__cards">' + cards + '</div>' +

      '<div class="ta-wizard__nav">' +
        '<button type="button" id="w-back" class="ta-btn">← Atras</button>' +
        '<button type="button" id="w-next" class="ta-btn ta-btn--primary" ' + (wstate.plantillaId ? '' : 'disabled') + '>Siguiente →</button>' +
      '</div>'
    );

    document.querySelectorAll('.ta-wizard__card[data-plantilla]').forEach(btn => {
      btn.addEventListener('click', () => {
        wstate.plantillaId = btn.getAttribute('data-plantilla');
        // Si cambiaron plantilla, la paleta anterior puede no aplicar a esta
        const paletasDeEsta = wstate.paletas.filter(p => p.plantilla_id === wstate.plantillaId);
        if (!paletasDeEsta.some(p => p.id === wstate.paletaId)) wstate.paletaId = null;
        renderPaso2();
      });
    });
    const back = document.getElementById('w-back');
    if (back) back.addEventListener('click', () => { wstate.paso = 1; renderPasoActual(); });
    const next = document.getElementById('w-next');
    if (next) next.addEventListener('click', () => {
      if (!wstate.plantillaId) return;
      wstate.paso = 3;
      renderPasoActual();
    });
  }

  // --------- PASO 3: paleta ---------
  function renderPaso3() {
    const T = window.TiendaIA;
    const paletasFiltradas = wstate.paletas.filter(p => p.plantilla_id === wstate.plantillaId);

    const swatches = paletasFiltradas.map(pa => {
      const activa = wstate.paletaId === pa.id;
      // v1 BUG #2 fix: safeColor valida que el valor sea hex CSS antes de
      // interpolarlo en style attribute (defensa contra CSS injection si una
      // paleta tuviera valor malicioso en BD).
      return '' +
        '<button type="button" class="ta-wizard__swatch' + (activa ? ' is-active' : '') + '" data-paleta="' + T.escapeHtml(pa.id) + '">' +
          '<div class="ta-wizard__swatch-colors">' +
            '<span style="background:' + safeColor(pa.color_primary) + ';"></span>' +
            '<span style="background:' + safeColor(pa.color_accent) + ';"></span>' +
            '<span style="background:' + safeColor(pa.color_text_base) + ';"></span>' +
            '<span style="background:' + safeColor(pa.color_bg_base) + ';border:1px solid rgba(0,0,0,.15);"></span>' +
          '</div>' +
          '<div class="ta-wizard__swatch-name">' + T.escapeHtml(pa.nombre) + '</div>' +
        '</button>';
    }).join('');

    const guardandoTxt = wstate.guardando ? 'Guardando...' : 'Terminar y publicar ✓';
    setWizardBody('' +
      '<h3 class="ta-wizard__h3">Elige tu paleta de colores</h3>' +
      '<p class="ta-wizard__hint">Estos seran los colores de tu tienda online. Tambien podras cambiarlos despues.</p>' +

      '<div class="ta-wizard__swatches">' + swatches + '</div>' +

      '<div class="ta-wizard__nav">' +
        '<button type="button" id="w-back" class="ta-btn"' + (wstate.guardando ? ' disabled' : '') + '>← Atras</button>' +
        '<button type="button" id="w-finish" class="ta-btn ta-btn--primary" ' + (wstate.paletaId && !wstate.guardando ? '' : 'disabled') + '>' + T.escapeHtml(guardandoTxt) + '</button>' +
      '</div>'
    );

    document.querySelectorAll('.ta-wizard__swatch[data-paleta]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (wstate.guardando) return;
        wstate.paletaId = btn.getAttribute('data-paleta');
        renderPaso3();
      });
    });
    const back = document.getElementById('w-back');
    if (back) back.addEventListener('click', () => {
      if (wstate.guardando) return;
      wstate.paso = 2;
      renderPasoActual();
    });
    const finish = document.getElementById('w-finish');
    if (finish) finish.addEventListener('click', () => { if (!wstate.guardando && wstate.paletaId) finalizarWizard(); });
  }

  // --------- Finalizacion: UPDATE tienda ---------
  async function finalizarWizard() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;

    wstate.guardando = true;
    renderPaso3();

    try {
      const patch = {
        plantilla_id: wstate.plantillaId,
        paleta_id: wstate.paletaId,
        estado: 'publicada',
      };
      // v1 BUG #4 fix: incluir slug si cambio O si slugInicial estaba vacio
      // (caso edge donde la tienda fue sembrada sin slug). slugActual ya paso
      // validarSlug (slugOk=true).
      const slugCambio = wstate.slugActual && wstate.slugActual !== wstate.slugInicial;
      const slugInicialVacio = !wstate.slugInicial;
      if (slugCambio || slugInicialVacio) {
        patch.slug = wstate.slugActual;
      }
      const { data, error } = await sb.from('tiendas').update(patch).eq('id', tienda.id).select().maybeSingle();

      if (error) {
        wstate.guardando = false;
        // v1 BUG #3 fix: 23505 puede ser cualquier UNIQUE, no solo slug.
        // Confirmar via error.message antes de redirigir al paso 1.
        const msg = (error.message || '').toLowerCase();
        const esSlugCollision = error.code === '23505' && (msg.includes('slug') || msg.includes('tiendas_slug'));
        if (esSlugCollision) {
          wstate.paso = 1;
          wstate.slugError = 'Este slug ya esta en uso por otra tienda. Elige otro.';
          wstate.slugOk = false;
          renderPasoActual();
          return;
        }
        T.toast('Error al guardar: ' + (error.message || 'desconocido'), 'error');
        renderPaso3();
        return;
      }
      if (!data) {
        wstate.guardando = false;
        T.toast('No se pudo actualizar. Refresca la pagina e intenta de nuevo.', 'error');
        renderPaso3();
        return;
      }

      // Exito: recargar la pagina para que admin.js entre en modo app limpio
      T.toast('¡Tu tienda esta publicada!', 'success');
      setTimeout(() => { window.location.reload(); }, 800);
    } catch (e) {
      console.error('[wizard] finalizar exception', e);
      wstate.guardando = false;
      T.toast('Error: ' + (e.message || e), 'error');
      renderPaso3();
    }
  }
})();
