# Inventario · Exportar Excel en los 4 tabs · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps con checkbox.

**Goal:** Que Sobrestock&Ruptura, Sin Ventas y Kardex exporten a Excel **según su filtro/estado aplicado** (como ya hace GENERAL). Front-only, sin RPC nueva.

**Architecture:** Cada tab exporta lo que tiene en `invState` (ya viene sin paginar, con sus filtros). Se extrae un helper `xlsxDescargar(XLSX, hojas, filename)` y cada tab arma su workbook. El botón "⬇ Exportar Excel" del header se muestra en general/accion/sinventas y despacha por `invState.tab`; Kardex lleva su botón propio en el panel (Nivel 2).

**Tech Stack:** JS vanilla TiendaIA, SheetJS UMD (`loadXLSX`, ya integrado), `inventario_variantes` (bulk).

## Global Constraints
- Branch `feat/inv-1b-export-tabs`; merge a main + Jorge Implementa; deploy-to-prod OFF.
- SIN RPC nueva. Cada export refleja el **filtro/estado vigente** del tab (S&R: Ver activo + filtros del shell; Sin Ventas: ventana 30/45/60/90 + filtros; Kardex: variante + rango de fechas del panel). Números como número (sumables en Excel). Copy español. Nombre de archivo descriptivo. Auditar con /ui-ux-pro-max + /impeccable (acá es data, foco en columnas correctas).

## File Structure
- Modify: `iapanel/tienda/admin/views/inventario.js` — helper `xlsxDescargar`, dispatch del botón, `exportarExcelAccion`, `exportarExcelSinVentas`, `exportarExcelKardex`, botón en el panel Kardex, shell (mostrar botón en 3 tabs).
- Modify: `iapanel/tienda/admin/index.html` — bump.
- (CSS: sin cambios — reúsa `.ta-btn`.)

---

### Task 1: Helper de descarga + dispatch del botón

- [ ] **Step 1: Helper** (extraer el patrón SheetJS; agregar cerca de `loadXLSX`):
```js
  function xlsxDescargar(XLSX, hojas, filename) {
    const wb = XLSX.utils.book_new();
    hojas.forEach(h => {
      const ws = XLSX.utils.aoa_to_sheet(h.aoa);
      if (h.cols) ws['!cols'] = h.cols;
      XLSX.utils.book_append_sheet(wb, ws, h.nombre);
    });
    XLSX.writeFile(wb, filename);
  }
  function hoyExcel() { return new Date().toISOString().slice(0, 10); }
  function slugTienda() { return (window.TiendaIA.state.tienda || {}).slug || 'tienda'; }
```
(Opcional: refactor de `exportarExcel` GENERAL para usar `xlsxDescargar` — DRY; no obligatorio.)

- [ ] **Step 2: Mostrar el botón en general/accion/sinventas** — en `renderShell`, cambiar la condición del `#inv-export`:
```js
            ((invState.tab === 'general' || invState.tab === 'accion' || invState.tab === 'sinventas') ? '<button type="button" id="inv-export" class="ta-btn" style="padding:6px 12px;">⬇ Exportar Excel</button>' : '') +
```

- [ ] **Step 3: Dispatch en `wireShell`** — reemplazar el wire actual del export:
```js
    const ex = view.querySelector('#inv-export');
    if (ex) ex.addEventListener('click', () => {
      if (invState.tab === 'accion') exportarExcelAccion(ex);
      else if (invState.tab === 'sinventas') exportarExcelSinVentas(ex);
      else exportarExcel(ex);
    });
```

- [ ] **Step 4: Verificar** — `node --check`.
- [ ] **Step 5: Commit** — `git commit -m "feat(inventario): helper xlsxDescargar + dispatch del boton Exportar por tab (export Task 1)"`

---

### Task 2: Export de Sobrestock & Ruptura (Ver activo)

