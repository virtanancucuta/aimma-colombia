/* AIMMA · Tienda IA · views/productos.js · v2 · 2026-05-29
   Fase 3.3a (lista) + 3.3b (crear/editar form basico).
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
    T.dom.mainView.innerHTML = renderFormHTML();
    wireFormEvents();
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

      '</form>';
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

    // v2 BUG #4 fix: warn hashchange si dirty (navegacion interna SPA).
    // beforeunload no protege contra cambios de hash (sidebar click, link interno).
    let lastHash = window.location.hash;
    const hashFn = (ev) => {
      if (formState.dirty && lastHash !== window.location.hash) {
        const confirmar = window.confirm('Tienes cambios sin guardar en este producto. ¿Salir de todos modos?');
        if (!confirmar) {
          // Revertir el cambio de hash
          history.replaceState(null, '', lastHash);
          return;
        }
        formState.dirty = false; // user confirmo salir
      }
      lastHash = window.location.hash;
    };
    window.addEventListener('hashchange', hashFn);

    T.registerCleanup(() => {
      window.removeEventListener('beforeunload', warnFn);
      window.removeEventListener('hashchange', hashFn);
    });
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
