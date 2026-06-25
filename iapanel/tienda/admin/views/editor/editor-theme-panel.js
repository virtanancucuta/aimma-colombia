/* AIMMA Tienda IA · Editor PRO-MAX Plan 4 · editor-theme-panel.js (T4b)
 * Panel de Tema Global — drawer derecho, overlay sobre el shell.
 * Presets de paleta (por plantilla) + custom color pickers (4 slots) + 6 font pairings.
 * Preview en vivo via editorCanvas.applyThemePreview (7 vars --ta-color-*).
 * Marker: editor-plan4-tema-panel
 */
(function(window) {
  'use strict';

  // ============================================================
  // Estado local del modulo
  // ============================================================
  var pstate = { mounted: false, paletas: null, loading: false, open: false, panelEl: null };

  // ============================================================
  // Helpers de seguridad (anti-injection)
  // ============================================================
  var HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  function safeColor(v, fb) {
    return (typeof v === 'string' && HEX_RE.test(v.trim())) ? v.trim() : (fb || '#888888');
  }

  // ============================================================
  // Contraste WCAG — port exacto de apps/storefront/src/lib/contrast.ts
  // ============================================================
  function _hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    var h = hex.trim().replace(/^#/, '');
    var full = h.length === 3 ? h.split('').map(function(c) { return c + c; }).join('') : h;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
  }
  function _lin(c) { var s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
  function _lum(rgb) { return 0.2126 * _lin(rgb.r) + 0.7152 * _lin(rgb.g) + 0.0722 * _lin(rgb.b); }
  function _ratio(L1, L2) { var hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); }
  function getContrastText(hex) {
    var rgb = _hexToRgb(hex);
    if (!rgb) return '#ffffff';
    var L = _lum(rgb);
    var cW = _ratio(L, 1.0);
    var cD = _ratio(L, _lum(_hexToRgb('#0a0a0a')));
    return cD >= cW ? '#0a0a0a' : '#ffffff';
  }

  // ============================================================
  // Defaults (fallback si no hay paleta)
  // ============================================================
  var DEF = { primary: '#1a1a1a', accent: '#ff6b35', text_base: '#1a1a1a', bg_base: '#ffffff' };

  // ============================================================
  // Paleta actual de la tienda (para fallback de colores no overrideados)
  // ============================================================
  function curPaleta() {
    var tienda = window.TiendaIA.state && window.TiendaIA.state.tienda;
    if (!pstate.paletas || !pstate.paletas.length) return DEF;
    var paleta = null;
    if (tienda && tienda.paleta_id) {
      for (var i = 0; i < pstate.paletas.length; i++) {
        if (pstate.paletas[i].id === tienda.paleta_id) { paleta = pstate.paletas[i]; break; }
      }
    }
    if (!paleta) paleta = pstate.paletas[0];
    if (!paleta) return DEF;
    return {
      primary: paleta.color_primary || DEF.primary,
      accent: paleta.color_accent || DEF.accent,
      text_base: paleta.color_text_base || DEF.text_base,
      bg_base: paleta.color_bg_base || DEF.bg_base,
    };
  }

  // ============================================================
  // Colores efectivos (theme override > paleta > DEF)
  // ============================================================
  function resolvedColors() {
    var themeColors = (window.TiendaIA.editorState && window.TiendaIA.editorState.theme && window.TiendaIA.editorState.theme.colors) || {};
    var pal = curPaleta();
    return {
      primary: themeColors.primary || pal.primary || DEF.primary,
      accent: themeColors.accent || pal.accent || DEF.accent,
      text_base: themeColors.text_base || pal.text_base || DEF.text_base,
      bg_base: themeColors.bg_base || pal.bg_base || DEF.bg_base,
    };
  }

  // ============================================================
  // buildColorsVars: las 7 vars CSS para applyThemePreview
  // ============================================================
  function buildColorsVars(r) {
    return {
      '--ta-color-primary': r.primary,
      '--ta-color-accent': r.accent,
      '--ta-color-text-base': r.text_base,
      '--ta-color-bg-base': r.bg_base,
      '--ta-color-on-primary': getContrastText(r.primary),
      '--ta-color-on-accent': getContrastText(r.accent),
      '--ta-color-on-bg': getContrastText(r.bg_base),
    };
  }

  // ============================================================
  // Aplica preview en vivo al iframe
  // ============================================================
  function applyPreview() {
    var r = resolvedColors();
    var theme = (window.TiendaIA.editorState && window.TiendaIA.editorState.theme) || {};
    var pairing = theme.font_pairing || null;
    var navSize = theme.nav_text_size || null; // M5.C: tamano de texto del menu (preview en vivo)
    var fotoAjuste = theme.foto_ajuste || 'rellenar';
    if (window.TiendaIA.editorCanvas && window.TiendaIA.editorCanvas.applyThemePreview) {
      window.TiendaIA.editorCanvas.applyThemePreview(buildColorsVars(r), pairing, navSize, fotoAjuste);
    }
  }

  // ============================================================
  // Carga de paletas desde Supabase (lazy, al primer open)
  // ============================================================
  async function loadPaletas() {
    if (pstate.paletas !== null) return;
    pstate.loading = true;
    var sb = window.TiendaIA.supabase && window.TiendaIA.supabase();
    if (!sb) { pstate.paletas = []; pstate.loading = false; return; }
    var tienda = window.TiendaIA.state && window.TiendaIA.state.tienda;
    try {
      var res = await sb
        .from('paletas')
        .select('id, plantilla_id, slug, nombre, color_primary, color_accent, color_text_base, color_bg_base, orden')
        .eq('plantilla_id', tienda && tienda.plantilla_id)
        .order('orden');
      if (res.error) throw res.error;
      pstate.paletas = res.data || [];
    } catch (err) {
      console.error('[editor-theme-panel] loadPaletas error', err);
      if (window.TiendaIA.toast) window.TiendaIA.toast('No pudimos cargar las paletas.', 'error');
      pstate.paletas = [];
    }
    pstate.loading = false;
  }

  // ============================================================
  // Render (monta el panel en shellEl, empieza cerrado)
  // ============================================================
  function render(shellEl) {
    var E = window.TiendaIA.editorControls.el;
    var panel = E('aside', { class: 'ed-theme-panel', id: 'editor-theme-panel' });

    // Header
    var btnClose = E('button', {
      type: 'button',
      class: 'ed-theme-panel__close',
      title: 'Cerrar panel de tema',
      onClick: function() { close(); },
    }, '✕');
    var tag = E('span', { class: 'ed-theme-panel__tag' }, 'Toda la tienda');
    var h1 = E('h2', { class: 'ed-theme-panel__title' }, 'Tema global');
    var head = E('div', { class: 'ed-theme-panel__head' }, [h1, tag, btnClose]);

    var body = E('div', { class: 'ed-theme-panel__body' });

    panel.appendChild(head);
    panel.appendChild(body);
    shellEl.appendChild(panel);
    pstate.panelEl = panel;
    pstate.mounted = true;
  }

  // ============================================================
  // renderBody: rellena el body (re-invocado en open + tras cambios)
  // ============================================================
  function renderBody() {
    var panel = pstate.panelEl;
    if (!panel) return;
    var body = panel.querySelector('.ed-theme-panel__body');
    if (!body) return;
    body.innerHTML = '';

    var E = window.TiendaIA.editorControls.el;
    var escHtml = window.TiendaIA.escapeHtml || function(s) { return String(s).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
    var editorState = window.TiendaIA.editorState;
    var tienda = window.TiendaIA.state && window.TiendaIA.state.tienda;
    var fp = window.TiendaIA.fontPairings;

    // ---- Seccion: Tamano de texto del menu (M5.C) — PRIMERO (es texto + Jorge lo quiere arriba) ----
    // Segmented control de 3 presets conectados (sin slider: un usuario sin experiencia no puede romper
    // el layout). 'md' = default = sin cambio. El storefront escala SOLO el menu (no logo/carrito).
    var navSec = E('section', { class: 'ed-theme-sec' });
    navSec.appendChild(E('p', { class: 'ed-theme-sec__label' }, 'Tamano de texto del menu'));
    var navOpts = [
      { id: 'sm', label: 'Pequeno' },
      { id: 'md', label: 'Mediano' },
      { id: 'lg', label: 'Grande' },
    ];
    var selNav = (editorState.theme && editorState.theme.nav_text_size) || 'md';
    var navRow = document.createElement('div');
    navRow.className = 'ed-theme-navsize';
    navRow.setAttribute('role', 'group');
    navRow.setAttribute('aria-label', 'Tamano de texto del menu');
    navOpts.forEach(function(opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-theme-navsize__btn' + (opt.id === selNav ? ' is-sel' : '');
      b.setAttribute('aria-pressed', opt.id === selNav ? 'true' : 'false');
      b.textContent = opt.label;
      b.addEventListener('click', function() {
        editorState.setThemeNavTextSize(opt.id);
        applyPreview();
        renderBody();
      });
      navRow.appendChild(b);
    });
    navSec.appendChild(navRow);
    navSec.appendChild(E('p', { class: 'ed-theme-hint' }, 'Cambia el tamano de los textos del menu de navegacion (categorias y paginas) en tu tienda.'));
    body.appendChild(navSec);

    // ---- Seccion: Ajuste de las fotos de producto (rellenar/contener) ----
    var fitSec = E('section', { class: 'ed-theme-sec' });
    fitSec.appendChild(E('p', { class: 'ed-theme-sec__label' }, 'Ajuste de las fotos de producto'));
    var fitOpts = [
      { id: 'rellenar', label: 'Rellenar' },
      { id: 'contener', label: 'Contener' },
    ];
    var selFit = (editorState.theme && editorState.theme.foto_ajuste) || 'rellenar';
    var fitRow = document.createElement('div');
    fitRow.className = 'ed-theme-navsize';
    fitRow.setAttribute('role', 'group');
    fitRow.setAttribute('aria-label', 'Ajuste de las fotos de producto');
    fitOpts.forEach(function(opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-theme-navsize__btn' + (opt.id === selFit ? ' is-sel' : '');
      b.setAttribute('aria-pressed', opt.id === selFit ? 'true' : 'false');
      b.textContent = opt.label;
      b.addEventListener('click', function() {
        editorState.setThemeFotoAjuste(opt.id);
        applyPreview();
        renderBody();
      });
      fitRow.appendChild(b);
    });
    fitSec.appendChild(fitRow);
    fitSec.appendChild(E('p', { class: 'ed-theme-hint' }, 'Rellenar recorta la foto para llenar el cuadro (ideal moda/calzado). Contener muestra el producto completo sin recortar (ideal ferreteria, supermercado, bisuteria).'));
    body.appendChild(fitSec);

    // ---- Seccion: Color ----
    var colorSec = E('section', { class: 'ed-theme-sec' });

    var colorLabel = E('p', { class: 'ed-theme-sec__label' }, 'Paleta de colores');
    colorSec.appendChild(colorLabel);

    // Grid de presets
    var swatchesEl = E('div', { class: 'ed-theme-swatches' });

    if (pstate.loading || pstate.paletas === null) {
      swatchesEl.appendChild(E('p', { class: 'ed-theme-loading' }, 'Cargando paletas...'));
    } else if (pstate.paletas.length === 0) {
      swatchesEl.appendChild(E('p', { class: 'ed-theme-loading' }, 'No hay paletas disponibles.'));
    } else {
      var themeColors = (editorState.theme && editorState.theme.colors) || {};
      var hasOverrides = Object.keys(themeColors).length > 0;

      pstate.paletas.forEach(function(p) {
        var pbg = safeColor(p.color_bg_base, '#ffffff');
        var ptx = safeColor(p.color_text_base, '#1a1a1a');
        var ppr = safeColor(p.color_primary, '#1a1a1a');
        var pac = safeColor(p.color_accent, '#888888');
        var nombre = escHtml(p.nombre || p.slug || '');

        // Determinar si este preset esta seleccionado
        var isSel = false;
        if (!hasOverrides) {
          isSel = tienda && tienda.paleta_id && p.id === tienda.paleta_id;
        } else {
          isSel = (
            themeColors.primary && themeColors.primary.toLowerCase() === ppr.toLowerCase() &&
            themeColors.accent && themeColors.accent.toLowerCase() === pac.toLowerCase() &&
            themeColors.text_base && themeColors.text_base.toLowerCase() === ptx.toLowerCase() &&
            themeColors.bg_base && themeColors.bg_base.toLowerCase() === pbg.toLowerCase()
          );
        }

        var sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'ed-theme-sw' + (isSel ? ' is-sel' : '');

        // Preview area usando innerHTML (todos los valores pasados por safeColor+escapeHtml)
        sw.innerHTML =
          '<span class="ed-theme-sw__prev" style="background:' + pbg + ';">' +
            '<span class="ed-theme-sw__aa" style="color:' + ptx + ';">Aa</span>' +
            '<span class="ed-theme-sw__dots">' +
              '<span class="ed-theme-sw__dot" style="background:' + ppr + ';"></span>' +
              '<span class="ed-theme-sw__dot" style="background:' + pac + ';"></span>' +
            '</span>' +
          '</span>' +
          '<span class="ed-theme-sw__name">' + nombre + '</span>';

        sw.addEventListener('click', function() {
          editorState.setThemePalette({
            primary: ppr,
            accent: pac,
            text_base: ptx,
            bg_base: pbg,
          });
          applyPreview();
          renderBody();
        });

        swatchesEl.appendChild(sw);
      });
    }
    colorSec.appendChild(swatchesEl);

    // Custom colors collapsible
    var customDetails = document.createElement('details');
    customDetails.className = 'ed-theme-custom';
    var customSummary = document.createElement('summary');
    customSummary.textContent = 'Personalizar colores';
    customDetails.appendChild(customSummary);

    var slots = [
      { key: 'primary', label: 'Principal' },
      { key: 'accent', label: 'Acento' },
      { key: 'text_base', label: 'Texto' },
      { key: 'bg_base', label: 'Fondo' },
    ];
    var resolved = resolvedColors();
    slots.forEach(function(slot) {
      var picker = window.TiendaIA.editorControls.colorPicker(
        slot.label,
        resolved[slot.key],
        function(v) {
          var patch = {};
          patch[slot.key] = v;
          editorState.setThemeColors(patch);
          applyPreview();
        },
        {}
      );
      customDetails.appendChild(picker);
    });

    var hintColor = E('p', { class: 'ed-theme-hint' }, 'El texto sobre cada fondo (botones, etc.) se calcula solo con contraste WCAG.');
    customDetails.appendChild(hintColor);
    colorSec.appendChild(customDetails);
    body.appendChild(colorSec);

    // ---- Seccion: Tipografia ----
    var fontSec = E('section', { class: 'ed-theme-sec' });
    var fontLabel = E('p', { class: 'ed-theme-sec__label' }, 'Tipografia');
    fontSec.appendChild(fontLabel);

    var pairsEl = E('div', { class: 'ed-theme-pairs' });
    var selPairingId = (editorState.theme && editorState.theme.font_pairing) ||
      (fp && fp.defaultForTemplate && tienda && tienda.plantilla && fp.defaultForTemplate(tienda.plantilla.slug)) ||
      'industrial';

    if (fp && fp.IDS) {
      fp.IDS.forEach(function(id) {
        var pairing = fp.PAIRINGS[id];
        if (!pairing) return;
        var isSel = id === selPairingId;

        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'ed-theme-pair' + (isSel ? ' is-sel' : '');

        // display font-family viene del allowlist de font-pairings.js — no es input del usuario.
        // Las familias traen comillas dobles ('"IBM Plex Sans",...'); dentro de un style="" en
        // innerHTML romperian el atributo -> normalizamos a comillas simples para que el "Aa" rendere.
        var displayFont = (pairing.display || 'inherit').replace(/"/g, "'");
        var labelText = escHtml(pairing.label || id);
        var catText = escHtml(pairing.cat || '');

        card.innerHTML =
          '<div class="ed-theme-pair__top">' +
            '<span class="ed-theme-pair__aa" style="font-family:' + displayFont + ';">Aa</span>' +
            '<span class="ed-theme-pair__sample">Texto del cuerpo en Inter, legible y neutral para tu tienda.</span>' +
          '</div>' +
          '<div class="ed-theme-pair__meta">' +
            '<span class="ed-theme-pair__name" style="font-family:' + displayFont + ';">' + labelText + '</span>' +
            '<span class="ed-theme-pair__chip">' + catText + '</span>' +
          '</div>';

        card.addEventListener('click', function() {
          editorState.setThemeFontPairing(id);
          applyPreview();
          renderBody();
        });

        pairsEl.appendChild(card);
      });
    }

    var hintFont = E('p', { class: 'ed-theme-hint' }, 'Solo se carga la fuente elegida. El titulo usa la fuente del par; el cuerpo siempre Inter.');
    fontSec.appendChild(pairsEl);
    fontSec.appendChild(hintFont);
    body.appendChild(fontSec);
  }

  // ============================================================
  // Carga (idempotente) de las 6 fuentes display para que los previews "Aa" se vean
  // reales. El admin usa Exo 2; sin esto las cards caerian a fuente de sistema pese
  // al font-family. Solo se inyecta al abrir el panel (no en cada carga del admin).
  // ============================================================
  function ensurePreviewFonts() {
    if (document.getElementById('ed-theme-preview-fonts')) return;
    var l = document.createElement('link');
    l.id = 'ed-theme-preview-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&family=Anton&family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Cormorant+Garamond:wght@500;600&family=IBM+Plex+Sans:wght@500;600;700&display=swap';
    document.head.appendChild(l);
  }

  // ============================================================
  // open / close / toggle
  // ============================================================
  async function open() {
    ensurePreviewFonts();
    await loadPaletas();
    pstate.open = true;
    if (pstate.panelEl) pstate.panelEl.classList.add('ed-theme-panel--open');
    renderBody();
  }

  function close() {
    pstate.open = false;
    if (pstate.panelEl) pstate.panelEl.classList.remove('ed-theme-panel--open');
  }

  function toggle() {
    if (pstate.open) { close(); } else { open(); }
  }

  // ============================================================
  // Export
  // ============================================================
  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorThemePanel = {
    render: render,
    open: open,
    close: close,
    toggle: toggle,
    _getContrastText: getContrastText,
    _buildColorsVars: buildColorsVars,
  };
})(window);
