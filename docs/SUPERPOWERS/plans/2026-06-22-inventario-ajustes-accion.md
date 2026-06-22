# Inventario · Ajustes (3 umbrales) + Tab SOBRESTOCK & RUPTURA · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps con checkbox.

**Goal:** Hacer real el panel ⚙ Ajustes (3 umbrales ruptura<óptimo<sobrestock que gobiernan las vistas) y construir el tab Sobrestock & Ruptura con sugerencia de compra (por ref y por variante) + capital amarrado, solo mostrar.

**Architecture:** Parte 1 (Ajustes) PRIMERO con checkpoint: migración (columna óptimo + defaults + CHECK con assert) → verificación de datos → panel inline que guarda por `tiendas.update` y re-clasifica en vivo. Parte 2 (S&R): segmented Ver (Ruptura/Sobrestock/Agotado), una llamada a `inventario_resumen`, filtro en cliente, sugerencias calculadas en cliente sobre `venta_diaria`/`costo_unitario` que las RPCs ya devuelven (sin RPC nueva).

**Tech Stack:** PL/pgSQL (MCP), JS vanilla TiendaIA, tokens `--ta-*`, RPCs existentes `inventario_resumen`/`inventario_variantes`.

## Global Constraints
- Branch `feat/inv-1b-ajustes-accion`; merge a main + Jorge Implementa; deploy-to-prod OFF. **Dos checkpoints**: Parte 1 (OK visual) → Parte 2 (OK visual).
- Umbrales: ruptura<óptimo<sobrestock, ruptura≥1, período∈[1,60]. Defaults recomendados nuevos: ruptura 15 / óptimo 30 / sobrestock 60. **NO pisar valores existentes** (las 3 tiendas siguen 15/90; óptimo=30 por el default de columna).
- Sugerencia compra = `max(0, ceil(óptimo × venta_diaria − stock − 1e-9))`; costo = cantidad × `costo_unitario` (padre). Sobra = `max(0, round(stock − sobrestock × venta_diaria))`; capital = sobra × costo. velocidad = `venta_diaria` (ya normalizada por edad en la RPC). **El `−1e-9` es OBLIGATORIO**: sin él, cuando óptimo==días_efectivos, `óptimo×venta_diaria` da p.ej. 14.0000000002 (residuo de coma flotante) y `ceil` empuja 9→10 (verificado en Task 1 con QAINV-P1: naive=10/$120.000 vs correcto=9/$108.000). El epsilon (1e-9 ≫ residuo ~1e-15, ≪ cualquier fracción real) absorbe el residuo sin afectar fracciones genuinas. round() (sobra) no lo necesita.
- datos_insuficientes → "Pocos datos, usá tu criterio". venta_diaria=0 → "Sin histórico de venta, definí vos cuánto pedir". NO se genera orden (Fase 2). Copy criollo accionable. Contraste AA. /ui-ux-pro-max + /impeccable.

---

## File Structure
- Create: `supabase/migrations/20260622180000_inv_umbral_optimo.sql`.
- Modify: `iapanel/tienda/admin/views/inventario.js` — estado, panel Ajustes, routing/Ver/render/sugerencia/drill S&R.
- Modify: `iapanel/tienda/admin/admin.css` — `.ta-inv-ajustes*`, `.ta-inv-sug*`, `.ta-inv-secc*` (Ver/segmented).
- Modify: `iapanel/tienda/admin/index.html` — bump (Parte 1: css/js; Parte 2: css/js).

---

# PARTE 1 — AJUSTES (PRIMERO, con checkpoint)

### Task 1: BD — columna óptimo + CHECK (rigor de capa de datos)

**Files:** Create `supabase/migrations/20260622180000_inv_umbral_optimo.sql`

**Interfaces:** Produce `tiendas.inv_umbral_optimo_dias int NOT NULL DEFAULT 30` + CHECK `chk_inv_umbrales` = ruptura≥1 ∧ óptimo>ruptura ∧ sobrestock>óptimo ∧ período∈[1,60].