- [ ] **Step 1: `exportarExcelAccion`** (refleja el Ver activo + filtros):
```js
  async function exportarExcelAccion(btn) {
    const T = window.TiendaIA, sb = T.supabase();
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      const ver = invState.accion.ver;
      const cls = ver === 'ruptura' ? 'ruptura' : ver === 'sobrestock' ? 'sobrestock' : 'quiebre';
      const lista = (invState.accion.rows || []).filter(r => r.clasificacion === cls);
      if (!lista.length) { T.toast('No hay productos para exportar en esta vista.', 'info'); return; }
      if (ver === 'sobrestock') lista.sort((a, b) => Number(b.valor_inventario || 0) - Number(a.valor_inventario || 0));
      else lista.sort((a, b) => Number(a.dias_inventario || 0) - Number(b.dias_inventario || 0));
      const { data: vars } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: lista.map(r => r.producto_id), p_periodo: invState.periodo });
      const byProd = {}; (vars || []).forEach(v => { (byProd[v.producto_id] = byProd[v.producto_id] || []).push(v); });
      const esSob = ver === 'sobrestock';
      const head = esSob
        ? ['Referencia', 'Nombre', 'Proveedor', 'Stock', 'Cobertura', 'Sobran (uds)', 'Capital parado']
        : ['Referencia', 'Nombre', 'Proveedor', 'Stock', 'Cobertura', 'Comprar (uds)', 'Costo reposición'];
      const aoa = [head];
      lista.forEach(r => {
        if (esSob) {
          const c = capitalAmarrado(r.venta_diaria, r.stock_total, r.costo_unitario);
          aoa.push([r.referencia, r.nombre || '', r.proveedor_nombre || '', numExcel(r.stock_total), cobTexto(r), c.unidades, numExcel(c.capital)]);
          (byProd[r.producto_id] || []).forEach(v => {
            const cv = capitalAmarrado(v.venta_diaria, v.stock, r.costo_unitario);
            aoa.push(['↳ ' + ([v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '')), v.sku || '', '', numExcel(v.stock), cobTexto(v), cv.unidades, numExcel(cv.capital)]);
          });
        } else {
          const s = sugCompra(r.venta_diaria, r.datos_insuficientes, r.stock_total, r.costo_unitario);
          aoa.push([r.referencia, r.nombre || '', r.proveedor_nombre || '', numExcel(r.stock_total), cobTexto(r), (s.estado === 'comprar' ? s.cant : 0), (s.estado === 'comprar' ? numExcel(s.costo) : 0)]);
          (byProd[r.producto_id] || []).forEach(v => {
            const sv = sugCompra(v.venta_diaria, v.datos_insuficientes, v.stock, r.costo_unitario);
            aoa.push(['↳ ' + ([v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '')), v.sku || '', '', numExcel(v.stock), cobTexto(v), (sv.estado === 'comprar' ? sv.cant : 0), (sv.estado === 'comprar' ? numExcel(sv.costo) : 0)]);
          });
        }
      });
      // total
      const total = lista.reduce((s, r) => esSob ? s + capitalAmarrado(r.venta_diaria, r.stock_total, r.costo_unitario).capital : s + (sugCompra(r.venta_diaria, r.datos_insuficientes, r.stock_total, r.costo_unitario).costo || 0), 0);
      aoa.push([]);
      aoa.push(esSob ? ['TOTAL', '', '', '', '', '', numExcel(total)] : ['TOTAL a reponer', '', '', '', '', '', numExcel(total)]);
      const nombreHoja = esSob ? 'Sobrestock' : (ver === 'quiebre' ? 'Agotado' : 'Ruptura');
      xlsxDescargar(XLSX, [{ nombre: nombreHoja, aoa, cols: [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 16 }] }],
        'Inventario_' + nombreHoja + '_' + slugTienda() + '_' + hoyExcel() + '.xlsx');
    } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }
```

- [ ] **Step 2: Verificar** — `node --check`.
- [ ] **Step 3: Commit** — `git commit -m "feat(inventario): Exportar Excel en Sobrestock & Ruptura (Ver activo + sugerencia/capital) (export Task 2)"`

---

### Task 3: Export de Sin Ventas

- [ ] **Step 1: `exportarExcelSinVentas`**:
```js
  async function exportarExcelSinVentas(btn) {
    const T = window.TiendaIA, sb = T.supabase();
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      const lista = invState.sinventas.rows || [];
      if (!lista.length) { T.toast('No hay productos para exportar.', 'info'); return; }
      const { data: vars } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: lista.map(r => r.producto_id), p_periodo: invState.sinventasPeriodo });
      const byProd = {}; (vars || []).forEach(v => { (byProd[v.producto_id] = byProd[v.producto_id] || []).push(v); });
      const aoa = [['Referencia', 'Nombre', 'Proveedor', 'Stock', 'Última venta', 'Último ingreso', 'Capital parado']];
      lista.forEach(r => {
        aoa.push([r.referencia, r.nombre || '', r.proveedor_nombre || '', numExcel(r.stock_total),
          (r.fecha_ultima_venta ? haceTxt(r.fecha_ultima_venta) : 'Nunca vendido'), haceTxt(r.fecha_ultimo_ingreso), numExcel(r.valor_inventario)]);
        (byProd[r.producto_id] || []).forEach(v => {
          aoa.push(['↳ ' + ([v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '')), v.sku || '', '', numExcel(v.stock), '', '', numExcel(Number(v.stock) * Number(r.costo_unitario || 0))]);
        });
      });
      const total = lista.reduce((s, r) => s + Number(r.valor_inventario || 0), 0);
      aoa.push([]); aoa.push(['TOTAL capital sin rotación', '', '', '', '', '', numExcel(total)]);
      xlsxDescargar(XLSX, [{ nombre: 'Sin ventas', aoa, cols: [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 }] }],
        'Inventario_SinVentas_' + invState.sinventasPeriodo + 'd_' + slugTienda() + '_' + hoyExcel() + '.xlsx');
    } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }
```

