# Inventario GENERAL — Ordenar + Exportar Excel · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** Agregar a GENERAL un dropdown "Ordenar por" (server-side) y un botón "Exportar Excel" del view actual (filtros + orden, completo), con categoría/subcategoría y variantes debajo.

**Architecture:** RPC `inventario_resumen` gana 3 casos de orden; `inventario_variantes` se generaliza a array de producto_ids (sirve drill + export). Front: dropdown que pasa `p_orden`; botón que carga SheetJS lazy y arma el workbook con resumen(all) + variantes(ids).

**Tech Stack:** PL/pgSQL (MCP), JS vanilla TiendaIA, SheetJS (xlsx ESM lazy desde CDN), tokens `--ta-*`.

## Global Constraints
- Branch `feat/inv-1b-orden-export`; merge a main + Jorge Implementa; deploy-to-prod OFF.
- RPC: SECURITY DEFINER STABLE search_path=public, dueño 1ª línea, REVOKE public/anon/authenticated + GRANT authenticated, `#variable_conflict use_column`. Versión alineada al repo tras apply_migration.
- Orden default = `referencia`. Sin orden por cobertura (es la pestaña Sobrestock/Ruptura). Sin flechas (dropdown). Solo GENERAL.
- Excel = view del momento (filtros + orden vigentes), sin paginar (`p_limit=NULL`). SheetJS lazy (no en el `<script>` inicial). Copy español, sin emojis.

---

## File Structure
- Create: `supabase/migrations/20260621200000_inv_orden_y_variantes_bulk.sql` — orden + variantes array.
- Modify: `iapanel/tienda/admin/views/inventario.js` — dropdown orden, drill→array, export Excel.
- Modify: `iapanel/tienda/admin/index.html` — bump `inventario.js?v=6` (no se agrega script de SheetJS; carga lazy por import()).

---

### Task 1: BD — orden nuevo + inventario_variantes a array

**Files:** Create `supabase/migrations/20260621200000_inv_orden_y_variantes_bulk.sql`

**Interfaces:**
- Produces: `inventario_resumen` con `p_orden` ∈ {referencia, valor, valor_asc, cantidad_desc, cantidad_asc, unidades, dias_asc, dias_desc}. `inventario_variantes(p_tienda_id uuid, p_producto_ids uuid[], p_periodo int default null)` → TABLE(`producto_id uuid, variante_id uuid, color text, talla text, sku text, stock int, reservado int, disponible int, foto_color_url text, unidades_vendidas bigint, venta_diaria numeric, dias_inventario numeric, clasificacion text, datos_insuficientes boolean`).

- [ ] **Step 1: Assert previo**
```sql
select (select count(*) from pg_proc where proname='inventario_variantes' and pronargs=3 and pg_get_function_arguments(oid) ilike '%uuid[]%') as ya_array,
       (select pg_get_functiondef(oid) ilike '%cantidad_desc%' from pg_proc where proname='inventario_resumen') as resumen_ya_orden;
```
Expected ANTES: `ya_array=0, resumen_ya_orden=false`.