- [ ] **Step 1: Migración** (ADD COLUMN + SET DEFAULTs nuevos para tiendas nuevas SIN tocar filas + **assert antes del CHECK** + reemplazo del CHECK):
```sql
-- 1) columna optimo (todas las filas existentes -> 30)
alter table public.tiendas add column if not exists inv_umbral_optimo_dias int not null default 30;
-- 2) defaults recomendados para tiendas NUEVAS (no toca filas existentes)
alter table public.tiendas alter column inv_umbral_ruptura_dias set default 15;
alter table public.tiendas alter column inv_umbral_optimo_dias set default 30;
alter table public.tiendas alter column inv_umbral_sobrestock_dias set default 60;
-- 3) ASSERT explicito: ninguna tienda viola ruptura<optimo<sobrestock ANTES del constraint
do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.tiendas
   where not (inv_umbral_ruptura_dias >= 1
              and inv_umbral_optimo_dias > inv_umbral_ruptura_dias
              and inv_umbral_sobrestock_dias > inv_umbral_optimo_dias);
  if v_bad > 0 then
    raise exception 'ABORT: % tienda(s) violan ruptura<optimo<sobrestock; no se agrega el CHECK', v_bad;
  end if;
end $$;
-- 4) reemplazar el CHECK
alter table public.tiendas drop constraint if exists chk_inv_umbrales;
alter table public.tiendas add constraint chk_inv_umbrales check (
  inv_umbral_ruptura_dias >= 1
  and inv_umbral_optimo_dias > inv_umbral_ruptura_dias
  and inv_umbral_sobrestock_dias > inv_umbral_optimo_dias
  and inv_periodo_default_dias between 1 and 60
);
```

- [ ] **Step 2: Aplicar a test** — MCP `apply_migration` (name `inv_umbral_optimo`); alinear versión:
```sql
update supabase_migrations.schema_migrations set version='20260622180000' where name='inv_umbral_optimo' and version<>'20260622180000';
```

- [ ] **Step 3: Verificar (empírico)**
```sql
select json_build_object(
  'tiendas', (select json_agg(json_build_object('slug',slug,'r',inv_umbral_ruptura_dias,'o',inv_umbral_optimo_dias,'s',inv_umbral_sobrestock_dias)) from tiendas),
  'todas_ok', (select bool_and(inv_umbral_ruptura_dias<inv_umbral_optimo_dias and inv_umbral_optimo_dias<inv_umbral_sobrestock_dias) from tiendas),
  'check_def', (select pg_get_constraintdef(oid) from pg_constraint where conname='chk_inv_umbrales')
);
```
Expected: las 3 tiendas con o=30 (r=15,s=90); todas_ok=true; CHECK con las 3 desigualdades.

- [ ] **Step 4: Verificar rechazo del CHECK** (impersonando dueño aimma-test; debe FALLAR):
```sql
do $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub','4bd6d4eb-65df-4225-8dde-1883d00bb32e')::text, true);
  begin
    update public.tiendas set inv_umbral_optimo_dias = 10  -- 10 < ruptura 15 -> debe violar
      where id='69915581-c0d1-4961-ab76-80dacde9169a';
    raise exception 'FALLO: el CHECK no rechazo optimo<ruptura';
  exception when check_violation then
    raise notice 'OK: CHECK rechazo el cruce (check_violation)';
  end;
  raise exception 'rollback verificacion';  -- no persistir nada
end $$;
```
Expected: notice "OK: CHECK rechazo el cruce", luego rollback.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260622180000_inv_umbral_optimo.sql
git commit -m "feat(inventario): tiendas.inv_umbral_optimo_dias + CHECK ruptura<optimo<sobrestock (Ajustes Task 1)"
```

---

### Task 2: Front — panel ⚙ Ajustes

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`, `admin.css`, `index.html`

**Interfaces:** `invState.ajustesOpen` (bool). Guarda por `sb.from('tiendas').update({inv_umbral_ruptura_dias, inv_umbral_optimo_dias, inv_umbral_sobrestock_dias}).eq('id', tienda.id)`.