- [ ] **Step 2: Verificar** — `node --check`.
- [ ] **Step 3: Commit** — `git commit -m "feat(inventario): Exportar Excel en Sin Ventas (lista + variantes + ventana) (export Task 3)"`

---

### Task 4: Export de Kardex (panel de la variante)

- [ ] **Step 1: Botón en el panel** — en `renderKardexPanel`, en `controls`, agregar al final (solo cuando hay filas):
```js
      ((p._loaded && p.rows.length) ? '<button type="button" id="kx-export" class="ta-btn">⬇ Exportar Excel</button>' : '') +
```
y wire (tras los otros del panel):
```js
    const exK = cont.querySelector('#kx-export'); if (exK) exK.addEventListener('click', () => exportarExcelKardex(exK));
```

- [ ] **Step 2: `exportarExcelKardex`**:
```js
  async function exportarExcelKardex(btn) {
    const T = window.TiendaIA, p = invState.kardex.panel;
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
    try {
      const XLSX = await loadXLSX();
      if (!p.rows || !p.rows.length) { T.toast('No hay movimientos para exportar.', 'info'); return; }
      const aoa = [
        ['Kardex', p.ref + ' · ' + p.vlabel],
        ['Rango', (p.desde || 'inicio') + ' a ' + (p.hasta || 'hoy')],
        [],
        ['Fecha', 'Movimiento', 'Entrada', 'Salida', 'Saldo', 'Costo unit.'],
      ];
      p.rows.forEach(m => aoa.push([fechaExcel(m.fecha), tipoLabel(m), numExcel(m.entrada), numExcel(m.salida), numExcel(m.saldo_acumulado), (m.costo_unitario != null ? numExcel(m.costo_unitario) : '')]));
      xlsxDescargar(XLSX, [{ nombre: 'Kardex', aoa, cols: [{ wch: 14 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 12 }] }],
        'Kardex_' + (p.ref || 'ref').replace(/[^\w-]/g, '') + '_' + (p.vlabel || '').replace(/[^\w-]/g, '') + '_' + hoyExcel() + '.xlsx');
    } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }
```

- [ ] **Step 3: Bump** — `index.html` css (sin cambio CSS → solo js) bump `inventario.js`.
- [ ] **Step 4: Verificar** — `node --check`.
- [ ] **Step 5: Commit + merge**
```bash
git add -A && git commit -m "feat(inventario): Exportar Excel en Kardex (panel de la variante) + bump (export Task 4)"
git checkout main && git merge --no-ff feat/inv-1b-export-tabs -m "merge: Inventario — Exportar Excel en los 4 tabs" && git push origin main
```

---

### Task 5: Gate
- [ ] Jorge Implementa; curl byte-idéntico (bump vivo).
- [ ] Funcional desktop+mobile (QAINV): **S&R** export refleja el Ver activo (Ruptura→Comprar/Costo, Sobrestock→Sobran/Capital, Agotado) + filtros + variantes + total; **Sin Ventas** export con ventana + filtros + variantes + total capital; **Kardex** export del panel = movimientos de esa variante con su rango (saldo correcto). GENERAL sigue igual (2 hojas). Números sumables en Excel. **OK visual de Jorge.**

## Self-Review
- Helper + dispatch → Task 1; S&R → Task 2; Sin Ventas → Task 3; Kardex → Task 4. ✓
- Reúsa data ya en `invState` (sin paginar) + `inventario_variantes` bulk + `sugCompra/capitalAmarrado/cobTexto/haceTxt/tipoLabel/numExcel/fechaExcel` (ya existen). Sin RPC nueva. ✓
- "Según filtro aplicado": S&R usa `invState.accion.ver` + rows (traídas con filtros del shell); Sin Ventas usa `invState.sinventas.rows` (ventana+filtros); Kardex usa `panel.rows` (variante+rango). ✓
