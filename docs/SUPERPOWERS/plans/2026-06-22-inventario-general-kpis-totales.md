# Inventario GENERAL — KPIs + Cobertura general (por costo) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps con checkbox.

**Goal:** Agregar a GENERAL una barra de 3 KPIs arriba (Unidades · Valor de inventario · Cobertura general por costo) + fila de totales abajo + totales en el Excel, recalculados con el set filtrado.

**Architecture:** Nueva RPC `inventario_totales` que agrega sobre el set filtrado completo (sin paginar). El front la cachea (invalida por filtro/período), pinta la barra KPI + la fila de totales, y la usa en el Excel.

**Tech Stack:** PL/pgSQL (MCP), JS vanilla TiendaIA, SheetJS (ya integrado), tokens `--ta-*`.

## Global Constraints
- Branch `feat/inv-1b-kpis-totales`; merge a main + Jorge Implementa; deploy-to-prod OFF.
- RPC: SECURITY DEFINER STABLE search_path=public, dueño 1ª línea, REVOKE public/anon/authenticated + GRANT authenticated, `#variable_conflict use_column`. Versión alineada al repo tras apply.
- Cobertura general = `valor_inventario / (costo_venta_periodo / dias_efectivos)`, `dias_efectivos = LEAST(periodo, GREATEST(1, today - tienda.created_at::date))`. **Sin color.** Etiqueta "(cobertura según tu costo)".
- KPIs recalculan con filtros (proveedor/categoría/buscador), no con paginación/orden. Período default 30.
- Sin emojis (salvo los ya existentes en botones), copy español, contraste AA, sin hero-metric/gradiente/tarjetas-cliché.

---

## File Structure
- Create: `supabase/migrations/20260622170000_inv_totales.sql` — RPC inventario_totales.
- Modify: `iapanel/tienda/admin/views/inventario.js` — estado/fetch/KPI bar/fila totales/Excel.
- Modify: `iapanel/tienda/admin/admin.css` — `.ta-inv-kpis`, `.ta-inv-totes`.
- Modify: `iapanel/tienda/admin/index.html` — bump `inventario.js?v=9`.

---

### Task 1: BD — RPC inventario_totales

**Files:** Create `supabase/migrations/20260622170000_inv_totales.sql`

**Interfaces:** Produces `inventario_totales(p_tienda_id uuid, p_periodo int default null, p_proveedor_id uuid default null, p_categoria_id uuid default null, p_buscar text default null)` → TABLE(`total_unidades bigint, valor_inventario numeric, costo_venta_periodo numeric, cobertura_general_dias numeric, periodo int`).

- [ ] **Step 1: Escribir la migración**
```sql
create or replace function public.inventario_totales(
  p_tienda_id uuid, p_periodo int default null,
  p_proveedor_id uuid default null, p_categoria_id uuid default null, p_buscar text default null
)
returns table(total_unidades bigint, valor_inventario numeric, costo_venta_periodo numeric,
              cobertura_general_dias numeric, periodo int)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_periodo int; v_dias_efectivos int; v_buscar text; v_creada date;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select least(coalesce(p_periodo, t.inv_periodo_default_dias), 60), t.created_at::date
    into v_periodo, v_creada from public.tiendas t where t.id = p_tienda_id;
  if v_periodo is null then raise exception 'tienda inexistente'; end if;
  v_dias_efectivos := least(v_periodo, greatest(1, current_date - v_creada));
  if p_buscar is not null and length(trim(p_buscar)) > 0 then
    v_buscar := '%' || replace(replace(replace(p_buscar, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  with base as (
    select p.id, p.costo
    from public.productos p
    where p.tienda_id = p_tienda_id
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
      and (p_categoria_id is null or p.categoria_id = p_categoria_id
           or p.categoria_id in (select c.id from public.categorias c where c.parent_id = p_categoria_id))
      and (v_buscar is null or p.referencia ilike v_buscar or p.nombre ilike v_buscar)
  ),
  stk as (
    select coalesce(sum(pv.stock),0)::bigint as unidades,
           coalesce(sum(pv.stock * b.costo),0)::numeric as valor
    from public.producto_variantes pv join base b on b.id = pv.producto_id
  ),
  cogs as (
    select (-1 * coalesce(sum(im.cantidad * im.costo_unitario),0))::numeric as costo_venta
    from public.inventario_movimientos im join base b on b.id = im.producto_id
    where im.tipo in ('venta','devolucion') and im.created_at >= now() - make_interval(days => v_periodo)
  )
  select s.unidades, s.valor, c.costo_venta,
    case when s.valor = 0 then 0::numeric
         when c.costo_venta <= 0 then null::numeric
         else s.valor / (c.costo_venta / v_dias_efectivos) end as cobertura_general_dias,
    v_periodo
  from stk s cross join cogs c;
end;
$function$;
revoke all on function public.inventario_totales(uuid, int, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.inventario_totales(uuid, int, uuid, uuid, text) to authenticated;
```