- [ ] **Step 1: Confirmar que `T.state.tienda` trae el óptimo** — buscar dónde se carga la tienda (grep `state.tienda` / `.from('tiendas')` en admin.js). Si el select es de columnas específicas y NO incluye `inv_umbral_optimo_dias`, agregarlo. (renderShell ya lee `T.state.tienda.inv_umbral_ruptura_dias`, así que el load trae umbrales; confirmar que el nuevo viene.) Si falta, el panel/S&R caen al default 30 con `|| 30`.

- [ ] **Step 2: Estado** — en `initState`, agregar `ajustesOpen: false,`.

- [ ] **Step 3: Panel en `renderShell`** — tras la card de filtros (antes del tabBar), si `invState.ajustesOpen`:
```js
      (invState.ajustesOpen ? (function () {
        const t = T.state.tienda || {};
        const f = (id, label, help, val) =>
          '<div class="ta-inv-aj__row"><label class="ta-inv-aj__lbl" for="' + id + '">' + label + '</label>' +
          '<input id="' + id + '" class="ta-input ta-inv-aj__inp" type="number" min="1" step="1" value="' + (val) + '">' +
          '<span class="ta-inv-aj__help">' + help + '</span></div>';
        return '<div class="ta-card ta-inv-aj" style="margin-bottom:16px;">' +
          '<h2 class="ta-inv-aj__title">Ajustes de inventario</h2>' +
          f('aj-ruptura', 'Ruptura (días)', 'Avisame cuando a un producto le queden menos de estos días de stock.', (t.inv_umbral_ruptura_dias || 15)) +
          f('aj-optimo', 'Inventario óptimo (días)', 'Cuántos días de stock querés tener como meta. Lo usamos para sugerirte cuánto comprar.', (t.inv_umbral_optimo_dias || 30)) +
          f('aj-sobrestock', 'Sobrestock (días)', 'Avisame cuando un producto tenga más de estos días de stock (capital parado).', (t.inv_umbral_sobrestock_dias || 60)) +
          '<p id="aj-error" class="ta-inv-aj__error" hidden></p>' +
          '<div class="ta-inv-aj__actions"><button id="aj-cancel" class="ta-btn">Cancelar</button>' +
          '<button id="aj-save" class="ta-btn ta-btn--primary">Guardar</button></div>' +
        '</div>';
      })() : '') +
```

- [ ] **Step 4: Wire en `wireShell`** — reemplazar el toast del ⚙ + agregar cancel/save:
```js
    const ajustes = view.querySelector('#inv-ajustes');
    if (ajustes) ajustes.addEventListener('click', () => { invState.ajustesOpen = !invState.ajustesOpen; renderInventario(); });
    const ajCancel = view.querySelector('#aj-cancel');
    if (ajCancel) ajCancel.addEventListener('click', () => { invState.ajustesOpen = false; renderInventario(); });
    const ajSave = view.querySelector('#aj-save');
    if (ajSave) ajSave.addEventListener('click', () => guardarAjustes(ajSave));
```

- [ ] **Step 5: `guardarAjustes`**
```js
  async function guardarAjustes(btn) {
    const T = window.TiendaIA, sb = T.supabase(), view = T.dom.mainView;
    const err = view.querySelector('#aj-error');
    const r = parseInt(view.querySelector('#aj-ruptura').value, 10);
    const o = parseInt(view.querySelector('#aj-optimo').value, 10);
    const s = parseInt(view.querySelector('#aj-sobrestock').value, 10);
    const showErr = (m) => { if (err) { err.textContent = m; err.hidden = false; } };
    if (![r, o, s].every(n => Number.isInteger(n) && n >= 1)) return showErr('Poné números enteros de 1 día o más.');
    if (!(r < o && o < s)) return showErr('Tienen que ir en orden: ruptura < óptimo < sobrestock.');
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const { error } = await sb.from('tiendas')
        .update({ inv_umbral_ruptura_dias: r, inv_umbral_optimo_dias: o, inv_umbral_sobrestock_dias: s })
        .eq('id', T.state.tienda.id);
      if (error) { showErr(error.code === '23514' ? 'Revisá los números: ruptura < óptimo < sobrestock.' : ('No se pudo guardar: ' + error.message)); return; }
      T.state.tienda.inv_umbral_ruptura_dias = r; T.state.tienda.inv_umbral_optimo_dias = o; T.state.tienda.inv_umbral_sobrestock_dias = s;
      invState.ajustesOpen = false; invState.general = null; invState.totales = null; invState.accion = null;
      T.toast('Ajustes guardados.', 'success');
      renderInventario();
    } catch (e) { showErr('No se pudo guardar: ' + (e.message || e)); }
    finally { btn.disabled = false; btn.textContent = old; }
  }
```

