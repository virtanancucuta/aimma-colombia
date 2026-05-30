/* AIMMA · Tienda IA · views/vista-previa.js · v1 · 2026-05-30
   Fase 3.4b - Mockup interactivo del storefront dentro del Panel.
   Renderiza una preview con datos reales de la tienda + paleta + plantilla
   + productos. NO es el storefront publico real (eso es Fase 4) sino una
   simulacion fiel para que el cliente vea como se ve antes de tener
   subdominio con cert. */

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
  // Validar URL https/http
  function safeImgUrl(url) {
    if (!url) return null;
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? url : null; }
    catch { return null; }
  }

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
      view.innerHTML = renderHeader() + renderMockup(data, tienda);
      wireInteracciones();
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
    return '' +
      '<header style="margin-bottom:20px;">' +
        '<h1 class="ta-section-title">Vista previa de tu tienda</h1>' +
        '<p class="ta-section-sub">' +
          'Asi se vera tu tienda online cuando este publica. Esta es una <strong>simulacion fiel</strong> dentro del panel para que veas como queda con tu paleta, plantilla y catalogo. La tienda publica real estara en la siguiente fase del modulo.' +
        '</p>' +
      '</header>';
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
            '<div>' + T.escapeHtml(tienda.nombre_negocio || tienda.slug) + '</div>' +
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

  // Estilo segun plantilla: font, hero block
  function estiloPlantilla(slug) {
    const T = window.TiendaIA;
    if (slug === 'fashion_bold') {
      return {
        cssClass: 'preview-plantilla--bold',
        font: "'Inter', 'Exo 2', system-ui, sans-serif",
        fontH: "'Inter', 'Exo 2', system-ui, sans-serif",
        hero: (tienda) => '' +
          '<section class="preview-hero preview-hero--bold">' +
            '<h1>' + T.escapeHtml(tienda.nombre_negocio || 'Tu marca') + '</h1>' +
            '<p>Calidad y estilo en cada pieza.</p>' +
            '<button type="button" class="preview-hero__cta" onclick="return false;">Ver coleccion</button>' +
          '</section>',
      };
    }
    if (slug === 'minimal_artesanal') {
      return {
        cssClass: 'preview-plantilla--artesanal',
        font: "'Lora', Georgia, serif",
        fontH: "'Lora', Georgia, serif",
        hero: (tienda) => '' +
          '<section class="preview-hero preview-hero--artesanal">' +
            '<h1>' + T.escapeHtml(tienda.nombre_negocio || 'Tu marca') + '</h1>' +
            '<p>Hecho a mano, con dedicacion.</p>' +
          '</section>',
      };
    }
    // industrial_clean (default)
    return {
      cssClass: 'preview-plantilla--clean',
      font: "'Inter', 'Exo 2', system-ui, sans-serif",
      fontH: "'Inter', 'Exo 2', system-ui, sans-serif",
      hero: (tienda) => '' +
        '<section class="preview-hero preview-hero--clean">' +
          '<h1>' + T.escapeHtml(tienda.nombre_negocio || 'Tu marca') + '</h1>' +
          '<p>Soluciones profesionales para tu negocio.</p>' +
          '<button type="button" class="preview-hero__cta" onclick="return false;">Conoce mas</button>' +
        '</section>',
    };
  }

  function wireInteracciones() {
    // Por ahora los buttons son demo (onclick return false) - nada que hacer
  }
})();
