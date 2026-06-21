/* AIMMA · Tienda IA · views/productos.js · v14 · 2026-05-30
   v14 (Fase 3.5.d): variantes flexibles. Editor con 2 bloques (VARIANTE +
   SUBVARIANTE opcional). Cada bloque tiene dropdown de tipo (Color, Tamaño,
   Talla, Textura, Material, ✨ Crear variante - input libre). Tabla resultante:
   - Solo Variante: tabla 2 cols (Valor | SKU | Stock).
   - Solo Subvariante: idem para tallas.
   - Variante + Sub: matriz N×M como antes.
   Migration tiendas + columnas variante_tipo_1/2 TEXT NULL. BD columnas
   color/talla en producto_variantes mantienen nombre por compat - semantica
   nueva: color = valor 1, talla = valor 2.
   Eliminar default variant al activar variantes en edicion (sin reservas).
   Botones "+ Agregar subvariante" / "Quitar subvariante" para mover entre
   modos 1 dim y 2 dims.
   v13 (fix bug CRITICO Jorge): producto sin variantes no tenia donde
   ingresar inventario. Ahora si NO hay colores/tallas activos, aparece
   campo "Stock disponible" simple. Al guardar crea/actualiza una variante
   "default" (color=NULL, talla=NULL) con ese stock. Patron Shopify: cada
   producto siempre tiene >=1 variante en BD. Permite migrar transparente
   a variantes color/talla despues sin perder stock.
   v12 (Fase 3.5.c feedback Jorge): tabla productos ahora muestra Foto +
   Nombre + Referencia + Descripcion (60 chars) + Categoria + Subcategoria +
   Precio + Costo + Estado + Editar. Filtros: Categoria (solo padres) +
   Subcategoria (cascade hijos del padre) + Estado. Resolucion padre/sub
   en cliente desde lista plana (resolverCategoria helper) en vez de join
   doble PostgREST.
   v11 (Fase 3.5.b feedback Jorge): dropdown unico de Categoria reemplazado
   por 2 dropdowns en cascada Categoria + Subcategoria. UX: el cliente
   elige primero el padre (Calzado), despues el dropdown subcategoria muestra
   solo los hijos (Tenis, Botas). Si la categoria no tiene hijos, el dropdown
   sub se deshabilita con hint claro. Al guardar, sub prevalece sobre padre
   (si hay sub elegida, esa es la categoria_id final del producto).
   Fase 3.3 COMPLETA + fix Jorge: validacion bloqueante de stocks faltantes.
   v10 (2026-05-29 post-feedback Jorge): validarMatrizStocks + highlight visual.
   Si user agrega color/talla pero deja celdas sin stock, al click Guardar
   variantes o Crear producto el guardado se bloquea con toast claro + las
   celdas vacias se resaltan en naranja con pulse animation. Forza decision
   explicita (0 = agotado, N = en stock) vs autollenar silenciosamente.
   v9 (2026-05-29 post-audit 3.3d): 2 HIGH + 3 MEDIUM + 1 LOW fixes
   - BUG #1 HIGH: recargarProductoYRender hacia full re-render+wireFormEvents
     en cada upload/eliminacion acumulando listeners. Migrado a refrescar SOLO
     #fotos-seccion (recargarProductoYRefrescarFotos).
   - BUG #2 HIGH: race condition en galeria - leer fresh galeria de BD justo
     antes del UPDATE (no usar formState.producto). Tambien serializar uploads
     con flag uploadingFoto.
   - BUG #3 MEDIUM: eliminarFoto dejaba huerfanos en Storage. Ahora extrae
     path del URL publico y llama storage.remove antes del UPDATE NULL.
   - BUG #4 MEDIUM: safeImgUrl() valida protocol https?:/ antes de interpolar
     URL en src para prevenir javascript:/data: si alguien escribe a BD.
   - BUG #5 MEDIUM: whitelist ALLOWED_EXTS para extension en lugar de file.name
     crudo (path traversal mitigado).
   - BUG #6 LOW: persistirUrlFoto ahora retorna el error y subirFoto/eliminarFoto
     lo propagan al toast.
   v8 (2026-05-29): Fase 3.3d - upload fotos + cross-modulo Estudio Visual.
   - Bucket tienda-productos publico con RLS por path <tienda_id>/<producto_id>/.
   - Slots: foto principal (1) + galeria (4) + foto por color (N segun colores).
   - Botones: Subir, Editar con IA (abre Estudio Visual con bundle cross-modulo),
     Reemplazar, Eliminar.
   - URL persistida en productos.foto_principal_url / fotos_galeria (jsonb)
     / producto_variantes.foto_color_url.
   v7 (2026-05-29 post-audit del v6): 2 HIGH + 2 MEDIUM fixes
   - BUG #1 HIGH: input stock llamaba formState.producto.referencia con null en crear
     -> TypeError. Migrado a obtenerReferenciaLive (data loss silencioso).
   - BUG #2 HIGH: rerenderVariantes con !formState.producto en guard hacia full
     re-render perdiendo foco y acumulando listeners de beforeunload/navGuard.
   - BUG #3 MEDIUM: variantesState.dirty se reseteaba incondicional. Ahora solo
     si !variantesWarning (mantiene dirty si variantes fallaron, navGuard avisa).
   - BUG #4 MEDIUM: subtitulo en CREAR decia "variantes se agregan despues de
     guardar" - obsoleto en v6. Actualizado: "puedes agregar variantes antes".
   v6 (2026-05-29 post-feedback Jorge): unificar form crear+variantes.
   - Seccion Variantes ahora aparece desde #/productos/nuevo (antes solo edicion).
   - SKU reactive al campo Referencia (input listener regenera matriz).
   - handleSubmit: si producto nuevo Y hay variantes definidas, INSERT producto
     + INSERT variantes en secuencia. Si producto OK pero variantes fallan,
     queda producto creado con toast warning explicito (editable para reintentar).
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
    filtroCategoria: '',     // id de la categoria PADRE seleccionada
    filtroSubcategoria: '',  // id de la subcategoria (cascade)
    filtroEstado: '',        // '' = todos | 'activo' | 'inactivo'
    pagina: 0,
    categorias: [],          // cache lista plana para resolver padre/sub
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

    // v12: cargar categorias primero para poder armar filtros cascade
    const catRes = await sb.from('categorias').select('id, nombre, parent_id').eq('tienda_id', tienda.id).order('nombre');
    const categorias = catRes.data || [];
    listaState.categorias = categorias;

    let prodQuery = sb.from('productos')
      .select('id, referencia, nombre, descripcion, costo, precio_venta, precio_promo, foto_principal_url, estado, categoria_id, created_at', { count: 'exact' })
      .eq('tienda_id', tienda.id);

    if (listaState.filtroBusqueda) {
      // v2 BUG #1 fix: sanitizar caracteres que rompen el parsing del filtro PostgREST
      const q = listaState.filtroBusqueda.trim()
        .replace(/[,()'"\\]/g, '')
        .replace(/[%_]/g, '\\$&')
        .slice(0, 100);
      if (q) {
        prodQuery = prodQuery.or('nombre.ilike.%' + q + '%,referencia.ilike.%' + q + '%');
      }
    }
    // v12 (Fase 3.5.c): filtro cascade Categoria + Subcategoria.
    // Si filtroSubcategoria: match exacto. Sino, si filtroCategoria (padre):
    // match productos cuya categoria sea el padre O cualquiera de sus hijos.
    if (listaState.filtroSubcategoria) {
      prodQuery = prodQuery.eq('categoria_id', listaState.filtroSubcategoria);
    } else if (listaState.filtroCategoria) {
      const subIds = categorias.filter(c => c.parent_id === listaState.filtroCategoria).map(c => c.id);
      const idsValidos = [listaState.filtroCategoria].concat(subIds);
      prodQuery = prodQuery.in('categoria_id', idsValidos);
    }
    if (listaState.filtroEstado) prodQuery = prodQuery.eq('estado', listaState.filtroEstado);

    prodQuery = prodQuery.order('created_at', { ascending: false }).range(desde, hasta);

    const prodRes = await prodQuery;
    const productos = prodRes.data || [];
    const totalCount = prodRes.count || 0;

    view.innerHTML = renderListaHTML(productos, totalCount, categorias);
    wireListaEvents();
  }

  // v12 helper: resolver padre + sub desde la lista plana de categorias
  function resolverCategoria(catId, categorias) {
    if (!catId) return { padre: null, sub: null };
    const cat = categorias.find(c => c.id === catId);
    if (!cat) return { padre: null, sub: null };
    if (!cat.parent_id) return { padre: cat, sub: null };
    const padre = categorias.find(c => c.id === cat.parent_id);
    return { padre: padre || null, sub: cat };
  }

  function renderListaHTML(productos, totalCount, categorias) {
    const T = window.TiendaIA;
    const totalPaginas = Math.max(1, Math.ceil(totalCount / POR_PAGINA));
    const paginaActual = listaState.pagina + 1;

    // v12: filtros cascade - solo padres en el dropdown Categoria
    const padresFiltro = categorias.filter(c => !c.parent_id);
    const opcionesCategorias = '<option value="">Todas las categorias</option>' +
      padresFiltro.map(c => '<option value="' + T.escapeHtml(c.id) + '"' + (listaState.filtroCategoria === c.id ? ' selected' : '') + '>' + T.escapeHtml(c.nombre) + '</option>').join('');
    // Subcategorias del padre seleccionado en filtro
    const subsFiltro = listaState.filtroCategoria
      ? categorias.filter(c => c.parent_id === listaState.filtroCategoria) : [];
    const opcionesSubs = '<option value="">Todas las subcategorias</option>' +
      subsFiltro.map(c => '<option value="' + T.escapeHtml(c.id) + '"' + (listaState.filtroSubcategoria === c.id ? ' selected' : '') + '>' + T.escapeHtml(c.nombre) + '</option>').join('');

    const COL_COUNT = 9;
    let tbody = '';
    if (productos.length === 0) {
      tbody = '<tr><td colspan="' + COL_COUNT + '"><div class="ta-empty" style="padding:32px 16px;">' +
        '<h2 class="ta-empty__title">' + (totalCount === 0 && !listaState.filtroBusqueda && !listaState.filtroCategoria && !listaState.filtroSubcategoria && !listaState.filtroEstado ? 'No tienes productos cargados todavia' : 'Sin resultados con esos filtros') + '</h2>' +
        '<p class="ta-empty__text">' + (totalCount === 0 ? 'Empieza creando tu primer producto.' : 'Prueba ajustar los filtros o limpiarlos.') + '</p>' +
        (totalCount === 0 ? '<a href="#/productos/nuevo" class="ta-btn ta-btn--primary">Crear primer producto</a>' : '') +
        '</div></td></tr>';
    } else {
      tbody = productos.map(p => {
        const foto = p.foto_principal_url
          ? '<img src="' + T.escapeHtml(p.foto_principal_url) + '" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;border:1px solid var(--ta-border);">'
          : '<div style="width:40px;height:40px;border-radius:6px;background:var(--ta-bg-soft);display:flex;align-items:center;justify-content:center;color:var(--ta-text-mut);font-size:18px;">📦</div>';
        // v12: resolver padre/sub desde lista plana
        const { padre, sub } = resolverCategoria(p.categoria_id, categorias);
        const categoriaNom = padre ? T.escapeHtml(padre.nombre) : '<span style="color:var(--ta-text-mut);">—</span>';
        const subNom = sub ? T.escapeHtml(sub.nombre) : '<span style="color:var(--ta-text-mut);">—</span>';
        const estadoPill = p.estado === 'activo'
          ? '<span class="ta-pill ta-pill--ok" style="margin-left:0;">Activo</span>'
          : '<span class="ta-pill ta-pill--warn" style="margin-left:0;">Inactivo</span>';
        const precio = fmtCOP(Number(p.precio_venta || 0));
        const precioPromo = p.precio_promo ? '<br><span style="color:var(--ta-success);font-size:11px;">Promo ' + fmtCOP(Number(p.precio_promo)) + '</span>' : '';
        const costo = p.costo != null ? fmtCOP(Number(p.costo)) : '<span style="color:var(--ta-text-mut);">—</span>';
        // Descripcion truncada
        const descrip = p.descripcion
          ? T.escapeHtml(String(p.descripcion).slice(0, 60)) + (p.descripcion.length > 60 ? '…' : '')
          : '<span style="color:var(--ta-text-mut);">—</span>';
        return '<tr data-id="' + T.escapeHtml(p.id) + '" style="cursor:pointer;">' +
          '<td>' + foto + '</td>' +
          '<td><strong>' + T.escapeHtml(p.nombre) + '</strong></td>' +
          '<td><code style="font-size:11px;">' + T.escapeHtml(p.referencia) + '</code></td>' +
          '<td style="font-size:12px;color:var(--ta-text-soft);max-width:180px;">' + descrip + '</td>' +
          '<td>' + categoriaNom + '</td>' +
          '<td>' + subNom + '</td>' +
          '<td style="text-align:right;">' + precio + precioPromo + '</td>' +
          '<td style="text-align:right;color:var(--ta-text-soft);">' + costo + '</td>' +
          '<td>' + estadoPill + '</td>' +
          '<td style="text-align:right;"><a href="#/productos/' + T.escapeHtml(p.id) + '" class="ta-btn" style="padding:6px 12px;font-size:12px;">Editar</a></td>' +
        '</tr>';
      }).join('');
    }

    const subDisabled = !listaState.filtroCategoria;

    return '' +
      '<header style="display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:20px;flex-wrap:wrap;">' +
        '<div>' +
          '<h1 class="ta-section-title">Productos</h1>' +
          '<p class="ta-section-sub">' + totalCount + ' producto(s) en tu catalogo. Cada producto puede tener variantes (color, talla) y fotos por color.</p>' +
        '</div>' +
        '<a href="#/productos/nuevo" class="ta-btn ta-btn--primary">+ Crear producto</a>' +
      '</header>' +

      '<div class="ta-card" style="padding:14px 16px;margin-bottom:20px;">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
          '<input id="lista-buscar" class="ta-input" type="text" placeholder="Buscar por nombre o referencia..." value="' + T.escapeHtml(listaState.filtroBusqueda) + '" style="flex:1;min-width:220px;">' +
          '<select id="lista-categoria" class="ta-select" style="max-width:200px;">' + opcionesCategorias + '</select>' +
          '<select id="lista-subcategoria" class="ta-select" style="max-width:200px;"' + (subDisabled ? ' disabled' : '') + '>' + opcionesSubs + '</select>' +
          '<select id="lista-estado" class="ta-select" style="max-width:160px;">' +
            '<option value=""' + (listaState.filtroEstado === '' ? ' selected' : '') + '>Todos los estados</option>' +
            '<option value="activo"' + (listaState.filtroEstado === 'activo' ? ' selected' : '') + '>Activo</option>' +
            '<option value="inactivo"' + (listaState.filtroEstado === 'inactivo' ? ' selected' : '') + '>Inactivo</option>' +
          '</select>' +
          (listaState.filtroBusqueda || listaState.filtroCategoria || listaState.filtroSubcategoria || listaState.filtroEstado
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
              '<th>Referencia</th>' +
              '<th>Descripcion</th>' +
              '<th>Categoria</th>' +
              '<th>Subcategoria</th>' +
              '<th style="text-align:right;">Precio</th>' +
              '<th style="text-align:right;">Costo</th>' +
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
    if (cat) cat.addEventListener('change', (e) => {
      listaState.filtroCategoria = e.target.value;
      // v12: al cambiar la categoria padre, resetear subcategoria
      listaState.filtroSubcategoria = '';
      listaState.pagina = 0;
      renderLista().catch(err => console.error(err));
    });
    const sub = view.querySelector('#lista-subcategoria');
    if (sub) sub.addEventListener('change', (e) => {
      listaState.filtroSubcategoria = e.target.value;
      listaState.pagina = 0;
      renderLista().catch(err => console.error(err));
    });
    const est = view.querySelector('#lista-estado');
    if (est) est.addEventListener('change', (e) => { listaState.filtroEstado = e.target.value; listaState.pagina = 0; renderLista().catch(err => console.error(err)); });
    const limpiar = view.querySelector('#lista-limpiar');
    if (limpiar) limpiar.addEventListener('click', () => {
      listaState = { filtroBusqueda: '', filtroCategoria: '', filtroSubcategoria: '', filtroEstado: '', pagina: 0, categorias: listaState.categorias };
      renderLista().catch(err => console.error(err));
    });
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
  // v12: defaultVariant + stockSimple para producto SIN variantes (patron Shopify)
  // v13 (Fase 3.5.d): variantes flexibles. tipoVariante1/2 son las etiquetas
  // semanticas (Color, Tamaño, Talla, Textura, Material, custom). Los arrays
  // colores/tallas mantienen su nombre por compat - internamente representan
  // valores1/valores2.
  let variantesState = {
    activo: false,
    tipoVariante1: 'Color',     // default 'Color' al activar variantes por primera vez
    tipoVariante2: '',           // '' = no hay subvariante (NULL en BD)
    colores: [],                 // valores del atributo 1 (independiente de su tipo)
    tallas: [],                  // valores del atributo 2 (NULL si no hay subvariante)
    matriz: {},
    original: [],
    dirty: false,
    defaultVariant: null,
    stockSimple: 0,
  };

  // v13: opciones del dropdown de tipo de variante. La ultima es input libre.
  const TIPOS_VARIANTE = ['Color', 'Tamaño', 'Talla', 'Textura', 'Material'];

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
      variantesState = {
        activo: false,
        tipoVariante1: 'Color',
        tipoVariante2: '',
        colores: [], tallas: [], matriz: {}, original: [], dirty: false,
        defaultVariant: null, stockSimple: 0,
      };
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
    // v12 (fix bug Jorge): detectar variante "default" (sin color ni talla).
    // Producto SIMPLE: 0 variantes O 1 variante con color=null AND talla=null.
    // Esa variante representa el stock del producto base, NO se muestra como matriz.
    const defaultVariant = lista.find(v => !v.color && !v.talla);
    const variantesReales = lista.filter(v => v.color || v.talla);
    const colores = Array.from(new Set(variantesReales.map(v => v.color).filter(Boolean)));
    const tallas = Array.from(new Set(variantesReales.map(v => v.talla).filter(Boolean)));
    const matriz = {};
    for (const v of variantesReales) {
      const k = (v.color || '') + '__' + (v.talla || '');
      matriz[k] = {
        id: v.id, sku: v.sku, stock: v.stock, reservado: v.reservado || 0,
        precio_override: v.precio_override, color: v.color, talla: v.talla,
      };
    }
    // v13/v14: leer tipos desde el producto. Si NULL pero hay variantes, asumir
    // 'Color' para variante1 y 'Talla' para variante2 (backward compat con
    // datos creados antes de la migration). Si producto NO tiene tipos guardados
    // ni variantes reales, tipoVariante1='Color' como default al activar editor.
    const p = formState.producto;
    const tipoVariante1 = (p && p.variante_tipo_1) || 'Color';
    const tipoVariante2 = (p && p.variante_tipo_2) || (tallas.length > 0 ? 'Talla' : '');

    variantesState = {
      activo: variantesReales.length > 0,
      tipoVariante1,
      tipoVariante2,
      colores, tallas, matriz,
      original: lista.map(v => ({ id: v.id, color: v.color, talla: v.talla, sku: v.sku, stock: v.stock, reservado: v.reservado, precio_override: v.precio_override })),
      dirty: false,
      defaultVariant: defaultVariant || null,
      stockSimple: defaultVariant ? defaultVariant.stock : 0,
    };
  }

  function renderFormHTML() {
    const T = window.TiendaIA;
    const p = formState.producto;
    const esEdicion = !!p;

    // F3: contenido editorial por-producto (guia de tallas + ficha). Todo opcional.
    // En edicion se popula desde p.guia_tallas_url / p.ficha_editorial (jsonb).
    const guiaUrl = (p && p.guia_tallas_url) || '';
    const ficha = (p && p.ficha_editorial && typeof p.ficha_editorial === 'object') ? p.ficha_editorial : {};
    const fichaMaterial = ficha.material || '';
    const fichaAjuste = ficha.ajuste || '';
    const fichaDiseno = Array.isArray(ficha.diseno) ? ficha.diseno.join('\n') : '';
    const fichaBeneficios = Array.isArray(ficha.beneficios) ? ficha.beneficios.join('\n') : '';

    // v11 (Fase 3.5.b feedback Jorge): dos dropdowns en cascada Categoria + Subcategoria
    // en lugar de uno plano con padres+hijos mezclados.
    const catSeleccionada = p && p.categoria_id ? formState.categorias.find(c => c.id === p.categoria_id) : null;
    let padreSelId = null, subSelId = null;
    if (catSeleccionada) {
      if (catSeleccionada.parent_id) {
        // El producto tiene asignada una subcategoria -> mostrar padre + sub
        padreSelId = catSeleccionada.parent_id;
        subSelId = catSeleccionada.id;
      } else {
        // El producto tiene asignada una categoria padre
        padreSelId = catSeleccionada.id;
      }
    }
    const padresList = formState.categorias.filter(c => !c.parent_id);
    const subsList = padreSelId ? formState.categorias.filter(c => c.parent_id === padreSelId) : [];
    const opcionesPadre = '<option value="">— Sin categoria —</option>' +
      padresList.map(c => {
        const sel = padreSelId === c.id ? ' selected' : '';
        return '<option value="' + T.escapeHtml(c.id) + '"' + sel + '>' + T.escapeHtml(c.nombre) + '</option>';
      }).join('');
    const opcionesSub = '<option value="">— Sin subcategoria —</option>' +
      subsList.map(c => {
        const sel = subSelId === c.id ? ' selected' : '';
        return '<option value="' + T.escapeHtml(c.id) + '"' + sel + '>' + T.escapeHtml(c.nombre) + '</option>';
      }).join('');

    return '' +
      '<header style="margin-bottom:24px;">' +
        '<a href="#/productos" style="font-size:13px;color:var(--ta-text-soft);">← Volver a productos</a>' +
        '<h1 class="ta-section-title" style="margin-top:8px;">' + (esEdicion ? 'Editar producto' : 'Nuevo producto') + '</h1>' +
        '<p class="ta-section-sub">' +
          (esEdicion
            ? 'Editando "' + T.escapeHtml(p.nombre) + '". Las variantes (color, talla, stock) se gestionan abajo.'
            : 'Datos basicos del producto. Puedes agregar variantes (color, talla, stock) antes de guardar, abajo.') +
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

        // v11: 2 dropdowns en cascada (padre + sub)
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-cat-padre">Categoria</label>' +
            '<select id="f-cat-padre" class="ta-select">' + opcionesPadre + '</select>' +
            (padresList.length === 0 ? '<span class="ta-field__hint">No tienes categorias. <a href="#/categorias">Crear ahora</a></span>' : '') +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-cat-sub">Subcategoria</label>' +
            '<select id="f-cat-sub" class="ta-select"' + (subsList.length === 0 ? ' disabled' : '') + '>' + opcionesSub + '</select>' +
            (padreSelId && subsList.length === 0 ? '<span class="ta-field__hint">Esta categoria no tiene subcategorias.</span>' : '') +
            (!padreSelId ? '<span class="ta-field__hint">Elige primero una categoria.</span>' : '') +
          '</div>' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="f-descripcion">Descripcion</label>' +
          '<textarea id="f-descripcion" name="descripcion" class="ta-textarea" maxlength="2000" rows="4">' + T.escapeHtml(p?.descripcion || '') + '</textarea>' +
          '<span class="ta-field__hint">Lo que verá el comprador en la página del producto.</span>' +
        '</div>' +

        // F3: contenido editorial (guia de tallas + ficha). Todo opcional, texto plano.
        '<div style="margin-top:8px;padding-top:16px;border-top:1px solid var(--ta-border);">' +
          '<h3 style="font-size:14px;margin:0 0 4px;color:var(--ta-text-soft);">Contenido editorial (opcional)</h3>' +
          '<p style="margin:0;color:var(--ta-text-soft);font-size:12px;">Se muestra en la página del producto. Texto plano.</p>' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label">Guía de tallas (imagen)</label>' +
          '<div id="f-guia-wrap">' + guiaControlHTML(guiaUrl) + '</div>' +
          '<input type="hidden" id="f-guia-url" name="guia_tallas_url" value="' + T.escapeHtml(guiaUrl) + '">' +
          '<span class="ta-field__hint">Tabla de tallas. Se muestra colapsable en la página del producto. Reusable entre productos (no re-subís).</span>' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="f-ficha-material">Material</label>' +
          '<textarea id="f-ficha-material" name="ficha_material" class="ta-textarea" maxlength="500" rows="2">' + T.escapeHtml(fichaMaterial) + '</textarea>' +
        '</div>' +

        '<div class="ta-field">' +
          '<label class="ta-field__label" for="f-ficha-ajuste">Ajuste</label>' +
          '<textarea id="f-ficha-ajuste" name="ficha_ajuste" class="ta-textarea" maxlength="500" rows="2">' + T.escapeHtml(fichaAjuste) + '</textarea>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-ficha-diseno">Diseño</label>' +
            '<textarea id="f-ficha-diseno" name="ficha_diseno" class="ta-textarea" maxlength="1000" rows="4" placeholder="Una característica por línea">' + T.escapeHtml(fichaDiseno) + '</textarea>' +
            '<span class="ta-field__hint">Una viñeta por línea.</span>' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-ficha-beneficios">Beneficios</label>' +
            '<textarea id="f-ficha-beneficios" name="ficha_beneficios" class="ta-textarea" maxlength="1000" rows="4" placeholder="Un beneficio por línea">' + T.escapeHtml(fichaBeneficios) + '</textarea>' +
            '<span class="ta-field__hint">Una viñeta por línea.</span>' +
          '</div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;">' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-precio">Precio de venta * (COP)</label>' +
            '<input id="f-precio" name="precio_venta" class="ta-input" type="number" required min="1" step="1" value="' + (p?.precio_venta || '') + '">' +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label" for="f-costo">Costo (COP)</label>' +
            '<input id="f-costo" name="costo" class="ta-input" type="number" min="0" step="1" value="' + (p?.costo || '') + '">' +
            '<span class="ta-field__hint">' + (esEdicion ? 'Privado. Es tu costo promedio actual; puedes ajustarlo.' : 'Privado, no se muestra al comprador.') + '</span>' +
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

        // v12 (fix bug Jorge): campo "Stock disponible" SOLO si el producto no
        // tiene variantes activadas. Si user despues agrega colores/tallas, este
        // campo se oculta y la matriz toma control. Stock 0 = agotado.
        (variantesState.activo ? '' :
          '<div class="ta-field" id="f-stock-simple-wrap">' +
            '<label class="ta-field__label" for="f-stock-simple">Stock disponible</label>' +
            '<input id="f-stock-simple" type="number" class="ta-input" min="0" step="1" style="max-width:200px;" value="' + (variantesState.stockSimple != null ? variantesState.stockSimple : 0) + '">' +
            '<span class="ta-field__hint">Cantidad de unidades disponibles. Si manejas variantes (color, talla), activalas abajo y este campo se ocultara.</span>' +
          '</div>') +

        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:24px;padding-top:20px;border-top:1px solid var(--ta-border);">' +
          (esEdicion ? '<button type="button" id="btn-eliminar" class="ta-btn ta-btn--danger">Eliminar producto</button>' : '<span></span>') +
          '<div style="display:flex;gap:8px;">' +
            '<a href="#/productos" class="ta-btn">Cancelar</a>' +
            '<button type="submit" id="btn-guardar" class="ta-btn ta-btn--primary">' + (esEdicion ? 'Guardar cambios' : 'Crear producto') + '</button>' +
          '</div>' +
        '</div>' +

      '</form>' +

      // v7 (Fase 3.3d): seccion Fotos solo en EDICION (necesita producto_id para
      // path de Storage y URLs de retorno cross-modulo).
      (esEdicion ? renderFotosSeccion(p) : '') +

      // v6: seccion Variantes desde crear (no solo edicion).
      renderVariantesSeccion(p);
  }

  // ============================================================
  // FOTOS (Fase 3.3d)
  // ============================================================
  const MAX_GALERIA = 4;       // 4 fotos en galeria
  const MAX_MB = 5;
  const ALLOWED_TYPES = ['image/jpeg','image/jpg','image/png','image/webp'];
  const ALLOWED_EXTS = ['jpg','jpeg','png','webp'];
  let uploadingFoto = false;   // v8 BUG #2 fix: serializar uploads de galeria

  // v8 BUG #4 fix: solo permitir https/http en src de img para prevenir
  // javascript:/data: URLs maliciosas si alguien escribe directo en BD.
  function safeImgUrl(url) {
    if (!url) return null;
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? url : null; }
    catch { return null; }
  }

  // F3: control de la guia de tallas. Reusa el image-picker del editor
  // (editorModalImage: browse <tienda_id>/editor/ + subir). Render-only;
  // el wiring (click delegado) vive en wireGuiaEvents.
  function guiaControlHTML(url) {
    const T = window.TiendaIA;
    const safe = safeImgUrl(url);
    if (safe) {
      return '' +
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
          '<img src="' + T.escapeHtml(safe) + '" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid var(--ta-border);">' +
          '<button type="button" class="ta-btn ta-btn--xs" data-guia-accion="pick">Reemplazar</button>' +
          '<button type="button" class="ta-btn ta-btn--xs ta-btn--danger" data-guia-accion="remove">Quitar</button>' +
        '</div>';
    }
    return '<button type="button" class="ta-btn" data-guia-accion="pick">Elegir imagen</button>';
  }

  function renderFotosSeccion(producto) {
    const T = window.TiendaIA;
    const galeria = Array.isArray(producto.fotos_galeria) ? producto.fotos_galeria : [];

    // Slots de galeria (4 fijos)
    const slotsGaleria = [];
    for (let i = 0; i < MAX_GALERIA; i++) {
      slotsGaleria.push(renderSlotFoto({
        url: galeria[i] || null,
        label: 'Foto ' + (i + 2),
        campo: 'foto_galeria_' + i,
        size: 'sm',
        producto,
      }));
    }

    // Slots por color (solo si hay variantes con colores)
    let slotsColores = '';
    if (variantesState.colores.length > 0) {
      const items = variantesState.colores.map(color => {
        // Buscar primera variante con este color en la matriz para sacar URL existente
        let urlColor = null;
        for (const talla of variantesState.tallas) {
          const celda = getMatrizCelda(color, talla);
          if (celda?.foto_color_url) { urlColor = celda.foto_color_url; break; }
        }
        return renderSlotFoto({
          url: urlColor,
          label: color,
          campo: 'foto_color_' + slugify(color),
          size: 'sm',
          producto,
          colorRef: color,
        });
      }).join('');
      slotsColores = '' +
        '<div style="margin-top:24px;">' +
          '<h3 style="font-size:14px;margin:0 0 12px;color:var(--ta-text-soft);">Foto por color</h3>' +
          '<div class="ta-fotos-grid">' + items + '</div>' +
        '</div>';
    }

    return '' +
      '<section id="fotos-seccion" class="ta-card" style="max-width:1100px;margin-top:24px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap;">' +
          '<div>' +
            '<h2 style="margin:0 0 4px;font-size:20px;">Fotos</h2>' +
            '<p style="margin:0;color:var(--ta-text-soft);font-size:13px;">' +
              'Foto principal + hasta ' + MAX_GALERIA + ' fotos de galeria. Tambien podes editar con IA usando el Estudio Visual.' +
            '</p>' +
          '</div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:auto 1fr;gap:20px;margin-top:20px;align-items:start;">' +
          // Foto principal (slot grande izq)
          '<div>' +
            '<h3 style="font-size:14px;margin:0 0 8px;color:var(--ta-text-soft);">Principal</h3>' +
            renderSlotFoto({
              url: producto.foto_principal_url,
              label: '',
              campo: 'foto_principal',
              size: 'lg',
              producto,
            }) +
          '</div>' +
          // Galeria (4 slots derecha)
          '<div>' +
            '<h3 style="font-size:14px;margin:0 0 8px;color:var(--ta-text-soft);">Galería</h3>' +
            '<div class="ta-fotos-grid">' + slotsGaleria.join('') + '</div>' +
          '</div>' +
        '</div>' +

        slotsColores +
      '</section>';
  }

  function renderSlotFoto({ url, label, campo, size, producto, colorRef }) {
    const T = window.TiendaIA;
    const sizeClass = size === 'lg' ? 'ta-foto-slot--lg' : 'ta-foto-slot--sm';
    const empty = !url;
    const labelHtml = label ? '<div class="ta-foto-slot__label">' + T.escapeHtml(label) + '</div>' : '';

    const imgOrPlaceholder = empty
      ? '<div class="ta-foto-slot__empty">📷</div>'
      : (safeImgUrl(url) ? '<img src="' + T.escapeHtml(url) + '" alt="" class="ta-foto-slot__img">' : '<div class="ta-foto-slot__empty">⚠️</div>');

    const acciones = empty
      ? '<button type="button" class="ta-btn ta-foto-slot__btn" data-foto-accion="upload" data-foto-campo="' + T.escapeHtml(campo) + '"' +
          (colorRef ? ' data-foto-color="' + T.escapeHtml(colorRef) + '"' : '') + '>Subir foto</button>'
      : '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
          '<button type="button" class="ta-btn ta-btn--xs" data-foto-accion="ia" data-foto-campo="' + T.escapeHtml(campo) + '">✨ Editar con IA</button>' +
          '<button type="button" class="ta-btn ta-btn--xs" data-foto-accion="replace" data-foto-campo="' + T.escapeHtml(campo) + '"' +
            (colorRef ? ' data-foto-color="' + T.escapeHtml(colorRef) + '"' : '') + '>Reemplazar</button>' +
          '<button type="button" class="ta-btn ta-btn--xs ta-btn--danger" data-foto-accion="delete" data-foto-campo="' + T.escapeHtml(campo) + '"' +
            (colorRef ? ' data-foto-color="' + T.escapeHtml(colorRef) + '"' : '') + '>×</button>' +
        '</div>';

    return '' +
      '<div class="ta-foto-slot ' + sizeClass + '">' +
        labelHtml +
        '<div class="ta-foto-slot__media">' + imgOrPlaceholder + '</div>' +
        '<div class="ta-foto-slot__acciones">' + acciones + '</div>' +
      '</div>';
  }

  // ============================================================
  // Fotos: handlers
  // ============================================================
  function wireFotosEvents() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    view.querySelectorAll('[data-foto-accion]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const accion = btn.getAttribute('data-foto-accion');
        const campo = btn.getAttribute('data-foto-campo');
        const colorRef = btn.getAttribute('data-foto-color');
        if (accion === 'upload' || accion === 'replace') {
          abrirSelectorArchivo(campo, colorRef);
        } else if (accion === 'ia') {
          abrirEstudioVisual(campo);
        } else if (accion === 'delete') {
          await eliminarFoto(campo, colorRef);
        }
      });
    });
  }

  // F3: wiring del control de guia de tallas. Delegado en #f-guia-wrap para
  // sobrevivir al re-render (innerHTML) tras elegir/quitar imagen.
  function wireGuiaEvents() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;
    const wrap = view.querySelector('#f-guia-wrap');
    const hidden = view.querySelector('#f-guia-url');
    if (!wrap || !hidden) return;
    const tienda = T.state.tienda;
    const rerender = () => { wrap.innerHTML = guiaControlHTML(hidden.value); };
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-guia-accion]');
      if (!btn) return;
      const accion = btn.getAttribute('data-guia-accion');
      if (accion === 'pick') {
        if (!(window.TiendaIA.editorModalImage && window.TiendaIA.editorModalImage.open)) {
          T.toast('No se pudo abrir el selector de imagen', 'error'); return;
        }
        window.TiendaIA.editorModalImage.open({ tiendaId: tienda.id }, (url) => {
          hidden.value = url || '';
          formState.dirty = true;
          rerender();
        });
      } else if (accion === 'remove') {
        hidden.value = '';
        formState.dirty = true;
        rerender();
      }
    });
  }

  function abrirSelectorArchivo(campo, colorRef) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ALLOWED_TYPES.join(',');
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await subirFoto(file, campo, colorRef);
    };
    input.click();
  }

  async function subirFoto(file, campo, colorRef) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const producto = formState.producto;
    if (!producto) { T.toast('Guarda el producto primero', 'error'); return; }

    // v8 BUG #2 fix: serializar uploads para evitar race condition en galeria
    if (uploadingFoto) { T.toast('Espera a que termine la subida actual', 'error'); return; }

    // Validacion cliente
    if (!ALLOWED_TYPES.includes(file.type)) { T.toast('Solo JPG, PNG o WebP', 'error'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { T.toast('Maximo ' + MAX_MB + 'MB por foto', 'error'); return; }

    uploadingFoto = true;
    T.toast('Subiendo foto...', null);

    try {
      // v8 BUG #5 fix: whitelist de extensiones (no usar file.name crudo en path)
      const rawExt = (file.name.split('.').pop() || '').toLowerCase();
      const ext = ALLOWED_EXTS.includes(rawExt) ? rawExt : 'jpg';
      const ts = Date.now();
      const path = tienda.id + '/' + producto.id + '/' + campo + '-' + ts + '.' + ext;
      const up = await sb.storage.from('tienda-productos').upload(path, file, { upsert: true, cacheControl: '3600' });
      if (up.error) {
        T.toast('Error al subir: ' + up.error.message, 'error');
        return;
      }
      const { data: pub } = sb.storage.from('tienda-productos').getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      // v8 BUG #6 fix: persistirUrlFoto ahora propaga errores
      const persistErr = await persistirUrlFoto(campo, publicUrl, colorRef);
      if (persistErr) {
        T.toast('Foto subida pero no se pudo asociar: ' + persistErr.message, 'error');
        return;
      }
      T.toast('Foto subida', 'success');
      // Recargar producto y variantes y re-render solo seccion fotos
      await recargarProductoYRefrescarFotos(producto.id);
    } catch (e) {
      console.error('[subirFoto] exception', e);
      T.toast('Error: ' + (e.message || e), 'error');
    } finally {
      uploadingFoto = false;
    }
  }

  // v8 BUG #2+#6 fix: SELECT fresco antes de UPDATE de galeria (evita race) +
  // propagar errores al caller para que muestre toast correcto.
  async function persistirUrlFoto(campo, url, colorRef) {
    const sb = window.TiendaIA.supabase();
    const tienda = window.TiendaIA.state.tienda;
    const producto = formState.producto;

    if (campo === 'foto_principal') {
      const { error } = await sb.from('productos').update({ foto_principal_url: url })
        .eq('id', producto.id).eq('tienda_id', tienda.id);
      return error || null;
    }

    if (campo.startsWith('foto_galeria_')) {
      const idx = parseInt(campo.slice('foto_galeria_'.length), 10);
      // v8 BUG #2 fix: re-leer galeria actual de BD justo antes del UPDATE para
      // evitar race si el user sube dos slots distintos rapido.
      const { data: prodFresco, error: selErr } = await sb.from('productos')
        .select('fotos_galeria').eq('id', producto.id).eq('tienda_id', tienda.id).maybeSingle();
      if (selErr) return selErr;
      const actual = Array.isArray(prodFresco?.fotos_galeria) ? [...prodFresco.fotos_galeria] : [];
      while (actual.length <= idx) actual.push(null);
      actual[idx] = url;
      while (actual.length && actual[actual.length - 1] == null) actual.pop();
      const { error } = await sb.from('productos').update({ fotos_galeria: actual })
        .eq('id', producto.id).eq('tienda_id', tienda.id);
      return error || null;
    }

    if (campo.startsWith('foto_color_') && colorRef) {
      const variantesDelColor = variantesState.original.filter(v => v.color === colorRef);
      if (variantesDelColor.length === 0) return null;
      const ids = variantesDelColor.map(v => v.id);
      const { error } = await sb.from('producto_variantes').update({ foto_color_url: url }).in('id', ids);
      return error || null;
    }
    return null;
  }

  // v8 BUG #3 fix: extraer paths de Storage del URL publico y borrar archivos
  // huerfanos antes de hacer NULL en BD.
  function extraerPathDeUrl(url) {
    if (!url) return null;
    // URL pattern: https://<supa>/storage/v1/object/public/tienda-productos/<path>
    const marker = '/storage/v1/object/public/tienda-productos/';
    const idx = url.indexOf(marker);
    if (idx < 0) return null;
    return url.slice(idx + marker.length);
  }

  async function eliminarFoto(campo, colorRef) {
    const T = window.TiendaIA;
    if (!window.confirm('¿Eliminar esta foto?')) return;
    const sb = T.supabase();
    const producto = formState.producto;
    try {
      // v8 BUG #3 fix: averiguar la URL actual del slot para borrar el archivo
      // de Storage. Si no se puede borrar (RLS, network), continuar igual con
      // el NULL en BD para mantener UI consistente.
      let urlActual = null;
      if (campo === 'foto_principal') {
        urlActual = producto.foto_principal_url;
      } else if (campo.startsWith('foto_galeria_')) {
        const idx = parseInt(campo.slice('foto_galeria_'.length), 10);
        urlActual = (producto.fotos_galeria || [])[idx] || null;
      } else if (campo.startsWith('foto_color_') && colorRef) {
        const v = variantesState.original.find(x => x.color === colorRef);
        urlActual = v?.foto_color_url || null;
      }
      const path = extraerPathDeUrl(urlActual);
      if (path) {
        const rm = await sb.storage.from('tienda-productos').remove([path]);
        if (rm.error) console.warn('[eliminarFoto] storage remove fallo (huerfana queda):', rm.error.message);
      }

      const persistErr = await persistirUrlFoto(campo, null, colorRef);
      if (persistErr) {
        T.toast('No se pudo desasociar la foto: ' + persistErr.message, 'error');
        return;
      }
      T.toast('Foto eliminada', 'success');
      await recargarProductoYRefrescarFotos(producto.id);
    } catch (e) {
      T.toast('Error: ' + (e.message || e), 'error');
    }
  }

  function abrirEstudioVisual(campo) {
    const producto = formState.producto;
    if (!producto) return;
    // return_to viene url-encoded para que el editor sepa adonde volver
    const returnTo = '/iapanel/tienda/admin/#/productos/' + producto.id;
    const params = new URLSearchParams({
      source: 'tienda_producto',
      return_to: returnTo,
      producto_id: producto.id,
      campo,
    });
    window.open('/iapanel/estudio/?' + params.toString(), '_blank', 'noopener');
  }

  // v8 BUG #1 fix: reemplazar SOLO la seccion #fotos-seccion (mismo patron que
  // rerenderVariantes) para NO acumular listeners de beforeunload/navGuard en
  // cada upload o eliminacion.
  async function recargarProductoYRefrescarFotos(productoId) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const { data, error } = await sb.from('productos').select('*').eq('id', productoId).eq('tienda_id', tienda.id).maybeSingle();
    if (error || !data) return;
    formState.producto = data;
    await cargarVariantes(productoId);
    // Reemplazar solo la seccion de fotos
    const seccionVieja = T.dom.mainView.querySelector('#fotos-seccion');
    if (seccionVieja) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderFotosSeccion(formState.producto);
      const nueva = wrapper.firstElementChild;
      seccionVieja.replaceWith(nueva);
      wireFotosEvents();
    } else {
      // Fallback inicial: re-render completo si no encontramos la seccion
      T.dom.mainView.innerHTML = renderFormHTML();
      wireFormEvents();
    }
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
    const esEdicion = !!producto;  // v6: null = crear nuevo

    // Estado A: editor NO activo - mostrar CTA
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
    // v13: dropdowns de TIPO + valores con label dinamico segun tipo elegido.
    const tipo1 = variantesState.tipoVariante1 || 'Color';
    const tipo2 = variantesState.tipoVariante2 || '';
    const tagsColores = variantesState.colores.map(c =>
      '<span class="ta-tag">' + T.escapeHtml(c) +
        ' <button type="button" class="ta-tag__x" data-tag-tipo="color" data-tag-valor="' + T.escapeHtml(c) + '" aria-label="Quitar valor">×</button>' +
      '</span>'
    ).join('');
    const tagsTallas = variantesState.tallas.map(t =>
      '<span class="ta-tag">' + T.escapeHtml(t) +
        ' <button type="button" class="ta-tag__x" data-tag-tipo="talla" data-tag-valor="' + T.escapeHtml(t) + '" aria-label="Quitar valor">×</button>' +
      '</span>'
    ).join('');

    const matrizHtml = renderMatrizTabla(producto);

    return '' +
      '<section id="variantes-seccion" class="ta-card" style="max-width:1100px;margin-top:24px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap;">' +
          '<div>' +
            '<h2 style="margin:0 0 4px;font-size:20px;">Variantes</h2>' +
            '<p style="margin:0;color:var(--ta-text-soft);font-size:13px;">' +
              'Define hasta 2 atributos (ej. Color + Talla, o solo Tamaño). Genera SKU + stock por cada combinacion.' +
            '</p>' +
          '</div>' +
          (variantesState.colores.length || variantesState.tallas.length
            ? '<button type="button" id="btn-cancelar-variantes" class="ta-btn">Quitar todas las variantes</button>'
            : '') +
        '</div>' +

        // BLOQUE VARIANTE 1
        '<div style="margin-top:20px;padding:16px;background:var(--ta-bg-soft);border-radius:var(--ta-radius-sm);">' +
          '<h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:var(--ta-accent);">VARIANTE</h3>' +
          '<div class="ta-field" style="margin-bottom:8px;">' +
            '<label class="ta-field__label">Tipo</label>' +
            renderTipoSelector('1', tipo1) +
          '</div>' +
          '<div class="ta-field">' +
            '<label class="ta-field__label">Valores de ' + T.escapeHtml(tipo1) + '</label>' +
            '<div class="ta-tags-row">' + tagsColores +
              '<input id="input-color" type="text" placeholder="Escribe un valor y enter" maxlength="40" class="ta-tag-input">' +
            '</div>' +
          '</div>' +
        '</div>' +

        // BLOQUE VARIANTE 2 (opcional)
        '<div style="margin-top:14px;padding:16px;background:var(--ta-bg-soft);border-radius:var(--ta-radius-sm);">' +
          '<h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:var(--ta-accent-2);">' +
            'SUBVARIANTE <span style="font-weight:400;color:var(--ta-text-mut);font-size:12px;">(opcional)</span>' +
          '</h3>' +
          (tipo2
            ? '<div class="ta-field" style="margin-bottom:8px;">' +
                '<label class="ta-field__label">Tipo</label>' +
                renderTipoSelector('2', tipo2) +
                '<button type="button" id="btn-quitar-sub" class="ta-btn" style="margin-top:8px;font-size:11px;padding:4px 10px;">Quitar subvariante</button>' +
              '</div>' +
              '<div class="ta-field">' +
                '<label class="ta-field__label">Valores de ' + T.escapeHtml(tipo2) + '</label>' +
                '<div class="ta-tags-row">' + tagsTallas +
                  '<input id="input-talla" type="text" placeholder="Escribe un valor y enter" maxlength="40" class="ta-tag-input">' +
                '</div>' +
              '</div>'
            : '<button type="button" id="btn-add-sub" class="ta-btn ta-btn--primary" style="font-size:12px;">+ Agregar subvariante</button>') +
        '</div>' +

        matrizHtml +

        // v6: boton "Guardar variantes" solo en EDICION. En CREAR, las variantes
        // se guardan automaticamente con el boton "Crear producto" arriba.
        (esEdicion && (variantesState.colores.length > 0 || variantesState.tallas.length > 0) ? '' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid var(--ta-border);">' +
            '<button type="button" id="btn-guardar-variantes" class="ta-btn ta-btn--primary">Guardar variantes</button>' +
          '</div>'
        : (!esEdicion && (variantesState.colores.length > 0 || variantesState.tallas.length > 0)
          ? '<p style="margin-top:16px;padding-top:12px;border-top:1px solid var(--ta-border);color:var(--ta-text-mut);font-size:13px;text-align:right;">Las variantes se guardaran junto con el producto al hacer click en <strong>Crear producto</strong> arriba.</p>'
          : '')) +
      '</section>';
  }

  // v10 (Fase 3.3.e post-feedback Jorge): identifica celdas sin stock.
  // v13: soporta 1 dimension (solo variante o solo subvariante) o matriz N×M.
  function validarMatrizStocks() {
    const colores = variantesState.colores;
    const tallas = variantesState.tallas;
    const hasVal1 = colores.length > 0;
    const hasVal2 = tallas.length > 0;
    if (!hasVal1 && !hasVal2) return { vacias: [], total: 0, requiereStock: false };

    const vacias = [];
    let total = 0;
    if (hasVal1 && hasVal2) {
      // matriz combinatoria
      for (const color of colores) for (const talla of tallas) {
        total++;
        const celda = getMatrizCelda(color, talla);
        if (celda == null || celda.stock == null) vacias.push({ color, talla });
      }
    } else if (hasVal1) {
      // solo variante 1 -> 1 fila por color, talla=''
      for (const color of colores) {
        total++;
        const celda = getMatrizCelda(color, '');
        if (celda == null || celda.stock == null) vacias.push({ color, talla: '' });
      }
    } else {
      // solo variante 2 -> 1 fila por talla, color=''
      for (const talla of tallas) {
        total++;
        const celda = getMatrizCelda('', talla);
        if (celda == null || celda.stock == null) vacias.push({ color: '', talla });
      }
    }
    return { vacias, total, requiereStock: vacias.length > 0 };
  }

  // Marca visualmente las celdas vacias con highlight naranja y muestra toast.
  function highlightCeldasVacias(vacias) {
    const view = window.TiendaIA.dom.mainView;
    if (!view) return;
    // Limpiar marks anteriores
    view.querySelectorAll('.ta-input--stock').forEach(i => i.classList.remove('ta-input--stock-empty'));
    // Marcar las vacias
    for (const { color, talla } of vacias) {
      const sel = '.ta-input--stock[data-celda-color="' + CSS.escape(color) + '"][data-celda-talla="' + CSS.escape(talla) + '"]';
      const el = view.querySelector(sel);
      if (el) {
        el.classList.add('ta-input--stock-empty');
        el.focus();  // foco al primer empty para que el user vea donde escribir
        return;       // solo focusear el primero
      }
    }
  }

  // v13: dropdown de tipo de variante. Si el tipo no esta en la lista fija,
  // muestra "Crear variante" como opcion seleccionada con input libre.
  function renderTipoSelector(num, valorActual) {
    const T = window.TiendaIA;
    const esCustom = !TIPOS_VARIANTE.includes(valorActual);
    const options = TIPOS_VARIANTE.map(t =>
      '<option value="' + T.escapeHtml(t) + '"' + (t === valorActual ? ' selected' : '') + '>' + T.escapeHtml(t) + '</option>'
    ).join('') +
    '<option value="__custom__"' + (esCustom ? ' selected' : '') + '>✨ Crear variante (escribir nombre)</option>';
    const customInput = esCustom
      ? '<input id="tipo-' + num + '-custom" type="text" class="ta-input" style="margin-top:6px;max-width:280px;" maxlength="40" placeholder="ej. Sabor, Aroma, Capacidad..." value="' + T.escapeHtml(valorActual) + '">'
      : '';
    return '<select id="tipo-' + num + '" class="ta-select" style="max-width:280px;">' + options + '</select>' + customInput;
  }

  function renderMatrizTabla(producto) {
    const T = window.TiendaIA;
    const colores = variantesState.colores;
    const tallas = variantesState.tallas;
    const tipo1 = variantesState.tipoVariante1 || 'Color';
    const tipo2 = variantesState.tipoVariante2 || '';
    const hasVal1 = colores.length > 0;
    const hasVal2 = tallas.length > 0;

    if (!hasVal1 && !hasVal2) {
      return '<p style="color:var(--ta-text-mut);font-size:13px;margin-top:16px;">Agrega al menos un valor para ver la tabla de stock.</p>';
    }

    // v13: tabla 1 columna si solo hay una variante (sin subvariante).
    if (hasVal1 && !hasVal2) {
      return renderTablaUnaColumna(producto, colores, tipo1, 'color');
    }
    if (!hasVal1 && hasVal2) {
      return renderTablaUnaColumna(producto, tallas, tipo2, 'talla');
    }
    // Ambos -> matriz combinatoria (logica existente)

    // v6: en CREAR, leer la referencia del input del form (live) en vez del producto
    // guardado. Si esta vacia, mostrar placeholder.
    const refLive = obtenerReferenciaLive(producto);
    const refValida = !!refLive;

    let thead = '<tr><th style="width:140px;">Color \\ Talla</th>';
    for (const t of tallas) thead += '<th>' + T.escapeHtml(t) + '</th>';
    thead += '</tr>';

    let tbody = '';
    for (const color of colores) {
      tbody += '<tr><th style="text-align:left;background:var(--ta-bg-soft);">' + T.escapeHtml(color) + '</th>';
      for (const talla of tallas) {
        const celda = getMatrizCelda(color, talla);
        const sku = celda?.sku || (refValida ? generarSku(refLive, color, talla) : '(llena la referencia arriba)');
        const stock = celda?.stock != null ? celda.stock : '';
        const reservadoStr = celda?.reservado > 0 ? '<span style="color:var(--ta-warn);font-size:11px;">(reserv: ' + celda.reservado + ')</span>' : '';
        const skuStyle = refValida ? 'color:var(--ta-text-mut);' : 'color:var(--ta-warn);font-style:italic;';
        tbody += '' +
          '<td>' +
            '<div style="display:flex;flex-direction:column;gap:4px;">' +
              '<code style="font-size:11px;' + skuStyle + '">' + T.escapeHtml(sku) + '</code>' +
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

  // v13: tabla de 1 columna para producto con solo Variante (sin Subvariante).
  // dimension = 'color' o 'talla' (indica que campo se llena en producto_variantes).
  function renderTablaUnaColumna(producto, valores, tipoLabel, dimension) {
    const T = window.TiendaIA;
    const refLive = obtenerReferenciaLive(producto);
    const refValida = !!refLive;

    const rows = valores.map(val => {
      const celda = dimension === 'color' ? getMatrizCelda(val, '') : getMatrizCelda('', val);
      const sku = celda?.sku || (refValida ? generarSku(refLive, dimension === 'color' ? val : '', dimension === 'talla' ? val : '') : '(llena la referencia arriba)');
      const stock = celda?.stock != null ? celda.stock : '';
      const reservadoStr = celda?.reservado > 0
        ? '<span style="color:var(--ta-warn);font-size:11px;">(reserv: ' + celda.reservado + ')</span>' : '';
      const skuStyle = refValida ? 'color:var(--ta-text-mut);' : 'color:var(--ta-warn);font-style:italic;';
      const colorAttr = dimension === 'color' ? T.escapeHtml(val) : '';
      const tallaAttr = dimension === 'talla' ? T.escapeHtml(val) : '';
      return '<tr>' +
        '<th style="text-align:left;background:var(--ta-bg-soft);padding:10px 14px;">' + T.escapeHtml(val) + '</th>' +
        '<td style="padding:10px 14px;"><code style="font-size:11px;' + skuStyle + '">' + T.escapeHtml(sku) + '</code></td>' +
        '<td style="padding:10px 14px;">' +
          '<input type="number" min="0" step="1" placeholder="Stock" value="' + T.escapeHtml(String(stock)) + '" ' +
            'data-celda-color="' + colorAttr + '" data-celda-talla="' + tallaAttr + '" ' +
            'class="ta-input ta-input--stock" style="padding:6px 8px;font-size:13px;max-width:120px;">' +
          ' ' + reservadoStr +
        '</td>' +
      '</tr>';
    }).join('');

    return '' +
      '<div style="margin-top:20px;overflow-x:auto;">' +
        '<table class="ta-table" style="font-size:13px;">' +
          '<thead><tr>' +
            '<th style="text-align:left;width:200px;">' + T.escapeHtml(tipoLabel) + '</th>' +
            '<th style="text-align:left;">SKU</th>' +
            '<th style="text-align:left;">Stock</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  // v6: lee la referencia "live" desde el input del form si estamos creando,
  // o desde el producto guardado si estamos editando.
  function obtenerReferenciaLive(producto) {
    if (producto && producto.referencia) return producto.referencia;
    const input = document.getElementById('f-referencia');
    return input ? String(input.value || '').trim() : '';
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

    // v12: wire del stock simple (solo si NO hay variantes activas)
    const stockSimpleInput = view.querySelector('#f-stock-simple');
    if (stockSimpleInput) {
      stockSimpleInput.addEventListener('input', () => {
        const v = stockSimpleInput.value === '' ? 0 : Math.max(0, parseInt(stockSimpleInput.value, 10) || 0);
        variantesState.stockSimple = v;
        formState.dirty = true;
      });
    }

    // v6: wire variantes events SIEMPRE (crear o edicion).
    wireVariantesEvents();
    // v7 (Fase 3.3d): wire fotos events solo en edicion (la seccion existe solo ahi)
    if (formState.producto) wireFotosEvents();
    // v11 (Fase 3.5.b): cascada categoria padre -> subcategoria
    wireCategoriaCascada();
    // F3: wire del picker de guia de tallas
    wireGuiaEvents();

    // v6: listener reactivo al campo Referencia para regenerar SKUs en la matriz
    // mientras el user escribe la referencia del producto (solo en CREAR).
    if (!formState.producto) {
      const inputRef = view.querySelector('#f-referencia');
      if (inputRef) {
        let refTimer = null;
        inputRef.addEventListener('input', () => {
          clearTimeout(refTimer);
          refTimer = setTimeout(() => {
            // Solo re-renderear si hay variantes activas con colores+tallas
            if (variantesState.activo && variantesState.colores.length > 0 && variantesState.tallas.length > 0) {
              rerenderVariantes();
            }
          }, 250);
        });
        T.registerCleanup(() => clearTimeout(refTimer));
      }
    }
  }

  // ============================================================
  // Variantes: event handlers
  // ============================================================
  function wireVariantesEvents() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    // v13: dropdowns de tipo (Variante 1 y 2) + input custom + agregar/quitar sub
    ['1', '2'].forEach(num => {
      const sel = view.querySelector('#tipo-' + num);
      const input = view.querySelector('#tipo-' + num + '-custom');
      const aplicar = (nuevo) => {
        if (num === '1') variantesState.tipoVariante1 = nuevo;
        else variantesState.tipoVariante2 = nuevo;
        variantesState.dirty = true;
      };
      if (sel) sel.addEventListener('change', () => {
        const v = sel.value;
        if (v === '__custom__') {
          // Pasar a modo custom con valor vacio para que el user escriba
          aplicar('');
          rerenderVariantes();
        } else {
          aplicar(v);
          rerenderVariantes();
        }
      });
      if (input) input.addEventListener('input', () => {
        aplicar(input.value.trim());
        // No re-render para no perder foco
      });
    });

    // v13: agregar subvariante (cuando aun no hay)
    const btnAddSub = view.querySelector('#btn-add-sub');
    if (btnAddSub) {
      btnAddSub.addEventListener('click', () => {
        variantesState.tipoVariante2 = 'Talla';  // default al agregar
        variantesState.dirty = true;
        rerenderVariantes();
      });
    }
    // v13: quitar subvariante
    const btnQuitarSub = view.querySelector('#btn-quitar-sub');
    if (btnQuitarSub) {
      btnQuitarSub.addEventListener('click', () => {
        const hayValores = variantesState.tallas.length > 0;
        if (hayValores && !window.confirm('Quitar la subvariante eliminara sus valores y la matriz combinatoria. ¿Continuar?')) return;
        variantesState.tipoVariante2 = '';
        variantesState.tallas = [];
        // Limpiar celdas que tenian talla
        const matrizLimpia = {};
        for (const k of Object.keys(variantesState.matriz)) {
          const [c, t] = k.split('__');
          if (!t) matrizLimpia[k] = variantesState.matriz[k];
        }
        variantesState.matriz = matrizLimpia;
        variantesState.dirty = true;
        rerenderVariantes();
      });
    }

    // Activar editor
    const btnActivar = view.querySelector('#btn-activar-variantes');
    if (btnActivar) {
      btnActivar.addEventListener('click', () => {
        variantesState.activo = true;
        // v13: default a Color para tipo1 si no esta seteado
        if (!variantesState.tipoVariante1) variantesState.tipoVariante1 = 'Color';
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
        // v6 BUG #1 fix: usar obtenerReferenciaLive que maneja crear (producto null).
        const ref = obtenerReferenciaLive(formState.producto);
        setMatrizCelda(color, talla, {
          ...existente,
          color, talla,
          sku: existente.sku || (ref ? generarSku(ref, color, talla) : null),
          stock,
        });
        // v10: quitar highlight de empty al escribir
        if (stockRaw !== '') e.target.classList.remove('ta-input--stock-empty');
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
    // v6 BUG #2 fix: NO incluir !formState.producto en el guard; en crear es null
    // y el fallback full re-render perdia foco + acumulaba listeners en cada
    // interaccion (input/agregar/quitar tag).
    const T = window.TiendaIA;
    const seccionVieja = T.dom.mainView.querySelector('#variantes-seccion');
    if (!seccionVieja) {
      // Fallback: re-render full (caso muy edge, no deberia pasar)
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

    // v10 fix Jorge: validar que TODAS las celdas tengan stock antes de guardar.
    // No guardar silenciosamente las que tienen stock; pedir explicitamente al
    // user que llene las vacias (0 si no hay stock, N si tiene).
    const validacion = validarMatrizStocks();
    if (validacion.requiereStock) {
      const faltan = validacion.vacias.length;
      T.toast('Faltan ' + faltan + ' celda(s) sin stock. Coloca 0 si no tienes stock o el numero real. Las celdas en naranja son las que faltan.', 'error');
      highlightCeldasVacias(validacion.vacias);
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    // v14 BUG #1 fix: si el UPDATE de tipos falla, ABORTAR con error visible.
    // Antes solo console.warn dejaba inconsistencia (tipos viejos + variantes nuevas).
    const tipo1Persist = variantesState.tipoVariante1 || null;
    const tipo2Persist = variantesState.tipoVariante2 || null;
    const tipoUpd = await sb.from('productos').update({
      variante_tipo_1: tipo1Persist,
      variante_tipo_2: tipo2Persist,
    }).eq('id', producto.id).eq('tienda_id', T.state.tienda.id);
    if (tipoUpd.error) {
      console.error('[guardarVariantes] no se pudo actualizar tipos:', tipoUpd.error);
      T.toast('No pudimos guardar los tipos de variante. Intenta de nuevo.', 'error');
      restoreVariantesBtn(btn);
      return;
    }

    // v13: construir lista soportando 1 dimension o matriz N×M
    const actuales = [];
    const colores = variantesState.colores;
    const tallas = variantesState.tallas;
    if (colores.length > 0 && tallas.length > 0) {
      for (const color of colores) for (const talla of tallas) {
        const celda = getMatrizCelda(color, talla);
        const stock = celda?.stock;
        if (stock == null) continue;
        actuales.push({
          id: celda?.id, color, talla,
          sku: celda?.sku || generarSku(producto.referencia, color, talla),
          stock, precio_override: celda?.precio_override || null,
        });
      }
    } else if (colores.length > 0) {
      for (const color of colores) {
        const celda = getMatrizCelda(color, '');
        const stock = celda?.stock;
        if (stock == null) continue;
        actuales.push({
          id: celda?.id, color, talla: null,
          sku: celda?.sku || generarSku(producto.referencia, color, ''),
          stock, precio_override: celda?.precio_override || null,
        });
      }
    } else if (tallas.length > 0) {
      for (const talla of tallas) {
        const celda = getMatrizCelda('', talla);
        const stock = celda?.stock;
        if (stock == null) continue;
        actuales.push({
          id: celda?.id, color: null, talla,
          sku: celda?.sku || generarSku(producto.referencia, '', talla),
          stock, precio_override: celda?.precio_override || null,
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
      // §2.4 Fase B: una sola RPC rutea altas/ediciones/bajas por el kardex.
      // Altas (sin id) -> entrada; ediciones (con id) -> delta>0 entrada / delta<0
      // ajuste; bajas -> p_eliminar (guard de reservas en la RPC, ademas del front).
      // p_costo_entrada=null -> la RPC usa el promedio actual del producto.
      const variantesArr = actuales.map(v => {
        const o = { color: v.color, talla: v.talla, sku: v.sku, stock: v.stock, precio_override: v.precio_override };
        if (v.id) o.id = v.id;
        return o;
      });
      const eliminarIds = eliminadas.map(e => e.id);
      const r = await sb.rpc('editar_variantes_producto', {
        p_producto_id: producto.id,
        p_variantes: variantesArr,
        p_eliminar: eliminarIds,
        p_costo_entrada: null,
      });
      if (r.error) {
        if (r.error.code === '23505') {
          T.toast('Algun SKU ya existe en otro producto. Cambia la referencia base del producto y vuelve a intentar.', 'error');
        } else {
          T.toast(r.error.message || 'No pudimos guardar las variantes.', 'error');
        }
        restoreVariantesBtn(btn);
        return;
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

  // v11 (Fase 3.5.b): al cambiar la categoria padre, regenera el dropdown
  // de subcategorias con los hijos del padre nuevo y resetea seleccion.
  function wireCategoriaCascada() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;
    const selPadre = view.querySelector('#f-cat-padre');
    const selSub = view.querySelector('#f-cat-sub');
    if (!selPadre || !selSub) return;

    selPadre.addEventListener('change', () => {
      const padreId = selPadre.value || null;
      const hijos = padreId ? formState.categorias.filter(c => c.parent_id === padreId) : [];
      const opts = ['<option value="">— Sin subcategoria —</option>']
        .concat(hijos.map(h => '<option value="' + T.escapeHtml(h.id) + '">' + T.escapeHtml(h.nombre) + '</option>'))
        .join('');
      selSub.innerHTML = opts;
      selSub.disabled = hijos.length === 0;
      formState.dirty = true;
      // Actualizar hint visual al lado del select
      const hintWrap = selSub.parentElement;
      if (hintWrap) {
        const oldHint = hintWrap.querySelector('.ta-field__hint');
        if (oldHint) oldHint.remove();
        const hintText = !padreId
          ? 'Elige primero una categoria.'
          : (hijos.length === 0 ? 'Esta categoria no tiene subcategorias.' : null);
        if (hintText) {
          const span = document.createElement('span');
          span.className = 'ta-field__hint';
          span.textContent = hintText;
          hintWrap.appendChild(span);
        }
      }
    });

    selSub.addEventListener('change', () => { formState.dirty = true; });
  }

  // F3: arma ficha_editorial desde el form. Listas (diseno/beneficios) = una
  // vinieta por linea. Devuelve null si TODO esta vacio -> garantiza que un
  // producto sin ficha quede con ficha_editorial NULL (PDP byte-identico).
  function buildFichaEditorial(fd) {
    const splitLines = (s) => String(s || '').split('\n').map(l => l.trim()).filter(Boolean);
    const material = String(fd.get('ficha_material') || '').trim();
    const ajuste = String(fd.get('ficha_ajuste') || '').trim();
    const diseno = splitLines(fd.get('ficha_diseno'));
    const beneficios = splitLines(fd.get('ficha_beneficios'));
    if (!material && !ajuste && !diseno.length && !beneficios.length) return null;
    return { material, ajuste, diseno, beneficios };
  }

  async function handleSubmit(form) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const btnGuardar = form.querySelector('#btn-guardar');
    if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = 'Guardando...'; }

    const fd = new FormData(form);
    // v11 (Fase 3.5.b): leer categoria desde los 2 dropdowns en cascada.
    // Si hay subcategoria seleccionada, prevalece; sino usa la padre.
    const padreEl = form.querySelector('#f-cat-padre');
    const subEl = form.querySelector('#f-cat-sub');
    const padreVal = padreEl ? padreEl.value : '';
    const subVal = subEl ? subEl.value : '';
    const finalCategoriaId = subVal || padreVal || null;

    // v13: persistir tipos de variante. Si NO hay variantes activas, NULL ambos.
    const variante_tipo_1 = variantesState.activo ? (variantesState.tipoVariante1 || 'Color') : null;
    const variante_tipo_2 = variantesState.activo && variantesState.tipoVariante2 ? variantesState.tipoVariante2 : null;

    const payload = {
      tienda_id: tienda.id,
      nombre: String(fd.get('nombre') || '').trim(),
      referencia: String(fd.get('referencia') || '').trim(),
      categoria_id: finalCategoriaId,
      variante_tipo_1,
      variante_tipo_2,
      descripcion: String(fd.get('descripcion') || '').trim() || null,
      precio_venta: Number(fd.get('precio_venta')) || 0,
      costo: fd.get('costo') ? Number(fd.get('costo')) : null,
      precio_promo: fd.get('precio_promo') ? Number(fd.get('precio_promo')) : null,
      precio_mayorista: fd.get('precio_mayorista') ? Number(fd.get('precio_mayorista')) : null,
      cantidad_min_mayorista: fd.get('cantidad_min_mayorista') ? Number(fd.get('cantidad_min_mayorista')) : null,
      estado: String(fd.get('estado') || 'activo'),
      // F3: contenido editorial. guia = URL (hidden input seteado por el picker).
      guia_tallas_url: String(fd.get('guia_tallas_url') || '').trim() || null,
      ficha_editorial: buildFichaEditorial(fd),
    };

    // Validacion cliente
    if (!payload.nombre) { T.toast('El nombre es obligatorio', 'error'); restoreBtn(btnGuardar); return; }
    if (!payload.referencia) { T.toast('La referencia es obligatoria', 'error'); restoreBtn(btnGuardar); return; }
    if (!(payload.precio_venta > 0)) { T.toast('El precio de venta debe ser mayor a 0', 'error'); restoreBtn(btnGuardar); return; }
    if (payload.precio_promo != null && payload.precio_promo >= payload.precio_venta) {
      T.toast('El precio promo debe ser menor al precio de venta', 'error'); restoreBtn(btnGuardar); return;
    }

    // v14 BUG #3 fix: en EDICION, si user activa variantes pero la defaultVariant
    // existente tiene reservas, ABORTAR antes de insertar nada para evitar estado
    // mixto (default + variantes reales coexistiendo con stocks distintos).
    if (formState.producto && variantesState.activo && variantesState.defaultVariant
        && (variantesState.defaultVariant.reservado || 0) > 0) {
      T.toast('No puedes activar variantes mientras el producto tenga ' + variantesState.defaultVariant.reservado + ' unidad(es) reservadas. Confirma o cancela los pedidos pendientes primero.', 'error');
      restoreBtn(btnGuardar);
      return;
    }

    // v10 fix Jorge: si crear con variantes activas, validar stocks ANTES del INSERT producto.
    // v13: ahora vale si hay solo variante 1 O solo variante 2 (no requiere ambas).
    const esCreacionConVariantes = !formState.producto && variantesState.activo &&
      (variantesState.colores.length > 0 || variantesState.tallas.length > 0);
    if (esCreacionConVariantes) {
      const validacion = validarMatrizStocks();
      if (validacion.requiereStock) {
        const faltan = validacion.vacias.length;
        T.toast('Faltan ' + faltan + ' celda(s) sin stock en las variantes. Coloca 0 si no tienes stock o el numero real. Las celdas en naranja son las que faltan.', 'error');
        highlightCeldasVacias(validacion.vacias);
        restoreBtn(btnGuardar);
        return;
      }
    }

    try {
      let result;
      let variantesWarning = null;
      const esCreacion = !formState.producto;

      if (esCreacion) {
        // §2.1 Fase B: la creacion entera (producto + variantes + saldo_inicial en
        // el kardex) va por UNA RPC. Construimos el array de variantes ANTES: matriz
        // / 1-dim si hay variantes activas, o 1 variante "default" (color/talla null)
        // con el stock simple si el producto no maneja variantes. >=1 siempre.
        const variantesArr = [];
        const colores = variantesState.colores;
        const tallas = variantesState.tallas;
        if (variantesState.activo && (colores.length > 0 || tallas.length > 0)) {
          if (colores.length > 0 && tallas.length > 0) {
            // matriz combinatoria
            for (const color of colores) for (const talla of tallas) {
              const celda = getMatrizCelda(color, talla);
              const stock = celda?.stock;
              if (stock == null) continue;
              variantesArr.push({ color, talla, sku: generarSku(payload.referencia, color, talla), stock, precio_override: celda?.precio_override || null });
            }
          } else if (colores.length > 0) {
            // solo variante 1 (talla=null)
            for (const color of colores) {
              const celda = getMatrizCelda(color, '');
              const stock = celda?.stock;
              if (stock == null) continue;
              variantesArr.push({ color, talla: null, sku: generarSku(payload.referencia, color, ''), stock, precio_override: celda?.precio_override || null });
            }
          } else {
            // solo variante 2 (color=null)
            for (const talla of tallas) {
              const celda = getMatrizCelda('', talla);
              const stock = celda?.stock;
              if (stock == null) continue;
              variantesArr.push({ color: null, talla, sku: generarSku(payload.referencia, '', talla), stock, precio_override: celda?.precio_override || null });
            }
          }
        } else {
          // producto SIN variantes: 1 variante default con el stock simple.
          const stockSimple = variantesState.stockSimple != null ? Math.max(0, parseInt(variantesState.stockSimple, 10) || 0) : 0;
          const skuSimple = generarSku(payload.referencia, '', '') || payload.referencia;
          variantesArr.push({ color: null, talla: null, sku: skuSimple, stock: stockSimple, precio_override: null });
        }

        result = await sb.rpc('crear_producto_con_stock', { p_producto: payload, p_variantes: variantesArr });
        if (result.error) {
          console.error('[prod-form] save error', result.error);
          let msg = result.error.message || 'No pudimos guardar el producto';
          if (result.error.code === '23505' || /referencia/i.test(msg)) {
            msg = 'Ya tienes un producto con esa referencia. Cambia el SKU.';
          }
          T.toast(msg, 'error');
          restoreBtn(btnGuardar);
          return;
        }
      } else {
        // EDICION: los campos del producto por UPDATE directo, SIN costo (§2.2: el
        // costo es proyeccion del kardex/Compras, no se edita en el form). El stock
        // y las variantes van por las RPCs (kardex).
        const { tienda_id, costo, ...patch } = payload;
        result = await sb.from('productos').update(patch).eq('id', formState.producto.id).eq('tienda_id', tienda.id).select().maybeSingle();
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
        // v2 BUG #3 fix: UPDATE silencioso. data null sin error = RLS bloqueo / id inexistente.
        if (result.data === null) {
          T.toast('No se pudo actualizar. Verifica que el producto sigue existiendo.', 'error');
          restoreBtn(btnGuardar);
          return;
        }

        // §2.5: transicion default->variantes. La default variant se borra via
        // p_eliminar de la RPC (nada de delete directo huerfano). Las variantes
        // reales se guardan aparte con "Guardar variantes" (guardarVariantes).
        if (variantesState.activo && variantesState.defaultVariant) {
          const dv = variantesState.defaultVariant;
          const delRes = await sb.rpc('editar_variantes_producto', {
            p_producto_id: formState.producto.id,
            p_variantes: [],
            p_eliminar: [dv.id],
            p_costo_entrada: null,
          });
          if (delRes.error) {
            console.warn('[prod-form] no se pudo eliminar default variant:', delRes.error);
            variantesWarning = 'No pudimos quitar el stock simple anterior: ' + (delRes.error.message || '');
          } else {
            variantesState.defaultVariant = null;
          }
        }

        // §2.3: producto SIN variantes -> crear/actualizar la default variant. El
        // stock va por kardex (delta) via editar_variantes_producto.
        if (!variantesState.activo) {
          const stockSimple = variantesState.stockSimple != null ? Math.max(0, parseInt(variantesState.stockSimple, 10) || 0) : 0;
          if (variantesState.defaultVariant) {
            // Update existing default variant (stock por delta del kardex)
            const dv = variantesState.defaultVariant;
            const vRes = await sb.rpc('editar_variantes_producto', {
              p_producto_id: formState.producto.id,
              p_variantes: [{ id: dv.id, color: null, talla: null, sku: dv.sku, stock: stockSimple, precio_override: dv.precio_override || null }],
              p_eliminar: [],
              p_costo_entrada: null,
            });
            if (vRes.error) {
              console.error('[prod-form] default variant update error', vRes.error);
              variantesWarning = 'No pudimos actualizar el stock: ' + (vRes.error.message || '');
            }
          } else {
            // Edicion, no habia default variant - alta de una ahora.
            const skuSimple = generarSku(result.data.referencia, '', '') || result.data.referencia;
            const vRes = await sb.rpc('editar_variantes_producto', {
              p_producto_id: formState.producto.id,
              p_variantes: [{ color: null, talla: null, sku: skuSimple, stock: stockSimple, precio_override: null }],
              p_eliminar: [],
              p_costo_entrada: null,
            });
            if (vRes.error) {
              console.error('[prod-form] default variant insert (edit) error', vRes.error);
              variantesWarning = 'No pudimos guardar el stock: ' + (vRes.error.message || '');
            }
          }
        }

        // Costo editable en edicion (decision Jorge): post-REVOKE el UPDATE directo
        // de productos.costo esta bloqueado, asi que el costo manual entra por RPC
        // owner-facing. Solo si cambio respecto al valor cargado (no pisar el promedio
        // recien recalculado por una entrada de stock si el usuario no toco el costo).
        const costoViejo = formState.producto.costo != null ? Number(formState.producto.costo) : null;
        if (costo !== costoViejo) {
          const cRes = await sb.rpc('actualizar_costo_producto', { p_producto_id: formState.producto.id, p_costo: costo });
          if (cRes.error) {
            console.error('[prod-form] costo update error', cRes.error);
            variantesWarning = 'No pudimos actualizar el costo: ' + (cRes.error.message || '');
          }
        }
      }

      formState.dirty = false;
      // v6 BUG #3 fix: solo resetear variantesState.dirty si las variantes
      // tambien se guardaron OK. Si producto OK + variantes fallaron, dejamos
      // dirty=true para que el navGuard avise al salir.
      if (!variantesWarning) variantesState.dirty = false;
      if (variantesWarning) {
        T.toast(variantesWarning, 'error');
      } else {
        const okMsg = esCreacion
          ? (variantesState.activo && variantesState.colores.length > 0
              ? 'Producto creado con sus variantes'
              : 'Producto creado')
          : 'Producto actualizado';
        T.toast(okMsg, 'success');
      }
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