- [ ] **Step 6: CSS** (`admin.css`):
```css
.ta-inv-aj { padding:16px; }
.ta-inv-aj__title { font-size:16px; font-weight:700; margin:0 0 12px; color:var(--ta-text); }
.ta-inv-aj__row { display:grid; grid-template-columns:180px 110px 1fr; gap:10px 14px; align-items:center; margin-bottom:12px; }
.ta-inv-aj__lbl { font-size:14px; font-weight:600; color:var(--ta-text); }
.ta-inv-aj__inp { max-width:110px; }
.ta-inv-aj__help { font-size:13px; color:var(--ta-text-soft); }
.ta-inv-aj__error { color:#b3210a; font-size:13px; margin:4px 0 10px; }
.ta-inv-aj__actions { display:flex; gap:8px; justify-content:flex-end; }
@media (max-width:760px){ .ta-inv-aj__row{ grid-template-columns:1fr; gap:4px; } .ta-inv-aj__inp{ max-width:140px; } }
```

- [ ] **Step 7: Bump + verificar** — `index.html` css `?v=20` / js `?v=11`. `node --check`.

- [ ] **Step 8: Commit (cierre Parte 1)**
```bash
git add iapanel/tienda/admin/views/inventario.js iapanel/tienda/admin/admin.css iapanel/tienda/admin/index.html
git commit -m "feat(inventario): panel Ajustes (3 umbrales) en el engranaje, guarda via tiendas.update + re-clasifica en vivo (Ajustes Task 2)"
```

### CHECKPOINT 1 (gate visual de Jorge)
Merge a main + Implementa. Jorge prueba: ⚙ abre el panel; edita un umbral (ej. óptimo 30→45 o ruptura 15→25) → Guardar → GENERAL **re-clasifica en vivo** (cambian colores/cobertura). Validación: cruzar los números muestra mensaje amable, no error. **Esperar OK visual antes de Parte 2.**

---

# PARTE 2 — TAB SOBRESTOCK & RUPTURA

### Task 3: Routing + segmented Ver + fetch + shell condicional

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`

- [ ] **Step 1: Estado** — `initState`: `accion: null,` (si no está). El holder será `{ rows, ver }`.

- [ ] **Step 2: Ocultar Ordenar/Excel fuera de GENERAL** — en `renderShell`, envolver `#inv-export` y `#inv-orden`:
```js
            (invState.tab === 'general' ? '<button type="button" id="inv-export" class="ta-btn" style="padding:6px 12px;">⬇ Exportar Excel</button>' : '') +
```
```js
          (invState.tab === 'general' ? '<select id="inv-orden" class="ta-select" style="max-width:230px;">' + ordenOpts + '</select>' : '') +
```

- [ ] **Step 3: Routing** — en `renderActiveTab`, antes del fallback:
```js
    if (invState.tab === 'accion') { fetchAndRenderAccion(cont); return; }
```

- [ ] **Step 4: Fetch**
```js
  async function fetchAndRenderAccion(cont) {
    const T = window.TiendaIA, sb = T.supabase();
    cont.innerHTML = loadingCard();
    try {
      const { data, error } = await sb.rpc('inventario_resumen', {
        p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo, p_orden: 'dias_asc',
        p_clasificacion: ['quiebre', 'ruptura', 'sobrestock'],
        p_proveedor_id: invState.filtros.proveedor_id || null,
        p_categoria_id: invState.filtros.categoria_id || null,
        p_buscar: invState.filtros.buscar || null, p_limit: null, p_offset: 0,
      });
      if (error) { cont.innerHTML = errorCard(error.message); return; }
      const ver = (invState.accion && invState.accion.ver) || 'ruptura';
      invState.accion = { rows: data || [], ver };
      renderAccion(cont);
    } catch (e) { cont.innerHTML = errorCard(e.message || String(e)); }
  }
```