- [ ] **Step 2: Escribir la migración** (`inventario_resumen` CREATE OR REPLACE con los 3 casos de orden agregados al `order by` —reproducir la función completa de `20260621170100` con estas 3 líneas extra antes del `case when v_orden='referencia'`):
```sql
    case when v_orden = 'valor_asc'     then f.valor_inventario end asc  nulls last,
    case when v_orden = 'cantidad_desc' then f.stock_total      end desc nulls last,
    case when v_orden = 'cantidad_asc'  then f.stock_total      end asc  nulls last,
```
y `inventario_variantes` a array:
```sql
drop function if exists public.inventario_variantes(uuid, uuid, int);
create or replace function public.inventario_variantes(p_tienda_id uuid, p_producto_ids uuid[], p_periodo int default null)
returns table(producto_id uuid, variante_id uuid, color text, talla text, sku text,
  stock int, reservado int, disponible int, foto_color_url text,
  unidades_vendidas bigint, venta_diaria numeric, dias_inventario numeric,
  clasificacion text, datos_insuficientes boolean)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_periodo int; v_ruptura int; v_sobrestock int;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select least(coalesce(p_periodo, t.inv_periodo_default_dias),60), t.inv_umbral_ruptura_dias, t.inv_umbral_sobrestock_dias
    into v_periodo, v_ruptura, v_sobrestock from public.tiendas t where t.id = p_tienda_id;
  if v_periodo is null then raise exception 'tienda inexistente'; end if;
  return query
  with vtas as (
    select im.variante_id,
      (-1 * coalesce(sum(im.cantidad) filter (where im.tipo in ('venta','devolucion') and im.created_at >= now() - make_interval(days => v_periodo)),0))::bigint as unidades_vendidas
    from public.inventario_movimientos im
    where im.producto_id = any(p_producto_ids) and im.variante_id is not null
    group by im.variante_id
  ),
  base as (
    select pv.producto_id, pv.id, pv.color, pv.talla, pv.sku, pv.stock, pv.reservado,
           (pv.stock - pv.reservado)::int as disponible, pv.foto_color_url,
           coalesce(v.unidades_vendidas,0)::bigint as unidades_vendidas,
           least(v_periodo, greatest(1, (current_date - p.created_at::date)))::int as dias_efectivos
    from public.producto_variantes pv
    join public.productos p on p.id = pv.producto_id
    left join vtas v on v.variante_id = pv.id
    where pv.producto_id = any(p_producto_ids) and p.tienda_id = p_tienda_id
  ),
  calc as (
    select b.*,
      case when b.unidades_vendidas = 0 then 0::numeric else b.unidades_vendidas::numeric / b.dias_efectivos end as venta_diaria,
      case when b.stock = 0 then 0::numeric when b.unidades_vendidas = 0 then null::numeric
           else b.stock::numeric / (b.unidades_vendidas::numeric / b.dias_efectivos) end as dias_inventario,
      (b.dias_efectivos < 7) as datos_insuficientes
    from base b
  )
  select c.producto_id, c.id, c.color, c.talla, c.sku, c.stock, c.reservado, c.disponible, c.foto_color_url,
    c.unidades_vendidas, c.venta_diaria, c.dias_inventario,
    case when c.stock = 0 then 'quiebre'
         when c.unidades_vendidas = 0 then 'sin_ventas'
         when c.dias_efectivos >= 7 and c.dias_inventario < v_ruptura then 'ruptura'
         when c.dias_efectivos >= 7 and c.dias_inventario > v_sobrestock then 'sobrestock'
         else 'normal' end as clasificacion,
    c.datos_insuficientes
  from calc c
  order by c.producto_id, c.color nulls first, c.talla nulls first, c.sku;
end;
$function$;
revoke all on function public.inventario_variantes(uuid, uuid[], int) from public, anon, authenticated;
grant execute on function public.inventario_variantes(uuid, uuid[], int) to authenticated;
```

- [ ] **Step 3: Aplicar a test** — MCP `apply_migration` (la migración completa: resumen reescrito + variantes array); alinear versión:
```sql
update supabase_migrations.schema_migrations set version='20260621200000' where name='inv_orden_y_variantes_bulk' and version<>'20260621200000';
```

- [ ] **Step 4: Verificar (impersonando dueño, rollback)**:
```sql
do $$
declare v_t uuid:='69915581-c0d1-4961-ab76-80dacde9169a'; v_o uuid:='4bd6d4eb-65df-4225-8dde-1883d00bb32e';
  r text:=''; a uuid[]; n int; ok boolean;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_o::text)::text, true);
  -- orden: cantidad_desc -> stock descendente
  select bool_and(prev>=stock_total) into ok from (
    select stock_total, lag(stock_total) over () prev from inventario_resumen(v_t,30,'cantidad_desc',null,null,null,'QAINV',1000,0)
  ) z where prev is not null;
  r:=r||E'\ncantidad_desc monotono='||ok;
  -- valor_asc -> valor ascendente
  select bool_and(prev<=valor_inventario) into ok from (
    select valor_inventario, lag(valor_inventario) over () prev from inventario_resumen(v_t,30,'valor_asc',null,null,null,'QAINV',1000,0)
  ) z where prev is not null;
  r:=r||E'\nvalor_asc monotono='||ok;
  -- variantes array: drill (1 id) y bulk (varios)
  select array_agg(producto_id) into a from inventario_resumen(v_t,30,'referencia',null,null,null,'QAINV-MV',10,0);
  select count(*) into n from inventario_variantes(v_t, a, 30);  -- 1 producto -> sus variantes
  r:=r||E'\nvariantes(QAINV-MV) filas='||n;
  select array_agg(producto_id) into a from inventario_resumen(v_t,30,'referencia',null,null,null,'QAINV',1000,0);
  select count(distinct producto_id) into n from inventario_variantes(v_t, a, 30);
  r:=r||E'\nvariantes bulk: productos con variantes='||n;
  raise exception '%', r;
end $$;
```
Expected: `cantidad_desc monotono=t`, `valor_asc monotono=t`, variantes drill devuelve filas, bulk agrupa por varios producto_id.