- [ ] **Step 2: Aplicar a test** — MCP `apply_migration` (name `inv_totales`); alinear versión:
```sql
update supabase_migrations.schema_migrations set version='20260622170000' where name='inv_totales' and version<>'20260622170000';
```

- [ ] **Step 3: Verificar (impersonando dueño, rollback)**
```sql
do $$
declare v_t uuid:='69915581-c0d1-4961-ab76-80dacde9169a'; v_o uuid:='4bd6d4eb-65df-4225-8dde-1883d00bb32e';
  r text:=E'\n=== TOTALES ==='; rec record; v_cat uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_o::text)::text, true);
  select * into rec from inventario_totales(v_t,30,null,null,null);
  r:=r||E'\nsin filtro: unid='||rec.total_unidades||' valor='||rec.valor_inventario||' cogs='||rec.costo_venta_periodo||' cob='||round(rec.cobertura_general_dias,1);
  -- con filtro de categoria (la primera con productos)
  select p.categoria_id into v_cat from productos p where p.tienda_id=v_t and p.categoria_id is not null limit 1;
  select * into rec from inventario_totales(v_t,30,null,v_cat,null);
  r:=r||E'\ncon 1 categoria: unid='||rec.total_unidades||' valor='||rec.valor_inventario;
  raise exception '%', r;
end $$;
```
Expected: sin filtro unid=658, valor=8000000, cogs=1216000, cob≈197.4; con categoría los totales bajan al subconjunto.

- [ ] **Step 4: Static asserts**
```sql
select (select count(*) from pg_proc where proname='inventario_totales') as existe,
       has_function_privilege('authenticated','public.inventario_totales(uuid,int,uuid,uuid,text)','execute') as auth,
       has_function_privilege('anon','public.inventario_totales(uuid,int,uuid,uuid,text)','execute') as anon;
```
Expected: existe=1, auth=true, anon=false.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260622170000_inv_totales.sql
git commit -m "feat(inventario): RPC inventario_totales (KPIs agregados + cobertura general por costo)"
```

---

### Task 2: Front — estado, fetch y barra KPI

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`, `admin.css`

**Interfaces:** Consume `inventario_totales`. `invState.totales = null`.

- [ ] **Step 1: Estado** — en `initState`, agregar `totales: null,`. En el handler de período y en los handlers de filtros (proveedor/categoría/buscador/limpiar), agregar `invState.totales = null;` (invalida; NO en orden ni paginación).

- [ ] **Step 2: Helpers** (junto a fmtCOP/fmtFecha):
```js
function fmtNum(n) { return Number(n || 0).toLocaleString('es-CO'); }
function cobTextoGeneral(t) {
  if (!t || Number(t.valor_inventario) === 0) return 'Sin inventario';
  if (t.cobertura_general_dias == null) return 'Sin ventas';
  return fmtNum(Math.round(Number(t.cobertura_general_dias))) + ' días';
}
```

- [ ] **Step 3: Fetch de totales** — función:
```js
async function fetchTotales() {
  const T = window.TiendaIA, sb = T.supabase();
  if (invState.totales) return invState.totales;
  const { data, error } = await sb.rpc('inventario_totales', {
    p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo,
    p_proveedor_id: invState.filtros.proveedor_id || null,
    p_categoria_id: invState.filtros.categoria_id || null,
    p_buscar: invState.filtros.buscar || null,
  });
  if (error) return null;
  invState.totales = (data && data[0]) || null;
  return invState.totales;
}
```