- [ ] **Step 5: Verificar** — `node --check`.

- [ ] **Step 6: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js
git commit -m "feat(inventario): routing tab accion + ocultar orden/Excel fuera de GENERAL + fetch S&R (S&R Task 3)"
```

---

### Task 4: Render S&R (segmented + sugerencia + capital + drill)

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`

**Interfaces:** `umbrOptimo()`, `umbrSobrestock()` (leen `T.state.tienda`); `sugerenciaCompra(r)`, `capitalAmarrado(r)`; `filaSugerencia(r, ver)`; `drillHtml(productoId)` dispatcher; `filaDrillAccion(productoId)`.

- [ ] **Step 1: Helpers de cálculo**
```js
  function umbrOptimo() { return Number((window.TiendaIA.state.tienda || {}).inv_umbral_optimo_dias || 30); }
  function umbrSobrestock() { return Number((window.TiendaIA.state.tienda || {}).inv_umbral_sobrestock_dias || 60); }
  // r/v deben traer: venta_diaria, datos_insuficientes, stock(_total). costo = costo_unitario del padre.
  function sugCompraTxt(velocidad, datos_insuf, stock, costo) {
    if (datos_insuf) return 'Pocos datos, usá tu criterio';
    if (!velocidad || Number(velocidad) === 0) return 'Sin histórico de venta, definí vos cuánto pedir';
    const opt = umbrOptimo();
    const cant = Math.max(0, Math.ceil(opt * Number(velocidad) - Number(stock) - 1e-9)); // -1e-9: absorbe residuo flotante (ver Task 1)
    if (cant === 0) return 'Ya tenés para tu meta de ' + opt + ' días';
    const cop = fmtCOP(cant * Number(costo || 0));
    return 'Para tu meta de ' + opt + ' días: comprá ~' + cant + ' ≈ ' + cop;
  }
  function capitalAmarrado(velocidad, stock, costo) {
    const sob = umbrSobrestock();
    const demas = Math.max(0, Math.round(Number(stock) - sob * Number(velocidad || 0)));
    return { unidades: demas, capital: demas * Number(costo || 0) };
  }
```

- [ ] **Step 2: filaSugerencia (sub-fila full-width bajo la referencia)**
```js
  function filaSugerencia(r, ver) {
    if (ver === 'sobrestock') {
      const c = capitalAmarrado(r.venta_diaria, r.stock_total, r.costo_unitario);
      if (c.unidades <= 0) return '';
      return '<div class="ta-inv-sug ta-inv-sug--liq">Te sobran ~' + c.unidades + ' ≈ ' + fmtCOP(c.capital) + ' parados</div>';
    }
    return '<div class="ta-inv-sug ta-inv-sug--rep">' + sugCompraTxt(r.venta_diaria, r.datos_insuficientes, r.stock_total, r.costo_unitario) + '</div>';
  }
```