- [ ] **Step 5: Static asserts**
```sql
select (select count(*) from pg_proc where proname='inventario_variantes' and pronargs=3) as v3,
       (select count(*) from pg_proc where proname='inventario_variantes' and pronargs=2) as v2_vieja,
       has_function_privilege('authenticated','public.inventario_variantes(uuid,uuid[],int)','execute') as auth,
       has_function_privilege('anon','public.inventario_variantes(uuid,uuid[],int)','execute') as anon;
```
Expected: `v3=1, v2_vieja=0, auth=true, anon=false`.

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/20260621200000_inv_orden_y_variantes_bulk.sql
git commit -m "feat(inventario): orden por cantidad/valor (asc/desc) + inventario_variantes a array (Fase 1b)"
```

---

### Task 2: Front — dropdown "Ordenar por" + drill a array

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`

**Interfaces:** Consume `inventario_resumen` (p_orden) + `inventario_variantes` (array). `invState.orden = 'referencia'`.

- [ ] **Step 1: Estado** — en `initState`, agregar `orden: 'referencia'`.

- [ ] **Step 2: Dropdown en el header** (en `renderShell`, dentro de la card de filtros, junto a proveedor/categoría):
```js
'<select id="inv-orden" class="ta-select" style="max-width:230px;">' +
  '<option value="referencia"'    + sel('referencia')    + '>Ordenar: Referencia (A-Z)</option>' +
  '<option value="cantidad_desc"' + sel('cantidad_desc') + '>Cantidad: mayor a menor</option>' +
  '<option value="cantidad_asc"'  + sel('cantidad_asc')  + '>Cantidad: menor a mayor</option>' +
  '<option value="valor"'         + sel('valor')         + '>Costo total: mayor a menor</option>' +
  '<option value="valor_asc"'     + sel('valor_asc')     + '>Costo total: menor a mayor</option>' +
'</select>'
```
con `const sel = (v) => invState.orden === v ? ' selected' : '';` definido en `renderShell`.

- [ ] **Step 3: Wire** (en `wireShell`):
```js
const orden = view.querySelector('#inv-orden');
if (orden) orden.addEventListener('change', () => { invState.orden = orden.value; invState.page.offset = 0; invState.general = null; renderInventario(); });
```

- [ ] **Step 4: Pasar p_orden** — en `fetchAndRenderGeneral`, cambiar `p_orden: 'referencia'` por `p_orden: invState.orden`.

- [ ] **Step 5: Drill a array** — en `toggleDrill`, cambiar la llamada a `sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: [productoId], p_periodo: invState.periodo })`.

- [ ] **Step 6: Verificar** — `node --check`; smoke (impersonando dueño): `inventario_resumen(...,'cantidad_desc',...)` corre; el drill (array de 1) devuelve variantes.

- [ ] **Step 7: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js
git commit -m "feat(inventario): dropdown Ordenar por en GENERAL + drill por array (Fase 1b)"
```

---

### Task 3: Front — Exportar Excel (SheetJS lazy)

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`, `iapanel/tienda/admin/index.html` (bump v=6).

**Interfaces:** Consume `inventario_resumen` (all) + `inventario_variantes` (ids) + `invState.catalogos.categorias`.

- [ ] **Step 1: Botón** en el header (junto a Ajustes):
```js
'<button type="button" id="inv-export" class="ta-btn" style="padding:6px 12px;">⬇ Exportar Excel</button>'
```
Wire en `wireShell`: `const ex = view.querySelector('#inv-export'); if (ex) ex.addEventListener('click', () => exportarExcel(ex));`

- [ ] **Step 2: Helpers de export**
```js
function resolverCat(categoriaId) {
  if (!categoriaId) return { cat: '', sub: '' };
  const cats = invState.catalogos.categorias;
  const c = cats.find(x => x.id === categoriaId);
  if (!c) return { cat: '', sub: '' };
  if (c.parent_id) { const par = cats.find(x => x.id === c.parent_id); return { cat: par ? par.nombre : '', sub: c.nombre }; }
  return { cat: c.nombre, sub: '' };
}
function cobTexto(r) {
  if (r.clasificacion === 'quiebre' || r.dias_inventario === 0 || r.dias_inventario === '0') return 'Agotado';
  if (r.clasificacion === 'sin_ventas' || r.dias_inventario == null) return 'Sin ventas';
  const d = Math.round(Number(r.dias_inventario));
  return (r.datos_insuficientes ? '≈' : '') + d + (d === 1 ? ' día' : ' días');
}
function numExcel(n) { return (n == null) ? '' : Number(n); }
function fechaExcel(ts) { if (!ts) return ''; try { return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return ''; } }
```

