/* AIMMA · Tienda IA · views/inicio.js · v2 · 2026-05-29 · Vista Inicio */
/* v2 (2026-05-29 post-audit): 3 HIGH fixes
   - Fix BUG #1+#2: KPIs (productos activos, pedidos pendientes, ventas mes)
     usan queries dedicadas count:exact head:true para conteos globales sin
     contaminacion por limit(5) en la query de pedidos recientes.
   - Fix BUG #3: whenReady con contador de intentos, abortar a los 10s para
     evitar polling infinito si admin.js falla en cargar.
   KPIs propios de la tienda + acciones recomendadas + ultimos pedidos.
   IMPORTANTE: estos KPIs son del modulo Tienda IA, NO del Dashboard AIMMA. */

(function () {
  'use strict';

  // v2: contador de intentos para whenReady. Max ~10s (200 intentos x 50ms).
  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') {
      cb();
      return;
    }
    if (attempts >= 200) {
      console.error('[inicio.js] window.TiendaIA no inicializo en 10s. Verifica que admin.js cargo sin errores.');
      return;
    }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.registerView('', renderInicio);
  });

  // ============================================================
  // Render principal
  // ============================================================
  async function renderInicio() {
    const T = window.TiendaIA;
    const tienda = T.state.tienda;
    const profile = T.state.profile;
    const isPromMax = tienda.plan_tienda === 'pro_max';
    const view = T.dom.mainView;

    view.innerHTML = renderHeader(tienda) + renderSkeleton(isPromMax);

    try {
      const data = await loadData(T.supabase(), tienda);
      const kpisEl = view.querySelector('#inicio-kpis');
      const accionesEl = view.querySelector('#inicio-acciones');
      const pedidosEl = view.querySelector('#inicio-pedidos');
      if (kpisEl) kpisEl.outerHTML = renderKPIs(data, isPromMax);
      if (accionesEl) accionesEl.outerHTML = renderAcciones(data, tienda, profile);
      if (pedidosEl) pedidosEl.outerHTML = renderPedidos(data, isPromMax);
    } catch (e) {
      console.error('[inicio] load error', e);
      const kpisEl = view.querySelector('#inicio-kpis');
      if (kpisEl) {
        kpisEl.outerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">No pudimos cargar tus datos</h2><p class="ta-empty__text">' + T.escapeHtml(e.message || String(e)) + '</p></div></div>';
      }
    }
  }

  // ============================================================
  // Data loading
  // ============================================================
  async function loadData(sb, tienda) {
    const tid = tienda.id;
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // v2: queries dedicadas para CONTEOS GLOBALES (head:true sin payload).
    // Las queries con limit(5) son SOLO para listas a renderizar, NO para KPIs.
    const [
      productosRecientesRes,     // lista para mostrar
      productosTotalRes,          // count total
      productosActivosRes,        // count activos
      variantesRes,               // todas (necesarias para conteos cliente)
      pedidosRecientesRes,        // lista para mostrar
      pedidosTotalRes,            // count total
      pedidosPendientesRes,       // count pendientes
      ventasMesRes,               // pedidos confirmados del mes para sumar
      categoriasRes,              // count
      legalesRes,                 // tipos para Set
    ] = await Promise.all([
      sb.from('productos')
        .select('id, estado, nombre, precio_venta, foto_principal_url, created_at, referencia, categoria_id')
        .eq('tienda_id', tid)
        .order('created_at', { ascending: false })
        .limit(5),
      sb.from('productos').select('id', { count: 'exact', head: true })
        .eq('tienda_id', tid),
      sb.from('productos').select('id', { count: 'exact', head: true })
        .eq('tienda_id', tid).eq('estado', 'activo'),
      sb.from('producto_variantes')
        .select('id, stock, reservado, producto_id, sku, color, talla, productos!inner(tienda_id)')
        .eq('productos.tienda_id', tid),
      sb.from('pedidos')
        .select('id, estado, total, codigo_publico, comprador_nombre, pendiente_at, confirmado_at')
        .eq('tienda_id', tid)
        .order('created_at', { ascending: false })
        .limit(5),
      sb.from('pedidos').select('id', { count: 'exact', head: true })
        .eq('tienda_id', tid),
      sb.from('pedidos').select('id', { count: 'exact', head: true })
        .eq('tienda_id', tid).eq('estado', 'pendiente_confirmacion'),
      sb.from('pedidos')
        .select('total')
        .eq('tienda_id', tid).eq('estado', 'confirmado')
        .gte('confirmado_at', inicioMes),
      sb.from('categorias').select('id', { count: 'exact', head: true })
        .eq('tienda_id', tid),
      sb.from('paginas_legales').select('tipo', { count: 'exact' })
        .eq('tienda_id', tid),
    ]);

    const productosRecientes = productosRecientesRes.data || [];
    const variantes = variantesRes.data || [];
    const pedidosRecientes = pedidosRecientesRes.data || [];
    const ventasMesRows = ventasMesRes.data || [];
    const legales = legalesRes.data || [];

    const totalVariantes = variantes.length;
    const variantesEnStock = variantes.filter(v => (v.stock || 0) > (v.reservado || 0)).length;
    const stockBajo = variantes.filter(v => (v.stock || 0) > 0 && (v.stock || 0) <= 5).length;

    const ventasMes = ventasMesRows.reduce((sum, p) => sum + Number(p.total || 0), 0);

    const tiposLegales = new Set(legales.map(l => l.tipo));
    const legalesCompletas = tiposLegales.size;

    return {
      productos: {
        recientes: productosRecientes,
        total: productosTotalRes.count || 0,
        activos: productosActivosRes.count || 0,
      },
      variantes: { total: totalVariantes, enStock: variantesEnStock, stockBajo },
      pedidos: {
        recientes: pedidosRecientes,
        total: pedidosTotalRes.count || 0,
        pendientes: pedidosPendientesRes.count || 0,
        ventasMes,
      },
      categorias: { total: categoriasRes.count || 0 },
      legales: { completadas: legalesCompletas, total: 3 },
    };
  }

  // ============================================================
  // Render parts
  // ============================================================
  function renderHeader(tienda) {
    const T = window.TiendaIA;
    const nombre = T.escapeHtml(tienda.nombre_negocio || 'Tu tienda');
    const slug = T.escapeHtml(tienda.slug || '');
    const estadoLabel = ({
      'publicada': '<span class="ta-pill ta-pill--ok">Publicada</span>',
      'pausada':   '<span class="ta-pill ta-pill--warn">Pausada</span>',
      'borrador':  '<span class="ta-pill ta-pill--info">En borrador</span>',
    })[tienda.estado] || '';

    return '' +
      '<header style="margin-bottom: 24px;">' +
        '<h1 class="ta-section-title">Bienvenido, ' + nombre + ' ' + estadoLabel + '</h1>' +
        '<p class="ta-section-sub">' +
          'Este es el panel de control del <strong>modulo Tienda IA</strong>. ' +
          'Aqui veras como va tu catalogo y tus pedidos. ' +
          'Tu slug es <code style="background:#0a172a;padding:2px 6px;border-radius:4px;">' + slug + '.tienda.aimma.com.co</code>' +
        '</p>' +
      '</header>';
  }

  function renderSkeleton(isPromMax) {
    const n = isPromMax ? 10 : 4;
    const cards = Array.from({ length: n }, () =>
      '<div class="ta-kpi" style="opacity:.5">' +
        '<div class="ta-kpi__label">Cargando...</div>' +
        '<div class="ta-kpi__value">·</div>' +
      '</div>'
    ).join('');

    return '' +
      '<div id="inicio-kpis" class="ta-kpi-grid">' + cards + '</div>' +
      '<div id="inicio-acciones"></div>' +
      '<div id="inicio-pedidos"></div>';
  }

  function renderKPIs(data, isPromMax) {
    const kpis = [];

    // === PRO basico: 4 KPIs ===
    kpis.push(kpi('Productos en catalogo', data.productos.total, data.productos.total === 0 ? 'Sin productos aun' : null));
    kpis.push(kpi('Variantes en stock', data.variantes.enStock, data.variantes.total ? data.variantes.total + ' SKUs totales' : 'Sin variantes'));
    kpis.push(kpi('Pedidos pendientes', data.pedidos.pendientes, 'Total ' + data.pedidos.total, data.pedidos.pendientes > 0 ? 'alert' : null));
    kpis.push(kpi('Categorias', data.categorias.total, data.categorias.total === 0 ? 'Crea tu primera categoria' : null));

    // === PRO-MAX: 6 KPIs extra ===
    if (isPromMax) {
      kpis.push(kpi('Ventas del mes', fmtCOP(data.pedidos.ventasMes), 'Solo pedidos confirmados'));
      kpis.push(kpi('Stock bajo (≤5)', data.variantes.stockBajo, data.variantes.stockBajo > 0 ? 'Revisa antes de quedar agotado' : 'Todo OK', data.variantes.stockBajo > 0 ? 'alert' : null));
      kpis.push(kpi('Paginas legales', data.legales.completadas + ' / ' + data.legales.total,
        data.legales.completadas === data.legales.total ? 'Todas completas' : 'Faltan ' + (data.legales.total - data.legales.completadas)));
      kpis.push(kpi('Total pedidos', data.pedidos.total, 'Historico'));
      kpis.push(kpi('Tokens IA disponibles', window.TiendaIA.state.profile.token_balance || 0, 'Para generar imagenes y webs'));
      kpis.push(kpi('Plan', 'PRO-MAX', 'Todos los features activos'));
    }

    return '<div id="inicio-kpis" class="ta-kpi-grid">' + kpis.join('') + '</div>';
  }

  function kpi(label, value, hint, kind) {
    const T = window.TiendaIA;
    return '' +
      '<div class="ta-kpi' + (kind === 'alert' ? ' ta-kpi--alert' : '') + '">' +
        '<div class="ta-kpi__label">' + T.escapeHtml(label) + '</div>' +
        '<div class="ta-kpi__value">' + T.escapeHtml(String(value)) + '</div>' +
        (hint ? '<div class="ta-kpi__hint">' + T.escapeHtml(hint) + '</div>' : '') +
      '</div>';
  }

  // ============================================================
  // Acciones recomendadas
  // ============================================================
  function renderAcciones(data, tienda, profile) {
    const acciones = [];

    if (!tienda.plantilla_id) {
      acciones.push({
        icon: '🎨', titulo: 'Elegi tu plantilla y paleta',
        desc: 'Sin plantilla no podemos publicar tu tienda. Toma 1 minuto.',
        cta: 'Ir a Configuracion', href: '#/configuracion',
      });
    }
    if (data.productos.total === 0) {
      acciones.push({
        icon: '📦', titulo: 'Carga tu primer producto',
        desc: 'Tu tienda esta vacia. Empieza con uno o sube varios via Excel.',
        cta: 'Crear producto', href: '#/productos/nuevo',
      });
    }
    if (data.categorias.total === 0 && data.productos.total > 0) {
      acciones.push({
        icon: '🗂️', titulo: 'Organiza con categorias',
        desc: 'Ayuda a tus clientes a encontrar lo que buscan.',
        cta: 'Crear categoria', href: '#/categorias',
      });
    }
    if (data.legales.completadas < data.legales.total) {
      acciones.push({
        icon: '📜', titulo: 'Completa tus paginas legales',
        desc: 'Garantias, tratamiento de datos y contacto. Obligatorio antes de publicar.',
        cta: 'Editar legales', href: '#/legales',
      });
    }
    if (tienda.estado === 'borrador' && data.productos.total > 0 && tienda.plantilla_id) {
      acciones.push({
        icon: '🚀', titulo: 'Publica tu tienda',
        desc: 'Esta lista para que tus clientes empiecen a comprarte.',
        cta: 'Ir a Configuracion', href: '#/configuracion',
      });
    }
    if (data.pedidos.pendientes > 0) {
      acciones.push({
        icon: '⚠️', titulo: 'Tienes ' + data.pedidos.pendientes + ' pedido(s) pendiente(s) de confirmar',
        desc: 'Los clientes esperan tu respuesta. Confirmalos o cancelalos.',
        cta: 'Ver pedidos', href: '#/pedidos',
      });
    }

    if (acciones.length === 0) {
      // Todo en orden
      return '' +
        '<div id="inicio-acciones" class="ta-card" style="margin-top:24px;">' +
          '<h2 style="margin:0 0 4px;font-size:18px;">Tu tienda esta en buen estado</h2>' +
          '<p style="margin:0;color:var(--ta-text-soft);font-size:14px;">' +
            'Catalogo cargado, plantilla elegida, paginas legales completas. Sigue revisando los pedidos en cuanto lleguen.' +
          '</p>' +
        '</div>';
    }

    const T = window.TiendaIA;
    const items = acciones.map(a =>
      '<a href="' + a.href + '" class="ta-accion">' +
        '<span class="ta-accion__icon" aria-hidden="true">' + a.icon + '</span>' +
        '<span class="ta-accion__body">' +
          '<span class="ta-accion__title">' + T.escapeHtml(a.titulo) + '</span>' +
          '<span class="ta-accion__desc">' + T.escapeHtml(a.desc) + '</span>' +
        '</span>' +
        '<span class="ta-accion__cta">' + T.escapeHtml(a.cta) + ' →</span>' +
      '</a>'
    ).join('');

    return '' +
      '<div id="inicio-acciones" style="margin-top:24px;">' +
        '<h2 style="font-size:18px;margin:0 0 12px;">Proximas acciones recomendadas</h2>' +
        '<div class="ta-acciones-list">' + items + '</div>' +
      '</div>';
  }

  // ============================================================
  // Ultimos pedidos
  // ============================================================
  function renderPedidos(data, isPromMax) {
    const T = window.TiendaIA;

    if (data.pedidos.total === 0) {
      return '' +
        '<div id="inicio-pedidos" class="ta-card" style="margin-top:24px;">' +
          '<h2 style="margin:0 0 4px;font-size:18px;">Ultimos pedidos</h2>' +
          '<p style="margin:0;color:var(--ta-text-mut);font-size:14px;">' +
            'Cuando tus clientes hagan checkout por WhatsApp, los pedidos apareceran aqui. ' +
            'El checkout estara activo desde la Fase 5 del MVP.' +
          '</p>' +
        '</div>';
    }

    const rows = data.pedidos.recientes.map(p =>
      '<tr>' +
        '<td><code>' + T.escapeHtml(p.codigo_publico || p.id.slice(0, 8)) + '</code></td>' +
        '<td>' + T.escapeHtml(p.comprador_nombre || '-') + '</td>' +
        '<td>' + renderEstado(p.estado) + '</td>' +
        '<td style="text-align:right;">' + fmtCOP(Number(p.total || 0)) + '</td>' +
      '</tr>'
    ).join('');

    return '' +
      '<div id="inicio-pedidos" style="margin-top:24px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;">' +
          '<h2 style="font-size:18px;margin:0;">Ultimos pedidos</h2>' +
          '<a href="#/pedidos" style="font-size:13px;">Ver todos →</a>' +
        '</div>' +
        '<div class="ta-card" style="padding:0;">' +
          '<div class="ta-table-wrap">' +
            '<table class="ta-table">' +
              '<thead><tr><th>Codigo</th><th>Cliente</th><th>Estado</th><th style="text-align:right;">Total</th></tr></thead>' +
              '<tbody>' + rows + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderEstado(estado) {
    if (estado === 'confirmado') return '<span class="ta-pill ta-pill--ok">Confirmado</span>';
    if (estado === 'cancelado') return '<span class="ta-pill ta-pill--danger">Cancelado</span>';
    return '<span class="ta-pill ta-pill--warn">Pendiente</span>';
  }

  // ============================================================
  // Utils
  // ============================================================
  function fmtCOP(n) {
    if (!n && n !== 0) return '$0';
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return '$' + Math.round(n).toLocaleString('es-CO');
    }
  }
})();