- [ ] **Step 4: Render barra KPI** — en `renderGeneral`, al inicio del contenido (antes de `.ta-inv-list`), insertar un contenedor `#inv-kpis` (placeholder), y tras pintar la tabla, llamar `fetchTotales().then(pintarKpis)`:
```js
function pintarKpis(t) {
  const host = window.TiendaIA.dom.mainView.querySelector('#inv-kpis');
  if (!host) return;
  if (!t) { host.innerHTML = ''; return; }
  host.innerHTML =
    '<div class="ta-inv-kpis">' +
      '<div class="ta-inv-kpi"><span class="ta-inv-kpi__val">' + fmtNum(t.total_unidades) + '</span><span class="ta-inv-kpi__lbl">unidades</span></div>' +
      '<div class="ta-inv-kpi"><span class="ta-inv-kpi__val">' + fmtCOP(t.valor_inventario) + '</span><span class="ta-inv-kpi__lbl">en inventario</span></div>' +
      '<div class="ta-inv-kpi"><span class="ta-inv-kpi__val">' + cobTextoGeneral(t) + '</span><span class="ta-inv-kpi__lbl">cobertura general</span></div>' +
    '</div>' +
    '<p class="ta-inv-kpis__note">(cobertura según tu costo · últimos ' + invState.periodo + ' días)</p>';
}
```
El placeholder en `renderGeneral`: `'<div id="inv-kpis"></div>'` antes de la lista; y al final de `renderGeneral` (o en `fetchAndRenderGeneral` tras pintar), `fetchTotales().then(pintarKpis); pintarTotes();` (ver Task 3).

- [ ] **Step 5: CSS** (`admin.css`):
```css
.ta-inv-kpis { display:flex; flex-wrap:wrap; gap:8px 28px; align-items:baseline; padding:12px 14px; margin:0 0 4px; background:var(--ta-bg-soft); border:1px solid var(--ta-border); border-radius:12px; }
.ta-inv-kpi { display:flex; flex-direction:column; gap:2px; }
.ta-inv-kpi__val { font-size:19px; font-weight:700; color:var(--ta-text); font-variant-numeric:tabular-nums; line-height:1.1; }
.ta-inv-kpi__lbl { font-size:12px; color:var(--ta-text-soft); }
.ta-inv-kpis__note { margin:4px 2px 12px; font-size:12px; color:var(--ta-text-soft); }
@media (max-width:760px){ .ta-inv-kpis{ gap:10px 22px; } }
```
(Verificar tokens reales con `/ui-ux-pro-max` y auditar con `/impeccable`; ajustar a AA si el script lo indica.)

- [ ] **Step 6: Verificar** — `node --check`.

- [ ] **Step 7: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js iapanel/tienda/admin/admin.css
git commit -m "feat(inventario): barra de KPIs (unidades/valor/cobertura general por costo) en GENERAL"
```

---

### Task 3: Front — fila de totales abajo

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`, `admin.css`

- [ ] **Step 1: Render fila** — función que se inserta tras `.ta-inv-list` (antes de la paginación), usando `invState.totales`:
```js
function pintarTotes() {
  const host = window.TiendaIA.dom.mainView.querySelector('#inv-totes');
  const t = invState.totales;
  if (!host || !t) { if (host) host.innerHTML = ''; return; }
  host.innerHTML =
    '<div class="ta-inv-totes">' +
      '<span class="ta-inv-totes__lbl">TOTALES</span>' +
      '<span class="ta-inv-totes__stock">' + fmtNum(t.total_unidades) + '</span>' +
      '<span class="ta-inv-totes__valor">' + fmtCOP(t.valor_inventario) + '</span>' +
    '</div>';
}
```
Placeholder `'<div id="inv-totes"></div>'` tras la lista en `renderGeneral`. En `fetchTotales().then(t => { pintarKpis(t); pintarTotes(); })`.

