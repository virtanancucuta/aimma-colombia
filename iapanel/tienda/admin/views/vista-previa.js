/* AIMMA · Tienda IA · views/vista-previa.js · v2 · 2026-05-30
   v2 (Fase 3.4c): MVP Modo Editor minimal. Cliente puede editar inline:
   - hero_title, hero_subtitle, cta_text, cta_url, footer_text.
   Toggle 'Modo editor' habilita contenteditable. 'Guardar y publicar'
   persiste en tiendas.personalizaciones (jsonb). Restaurar default por campo.
   Editor full Webflow-style = feature PRO-MAX (post-MVP, ver memoria).
   Fase 3.4b - Mockup interactivo del storefront dentro del Panel. */

(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[vista-previa.js] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.registerView('vista-previa', renderVistaPrevia);
  });

  // Validar hex color para CSS (defensa anti-XSS por style attribute)
  const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  function safeColor(v, fallback) {
    return (typeof v === 'string' && HEX_COLOR_RE.test(v.trim())) ? v.trim() : (fallback || '#888');
  }
  // Validar URL https/http o anchor interno
  function safeImgUrl(url) {
    if (!url) return null;
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? url : null; }
    catch { return null; }
  }
  // v2: validar URL para boton CTA (acepta https?:// o #)
  function safeCtaUrl(url) {
    if (!url) return '#';
    const trimmed = String(url).trim();
    if (trimmed === '' || trimmed === '#' || trimmed.startsWith('#')) return trimmed || '#';
    try { const u = new URL(trimmed); return /^https?:$/.test(u.protocol) ? trimmed : '#'; }
    catch { return '#'; }
  }

  // v2: estado del editor
  const PERSONALIZABLES = ['hero_title', 'hero_subtitle', 'cta_text', 'cta_url', 'footer_text'];
  const MAX_LEN = 200;
  const estate = {
    editing: false,        // true cuando "Modo editor" esta activo
    dirty: false,          // hay cambios no guardados
    personalizaciones: {}, // datos actuales (de BD + cambios locales)
    defaults: {},          // valores default segun plantilla (no se persisten)
    guardando: false,
  };

  async function renderVistaPrevia() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;
    const tienda = T.state.tienda;

    if (!tienda.plantilla_id || !tienda.paleta_id) {
      view.innerHTML = '' +
        '<div class="ta-card">' +
          '<div class="ta-empty">' +
            '<h2 class="ta-empty__title">Configura tu plantilla y paleta primero</h2>' +
            '<p class="ta-empty__text">Necesitas elegir plantilla y paleta antes de ver la vista previa. Ve a <a href="#/configuracion">Configuracion</a>.</p>' +
          '</div>' +
        '</div>';
      return;
    }

    // Loading skeleton
    view.innerHTML = '<div class="ta-card"><div class="ta-empty"><div class="ta-loader" style="width:32px;height:32px;margin:0 auto 12px;"></div><p class="ta-empty__text">Cargando preview...</p></div></div>';

    try {
      const data = await cargarData(T.supabase(), tienda);
      // v2: setear personalizaciones desde BD y calcular defaults
      estate.personalizaciones = Object.assign({}, tienda.personalizaciones || {});
      estate.defaults = calcularDefaults(tienda, data.plantilla);
      estate.editing = false;
      estate.dirty = false;
      view.innerHTML = renderHeader() + renderMockup(data, tienda);
      wireInteracciones(data, tienda);
    } catch (e) {
      console.error('[vista-previa] error', e);
      view.innerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">No pudimos cargar la preview</h2><p class="ta-empty__text">' + T.escapeHtml(e.message || String(e)) + '</p></div></div>';
    }
  }

  async function cargarData(sb, tienda) {
    // En paralelo: plantilla, paleta, productos top 6, categorias
    const [plRes, paRes, prRes, catRes] = await Promise.all([
      sb.from('plantillas').select('slug, nombre, descripcion').eq('id', tienda.plantilla_id).maybeSingle(),
      sb.from('paletas').select('slug, nombre, color_primary, color_accent, color_text_base, color_bg_base').eq('id', tienda.paleta_id).maybeSingle(),
      sb.from('productos').select('id, nombre, descripcion, precio_venta, precio_promo, foto_principal_url, estado').eq('tienda_id', tienda.id).eq('estado', 'activo').order('created_at', { ascending: false }).limit(6),
      sb.from('categorias').select('nombre').eq('tienda_id', tienda.id).is('parent_id', null).order('orden').limit(6),
    ]);
    if (plRes.error) throw plRes.error;
    if (paRes.error) throw paRes.error;
    return {
      plantilla: plRes.data,
      paleta: paRes.data,
      productos: prRes.data || [],
      categorias: catRes.data || [],
    };
  }

  function renderHeader() {
    const labelToggle = estate.editing ? '✓ Salir del modo editor' : '✏️ Modo editor';
    const guardandoTxt = estate.guardando ? 'Guardando...' : 'Guardar y publicar';
    const saveBtn = estate.editing
      ? '<button type="button" id="vp-guardar" class="ta-btn ta-btn--primary" ' +
          (estate.dirty && !estate.guardando ? '' : 'disabled') + '>' + guardandoTxt + '</button>'
      : '';
    return '' +
      '<header style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
        '<div>' +
          '<h1 class="ta-section-title">Vista previa de tu tienda</h1>' +
          '<p class="ta-section-sub">' +
            (estate.editing
              ? 'Estas en <strong>modo editor</strong>. Click sobre cualquier texto resaltado para editarlo. Al terminar, <strong>Guardar y publicar</strong>.'
              : 'Asi se vera tu tienda. Esta es una <strong>simulacion fiel</strong> dentro del panel. La tienda publica real con dominio propio estara en la siguiente fase.') +
          '</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button type="button" id="vp-toggle-editor" class="ta-btn' + (estate.editing ? ' ta-btn--primary' : '') + '">' + labelToggle + '</button>' +
          saveBtn +
        '</div>' +
      '</header>';
  }

  // Calcula los valores DEFAULT segun la plantilla. Si el usuario no edita
  // hero_title/hero_subtitle/cta_text/footer_text, se muestran estos.
  function calcularDefaults(tienda, plantilla) {
    const slug = plantilla?.slug || 'industrial_clean';
    const nombre = tienda.nombre_negocio || 'Tu marca';
    let heroSub = 'Calidad y estilo en cada pieza.';
    let cta = 'Ver coleccion';
    if (slug === 'industrial_clean') { heroSub = 'Soluciones profesionales para tu negocio.'; cta = 'Conoce mas'; }
    if (slug === 'minimal_artesanal') { heroSub = 'Hecho a mano, con dedicacion.'; cta = ''; /* sin CTA por defecto */ }
    return {
      hero_title: nombre,
      hero_subtitle: heroSub,
      cta_text: cta,
      cta_url: '#',
      footer_text: nombre,
    };
  }

  // Obtiene el valor efectivo (personalizado o default) de un campo.
  function getValor(campo) {
    const v = estate.personalizaciones[campo];
    if (v == null || v === '') return estate.defaults[campo] || '';
    return v;
  }

  function renderMockup(data, tienda) {
    const T = window.TiendaIA;
    const paleta = data.paleta || {};
    const plantilla = data.plantilla || {};
    const productos = data.productos || [];
    const categorias = data.categorias || [];

    // Colores validados
    const cP = safeColor(paleta.color_primary, '#1B4965');
    const cA = safeColor(paleta.color_accent, '#5FA8D3');
    const cTB = safeColor(paleta.color_text_base, '#102841');
    const cBB = safeColor(paleta.color_bg_base, '#F4F6F8');

    // Estilo segun plantilla
    const tStyle = estiloPlantilla(plantilla.slug || 'industrial_clean');

    // CSS variables como style inline en un wrapper. Usamos clase prefijada
    // .preview-mockup para evitar leak de estilos al resto del panel.
    const stylesVars =
      '--p:' + cP + ';' +
      '--a:' + cA + ';' +
      '--tb:' + cTB + ';' +
      '--bb:' + cBB + ';' +
      '--font:' + tStyle.font + ';' +
      '--font-h:' + tStyle.fontH + ';';

    const logoOrText = tienda.logo_url && safeImgUrl(tienda.logo_url)
      ? '<img src="' + T.escapeHtml(tienda.logo_url) + '" alt="" style="height:36px;width:auto;">'
      : '<span class="preview-logo-text">' + T.escapeHtml(tienda.nombre_negocio || tienda.slug) + '</span>';

    const catsHtml = categorias.length > 0
      ? categorias.slice(0, 5).map(c => '<a href="#" onclick="return false;">' + T.escapeHtml(c.nombre) + '</a>').join('')
      : '<a href="#" onclick="return false;">Todos los productos</a>';

    const productosHtml = productos.length > 0
      ? productos.map(p => renderProductoCard(p, cP, cA, cTB, cBB)).join('')
      : Array.from({ length: 3 }, () => renderProductoPlaceholder()).join('');

    const hero = tStyle.hero(tienda, T);

    return '' +
      '<div class="preview-mockup-frame">' +
        '<div class="preview-mockup-bar">' +
          '<span class="preview-dot"></span><span class="preview-dot"></span><span class="preview-dot"></span>' +
          '<span class="preview-url">' + T.escapeHtml(tienda.slug || 'tu-tienda') + '.tienda.aimma.com.co</span>' +
        '</div>' +
        '<div class="preview-mockup ' + tStyle.cssClass + '" style="' + stylesVars + '">' +

          '<header class="preview-header">' +
            '<div class="preview-header__logo">' + logoOrText + '</div>' +
            '<nav class="preview-header__nav">' + catsHtml + '</nav>' +
            '<div class="preview-header__cart">🛒</div>' +
          '</header>' +

          hero +

          '<section class="preview-products">' +
            '<h2 class="preview-products__title">' + (productos.length > 0 ? 'Nuestros productos' : 'Pronto disponibles') + '</h2>' +
            '<div class="preview-products__grid">' + productosHtml + '</div>' +
            (productos.length === 0
              ? '<p class="preview-products__hint">Aun no tienes productos cargados. Cuando los agregues, apareceran aqui.</p>'
              : '') +
          '</section>' +

          '<footer class="preview-footer">' +
            '<div class="editable" data-campo="footer_text"' + (estate.editing ? ' contenteditable="true" spellcheck="false"' : '') + '>' + T.escapeHtml(getValor('footer_text')) + '</div>' +
            '<div class="preview-footer__links">' +
              '<a href="#" onclick="return false;">Garantias</a>' +
              '<a href="#" onclick="return false;">Tratamiento de datos</a>' +
              '<a href="#" onclick="return false;">Contacto</a>' +
            '</div>' +
            '<div class="preview-footer__credit">Tienda creada con <strong>AIMMA Tienda IA</strong></div>' +
          '</footer>' +

        '</div>' +
      '</div>' +

      '<div style="margin-top:20px;display:flex;gap:8px;align-items:center;color:var(--ta-text-soft);font-size:13px;flex-wrap:wrap;">' +
        '<span>Plantilla: <strong>' + T.escapeHtml(plantilla.nombre || '-') + '</strong></span>' +
        '<span>·</span>' +
        '<span>Paleta: <strong>' + T.escapeHtml(paleta.nombre || '-') + '</strong></span>' +
        '<span>·</span>' +
        '<a href="#/configuracion" style="color:var(--ta-accent);">Cambiar →</a>' +
      '</div>';
  }

  function renderProductoCard(p, cP, cA, cTB, cBB) {
    const T = window.TiendaIA;
    const foto = safeImgUrl(p.foto_principal_url);
    const fotoBlock = foto
      ? '<img src="' + T.escapeHtml(foto) + '" alt="" class="preview-product__img">'
      : '<div class="preview-product__img preview-product__img--empty">📦</div>';
    const precio = '$' + Math.round(Number(p.precio_venta || 0)).toLocaleString('es-CO');
    const promoLabel = p.precio_promo
      ? '<div class="preview-product__promo">$' + Math.round(Number(p.precio_promo)).toLocaleString('es-CO') + ' <span class="preview-product__antes">$' + Math.round(Number(p.precio_venta)).toLocaleString('es-CO') + '</span></div>'
      : '<div class="preview-product__precio">' + precio + '</div>';
    return '' +
      '<article class="preview-product">' +
        fotoBlock +
        '<div class="preview-product__body">' +
          '<h3 class="preview-product__nombre">' + T.escapeHtml(p.nombre) + '</h3>' +
          promoLabel +
          '<button type="button" class="preview-product__btn" onclick="return false;">Ver detalles</button>' +
        '</div>' +
      '</article>';
  }

  function renderProductoPlaceholder() {
    return '' +
      '<article class="preview-product preview-product--placeholder">' +
        '<div class="preview-product__img preview-product__img--empty">📦</div>' +
        '<div class="preview-product__body">' +
          '<h3 class="preview-product__nombre">Producto de ejemplo</h3>' +
          '<div class="preview-product__precio">$ —</div>' +
          '<button type="button" class="preview-product__btn" disabled>Ver detalles</button>' +
        '</div>' +
      '</article>';
  }

  // v2: hero usa getValor() y agrega contenteditable attributes en modo editor.
  function renderHeroEditable(variantClass) {
    const T = window.TiendaIA;
    const heroTitle = getValor('hero_title');
    const heroSub = getValor('hero_subtitle');
    const ctaText = getValor('cta_text');
    const ctaUrl = safeCtaUrl(getValor('cta_url'));
    const editableAttr = estate.editing ? ' contenteditable="true" spellcheck="false"' : '';
    const editableCls = estate.editing ? ' editable' : '';
    const ctaBlock = ctaText
      ? '<a href="' + T.escapeHtml(ctaUrl) + '" class="preview-hero__cta' + editableCls + '" data-campo="cta_text"' + editableAttr +
          (estate.editing ? ' onclick="event.preventDefault();return false;"' : ' target="_blank" rel="noopener"') + '>' +
          T.escapeHtml(ctaText) +
        '</a>'
      : (estate.editing ? '<button type="button" class="preview-hero__cta editable" data-campo="cta_text" contenteditable="true" spellcheck="false">Agregar boton</button>' : '');
    const ctaUrlEditor = estate.editing && ctaText
      ? '<div class="preview-cta-url-editor"><label>URL del boton:</label><input type="url" id="vp-cta-url" value="' + T.escapeHtml(ctaUrl) + '" placeholder="https://..." maxlength="500"></div>'
      : '';
    return '' +
      '<section class="preview-hero ' + variantClass + '">' +
        '<h1 class="editable" data-campo="hero_title"' + editableAttr + '>' + T.escapeHtml(heroTitle) + '</h1>' +
        '<p class="editable" data-campo="hero_subtitle"' + editableAttr + '>' + T.escapeHtml(heroSub) + '</p>' +
        ctaBlock +
        ctaUrlEditor +
      '</section>';
  }

  // Estilo segun plantilla: font, hero variant class
  function estiloPlantilla(slug) {
    if (slug === 'fashion_bold') {
      return {
        cssClass: 'preview-plantilla--bold',
        font: "'Inter', 'Exo 2', system-ui, sans-serif",
        fontH: "'Inter', 'Exo 2', system-ui, sans-serif",
        hero: () => renderHeroEditable('preview-hero--bold'),
      };
    }
    if (slug === 'minimal_artesanal') {
      return {
        cssClass: 'preview-plantilla--artesanal',
        font: "'Lora', Georgia, serif",
        fontH: "'Lora', Georgia, serif",
        hero: () => renderHeroEditable('preview-hero--artesanal'),
      };
    }
    return {
      cssClass: 'preview-plantilla--clean',
      font: "'Inter', 'Exo 2', system-ui, sans-serif",
      fontH: "'Inter', 'Exo 2', system-ui, sans-serif",
      hero: () => renderHeroEditable('preview-hero--clean'),
    };
  }

  function wireInteracciones(data, tienda) {
    const T = window.TiendaIA;

    // v2 BUG #1 fix: reset navGuards de esta view en cada wire para no acumular.
    // El toggle llama renderVistaPrevia que llama wireInteracciones de nuevo;
    // sin este reset, cada toggle agregaba un guard nuevo (despues de 5 toggles,
    // 5 confirm() apilados al navegar).
    if (T.state && Array.isArray(T.state.viewNavGuards)) T.state.viewNavGuards = [];

    // Toggle modo editor
    const btnToggle = document.getElementById('vp-toggle-editor');
    if (btnToggle) {
      btnToggle.addEventListener('click', async () => {
        // v2 BUG #2 fix: deshabilitar al inicio para evitar double-click race.
        // El boton sera reemplazado por innerHTML del re-render, no requiere re-habilitar.
        if (btnToggle.disabled) return;
        btnToggle.disabled = true;
        if (estate.editing && estate.dirty) {
          if (!window.confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) {
            btnToggle.disabled = false;
            return;
          }
          estate.personalizaciones = Object.assign({}, tienda.personalizaciones || {});
          estate.dirty = false;
        }
        estate.editing = !estate.editing;
        await renderVistaPrevia();
      });
    }

    // Boton Guardar y publicar (solo visible en modo editor)
    const btnGuardar = document.getElementById('vp-guardar');
    if (btnGuardar) {
      btnGuardar.addEventListener('click', () => guardarPersonalizaciones(tienda));
    }

    if (!estate.editing) return;

    // Listeners para cada campo editable (contenteditable)
    document.querySelectorAll('.editable[data-campo]').forEach(el => {
      el.addEventListener('input', () => {
        const campo = el.getAttribute('data-campo');
        if (!PERSONALIZABLES.includes(campo)) return;
        let valor = (el.textContent || '').trim();
        if (valor.length > MAX_LEN) {
          valor = valor.slice(0, MAX_LEN);
          el.textContent = valor;
          // Mover cursor al final
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // Si vuelve al default, eliminar la personalizacion (limpia el JSON)
        if (valor === estate.defaults[campo]) {
          delete estate.personalizaciones[campo];
        } else {
          estate.personalizaciones[campo] = valor;
        }
        estate.dirty = true;
        actualizarBotonGuardar();
      });
      // Permitir blur con Escape (cancela edicion del input actual)
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && el.tagName !== 'P') {
          ev.preventDefault();
          el.blur();
        }
      });
    });

    // Input para URL del CTA
    const inputCtaUrl = document.getElementById('vp-cta-url');
    if (inputCtaUrl) {
      inputCtaUrl.addEventListener('input', () => {
        const valor = inputCtaUrl.value.trim();
        if (valor.length > 500) return;
        if (valor === estate.defaults.cta_url || valor === '') {
          delete estate.personalizaciones.cta_url;
        } else {
          estate.personalizaciones.cta_url = valor;
        }
        estate.dirty = true;
        actualizarBotonGuardar();
      });
    }

    // navGuard si dirty
    T.registerNavGuard(() => {
      if (!estate.editing || !estate.dirty) return true;
      return window.confirm('Tienes cambios sin guardar en la vista previa. ¿Salir de todos modos?');
    });
  }

  function actualizarBotonGuardar() {
    const btn = document.getElementById('vp-guardar');
    if (!btn) return;
    btn.disabled = !(estate.dirty && !estate.guardando);
    btn.textContent = estate.guardando ? 'Guardando...' : 'Guardar y publicar';
  }

  async function guardarPersonalizaciones(tienda) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    if (estate.guardando) return;

    // Limpiar valores invalidos (definensa): truncar y validar URL
    const limpio = {};
    for (const k of PERSONALIZABLES) {
      const v = estate.personalizaciones[k];
      if (v == null || v === '') continue;
      if (k === 'cta_url') {
        const valid = safeCtaUrl(v);
        if (valid && valid !== '#') limpio[k] = valid;
      } else {
        const trimmed = String(v).trim().slice(0, MAX_LEN);
        if (trimmed) limpio[k] = trimmed;
      }
    }

    estate.guardando = true;
    actualizarBotonGuardar();

    try {
      const { data, error } = await sb.from('tiendas')
        .update({ personalizaciones: limpio })
        .eq('id', tienda.id)
        .select('personalizaciones')
        .maybeSingle();
      if (error) {
        T.toast('Error al guardar: ' + (error.message || 'desconocido'), 'error');
        estate.guardando = false;
        actualizarBotonGuardar();
        return;
      }
      if (!data) {
        T.toast('No se pudo actualizar. Refresca e intenta de nuevo.', 'error');
        estate.guardando = false;
        actualizarBotonGuardar();
        return;
      }
      // Persistir en el state global de la tienda tambien
      tienda.personalizaciones = data.personalizaciones || {};
      T.state.tienda.personalizaciones = tienda.personalizaciones;
      estate.personalizaciones = Object.assign({}, tienda.personalizaciones);
      estate.dirty = false;
      estate.guardando = false;
      T.toast('Cambios guardados ✓', 'success');
      // Salir de modo editor y re-render
      estate.editing = false;
      await renderVistaPrevia();
    } catch (e) {
      console.error('[vista-previa guardar] exception', e);
      T.toast('Error: ' + (e.message || e), 'error');
      estate.guardando = false;
      actualizarBotonGuardar();
    }
  }
})();
