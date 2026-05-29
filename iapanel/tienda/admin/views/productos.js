/* AIMMA · Tienda IA · views/productos.js · v5 · 2026-05-29
   Fase 3.3a (lista) + 3.3b (form) + 3.3c (matriz variantes color x talla).
   v5 (2026-05-29 post-audit 3.3c): 3 HIGH + 1 MEDIUM fixes
   - BUG #1 HIGH: id="variantes-seccion" en lugar de selector :last-of-type fragil.
   - BUG #2 HIGH: sanitizar "__" en input de color/talla para no romper keys de matriz.
   - BUG #3 HIGH: capturar check_violation 23514 (stock < reservado) con mensaje claro.
   - BUG #4 MEDIUM: regex diacriticos via new RegExp con ̀-ͯ para no depender del encoding.
   v4 (2026-05-29): Fase 3.3c - matriz combinatoria color x talla con stock
   por SKU. Solo aparece en edicion (necesita producto guardado). SKU auto
   generado de <ref>-<color-slug>-<talla-slug>. Guard de reservas activas
   en eliminacion. Diff con upsert (insert nuevas + update existentes +
   delete removidas).
   v3 (2026-05-29 post-feedback Jorge): API registerNavGuard.
   v2 (2026-05-29 post-audit): 2 HIGH + 3 MEDIUM fixes:
   - BUG #1 HIGH: sanitizar caracteres especiales en busqueda para evitar
     inyeccion de filtro PostgREST (RLS limita blast radius pero igual).
   - BUG #2 HIGH: re-query btn-guardar en restoreBtn por si el DOM cambio.
   - BUG #3 MEDIUM: detectar UPDATE silencioso (data=null sin error =
     RLS bloqueo) en vez de mostrar "actualizado" falsamente.
   - BUG #4 MEDIUM: hashchange handler con confirm para no perder cambios
     al navegar a otra seccion del SPA con cambios sin guardar.
   - BUG #5 MEDIUM: usar error.code='23505' en vez de substring del mensaje
     para detectar unique constraint violation (robusto a renombres).
   Variantes color x talla = 3.3c (proxima vuelta).
   Upload fotos + cross-modulo Estudio Visual = 3.3d (despues). */

