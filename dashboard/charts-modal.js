/* =============================================================================
   AIMMA Charts Modal — Propuesta B (modal fullscreen reusable)
   ----------------------------------------------------------------------------
   Patrón: registry de builders por informe.
     window.AIMMA.chartsModal.register(id, builder)
     window.AIMMA.chartsModal.open(id)
     window.AIMMA.chartsModal.close()
   Cada `builder()` retorna { title: string, config: ChartJsConfig } o null.
   ----------------------------------------------------------------------------
   Robustez aditiva: NO modifica funciones de cálculo existentes (topVentas,
   calcResurtido, etc.) — solo las LEE. Si una función no existe o no hay
   datos, builder retorna null → modal muestra estado vacío sin crash.
   ============================================================================= */
(function initChartsModal() {
  'use strict';

  const modal      = document.getElementById('chart-modal');
  const titleEl    = document.getElementById('chart-modal-title');
  const canvasEl   = document.getElementById('chart-modal-canvas');
  const closeBtn   = document.getElementById('chart-modal-close');
  const dlBtn      = document.getElementById('chart-modal-download');
  const prevBtn    = document.getElementById('chart-modal-prev');
  const nextBtn    = document.getElementById('chart-modal-next');
  const counterEl  = document.getElementById('chart-modal-counter');
  const topNGroup  = document.getElementById('chart-modal-topn');
  const topNBtns   = topNGroup ? topNGroup.querySelectorAll('.chart-modal__topn-btn') : [];

  if (!modal || !canvasEl) {
    console.warn('[charts-modal] no se encontró el modal HTML; init abortado');
    return;
  }
  if (typeof Chart === 'undefined') {
    console.warn('[charts-modal] Chart.js no cargado; init abortado');
    return;
  }

  // ====== Estado interno ======
  let currentChart = null;
  let currentReportId = null;
  let lastFocusedElement = null;
  let currentTopN = 10;  // Default 10, se cambia con botones selector
  const REGISTRY = new Map();  // id → builder fn

  // ====== Public API ======
  function register(reportId, builder) {
    if (typeof builder !== 'function') {
      console.warn('[charts-modal] builder no es función:', reportId);
      return;
    }
    REGISTRY.set(reportId, builder);
  }

  function open(reportId) {
    if (!REGISTRY.has(reportId)) {
      console.warn('[charts-modal] sin builder para', reportId);
      return;
    }
    lastFocusedElement = document.activeElement;
    currentReportId = reportId;
    render(reportId);
    modal.hidden = false;
    // Bloquear scroll del body mientras el modal está abierto
    document.body.style.overflow = 'hidden';
    // Focus management: enfoco el botón cerrar (1er elemento interactivo dentro del modal)
    closeBtn.focus();
  }

  function close() {
    modal.hidden = true;
    if (currentChart) { try { currentChart.destroy(); } catch (_) {} currentChart = null; }
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      try { lastFocusedElement.focus(); } catch (_) {}
    }
    currentReportId = null;
  }

  function render(reportId) {
    if (currentChart) { try { currentChart.destroy(); } catch (_) {} currentChart = null; }
    const builder = REGISTRY.get(reportId);
    let result = null;
    try { result = builder({ topN: currentTopN }); }
    catch (e) {
      console.error('[charts-modal] builder error:', e);
      showEmpty('Error al generar el gráfico');
      return;
    }
    if (!result || !result.config) {
      showEmpty(result?.emptyMsg || 'No hay datos disponibles para este informe');
      // Builder puede declarar supportsTopN incluso en estado vacio
      toggleTopNSelector(result && result.supportsTopN);
      return;
    }
    titleEl.textContent = result.title || 'Gráfico';
    try {
      currentChart = new Chart(canvasEl, result.config);
    } catch (e) {
      console.error('[charts-modal] Chart.js error:', e);
      showEmpty('Error al renderizar el gráfico');
    }
    // Mostrar selector Top-N solo si el builder lo declara. Builder puede
    // declarar `topNOptions: [10, 20]` para limitar las opciones disponibles.
    // Default si solo declara `supportsTopN: true` sin lista: [10, 20, 30, 50].
    toggleTopNSelector(!!result.supportsTopN, result.topNOptions);
    updateNavCounter();
  }

  function toggleTopNSelector(show, options) {
    if (!topNGroup) return;
    topNGroup.hidden = !show;
    if (!show) return;
    // Filtrar botones según las opciones declaradas por el builder
    const allowed = Array.isArray(options) && options.length ? options.map(Number) : null;
    let firstAllowed = null;
    topNBtns.forEach(btn => {
      const n = Number(btn.dataset.topn);
      const visible = !allowed || allowed.includes(n);
      btn.hidden = !visible;
      if (visible && firstAllowed === null) firstAllowed = n;
    });
    // Si el currentTopN actual no está en allowed, fallback al primero permitido
    if (allowed && !allowed.includes(currentTopN) && firstAllowed !== null) {
      currentTopN = firstAllowed;
      topNBtns.forEach(btn => {
        const active = Number(btn.dataset.topn) === currentTopN;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  }

  function setTopN(n) {
    currentTopN = n;
    // Update aria-pressed en botones
    topNBtns.forEach(btn => {
      const active = Number(btn.dataset.topn) === n;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    // Re-render con el reporte actual
    if (currentReportId) render(currentReportId);
  }

  function showEmpty(msg) {
    titleEl.textContent = msg;
    if (currentChart) { try { currentChart.destroy(); } catch (_) {} currentChart = null; }
    // Limpiar canvas
    const ctx = canvasEl.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    updateNavCounter();
  }

  function updateNavCounter() {
    const ids = Array.from(REGISTRY.keys());
    const idx = ids.indexOf(currentReportId);
    counterEl.textContent = `${idx + 1} / ${ids.length}`;
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= ids.length - 1;
  }

  function navPrev() {
    const ids = Array.from(REGISTRY.keys());
    const idx = ids.indexOf(currentReportId);
    if (idx > 0) { currentReportId = ids[idx - 1]; render(currentReportId); }
  }
  function navNext() {
    const ids = Array.from(REGISTRY.keys());
    const idx = ids.indexOf(currentReportId);
    if (idx < ids.length - 1) { currentReportId = ids[idx + 1]; render(currentReportId); }
  }

  function downloadPng() {
    if (!currentChart) return;
    try {
      const url = currentChart.toBase64Image('image/png', 1.0);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aimma-${currentReportId || 'grafico'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.warn('[charts-modal] download PNG falló:', e);
    }
  }

  // ====== Wire up eventos ======
  closeBtn.addEventListener('click', close);
  dlBtn.addEventListener('click', downloadPng);
  prevBtn.addEventListener('click', navPrev);
  nextBtn.addEventListener('click', navNext);
  // Top-N selector buttons
  topNBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.topn);
      if (n > 0) setTopN(n);
    });
  });
  // Click en backdrop (no en el container) cierra
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); navPrev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); navNext(); }
  });

  // Delegated listener: cualquier botón con .reporte-btn--chart[data-chart-id]
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.reporte-btn--chart[data-chart-id]');
    if (!btn) return;
    e.preventDefault();
    open(btn.dataset.chartId);
  });

  // ====== Helpers de formato ======
  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function formatMoney(n) {
    return '$ ' + Math.round(n).toLocaleString('es-CO');
  }
  function formatMoneyShort(n) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function getDiasInput() {
    return Number(document.getElementById('dias-resurtido')?.value) || 45;
  }

  // ====== Builder: Top Ventas (barras horizontales por valor vendido $) ======
  // topVentasConEstado() retorna { codigo, nombre, valorVendido, unidadesVendidasMes,
  // estado, ... } — NO usa 'subtotal' ni 'cantidad' (bug pilot inicial).
  register('top-ventas', function buildTopVentas(opts) {
    const topN = (opts && opts.topN) || 10;
    // Solo 10 y 20: con más items el nombre del producto queda ilegible en mobile
    // y deja de ser informativo (cualquier producto fuera de top 20 ya tiene
    // ventas marginales y aporta poco al ejecutivo).
    const topNOptions = [10, 20];
    if (typeof topVentasConEstado !== 'function') {
      return { emptyMsg: 'topVentasConEstado no disponible', supportsTopN: true, topNOptions };
    }
    if (typeof state === 'undefined' || !state.ventas || !state.ventas.length) {
      return { emptyMsg: 'Subí un archivo de ventas para ver el gráfico', supportsTopN: true, topNOptions };
    }
    const dias = getDiasInput();
    const all = topVentasConEstado(dias);
    if (!all || !all.length) return { emptyMsg: 'No hay ventas para mostrar', supportsTopN: true, topNOptions };
    // Top N por VALOR vendido $ (más significativo para ejecutivo que unidades).
    // Excluir devoluciones netas (valorVendido negativo) y NETO CERO.
    const validRows = all.filter(r => (r.valorVendido || 0) > 0);
    const top = validRows.slice().sort((a, b) => (b.valorVendido || 0) - (a.valorVendido || 0)).slice(0, topN);
    if (!top.length) return { emptyMsg: 'No hay ventas con valor > 0', supportsTopN: true, topNOptions };
    return {
      supportsTopN: true,
      topNOptions,
      title: `Top ${topN} productos por ventas ($)`,
      config: {
        type: 'bar',
        data: {
          labels: top.map(r => truncate(r.nombre || r.codigo || '(sin nombre)', 36)),
          datasets: [{
            label: 'Valor vendido',
            data: top.map(r => Math.round(r.valorVendido || 0)),
            backgroundColor: 'rgba(0, 109, 139, 0.80)',
            borderColor: 'rgba(0, 109, 139, 1)',
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion() ? false : { duration: 600, easing: 'easeOutCubic' },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const row = top[ctx.dataIndex];
                  const lines = [`Valor vendido: ${formatMoney(ctx.parsed.x)}`];
                  if (row.unidadesVendidasMes) lines.push(`Unidades: ${row.unidadesVendidasMes.toLocaleString('es-CO')}`);
                  if (row.estado) lines.push(`Estado: ${row.estado}`);
                  if (row.stockActual !== undefined) lines.push(`Stock actual: ${row.stockActual.toLocaleString('es-CO')}`);
                  return lines;
                }
              }
            },
          },
          scales: {
            x: {
              ticks: { callback: v => formatMoneyShort(v), color: 'rgba(26,26,26,0.72)' },
              grid: { color: 'rgba(26,26,26,0.10)' }
            },
            y: {
              ticks: { color: 'rgba(26,26,26,0.85)', font: { size: 11 } },
              grid: { display: false }
            }
          }
        }
      }
    };
  });

  // ====== Builder: Sobrestock — barras horizontales top N por capital amarrado ======
  // Orden DESCENDENTE (de mayor a menor). Outliers >$5M en rojo. Solo Top 10 y 20
  // porque con más items se pierde la legibilidad del nombre del producto.
  register('sobrestock', function buildSobrestock(opts) {
    const topN = (opts && opts.topN) || 10;
    const topNOptions = [10, 20];
    if (typeof calcResurtido !== 'function') {
      return { emptyMsg: 'calcResurtido no disponible', supportsTopN: true, topNOptions };
    }
    if (typeof state === 'undefined' || !state.inventario || !state.inventario.length) {
      return { emptyMsg: 'Subí un archivo de inventario para ver el gráfico', supportsTopN: true, topNOptions };
    }
    const dias = getDiasInput();
    const result = calcResurtido(dias);
    const sobrestock = result && result.sobrestock;
    if (!sobrestock || !sobrestock.length) return { emptyMsg: 'No hay productos con sobrestock', supportsTopN: true, topNOptions };
    // SIEMPRE descendente por capital amarrado (de mayor a menor)
    const top = sobrestock.slice()
      .sort((a, b) => (b.capitalAmarrado || 0) - (a.capitalAmarrado || 0))
      .slice(0, topN);
    return {
      supportsTopN: true,
      topNOptions,
      title: `Sobrestock — Top ${topN} por capital amarrado (de mayor a menor)`,
      config: {
        type: 'bar',
        data: {
          labels: top.map(r => truncate(r.nombre || r.codigo || '(sin nombre)', 36)),
          datasets: [{
            label: 'Capital amarrado',
            data: top.map(r => Math.round(r.capitalAmarrado || 0)),
            backgroundColor: top.map(r => (r.capitalAmarrado || 0) > 5e6 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(0, 109, 139, 0.80)'),
            borderColor:     top.map(r => (r.capitalAmarrado || 0) > 5e6 ? 'rgba(239, 68, 68, 1)'   : 'rgba(0, 212, 245, 1)'),
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion() ? false : { duration: 600, easing: 'easeOutCubic' },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const r = top[ctx.dataIndex];
                  return [
                    `Capital amarrado: ${formatMoney(ctx.parsed.x)}`,
                    `Código: ${r.codigo || ''}`,
                    `Sobrante: ${(r.sobrante || 0).toLocaleString('es-CO')} und`,
                    `Stock actual: ${(r.stockActual || 0).toLocaleString('es-CO')} und`,
                  ];
                }
              }
            },
          },
          scales: {
            x: { ticks: { callback: v => formatMoneyShort(v), color: 'rgba(26,26,26,0.72)' }, grid: { color: 'rgba(26,26,26,0.10)' } },
            y: { ticks: { color: 'rgba(26,26,26,0.85)', font: { size: 11 } }, grid: { display: false } }
          }
        }
      }
    };
  });

  // ====== Builder: Top Rentabilidad (barras horizontales utilidad $ desc) ======
  register('top-rentabilidad', function buildTopRentabilidad(opts) {
    const topN = (opts && opts.topN) || 10;
    const topNOptions = [10, 20];
    if (typeof topRentabilidad !== 'function') {
      return { emptyMsg: 'topRentabilidad no disponible', supportsTopN: true, topNOptions };
    }
    if (typeof state === 'undefined' || !state.ventas || !state.ventas.length || !state.inventario || !state.inventario.length) {
      return { emptyMsg: 'Subí ventas E inventario para ver rentabilidad', supportsTopN: true, topNOptions };
    }
    const all = topRentabilidad();
    if (!all.length) return { emptyMsg: 'No hay productos con utilidad > 0', supportsTopN: true, topNOptions };
    const top = all.slice(0, topN);
    return {
      supportsTopN: true,
      topNOptions,
      title: `Top ${topN} productos más rentables (por utilidad $)`,
      config: {
        type: 'bar',
        data: {
          labels: top.map(r => truncate(r.nombre || r.codigo || '(sin nombre)', 36)),
          datasets: [{
            label: 'Utilidad',
            data: top.map(r => Math.round(r.utilidad || 0)),
            backgroundColor: 'rgba(34, 197, 94, 0.65)',   // verde — rentabilidad positiva
            borderColor:     'rgba(34, 197, 94, 1)',
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion() ? false : { duration: 600, easing: 'easeOutCubic' },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const r = top[ctx.dataIndex];
                  return [
                    `Utilidad: ${formatMoney(ctx.parsed.x)}`,
                    `Vendido: ${formatMoney(r.valorVendido || 0)}`,
                    `Unidades: ${(r.unidadesVendidasMes || 0).toLocaleString('es-CO')}`,
                    `Margen: ${((r.margenPct || 0) * 100).toFixed(1)}%`,
                  ];
                }
              }
            },
          },
          scales: {
            x: { ticks: { callback: v => formatMoneyShort(v), color: 'rgba(26,26,26,0.72)' }, grid: { color: 'rgba(26,26,26,0.10)' } },
            y: { ticks: { color: 'rgba(26,26,26,0.85)', font: { size: 11 } }, grid: { display: false } }
          }
        }
      }
    };
  });

  // ====== Builder: Sin Venta del mes (barras horiz capital amarrado) ======
  register('sin-venta', function buildSinVenta(opts) {
    const topN = (opts && opts.topN) || 10;
    const topNOptions = [10, 20];
    if (typeof getReferenciasSinVenta !== 'function') {
      return { emptyMsg: 'getReferenciasSinVenta no disponible', supportsTopN: true, topNOptions };
    }
    if (typeof state === 'undefined' || !state.inventario || !state.inventario.length) {
      return { emptyMsg: 'Subí inventario para ver referencias sin venta', supportsTopN: true, topNOptions };
    }
    const all = getReferenciasSinVenta();
    if (!all.length) return { emptyMsg: '¡Todas las referencias se vendieron! No hay sin movimiento', supportsTopN: true, topNOptions };
    const top = all.slice(0, topN);
    return {
      supportsTopN: true,
      topNOptions,
      title: `Top ${topN} referencias sin venta (por capital amarrado)`,
      config: {
        type: 'bar',
        data: {
          labels: top.map(r => truncate(r.nombre || r.codigo || '(sin nombre)', 36)),
          datasets: [{
            label: 'Capital sin moverse',
            data: top.map(r => Math.round(r.valorTotal || 0)),
            backgroundColor: 'rgba(245, 158, 11, 0.65)',  // ámbar — alerta inacción
            borderColor:     'rgba(245, 158, 11, 1)',
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion() ? false : { duration: 600, easing: 'easeOutCubic' },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const r = top[ctx.dataIndex];
                  return [
                    `Capital amarrado: ${formatMoney(ctx.parsed.x)}`,
                    `Código: ${r.codigo || ''}`,
                    `Stock actual: ${(r.stockActual || 0).toLocaleString('es-CO')} und`,
                    `Costo unitario: ${formatMoney(r.costoUnitario || 0)}`,
                  ];
                }
              }
            },
          },
          scales: {
            x: { ticks: { callback: v => formatMoneyShort(v), color: 'rgba(26,26,26,0.72)' }, grid: { color: 'rgba(26,26,26,0.10)' } },
            y: { ticks: { color: 'rgba(26,26,26,0.85)', font: { size: 11 } }, grid: { display: false } }
          }
        }
      }
    };
  });

  // ====== Builder: Sin Costo (barras horiz cantidad vendida) ======
  register('sin-costo', function buildSinCosto(opts) {
    const topN = (opts && opts.topN) || 10;
    const topNOptions = [10, 20];
    if (typeof getProductosVendidosSinCosto !== 'function') {
      return { emptyMsg: 'getProductosVendidosSinCosto no disponible', supportsTopN: true, topNOptions };
    }
    if (typeof state === 'undefined' || !state.ventas || !state.ventas.length) {
      return { emptyMsg: 'Subí ventas para ver productos sin costo', supportsTopN: true, topNOptions };
    }
    const all = getProductosVendidosSinCosto();
    if (!all.length) return { emptyMsg: '¡Todos los vendidos tienen costo en inventario!', supportsTopN: true, topNOptions };
    const top = all.slice(0, topN);
    return {
      supportsTopN: true,
      topNOptions,
      title: `Top ${topN} vendidos SIN COSTO en inventario (por valor)`,
      config: {
        type: 'bar',
        data: {
          labels: top.map(r => truncate(r.descripcion || r.codigo || '(sin desc)', 36)),
          datasets: [{
            label: 'Total vendido',
            data: top.map(r => Math.round(r.totalVendido || 0)),
            backgroundColor: 'rgba(239, 68, 68, 0.65)',   // rojo — alerta crítica (posible ruptura)
            borderColor:     'rgba(239, 68, 68, 1)',
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion() ? false : { duration: 600, easing: 'easeOutCubic' },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const r = top[ctx.dataIndex];
                  return [
                    `Vendido: ${formatMoney(ctx.parsed.x)}`,
                    `Código: ${r.codigo || ''}`,
                    `Unidades: ${(r.cantidadVendida || 0).toLocaleString('es-CO')}`,
                  ];
                }
              }
            },
          },
          scales: {
            x: { ticks: { callback: v => formatMoneyShort(v), color: 'rgba(26,26,26,0.72)' }, grid: { color: 'rgba(26,26,26,0.10)' } },
            y: { ticks: { color: 'rgba(26,26,26,0.85)', font: { size: 11 } }, grid: { display: false } }
          }
        }
      }
    };
  });

  // ====== Builder: Punto de Equilibrio (barras comparativas) ======
  register('punto-equilibrio', function buildPuntoEquilibrio() {
    if (typeof calcPuntoEquilibrio !== 'function') {
      return { emptyMsg: 'calcPuntoEquilibrio no disponible' };
    }
    if (typeof state === 'undefined' || (!state.ventas?.length && !state.gastos?.length)) {
      return { emptyMsg: 'Subí ventas y gastos para calcular el punto de equilibrio' };
    }
    const pe = calcPuntoEquilibrio();
    if (!pe.puntoEquilibrioVentas) {
      return { emptyMsg: 'No hay datos suficientes (necesita ventas, COGS o gastos)' };
    }
    const sobre = pe.cobertura >= 1;
    const color = sobre ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)';
    const colorBorder = sobre ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)';
    return {
      title: `Punto de Equilibrio — ${sobre ? `+${formatMoneyShort(pe.brecha)} sobre PE` : `${formatMoneyShort(Math.abs(pe.brecha))} bajo PE`}`,
      config: {
        type: 'bar',
        data: {
          labels: ['Ventas reales', 'Punto de equilibrio', 'Gastos totales'],
          datasets: [{
            label: 'Pesos',
            data: [Math.round(pe.totalVentas || 0), Math.round(pe.puntoEquilibrioVentas || 0), Math.round(pe.totalGastos || 0)],
            backgroundColor: [color, 'rgba(0, 109, 139, 0.80)', 'rgba(245, 158, 11, 0.65)'],
            borderColor:     [colorBorder, 'rgba(0, 212, 245, 1)', 'rgba(245, 158, 11, 1)'],
            borderWidth: 2,
            borderRadius: 6,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion() ? false : { duration: 700, easing: 'easeOutCubic' },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const lines = [formatMoney(ctx.parsed.x)];
                  if (ctx.dataIndex === 0 && pe.cobertura) lines.push(`Cobertura: ${(pe.cobertura * 100).toFixed(0)}% del PE`);
                  if (ctx.dataIndex === 1) lines.push(`Margen bruto: ${(pe.margenBruto * 100).toFixed(1)}%`);
                  return lines;
                }
              }
            },
          },
          scales: {
            x: { ticks: { callback: v => formatMoneyShort(v), color: 'rgba(26,26,26,0.72)' }, grid: { color: 'rgba(26,26,26,0.10)' } },
            y: { ticks: { color: 'rgba(26,26,26,0.85)', font: { size: 13, weight: '600' } }, grid: { display: false } }
          }
        }
      }
    };
  });

  // ====== Builder: Participación de Gastos (donut top 6 + Otros) ======
  register('participacion-gastos', function buildParticipacionGastos() {
    if (typeof calcParticipacionGastos !== 'function') {
      return { emptyMsg: 'calcParticipacionGastos no disponible' };
    }
    if (typeof state === 'undefined' || !state.gastos || !state.gastos.length) {
      return { emptyMsg: 'Subí gastos para ver su participación' };
    }
    const res = calcParticipacionGastos();
    const grupos = (res && res.filasAgrupadasPorProveedor) || [];
    if (!grupos.length) return { emptyMsg: 'No hay gastos para mostrar' };
    // Top 6 + "Otros" si quedan más
    const top6 = grupos.slice(0, 6);
    const otros = grupos.slice(6);
    const otrosTotal = otros.reduce((s, g) => s + (g.total || 0), 0);
    const labels = top6.map(g => truncate(g.proveedor, 24));
    const data = top6.map(g => Math.round(g.total || 0));
    if (otros.length) { labels.push(`Otros (${otros.length})`); data.push(Math.round(otrosTotal)); }
    const total = data.reduce((s, v) => s + v, 0);
    // Paleta accesible cyan + variantes
    const palette = [
      'rgba(0, 212, 245, 0.85)', 'rgba(34, 197, 94, 0.8)', 'rgba(245, 158, 11, 0.8)',
      'rgba(168, 85, 247, 0.8)', 'rgba(239, 68, 68, 0.8)', 'rgba(14, 165, 233, 0.8)',
      'rgba(156, 163, 175, 0.7)', // gris para "Otros"
    ];
    return {
      title: `Participación de gastos por proveedor (${formatMoneyShort(total)} total)`,
      config: {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: palette.slice(0, data.length),
            borderColor: '#ffffff',
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion() ? false : { duration: 700, easing: 'easeOutCubic' },
          plugins: {
            legend: {
              position: 'right',
              labels: { color: 'rgba(26,26,26,0.85)', font: { size: 12 }, padding: 12 }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.parsed;
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return `${ctx.label}: ${formatMoney(val)} (${pct}%)`;
                }
              }
            }
          }
        }
      }
    };
  });

  // ====== Builder: Marketing AIMMA (pie por canal) ======
  register('marketing-aimma', function buildMarketing() {
    if (typeof calcAnalisisMarketing !== 'function') {
      return { emptyMsg: 'calcAnalisisMarketing no disponible' };
    }
    if (typeof state === 'undefined' || !state.ventas?.length) {
      return { emptyMsg: 'Subí ventas para calcular el presupuesto de marketing' };
    }
    // Leer el porcentaje seleccionado por el usuario (input id="pct-marketing")
    const pctEl = document.getElementById('pct-marketing');
    const pctInput = pctEl ? Number(pctEl.value) : 5;
    const m = calcAnalisisMarketing(pctInput || 5);
    if (!m || !m.presupuestoTotal) {
      return { emptyMsg: 'No hay utilidad para distribuir en marketing' };
    }
    const filas = m.filas || [];
    const palette = [
      'rgba(0, 212, 245, 0.85)',   // Meta Ads — cyan
      'rgba(168, 85, 247, 0.85)',  // TikTok — púrpura
      'rgba(34, 197, 94, 0.85)',   // Google — verde
      'rgba(245, 158, 11, 0.85)',  // Producción — ámbar
      'rgba(239, 68, 68, 0.85)',   // Influencers — rojo
      'rgba(14, 165, 233, 0.85)',  // CRM — azul
    ];
    return {
      title: `Marketing AIMMA — ${pctInput}% de utilidad = ${formatMoney(m.presupuestoTotal)}`,
      config: {
        type: 'pie',
        data: {
          labels: filas.map(f => f.canal),
          datasets: [{
            data: filas.map(f => Math.round(f.monto || 0)),
            backgroundColor: palette.slice(0, filas.length),
            borderColor: '#ffffff',
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion() ? false : { duration: 700, easing: 'easeOutCubic' },
          plugins: {
            legend: {
              position: 'right',
              labels: { color: 'rgba(26,26,26,0.85)', font: { size: 11 }, padding: 10 }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const fila = filas[ctx.dataIndex];
                  return [
                    `${formatMoney(ctx.parsed)} (${(fila.pct * 100).toFixed(0)}%)`,
                  ];
                }
              }
            }
          }
        }
      }
    };
  });

  // ====== Expose API global ======
  window.AIMMA = window.AIMMA || {};
  window.AIMMA.chartsModal = { register, open, close };
})();