- [ ] **Step 3: exportarExcel**
```js
async function exportarExcel(btn) {
  const T = window.TiendaIA, sb = T.supabase();
  const old = btn.textContent; btn.disabled = true; btn.textContent = 'Exportando…';
  try {
    const XLSX = await import('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.mjs');
    const { data: prods, error } = await sb.rpc('inventario_resumen', {
      p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo, p_orden: invState.orden, p_clasificacion: null,
      p_proveedor_id: invState.filtros.proveedor_id || null, p_categoria_id: invState.filtros.categoria_id || null,
      p_buscar: invState.filtros.buscar || null, p_limit: null, p_offset: 0 });
    if (error) throw error;
    if (!prods || !prods.length) { T.toast('No hay productos para exportar con esos filtros.', 'info'); return; }
    const ids = prods.map(p => p.producto_id);
    const { data: vars, error: e2 } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_ids: ids, p_periodo: invState.periodo });
    if (e2) throw e2;
    const byProd = {}; (vars || []).forEach(v => { (byProd[v.producto_id] = byProd[v.producto_id] || []).push(v); });
    const aoa = [['Categoría','Subcategoría','Referencia','Nombre','Stock','Reservado','Disponible','Costo','Valor','Cobertura','Clasificación','Última venta','Proveedor']];
    prods.forEach(p => {
      const { cat, sub } = resolverCat(p.categoria_id);
      aoa.push([cat, sub, p.referencia, p.nombre || '', numExcel(p.stock_total), numExcel(p.reservado_total), numExcel(p.stock_disponible),
                numExcel(p.costo_unitario), numExcel(p.valor_inventario), cobTexto(p), p.clasificacion, fechaExcel(p.fecha_ultima_venta), p.proveedor_nombre || '']);
      (byProd[p.producto_id] || []).forEach(v => {
        const et = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '');
        aoa.push(['', '', '↳ ' + et, v.sku || '', numExcel(v.stock), numExcel(v.reservado), numExcel(v.disponible), '', '', cobTexto(v), v.clasificacion, '', '']);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:16},{wch:16},{wch:16},{wch:24},{wch:8},{wch:10},{wch:11},{wch:12},{wch:14},{wch:14},{wch:13},{wch:13},{wch:18}];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, 'Inventario_' + (T.state.tienda.slug || 'tienda') + '_' + fecha + '.xlsx');
  } catch (e) { T.toast('No pudimos exportar: ' + (e.message || e), 'error'); }
  finally { btn.disabled = false; btn.textContent = old; }
}
```

- [ ] **Step 4: Bump versión** — `index.html`: `inventario.js?v=5` → `?v=6`.

- [ ] **Step 5: Verificar** — `node --check`. (El export real lo prueba Jorge en el navegador: descarga con los filtros+orden del momento, cat/subcat + variantes debajo.)

- [ ] **Step 6: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js iapanel/tienda/admin/index.html
git commit -m "feat(inventario): Exportar Excel del view (SheetJS lazy) en GENERAL (Fase 1b)"
```

---

### Task 4: Gate de build
- [ ] Merge a main + Jorge Implementa; curl `inventario.js?v=6` byte-idéntico.
- [ ] Funcional (Jorge desktop + celular): cada opción del dropdown reordena el set completo (no solo la página); "Exportar Excel" descarga con los filtros+orden del momento; el .xlsx tiene Categoría/Subcategoría, fila por referencia con su total, y variantes debajo con su cobertura. **OK visual de Jorge.**

---

## Self-Review
**1. Spec coverage:** §3.1 orden (3 casos) → Task 1; §3.2 variantes array → Task 1; §4.2 dropdown → Task 2; §4.1 drill array → Task 2 step 5; §4.3 export → Task 3; gate → Task 4. ✓
**2. Placeholder scan:** Task 1 step 2 dice "reproducir la función completa de 20260621170100 con 3 líneas extra" — no es placeholder: las 3 líneas exactas están dadas y la base es un archivo existente versionado; al ejecutar se copia esa función + las 3 líneas. El SQL de `inventario_variantes` está completo. Front con código completo. ✓
**3. Type consistency:** `inventario_variantes(uuid,uuid[],int)` con `producto_id` en salida, usado igual en drill (array de 1) y export (array N). `invState.orden` consistente. p_orden values calzan entre RPC y dropdown. ✓