- [ ] **Step 2: CSS** — fila alineada a la grilla del padre (mismas columnas):
```css
.ta-inv-totes { display:grid; grid-template-columns: 26px 46px minmax(140px,2fr) 60px 156px 104px 90px 98px 112px; gap:0 12px; align-items:center; padding:10px 12px; border-top:2px solid var(--ta-border); font-weight:700; }
.ta-inv-totes__lbl { grid-column:1 / 4; font-size:12px; letter-spacing:.03em; color:var(--ta-text-soft); }
.ta-inv-totes__stock { grid-column:4; text-align:right; font-variant-numeric:tabular-nums; }
.ta-inv-totes__valor { grid-column:6; text-align:right; font-variant-numeric:tabular-nums; }
@media (max-width:760px){
  .ta-inv-totes{ display:flex; gap:6px 18px; flex-wrap:wrap; border-top:2px solid var(--ta-border); }
  .ta-inv-totes__lbl{ flex:1 1 100%; }
}
```

- [ ] **Step 3: Verificar** — `node --check`.

- [ ] **Step 4: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js iapanel/tienda/admin/admin.css
git commit -m "feat(inventario): fila de totales (unidades + valor) al pie de GENERAL"
```

---

### Task 4: Front — totales en el Excel

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`, `index.html` (bump v=9)

- [ ] **Step 1: En `exportarExcel`**, tras llenar `aoa` con productos/variantes, traer totales con los filtros vigentes y agregar filas:
```js
      const { data: tot } = await sb.rpc('inventario_totales', {
        p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo,
        p_proveedor_id: invState.filtros.proveedor_id || null,
        p_categoria_id: invState.filtros.categoria_id || null, p_buscar: invState.filtros.buscar || null });
      if (tot && tot[0]) {
        const tt = tot[0];
        aoa.push([]); // separador
        // header: Ref,Nombre,Stock,Reservado,Disponible,Costo,Valor,Cobertura,Clasif,Última,Proveedor,Cat,Subcat
        aoa.push(['TOTALES', '', numExcel(tt.total_unidades), '', '', '', numExcel(tt.valor_inventario), '', '', '', '', '', '']);
        aoa.push(['Cobertura general (según tu costo): ' + cobTextoGeneral(tt), '', '', '', '', '', '', '', '', '', '', '', '']);
      }
```
(Va antes de `XLSX.utils.aoa_to_sheet(aoa)`.)

- [ ] **Step 2: Bump versión** — `index.html`: `inventario.js?v=8` → `?v=9`.

- [ ] **Step 3: Verificar** — `node --check`.

- [ ] **Step 4: Commit + merge**
```bash
git add iapanel/tienda/admin/views/inventario.js iapanel/tienda/admin/index.html
git commit -m "feat(inventario): totales + cobertura general en el Excel; bump v=9"
git checkout main && git merge --no-ff feat/inv-1b-kpis-totales -m "merge: Inventario GENERAL — KPIs + cobertura general por costo" && git push origin main
```

---

### Task 5: Gate de build
- [ ] Jorge Implementa; curl `inventario.js?v=9` byte-idéntico a main.
- [ ] Funcional (desktop + celular): los 3 KPIs cambian al filtrar por categoría/proveedor; la fila de totales coincide con la barra; el Excel trae TOTALES + cobertura general; cobertura general sin color; explicación por-referencia intacta. **OK visual de Jorge.**

---

## Self-Review
**1. Spec coverage:** §3 RPC → Task 1; §4.1-4.3 estado/fetch/KPI → Task 2; §4.4 fila totales → Task 3; §4.5 Excel → Task 4; §4.6 responsive → CSS de Task 2/3; gate → Task 5. ✓
**2. Placeholder scan:** SQL y JS completos; sin TBD. ✓
**3. Type consistency:** `inventario_totales(uuid,int,uuid,uuid,text)` con columnas total_unidades/valor_inventario/costo_venta_periodo/cobertura_general_dias/periodo, usadas igual en fetch/pintarKpis/pintarTotes/Excel. `invState.totales` invalidado por filtro/período. fmtNum/fmtCOP/cobTextoGeneral consistentes. ✓