- [ ] **Step 3: drillHtml dispatcher + filaDrillAccion** — y cambiar `toggleDrill` y los render para usar `drillHtml`:
```js
  function drillHtml(productoId) {
    return (invState.tab === 'accion') ? filaDrillAccion(productoId) : filaDrill(productoId);
  }
  function filaDrillAccion(productoId) {
    const T = window.TiendaIA;
    const vs = invState.drillCache[productoId];
    if (!vs) return vrowMsg('Cargando variantes…');
    if (!vs.length) return vrowMsg('Sin variantes.');
    const padre = (invState.accion && invState.accion.rows || []).find(x => x.producto_id === productoId) || {};
    const costo = padre.costo_unitario; const ver = (invState.accion && invState.accion.ver) || 'ruptura';
    return vs.map(v => {
      const etiqueta = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '—');
      let sug;
      if (ver === 'sobrestock') { const c = capitalAmarrado(v.venta_diaria, v.stock, costo); sug = c.unidades > 0 ? ('sobran ~' + c.unidades + ' ≈ ' + fmtCOP(c.capital)) : '—'; }
      else { sug = sugCompraTxt(v.venta_diaria, v.datos_insuficientes, v.stock, costo); }
      return '<div class="ta-inv-vrow ta-inv-vrow--sug">' +
        '<span class="ta-inv-vmark" aria-hidden="true"></span><span class="ta-inv-vswatch" aria-hidden="true"></span>' +
        '<div class="ta-inv-vref"><strong>' + T.escapeHtml(etiqueta) + '</strong> <code>' + T.escapeHtml(v.sku || '') + '</code>' +
          '<span class="ta-inv-vsub">stock ' + Number(v.stock) + ' · ' + T.escapeHtml(sug) + '</span></div>' +
        '<div class="ta-inv-vcell num"><span class="ta-inv-vlabel">Stock</span>' + Number(v.stock) + '</div>' +
        '<div class="ta-inv-vcell"><span class="ta-inv-vlabel">Cobertura</span>' + diasInvCelda(v) + '</div>' +
      '</div>';
    }).join('');
  }
```
En `toggleDrill`: cambiar `insertDrillRows(item, filaDrill(productoId))` por `insertDrillRows(item, drillHtml(productoId))`. En `renderGeneral`: `if (invState.drillOpen[r.producto_id]) html += drillHtml(r.producto_id);`.

- [ ] **Step 4: renderAccion (segmented + lista)**
```js
  function renderAccion(cont) {
    const T = window.TiendaIA;
    const ver = invState.accion.ver, rows = invState.accion.rows;
    const cls = ver === 'ruptura' ? 'ruptura' : ver === 'sobrestock' ? 'sobrestock' : 'quiebre';
    let lista = rows.filter(r => r.clasificacion === cls);
    if (ver === 'sobrestock') lista.sort((a, b) => Number(b.valor_inventario || 0) - Number(a.valor_inventario || 0));
    else lista.sort((a, b) => Number(a.dias_inventario || 0) - Number(b.dias_inventario || 0));
    const nR = rows.filter(r => r.clasificacion === 'ruptura').length;
    const nS = rows.filter(r => r.clasificacion === 'sobrestock').length;
    const nA = rows.filter(r => r.clasificacion === 'quiebre').length;
    const seg = (id, label, n) => '<button type="button" class="ta-btn inv-ver' + (ver === id ? ' ta-btn--primary' : '') + '" data-ver="' + id + '">' + label + ' (' + n + ')</button>';
    let body;
    if (!lista.length) {
      const vacio = ver === 'sobrestock' ? 'Sin exceso de inventario.' : ver === 'ruptura' ? 'Nada en ruptura. Tu stock está al día.' : 'Nada agotado.';
      body = '<div class="ta-card"><div class="ta-empty" style="padding:28px 16px;"><p class="ta-empty__text">' + vacio + '</p></div></div>';
    } else {
      let filas = '';
      lista.forEach(r => {
        filas += filaGeneral(r) + filaSugerencia(r, ver);
        if (invState.drillOpen[r.producto_id]) filas += drillHtml(r.producto_id);
      });
      body = '<div class="ta-card" style="padding:0;overflow:hidden;"><div class="ta-inv-list">' +
        '<div class="ta-inv-list__head"><span></span><span></span><span>Referencia</span>' +
        '<span style="text-align:right;">Stock</span><span>Cobertura</span><span style="text-align:right;">Valor</span>' +
        '<span style="text-align:right;">Costo</span><span>Última venta</span><span>Proveedor</span></div>' + filas +
        '</div></div>';
    }
    let extra = '';
    if (ver === 'sobrestock' && lista.length) {
      const cap = lista.reduce((s, r) => s + capitalAmarrado(r.venta_diaria, r.stock_total, r.costo_unitario).capital, 0);
      extra = '<p class="ta-inv-secc__sub">' + fmtCOP(cap) + ' en capital parado en esta lista.</p>';
    } else if (ver !== 'sobrestock' && lista.length) {
      extra = '<p class="ta-inv-secc__sub">Sugerencia hacia tu óptimo de ' + umbrOptimo() + ' días. No genera la orden: es para que decidas.</p>';
    }
    cont.innerHTML =
      '<div class="ta-inv-ver" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">' +
        seg('ruptura', 'Ruptura', nR) + seg('sobrestock', 'Sobrestock', nS) + seg('agotado', 'Agotado', nA) +
      '</div>' + extra + body;
    cont.querySelectorAll('.inv-ver').forEach(b => b.addEventListener('click', () => {
      invState.accion.ver = b.getAttribute('data-ver'); renderAccion(cont);
    }));
    wireGeneral(cont);
  }
```