(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[productos.js] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.registerView('productos', renderProductos);
  });

  // ============================================================
  // Dispatch: lista vs form segun paramId
  // ============================================================
  async function renderProductos() {
    const T = window.TiendaIA;
    const params = T.state.currentRouteParams;
    const view = T.dom.mainView;

    // Loading skeleton
    view.innerHTML = '<div class="ta-card"><div class="ta-empty"><div class="ta-loader" style="width:32px;height:32px;margin:0 auto 12px;"></div><p class="ta-empty__text">Cargando...</p></div></div>';

    try {
      if (!params || !params.id) {
        // #/productos -> lista
        await renderLista();
      } else if (params.id === 'nuevo') {
        // #/productos/nuevo -> form crear
        await renderForm(null);
      } else {
        // #/productos/<uuid> -> form editar
        await renderForm(params.id);
      }
    } catch (e) {
      console.error('[productos] render error', e);
      view.innerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">No pudimos cargar la pagina</h2><p class="ta-empty__text">' + T.escapeHtml(e.message || String(e)) + '</p></div></div>';
    }
  }

  // ============================================================
  // VISTA LISTA
  // ============================================================
  let listaState = {
    filtroBusqueda: '',
    filtroCategoria: '',  // '' = todas
    filtroEstado: '',     // '' = todos | 'activo' | 'inactivo'
    pagina: 0,
  };
  const POR_PAGINA = 50;

  async function renderLista() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const view = T.dom.mainView;

    // Cargar categorias (para dropdown filtro) + productos paginados
    const desde = listaState.pagina * POR_PAGINA;
    const hasta = desde + POR_PAGINA - 1;

    let prodQuery = sb.from('productos')
      .select('id, referencia, nombre, precio_venta, precio_promo, foto_principal_url, estado, categoria_id, created_at, categorias(nombre)', { count: 'exact' })
      .eq('tienda_id', tienda.id);

    if (listaState.filtroBusqueda) {
      // v2 BUG #1 fix: sanitizar caracteres que rompen el parsing del filtro
      // PostgREST (coma, parentesis, comilla) + escapar wildcards SQL (%, _)
      // para que el usuario no obtenga matches accidentales.
      const q = listaState.filtroBusqueda.trim()
        .replace(/[,()'"\\]/g, '')   // chars que rompen parsing
        .replace(/[%_]/g, '\\$&')    // wildcards SQL escapados
        .slice(0, 100);              // tope de longitud razonable
      if (q) {
        prodQuery = prodQuery.or('nombre.ilike.%' + q + '%,referencia.ilike.%' + q + '%');
      }
    }
    if (listaState.filtroCategoria) prodQuery = prodQuery.eq('categoria_id', listaState.filtroCategoria);
    if (listaState.filtroEstado) prodQuery = prodQuery.eq('estado', listaState.filtroEstado);

    prodQuery = prodQuery.order('created_at', { ascending: false }).range(desde, hasta);

    const [prodRes, catRes] = await Promise.all([
      prodQuery,
      sb.from('categorias').select('id, nombre, parent_id').eq('tienda_id', tienda.id).order('nombre'),
    ]);

    const productos = prodRes.data || [];
    const totalCount = prodRes.count || 0;
    const categorias = catRes.data || [];

    view.innerHTML = renderListaHTML(productos, totalCount, categorias);
    wireListaEvents();
  }

  function renderListaHTML(productos, totalCount, categorias) {
    const T = window.TiendaIA;
    const totalPaginas = Math.max(1, Math.ceil(totalCount / POR_PAGINA));
    const paginaActual = listaState.pagina + 1;

    const opcionesCategorias = '<option value="">Todas las categorias</option>' +
      categorias.map(c => '<option value="' + T.escapeHtml(c.id) + '"' + (listaState.filtroCategoria === c.id ? ' selected' : '') + '>' + T.escapeHtml(c.nombre) + '</option>').join('');

    let tbody = '';
    if (productos.length === 0) {
      tbody = '<tr><td colspan="6"><div class="ta-empty" style="padding:32px 16px;">' +
        '<h2 class="ta-empty__title">' + (totalCount === 0 && !listaState.filtroBusqueda && !listaState.filtroCategoria && !listaState.filtroEstado ? 'No tienes productos cargados todavia' : 'Sin resultados con esos filtros') + '</h2>' +
        '<p class="ta-empty__text">' + (totalCount === 0 ? 'Empieza creando tu primer producto.' : 'Prueba ajustar los filtros o limpiarlos.') + '</p>' +
        (totalCount === 0 ? '<a href="#/productos/nuevo" class="ta-btn ta-btn--primary">Crear primer producto</a>' : '') +
        '</div></td></tr>';
    } else {
      tbody = productos.map(p => {
        const foto = p.foto_principal_url
          ? '<img src="' + T.escapeHtml(p.foto_principal_url) + '" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;border:1px solid var(--ta-border);">'
          : '<div style="width:40px;height:40px;border-radius:6px;background:var(--ta-bg-soft);display:flex;align-items:center;justify-content:center;color:var(--ta-text-mut);font-size:18px;">📦</div>';
        const categoriaNom = (p.categorias && p.categorias.nombre) ? T.escapeHtml(p.categorias.nombre) : '<span style="color:var(--ta-text-mut);">Sin categoria</span>';
        const estadoPill = p.estado === 'activo'
          ? '<span class="ta-pill ta-pill--ok" style="margin-left:0;">Activo</span>'
          : '<span class="ta-pill ta-pill--warn" style="margin-left:0;">Inactivo</span>';
        const precio = fmtCOP(Number(p.precio_venta || 0));
        const precioPromo = p.precio_promo ? '<br><span style="color:var(--ta-success);font-size:11px;">Promo ' + fmtCOP(Number(p.precio_promo)) + '</span>' : '';
        return '<tr data-id="' + T.escapeHtml(p.id) + '" style="cursor:pointer;">' +
          '<td>' + foto + '</td>' +
          '<td><strong>' + T.escapeHtml(p.nombre) + '</strong><br><code style="font-size:11px;">' + T.escapeHtml(p.referencia) + '</code></td>' +
          '<td>' + categoriaNom + '</td>' +
          '<td style="text-align:right;">' + precio + precioPromo + '</td>' +
          '<td>' + estadoPill + '</td>' +
          '<td style="text-align:right;"><a href="#/productos/' + T.escapeHtml(p.id) + '" class="ta-btn" style="padding:6px 12px;font-size:12px;">Editar</a></td>' +
        '</tr>';
      }).join('');
    }

    return '' +
      '<header style="display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:20px;flex-wrap:wrap;">' +
        '<div>' +
          '<h1 class="ta-section-title">Productos</h1>' +
          '<p class="ta-section-sub">' + totalCount + ' producto(s) en tu catalogo. Cada producto puede tener variantes (color, talla) en la sub-fase 3.3c.</p>' +
        '</div>' +
        '<a href="#/productos/nuevo" class="ta-btn ta-btn--primary">+ Crear producto</a>' +
      '</header>' +

      '<div class="ta-card" style="padding:14px 16px;margin-bottom:20px;">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
          '<input id="lista-buscar" class="ta-input" type="text" placeholder="Buscar por nombre o referencia..." value="' + T.escapeHtml(listaState.filtroBusqueda) + '" style="flex:1;min-width:200px;">' +
          '<select id="lista-categoria" class="ta-select" style="max-width:220px;">' + opcionesCategorias + '</select>' +
          '<select id="lista-estado" class="ta-select" style="max-width:160px;">' +
            '<option value=""' + (listaState.filtroEstado === '' ? ' selected' : '') + '>Todos los estados</option>' +
            '<option value="activo"' + (listaState.filtroEstado === 'activo' ? ' selected' : '') + '>Activo</option>' +
            '<option value="inactivo"' + (listaState.filtroEstado === 'inactivo' ? ' selected' : '') + '>Inactivo</option>' +
          '</select>' +
          (listaState.filtroBusqueda || listaState.filtroCategoria || listaState.filtroEstado
            ? '<button id="lista-limpiar" class="ta-btn" style="white-space:nowrap;">Limpiar</button>'
            : '') +
        '</div>' +
      '</div>' +

      '<div class="ta-card" style="padding:0;overflow:hidden;">' +
        '<div class="ta-table-wrap">' +
          '<table class="ta-table">' +
            '<thead><tr>' +
              '<th style="width:60px;">Foto</th>' +
              '<th>Producto</th>' +
              '<th>Categoria</th>' +
              '<th style="text-align:right;">Precio</th>' +
              '<th>Estado</th>' +
              '<th style="text-align:right;width:80px;"></th>' +
            '</tr></thead>' +
            '<tbody>' + tbody + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +

      (totalPaginas > 1
        ? '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">' +
            '<span style="color:var(--ta-text-soft);font-size:13px;">Pagina ' + paginaActual + ' de ' + totalPaginas + '</span>' +
            '<div style="display:flex;gap:8px;">' +
              (listaState.pagina > 0 ? '<button id="lista-prev" class="ta-btn">← Anterior</button>' : '') +
              (listaState.pagina < totalPaginas - 1 ? '<button id="lista-next" class="ta-btn">Siguiente →</button>' : '') +
            '</div>' +
          '</div>'
        : '');
  }

  let buscarTimer = null;
  function wireListaEvents() {
    const view = window.TiendaIA.dom.mainView;

    const buscar = view.querySelector('#lista-buscar');
    if (buscar) {
      buscar.addEventListener('input', (e) => {
        clearTimeout(buscarTimer);
        buscarTimer = setTimeout(() => {
          listaState.filtroBusqueda = e.target.value;
          listaState.pagina = 0;
          renderLista().catch(err => console.error(err));
        }, 300);
      });
    }
    const cat = view.querySelector('#lista-categoria');
    if (cat) cat.addEventListener('change', (e) => { listaState.filtroCategoria = e.target.value; listaState.pagina = 0; renderLista().catch(err => console.error(err)); });
    const est = view.querySelector('#lista-estado');
    if (est) est.addEventListener('change', (e) => { listaState.filtroEstado = e.target.value; listaState.pagina = 0; renderLista().catch(err => console.error(err)); });
    const limpiar = view.querySelector('#lista-limpiar');
    if (limpiar) limpiar.addEventListener('click', () => { listaState = { filtroBusqueda: '', filtroCategoria: '', filtroEstado: '', pagina: 0 }; renderLista().catch(err => console.error(err)); });
    const prev = view.querySelector('#lista-prev');
    if (prev) prev.addEventListener('click', () => { listaState.pagina = Math.max(0, listaState.pagina - 1); renderLista().catch(err => console.error(err)); });
    const next = view.querySelector('#lista-next');
    if (next) next.addEventListener('click', () => { listaState.pagina += 1; renderLista().catch(err => console.error(err)); });

    // Click en filas (excepto el boton Editar que ya tiene su href)
    view.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a')) return; // el link ya navega
        const id = tr.getAttribute('data-id');
        window.location.hash = '#/productos/' + id;
      });
    });

    window.TiendaIA.registerCleanup(() => { clearTimeout(buscarTimer); });
  }

  // ============================================================
  // VISTA FORM (crear / editar)
  // ============================================================
  let formState = { producto: null, categorias: [], dirty: false };
  // v4 (Fase 3.3c): editor matriz color x talla
  let variantesState = {
    activo: false,        // true cuando el user clickea "Agregar variantes" o ya hay variantes
    colores: [],          // ej. ['Rojo', 'Negro']
    tallas: [],           // ej. ['S', 'M', 'L']
    matriz: {},           // mapa "<color>__<talla>" -> { id, stock, precio_override, sku, reservado }
    original: [],         // snapshot de la DB para diff al guardar
    dirty: false,
  };

  async function renderForm(id) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;

    const [catRes, prodRes] = await Promise.all([
      sb.from('categorias').select('id, nombre, parent_id').eq('tienda_id', tienda.id).order('nombre'),
      id ? sb.from('productos').select('*').eq('id', id).eq('tienda_id', tienda.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    if (id && (!prodRes.data || prodRes.error)) {
      T.dom.mainView.innerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">Producto no encontrado</h2><p class="ta-empty__text">Puede haber sido eliminado o no pertenece a tu tienda.</p><a href="#/productos" class="ta-btn">Volver a la lista</a></div></div>';
      return;
    }

    formState = { producto: prodRes.data || null, categorias: catRes.data || [], dirty: false };
    // v4: si producto existe, cargar variantes en paralelo
    if (formState.producto) {
      await cargarVariantes(formState.producto.id);
    } else {
      variantesState = { activo: false, colores: [], tallas: [], matriz: {}, original: [], dirty: false };
    }
    T.dom.mainView.innerHTML = renderFormHTML();
    wireFormEvents();
  }

  // v4: carga variantes desde DB y reconstruye matriz para el editor
  async function cargarVariantes(productoId) {
    const sb = window.TiendaIA.supabase();
    const { data, error } = await sb.from('producto_variantes')
      .select('id, color, talla, sku, stock, reservado, precio_override')
      .eq('producto_id', productoId);
    if (error) {
      console.error('[cargarVariantes] error', error);
      variantesState = { activo: false, colores: [], tallas: [], matriz: {}, original: [], dirty: false };
      return;
    }
    const lista = data || [];
    const colores = Array.from(new Set(lista.map(v => v.color).filter(Boolean)));
    const tallas = Array.from(new Set(lista.map(v => v.talla).filter(Boolean)));
    const matriz = {};
    for (const v of lista) {
      const k = (v.color || '') + '__' + (v.talla || '');
      matriz[k] = {
        id: v.id, sku: v.sku, stock: v.stock, reservado: v.reservado || 0,
        precio_override: v.precio_override, color: v.color, talla: v.talla,
      };
    }
    variantesState = {
      activo: lista.length > 0,
      colores, tallas, matriz,
      original: lista.map(v => ({ id: v.id, color: v.color, talla: v.talla, sku: v.sku, stock: v.stock, reservado: v.reservado, precio_override: v.precio_override })),
      dirty: false,
    };
  }

  function renderFormHTML() {
    const T = window.TiendaIA;
    const p = formState.producto;
    const esEdicion = !!p;

    const opcionesCategorias = '<option value="">— Sin categoria —</option>' +
      formState.categorias.map(c => {
        const sel = p && p.categoria_id === c.id ? ' selected' : '';
        return '<option value="' + T.escapeHtml(c.id) + '"' + sel + '>' + T.escapeHtml(c.nombre) + '</option>';
      }).join('');

    return '' +
      '<header style="margin-bottom:24px;">' +
        '<a href="#/productos" style="font-size:13px;color:var(--ta-text-soft);">← Volver a productos</a>' +
        '<h1 class="ta-section-title" style="margin-top:8px;">' + (esEdicion ? 'Editar producto' : 'Nuevo producto') + '</h1>' +
        '<p class="ta-section-sub">' +
          (esEdicion
            ? 'Editando "' + T.escapeHtml(p.nombre) + '". Las variantes (color, talla, stock) se gestionan en la sub-fase 3.3c.'
            : 'Datos basicos del producto. Variantes y fotos se agregan despues de guardar.') +
        '</p>' +
      '</header>' +

      '<form id="prod-form" class="ta-card" style="max-width:760px;" autocomplete="off">' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="f-nombre">Nombre del producto *</label>' +
          '<input id="f-nombre" name="nombre" class="ta-input" type="text" required maxlength="200" value="' + T.escapeHtml(p?.nombre || '') + '">' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="f-referencia">Referencia (SKU base) *</label>' +
          '<input id="f-referencia" name="referencia" class="ta-input" type="text" required maxlength="60" value="' + T.escapeHtml(p?.referencia || '') + '" placeholder="ej. ZAP-ITALO-001">' +
          '<span class="ta-field__hint">Codigo unico interno del producto. Las variantes color/talla se construyen sobre este.</span>' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="f-categoria">Categoria</label>' +
          '<select id="f-categoria" name="categoria_id" class="ta-select">' + opcionesCategorias + '</select>' +
          (formState.categorias.length === 0 ? '<span class="ta-field__hint">No tienes categorias creadas. <a href="#/categorias">Crear ahora</a></span>' : '') +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="f-descripcion">Descripcion</label>' +
          '<textarea id="f-descripcion" name="descripcion" class="ta-textarea" maxlength="2000" rows="4">' + T.escapeHtml(p?.descripcion || '') + '</textarea>' +
          '<span class="ta-field__hint">Lo que verá el comprador en la página del producto.</span>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;">' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-precio">Precio de venta * (COP)</label>' +
            '<input id="f-precio" name="precio_venta" class="ta-input" type="number" required min="1" step="1" value="' + (p?.precio_venta || '') + '">' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-costo">Costo (COP)</label>' +
            '<input id="f-costo" name="costo" class="ta-input" type="number" min="0" step="1" value="' + (p?.costo || '') + '">' +
            '<span class="ta-field__hint">Privado, no se muestra al comprador.</span>' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-precio-promo">Precio promo (COP)</label>' +
            '<input id="f-precio-promo" name="precio_promo" class="ta-input" type="number" min="1" step="1" value="' + (p?.precio_promo || '') + '">' +
            '<span class="ta-field__hint">Si está, se muestra el precio normal tachado.</span>' +
          '</div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-precio-mayorista">Precio mayorista (COP)</label>' +
            '<input id="f-precio-mayorista" name="precio_mayorista" class="ta-input" type="number" min="1" step="1" value="' + (p?.precio_mayorista || '') + '">' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-cant-min">Cantidad mínima mayorista</label>' +
            '<input id="f-cant-min" name="cantidad_min_mayorista" class="ta-input" type="number" min="1" step="1" value="' + (p?.cantidad_min_mayorista || '') + '">' +
          '</div>' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="f-estado">Estado</label>' +
          '<select id="f-estado" name="estado" class="ta-select" style="max-width:240px;">' +
            '<option value="activo"' + (!p || p.estado === 'activo' ? ' selected' : '') + '>Activo (visible en tienda)</option>' +
            '<option value="inactivo"' + (p && p.estado === 'inactivo' ? ' selected' : '') + '>Inactivo (oculto)</option>' +
          '</select>' +
        '</div>' +

        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:24px;padding-top:20px;border-top:1px solid var(--ta-border);">' +
          (esEdicion ? '<button type="button" id="btn-eliminar" class="ta-btn ta-btn--danger">Eliminar producto</button>' : '<span></span>') +
          '<div style="display:flex;gap:8px;">' +
            '<a href="#/productos" class="ta-btn">Cancelar</a>' +
            '<button type="submit" id="btn-guardar" class="ta-btn ta-btn--primary">' + (esEdicion ? 'Guardar cambios' : 'Crear producto') + '</button>' +
          '</div>' +
        '</div>' +

      '</form>' +

      // v4 (Fase 3.3c): seccion Variantes solo en edicion
      (esEdicion ? renderVariantesSeccion(p) : '');
  }

  // ============================================================
  // VARIANTES (Fase 3.3c)
  // ============================================================
  // v4 BUG #4 fix: construir el regex con escapes Unicode via new RegExp para
  // no depender del encoding del archivo fuente. El rango ̀-ͯ cubre
  // Combining Diacritical Marks (tildes, dieresis, etc).
  const RE_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
  function slugify(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(RE_DIACRITICS, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
  }

  function generarSku(referenciaProd, color, talla) {
    const ref = slugify(referenciaProd) || 'sku';
    const c = color ? slugify(color) : '';
    const t = talla ? slugify(talla) : '';
    return [ref, c, t].filter(Boolean).join('-').slice(0, 60);
  }

  function getMatrizCelda(color, talla) {
    return variantesState.matriz[(color || '') + '__' + (talla || '')] || null;
  }
  function setMatrizCelda(color, talla, payload) {
    variantesState.matriz[(color || '') + '__' + (talla || '')] = payload;
  }
  function delMatrizCelda(color, talla) {
    delete variantesState.matriz[(color || '') + '__' + (talla || '')];
  }

  function renderVariantesSeccion(producto) {
    const T = window.TiendaIA;

    // Estado A: producto sin variantes y editor NO activo - mostrar CTA
    // v4 BUG #1 fix: id="variantes-seccion" para selector robusto en rerender.
    if (!variantesState.activo) {
      return '' +
        '<section id="variantes-seccion" class="ta-card" style="max-width:760px;margin-top:24px;">' +
          '<h2 style="margin:0 0 8px;font-size:20px;">Variantes</h2>' +
          '<p style="color:var(--ta-text-soft);margin:0 0 16px;font-size:14px;">' +
            'Si tu producto se vende en varios colores o tallas, agrega variantes. ' +
            'Cada combinacion color × talla tiene su propio stock y SKU. ' +
            'Si vendes solo una version, no necesitas variantes.' +
          '</p>' +
          '<button type="button" id="btn-activar-variantes" class="ta-btn ta-btn--primary">+ Agregar variantes</button>' +
        '</section>';
    }

    // Estado B: editor activo
    const tagsColores = variantesState.colores.map(c =>
      '<span class="ta-tag">' + T.escapeHtml(c) +
        ' <button type="button" class="ta-tag__x" data-tag-tipo="color" data-tag-valor="' + T.escapeHtml(c) + '" aria-label="Quitar color">×</button>' +
      '</span>'
    ).join('');
    const tagsTallas = variantesState.tallas.map(t =>
      '<span class="ta-tag">' + T.escapeHtml(t) +
        ' <button type="button" class="ta-tag__x" data-tag-tipo="talla" data-tag-valor="' + T.escapeHtml(t) + '" aria-label="Quitar talla">×</button>' +
      '</span>'
    ).join('');

    const matrizHtml = renderMatrizTabla(producto);

    return '' +
      '<section id="variantes-seccion" class="ta-card" style="max-width:1100px;margin-top:24px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap;">' +
          '<div>' +
            '<h2 style="margin:0 0 4px;font-size:20px;">Variantes</h2>' +
            '<p style="margin:0;color:var(--ta-text-soft);font-size:13px;">' +
              'Agrega colores y tallas. La matriz combinatoria genera un SKU + stock por celda.' +
            '</p>' +
          '</div>' +
          (variantesState.colores.length || variantesState.tallas.length
            ? '<button type="button" id="btn-cancelar-variantes" class="ta-btn">Quitar todas las variantes</button>'
            : '') +
        '</div>' +

        '<div style="margin-top:20px;">' +
          '<div class="ta-field">' +
            '<label class="ta-field__label">Colores</label>' +
            '<div class="ta-tags-row">' + tagsColores +
              '<input id="input-color" type="text" placeholder="Escribe un color y enter" maxlength="40" class="ta-tag-input">' +
            '</div>' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label">Tallas</label>' +
            '<div class="ta-tags-row">' + tagsTallas +
              '<input id="input-talla" type="text" placeholder="Escribe una talla y enter" maxlength="40" class="ta-tag-input">' +
            '</div>' +
          '</div>' +
        '</div>' +

        matrizHtml +

        (variantesState.colores.length > 0 || variantesState.tallas.length > 0 ? '' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid var(--ta-border);">' +
            '<button type="button" id="btn-guardar-variantes" class="ta-btn ta-btn--primary">Guardar variantes</button>' +
          '</div>'
        : '') +
      '</section>';
  }

  function renderMatrizTabla(producto) {
    const T = window.TiendaIA;
    const colores = variantesState.colores;
    const tallas = variantesState.tallas;

    if (colores.length === 0 || tallas.length === 0) {
      return '<p style="color:var(--ta-text-mut);font-size:13px;margin-top:16px;">Agrega al menos un color y una talla para ver la matriz de variantes.</p>';
    }

    let thead = '<tr><th style="width:140px;">Color \\ Talla</th>';
    for (const t of tallas) thead += '<th>' + T.escapeHtml(t) + '</th>';
    thead += '</tr>';

    let tbody = '';
    for (const color of colores) {
      tbody += '<tr><th style="text-align:left;background:var(--ta-bg-soft);">' + T.escapeHtml(color) + '</th>';
      for (const talla of tallas) {
        const celda = getMatrizCelda(color, talla);
        const sku = celda?.sku || generarSku(producto.referencia, color, talla);
        const stock = celda?.stock != null ? celda.stock : '';
        const reservadoStr = celda?.reservado > 0 ? '<span style="color:var(--ta-warn);font-size:11px;">(reserv: ' + celda.reservado + ')</span>' : '';
        tbody += '' +
          '<td>' +
            '<div style="display:flex;flex-direction:column;gap:4px;">' +
              '<code style="font-size:11px;color:var(--ta-text-mut);">' + T.escapeHtml(sku) + '</code>' +
              '<input type="number" min="0" step="1" placeholder="Stock" value="' + T.escapeHtml(String(stock)) + '" ' +
                'data-celda-color="' + T.escapeHtml(color) + '" data-celda-talla="' + T.escapeHtml(talla) + '" ' +
                'class="ta-input ta-input--stock" style="padding:6px 8px;font-size:13px;">' +
              reservadoStr +
            '</div>' +
          '</td>';
      }
      tbody += '</tr>';
    }

    return '' +
      '<div style="margin-top:20px;overflow-x:auto;">' +
        '<table class="ta-table" style="font-size:13px;">' +
          '<thead>' + thead + '</thead>' +
          '<tbody>' + tbody + '</tbody>' +
        '</table>' +
      '</div>';
  }

  function wireFormEvents() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;
    const form = view.querySelector('#prod-form');
    if (!form) return;

    // Track dirty
    form.addEventListener('input', () => { formState.dirty = true; });

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSubmit(form);
    });

    // Eliminar
    const btnEliminar = view.querySelector('#btn-eliminar');
    if (btnEliminar) {
      btnEliminar.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este producto y todas sus variantes? Esta accion no se puede deshacer.')) return;
        await handleDelete();
      });
    }

    // Warn beforeunload si dirty (cierre tab / reload)
    const warnFn = (ev) => {
      if (formState.dirty) {
        ev.preventDefault();
        ev.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnFn);

    // v3 (post-feedback Jorge): registrar nav guard via admin.js API. El listener
    // hashchange directo de v2 NO funcionaba porque admin.js dispatch primero y
    // ya habia llamado cleanupCurrentView() que removia el listener antes de que
    // pudiera chequear dirty. Ahora admin.js evalua guards ANTES del cleanup.
    T.registerNavGuard(() => {
      // v4: incluir variantes dirty en el guard
      if (!formState.dirty && !variantesState.dirty) return true;
      const confirmar = window.confirm('Tienes cambios sin guardar en este producto o sus variantes. ¿Salir de todos modos?');
      if (confirmar) {
        formState.dirty = false;
        variantesState.dirty = false;
      }
      return confirmar;
    });

    T.registerCleanup(() => {
      window.removeEventListener('beforeunload', warnFn);
    });

    // v4 (Fase 3.3c): wire variantes events si producto en edicion
    if (formState.producto) {
      wireVariantesEvents();
    }
  }

  // ============================================================
  // Variantes: event handlers
  // ============================================================
  function wireVariantesEvents() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    // Activar editor
    const btnActivar = view.querySelector('#btn-activar-variantes');
    if (btnActivar) {
      btnActivar.addEventListener('click', () => {
        variantesState.activo = true;
        rerenderVariantes();
      });
    }

    // Cancelar/quitar todas las variantes
    const btnCancelar = view.querySelector('#btn-cancelar-variantes');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => {
        const hayDatos = Object.keys(variantesState.matriz).length > 0;
        if (hayDatos && !window.confirm('Quitar TODAS las variantes. Esto eliminara los SKUs y stock asociados. ¿Continuar?')) return;
        variantesState.colores = [];
        variantesState.tallas = [];
        variantesState.matriz = {};
        variantesState.activo = false;
        variantesState.dirty = true;
        rerenderVariantes();
      });
    }

    // Agregar color (Enter)
    const inputColor = view.querySelector('#input-color');
    if (inputColor) {
      inputColor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          agregarTag('color', e.target.value);
          e.target.value = '';
        }
      });
    }

    // Agregar talla (Enter)
    const inputTalla = view.querySelector('#input-talla');
    if (inputTalla) {
      inputTalla.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          agregarTag('talla', e.target.value);
          e.target.value = '';
        }
      });
    }

    // Quitar tag (color o talla)
    view.querySelectorAll('.ta-tag__x').forEach(btn => {
      btn.addEventListener('click', () => {
        const tipo = btn.getAttribute('data-tag-tipo');
        const valor = btn.getAttribute('data-tag-valor');
        quitarTag(tipo, valor);
      });
    });

    // Cambios en stock de cada celda
    view.querySelectorAll('.ta-input--stock').forEach(input => {
      input.addEventListener('input', (e) => {
        const color = e.target.getAttribute('data-celda-color');
        const talla = e.target.getAttribute('data-celda-talla');
        const stockRaw = e.target.value;
        const stock = stockRaw === '' ? null : Math.max(0, parseInt(stockRaw, 10) || 0);
        const existente = getMatrizCelda(color, talla) || {};
        setMatrizCelda(color, talla, {
          ...existente,
          color, talla,
          sku: existente.sku || generarSku(formState.producto.referencia, color, talla),
          stock,
        });
        variantesState.dirty = true;
      });
    });

    // Guardar variantes
    const btnGuardarV = view.querySelector('#btn-guardar-variantes');
    if (btnGuardarV) {
      btnGuardarV.addEventListener('click', () => guardarVariantes(btnGuardarV));
    }
  }

  function agregarTag(tipo, valor) {
    // v4 BUG #2 fix: sanitizar input para evitar colision con el separador
    // "__" usado en las keys de matriz. Reemplazar cualquier "__" por "_".
    let v = String(valor || '').trim().replace(/_{2,}/g, '_');
    if (!v) return;
    if (v.length > 40) { window.TiendaIA.toast('Maximo 40 caracteres', 'error'); return; }
    const lista = tipo === 'color' ? variantesState.colores : variantesState.tallas;
    if (lista.some(x => x.toLowerCase() === v.toLowerCase())) {
      window.TiendaIA.toast('Ya existe ese ' + tipo, 'error');
      return;
    }
    if (lista.length >= 20) { window.TiendaIA.toast('Maximo 20 ' + tipo + 's por producto', 'error'); return; }
    lista.push(v);
    variantesState.dirty = true;
    rerenderVariantes();
  }

  function quitarTag(tipo, valor) {
    // Si hay datos guardados en alguna celda con este valor, pedir confirmacion.
    const matrizKeys = Object.keys(variantesState.matriz);
    const afectadas = matrizKeys.filter(k => {
      const [c, t] = k.split('__');
      return (tipo === 'color' && c === valor) || (tipo === 'talla' && t === valor);
    });
    const conStock = afectadas.some(k => (variantesState.matriz[k]?.stock || 0) > 0 || variantesState.matriz[k]?.id);
    if (conStock && !window.confirm('Hay variantes con stock o ya guardadas en BD que se eliminaran. ¿Continuar?')) return;

    if (tipo === 'color') variantesState.colores = variantesState.colores.filter(c => c !== valor);
    else variantesState.tallas = variantesState.tallas.filter(t => t !== valor);

    // Limpiar matriz de las celdas afectadas
    for (const k of afectadas) delete variantesState.matriz[k];

    variantesState.dirty = true;
    rerenderVariantes();
  }

  function rerenderVariantes() {
    // v4 BUG #1 fix: usar id explicito en vez de selector :last-of-type fragil.
    const T = window.TiendaIA;
    const seccionVieja = T.dom.mainView.querySelector('#variantes-seccion');
    if (!seccionVieja || !formState.producto) {
      // Fallback: re-render full
      T.dom.mainView.innerHTML = renderFormHTML();
      wireFormEvents();
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderVariantesSeccion(formState.producto);
    const nueva = wrapper.firstElementChild;
    seccionVieja.replaceWith(nueva);
    wireVariantesEvents();
  }

  // Guardar variantes: diff vs original + insert/update/delete
  async function guardarVariantes(btn) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const producto = formState.producto;
    if (!producto) return;

    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    // Construir lista de variantes actuales desde la matriz (solo celdas con stock definido)
    const actuales = [];
    for (const color of variantesState.colores) {
      for (const talla of variantesState.tallas) {
        const celda = getMatrizCelda(color, talla);
        const stock = celda?.stock;
        if (stock == null) continue; // celdas vacias se ignoran
        actuales.push({
          id: celda?.id,
          color, talla,
          sku: celda?.sku || generarSku(producto.referencia, color, talla),
          stock,
          precio_override: celda?.precio_override || null,
        });
      }
    }

    // Diff vs original
    const idsActuales = new Set(actuales.filter(v => v.id).map(v => v.id));
    const eliminadas = variantesState.original.filter(o => !idsActuales.has(o.id));

    // Guard: no eliminar variantes con reservas activas
    const conReservas = eliminadas.filter(v => (v.reservado || 0) > 0);
    if (conReservas.length > 0) {
      const skus = conReservas.map(v => v.sku).join(', ');
      T.toast('No se puede eliminar variantes con reservas activas: ' + skus, 'error');
      restoreVariantesBtn(btn);
      return;
    }

    try {
      // INSERTS (sin id)
      const nuevas = actuales.filter(v => !v.id).map(v => ({
        producto_id: producto.id,
        color: v.color, talla: v.talla,
        sku: v.sku, stock: v.stock,
        precio_override: v.precio_override,
      }));
      if (nuevas.length > 0) {
        const r = await sb.from('producto_variantes').insert(nuevas);
        if (r.error) {
          if (r.error.code === '23505') {
            T.toast('Algun SKU ya existe en otro producto. Cambia la referencia base del producto y vuelve a intentar.', 'error');
          } else {
            T.toast('Error al crear variantes: ' + r.error.message, 'error');
          }
          restoreVariantesBtn(btn);
          return;
        }
      }

      // UPDATES (con id)
      const existentes = actuales.filter(v => v.id);
      for (const v of existentes) {
        const patch = { color: v.color, talla: v.talla, stock: v.stock, precio_override: v.precio_override };
        const r = await sb.from('producto_variantes').update(patch).eq('id', v.id);
        if (r.error) {
          // v4 BUG #3 fix: capturar check_violation (23514) que dispara cuando
          // el nuevo stock es < reservado. Mensaje claro al usuario.
          if (r.error.code === '23514') {
            // Buscar la variante original para mostrar el reservado actual
            const orig = variantesState.original.find(o => o.id === v.id);
            const reservado = orig?.reservado ?? '?';
            T.toast('SKU "' + v.sku + '": el stock no puede ser menor al reservado (' + reservado + ' en pedidos pendientes)', 'error');
          } else if (r.error.code === '23505') {
            T.toast('Conflicto de SKU "' + v.sku + '". Cambia la referencia base del producto.', 'error');
          } else {
            T.toast('Error al actualizar variante "' + v.sku + '": ' + r.error.message, 'error');
          }
          restoreVariantesBtn(btn);
          return;
        }
      }

      // DELETES
      if (eliminadas.length > 0) {
        const ids = eliminadas.map(e => e.id);
        const r = await sb.from('producto_variantes').delete().in('id', ids);
        if (r.error) {
          T.toast('Error al eliminar variantes: ' + r.error.message, 'error');
          restoreVariantesBtn(btn);
          return;
        }
      }

      // Recargar desde BD para refrescar ids y reservado
      await cargarVariantes(producto.id);
      rerenderVariantes();
      T.toast('Variantes guardadas (' + actuales.length + ' SKUs)', 'success');
    } catch (e) {
      console.error('[guardarVariantes] exception', e);
      T.toast('Error: ' + (e.message || e), 'error');
      restoreVariantesBtn(btn);
    }
  }

  function restoreVariantesBtn(btn) {
    if (!btn || !btn.isConnected) {
      btn = window.TiendaIA.dom.mainView.querySelector('#btn-guardar-variantes');
    }
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = 'Guardar variantes';
  }

  async function handleSubmit(form) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const btnGuardar = form.querySelector('#btn-guardar');
    if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = 'Guardando...'; }

    const fd = new FormData(form);
    const payload = {
      tienda_id: tienda.id,
      nombre: String(fd.get('nombre') || '').trim(),
      referencia: String(fd.get('referencia') || '').trim(),
      categoria_id: fd.get('categoria_id') || null,
      descripcion: String(fd.get('descripcion') || '').trim() || null,
      precio_venta: Number(fd.get('precio_venta')) || 0,
      costo: fd.get('costo') ? Number(fd.get('costo')) : null,
      precio_promo: fd.get('precio_promo') ? Number(fd.get('precio_promo')) : null,
      precio_mayorista: fd.get('precio_mayorista') ? Number(fd.get('precio_mayorista')) : null,
      cantidad_min_mayorista: fd.get('cantidad_min_mayorista') ? Number(fd.get('cantidad_min_mayorista')) : null,
      estado: String(fd.get('estado') || 'activo'),
    };

    // Validacion cliente
    if (!payload.nombre) { T.toast('El nombre es obligatorio', 'error'); restoreBtn(btnGuardar); return; }
    if (!payload.referencia) { T.toast('La referencia es obligatoria', 'error'); restoreBtn(btnGuardar); return; }
    if (!(payload.precio_venta > 0)) { T.toast('El precio de venta debe ser mayor a 0', 'error'); restoreBtn(btnGuardar); return; }
    if (payload.precio_promo != null && payload.precio_promo >= payload.precio_venta) {
      T.toast('El precio promo debe ser menor al precio de venta', 'error'); restoreBtn(btnGuardar); return;
    }

    try {
      let result;
      if (formState.producto) {
        // Update - no tocar tienda_id ni created_at
        const { tienda_id, ...patch } = payload;
        result = await sb.from('productos').update(patch).eq('id', formState.producto.id).eq('tienda_id', tienda.id).select().maybeSingle();
      } else {
        result = await sb.from('productos').insert(payload).select().maybeSingle();
      }

      if (result.error) {
        console.error('[prod-form] save error', result.error);
        // v2 BUG #5 fix: usar error.code de Postgres en vez de substring del mensaje
        let msg = result.error.message || 'No pudimos guardar el producto';
        if (result.error.code === '23505') {
          msg = 'Ya tienes un producto con esa referencia. Cambia el SKU.';
        }
        T.toast(msg, 'error');
        restoreBtn(btnGuardar);
        return;
      }

      // v2 BUG #3 fix: UPDATE silencioso. Si data es null sin error en un update,
      // significa que RLS bloqueo la fila o el id no existe.
      if (formState.producto && result.data === null) {
        T.toast('No se pudo actualizar. Verifica que el producto sigue existiendo.', 'error');
        restoreBtn(btnGuardar);
        return;
      }

      formState.dirty = false;
      T.toast(formState.producto ? 'Producto actualizado' : 'Producto creado', 'success');
      window.location.hash = '#/productos';
    } catch (e) {
      console.error('[prod-form] exception', e);
      T.toast('Error al guardar: ' + (e.message || e), 'error');
      restoreBtn(btnGuardar);
    }
  }

  function restoreBtn(btn) {
    // v2 BUG #2 fix: re-query el button por si el DOM cambio (race condition).
    if (!btn || !btn.isConnected) {
      btn = window.TiendaIA.dom.mainView.querySelector('#btn-guardar');
    }
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = formState.producto ? 'Guardar cambios' : 'Crear producto';
  }

  async function handleDelete() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    if (!formState.producto) return;
    try {
      const { error } = await sb.from('productos').delete().eq('id', formState.producto.id).eq('tienda_id', tienda.id);
      if (error) {
        T.toast('No pudimos eliminar: ' + error.message, 'error');
        return;
      }
      formState.dirty = false;
      T.toast('Producto eliminado', 'success');
      window.location.hash = '#/productos';
    } catch (e) {
      T.toast('Error: ' + (e.message || e), 'error');
    }
  }

  // ============================================================
  // Utils
  // ============================================================
  function fmtCOP(n) {
    if (!n && n !== 0) return '$0';
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n); }
    catch { return '$' + Math.round(n).toLocaleString('es-CO'); }
  }
})();