- [ ] **Step 5: Verificar** — `node --check`. Verificación de sugerencia (impersonando dueño, opcional): para 1 ref en ruptura y 1 variante, `ceil(optimo×venta_diaria−stock)` == lo que muestra.

- [ ] **Step 6: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js
git commit -m "feat(inventario): S&R render — segmented Ver + sugerencia compra (ref+variante) + capital amarrado (S&R Task 4)"
```

---

### Task 5: CSS S&R + bump + merge

**Files:** Modify `admin.css`, `index.html`

- [ ] **Step 1: CSS**
```css
/* Sugerencia / capital (sub-fila full-width bajo la referencia en S&R) */
.ta-inv-sug { padding:8px 12px 10px 84px; font-size:13px; font-weight:600; border-bottom:1px solid var(--ta-border); background:var(--ta-bg-soft); }
.ta-inv-sug--rep { color:#0f5132; }
.ta-inv-sug--liq { color:#8a5a00; }
.ta-inv-vrow--sug .ta-inv-vsub { color:var(--ta-text-soft); }
@media (max-width:760px){ .ta-inv-sug { padding:8px 12px; } }
```
(Auditar tokens/contraste con /ui-ux-pro-max + /impeccable; el verde/ámbar deben ser AA sobre `--ta-bg-soft`.)

- [ ] **Step 2: Bump** — `index.html`: css `?v=21`, js `?v=12`.

- [ ] **Step 3: Verificar** — `node --check`.

- [ ] **Step 4: Commit + merge**
```bash
git add iapanel/tienda/admin/admin.css iapanel/tienda/admin/index.html
git commit -m "feat(inventario): estilos S&R (sugerencia/capital) + bump v=12 (S&R Task 5)"
git checkout main && git merge --no-ff feat/inv-1b-ajustes-accion -m "merge: Inventario Ajustes (3 umbrales) + tab Sobrestock & Ruptura" && git push origin main
```

### CHECKPOINT 2 (gate visual de Jorge)
Implementa. Jorge prueba el tab S&R (desktop+mobile, QAINV): Ver Ruptura/Sobrestock/Agotado; sugerencia "Para tu meta de N días: comprá ~X ≈ $Y" por ref y por variante; agotado sin histórico → mensaje de criterio; sobrestock → "te sobran ~X ≈ $Y" + total capital parado; sin Ordenar/Excel; vacíos positivos; responsive. **OK visual cierra la fase.**

---

## Self-Review
- **Spec coverage:** migración óptimo+CHECK+assert+rechazo → Task 1; panel Ajustes + guardado + re-clasifica vivo → Task 2; routing/Ver/fetch → Task 3; sugerencia ref+variante / capital / drill / mini-dato / vacíos / ocultar orden-Excel → Task 4-5; 2 checkpoints → tras Task 2 y Task 5. ✓
- **Placeholders:** SQL y JS completos. (Task 2 Step 1 = verificación real del load de tienda, no placeholder.) ✓
- **Type consistency:** `invState.accion={rows,ver}`, `invState.ajustesOpen`; `drillHtml`→`filaDrill`/`filaDrillAccion`; `sugCompraTxt(velocidad,datos_insuf,stock,costo)` y `capitalAmarrado(velocidad,stock,costo)` llamadas igual en filaSugerencia/filaDrillAccion/renderAccion; `umbrOptimo/umbrSobrestock` leen `T.state.tienda`; columnas RPC (venta_diaria, datos_insuficientes, stock_total, costo_unitario, valor_inventario, dias_inventario, clasificacion) == firmas confirmadas en PASO 0. ✓
