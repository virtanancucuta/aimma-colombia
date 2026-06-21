# Inventario Fase 1b — UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la cara del módulo Inventario — route `#/inventario` con 4 tabs (GENERAL, SOBRESTOCK&RUPTURA, SIN VENTAS, KARDEX) sobre las RPCs de 1a, drill-down por variante (1 RPC nueva) y edición inline de umbrales — con OK visual de Jorge.

**Architecture:** Admin SPA plano. Un archivo `views/inventario.js` (`registerView('inventario',…)`) + wiring en admin.js/index.html. Lee de `inventario_resumen`/`inventario_kardex` (1a) + `inventario_variantes` (nueva). Umbrales se guardan por el `tiendas.update` RLS existente. Storefront NO se toca.

**Tech Stack:** JS vanilla (patrón TiendaIA), Supabase JS (`T.supabase()`), CSS tokens `--ta-*` / `.ta-pill--*`. BD: PL/pgSQL (MCP apply_migration).

## Global Constraints

- Branch `feat/inv-fase1b-ui` (NUNCA main; gate de Jorge antes de merge). Deploy-to-prod OFF.
- BD: migraciones con versión alineada al repo (post `20260621170100`); tras `apply_migration`, `UPDATE schema_migrations SET version='<archivo>'`. RPC nueva: `SECURITY DEFINER STABLE search_path=public`, dueño 1ª línea, `REVOKE … FROM public, anon, authenticated` + `GRANT EXECUTE TO authenticated`.
- Front: patrón `registerView`; estado/cleanup vía `T.registerCleanup`; `T.escapeHtml` en todo dato; `T.state.tienda` (tienda del dueño), `T.supabase()`, `T.toast`. Sin tocar storefront ni otras views.
- Umbrales NO por RPC/EF nueva → por `sb.from('tiendas').update({...}).eq('id', tienda.id)` (camino RLS existente, PASO 0.2).
- Semáforo: rojo `.ta-pill--danger` (quiebre/ruptura), ámbar `.ta-pill--warn` (sobrestock), gris (`sin_ventas`, color `--ta-text-mut`), `normal` sin badge. `datos_insuficientes` = notita, no alarma.
- Copy español, sin emojis. Easypanel deploy MANUAL (Jorge "Implementar"); verificar live byte-idéntico antes del OK visual.
- Período header = override de sesión (`p_periodo`); `inv_periodo_default_dias` solo en Ajustes. Al cargar, período activo = default de la tienda.

---

## File Structure

- Create: `supabase/migrations/20260621180000_inv_variantes_rpc.sql` — RPC `inventario_variantes`.
- Create: `supabase/migrations/20260621180100_inv_umbrales_check.sql` — CHECK de umbrales en `tiendas`.
- Create: `iapanel/tienda/admin/views/inventario.js` — el módulo completo (shell + 4 tabs + drill-down + ajustes).
- Modify: `iapanel/tienda/admin/admin.js:35` — agregar `'inventario'` a `ROUTES`.
- Modify: `iapanel/tienda/admin/index.html` — nav link `data-route="inventario"` + `<script src="views/inventario.js?v=1">`.
- Modify: `iapanel/tienda/admin/admin.css` — clases `.ta-inv-*` (badge gris, tabs, secciones, drill-down) si los tokens existentes no alcanzan.
- Spec: `docs/SUPERPOWERS/specs/2026-06-21-inventario-fase1b-ui-design.md`.

> "test" front = `node --check` + assert funcional (datos del front == RPC, vía MCP execute_sql impersonando dueño) + curl del asset live + **OK visual de Jorge** en el gate. NO se aplica/deploya nada hasta el gate del plan.

---

### Task 1: BD — RPC `inventario_variantes` + CHECK de umbrales

**Files:**
- Create: `supabase/migrations/20260621180000_inv_variantes_rpc.sql`
- Create: `supabase/migrations/20260621180100_inv_umbrales_check.sql`

**Interfaces:**
- Produces: `inventario_variantes(p_tienda_id uuid, p_producto_id uuid)` → TABLE(`variante_id uuid, color text, talla text, sku text, stock int, reservado int, disponible int, foto_color_url text`). CHECK `chk_inv_umbrales` en `tiendas`.

- [ ] **Step 1: Assert previo** (MCP `execute_sql`):
```sql
select (select count(*) from pg_proc where proname='inventario_variantes') as rpc,
       (select count(*) from pg_constraint where conname='chk_inv_umbrales') as chk;
```
Expected ANTES: `rpc=0, chk=0`.

- [ ] **Step 2: Escribir la migración de la RPC** (`20260621180000_inv_variantes_rpc.sql`):
```sql
create or replace function public.inventario_variantes(p_tienda_id uuid, p_producto_id uuid)
returns table(variante_id uuid, color text, talla text, sku text,
              stock int, reservado int, disponible int, foto_color_url text)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  return query
  select pv.id, pv.color, pv.talla, pv.sku,
         pv.stock, pv.reservado, (pv.stock - pv.reservado)::int as disponible, pv.foto_color_url
  from public.producto_variantes pv
  join public.productos p on p.id = pv.producto_id
  where p.id = p_producto_id and p.tienda_id = p_tienda_id
  order by pv.color nulls first, pv.talla nulls first, pv.sku;
end;
$function$;

revoke all on function public.inventario_variantes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.inventario_variantes(uuid, uuid) to authenticated;
```

- [ ] **Step 3: Escribir la migración del CHECK** (`20260621180100_inv_umbrales_check.sql`):
```sql
alter table public.tiendas add constraint chk_inv_umbrales
  check (inv_umbral_ruptura_dias >= 1
         and inv_umbral_sobrestock_dias > inv_umbral_ruptura_dias
         and inv_periodo_default_dias between 1 and 60);
```

- [ ] **Step 4: Aplicar a test** — MCP `apply_migration` para cada una; alinear versión:
```sql
update supabase_migrations.schema_migrations set version='20260621180000' where name='inv_variantes_rpc' and version<>'20260621180000';
update supabase_migrations.schema_migrations set version='20260621180100' where name='inv_umbrales_check' and version<>'20260621180100';
```

- [ ] **Step 5: Assert post** (impersonando dueño; RPC corre y CHECK existe):
```sql
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub','4bd6d4eb-65df-4225-8dde-1883d00bb32e')::text, true);
  perform count(*) from inventario_variantes('69915581-c0d1-4961-ab76-80dacde9169a', (select id from productos where tienda_id='69915581-c0d1-4961-ab76-80dacde9169a' limit 1));
end $$;
select has_function_privilege('authenticated','public.inventario_variantes(uuid,uuid)','execute') as auth_ok,
       has_function_privilege('anon','public.inventario_variantes(uuid,uuid)','execute') as anon_ok,
       (select count(*) from pg_constraint where conname='chk_inv_umbrales') as chk;
```
Expected: RPC corre sin error; `auth_ok=true, anon_ok=false, chk=1`.

- [ ] **Step 6: Assert CHECK rechaza inválido** (rollback):
```sql
do $$ begin
  update public.tiendas set inv_umbral_sobrestock_dias=5, inv_umbral_ruptura_dias=15 where id='69915581-c0d1-4961-ab76-80dacde9169a';
  raise exception 'CHECK NO disparó (MAL)';
exception when check_violation then raise notice 'CHECK ok'; when others then raise notice 'otro: %', sqlerrm; end $$;
```
Expected: `check_violation` (sobrestock<ruptura rechazado). No persiste.

- [ ] **Step 7: Commit**
```bash
git add supabase/migrations/20260621180000_inv_variantes_rpc.sql supabase/migrations/20260621180100_inv_umbrales_check.sql
git commit -m "feat(inventario): RPC inventario_variantes (drill-down) + CHECK de umbrales (Fase 1b)"
```

---

### Task 2: Shell + GENERAL + drill-down + paginación  →  GATE VISUAL DE JORGE

**Files:**
- Create: `iapanel/tienda/admin/views/inventario.js`
- Modify: `iapanel/tienda/admin/admin.js:35` (ROUTES), `iapanel/tienda/admin/index.html` (nav + script), `iapanel/tienda/admin/admin.css` (clases `.ta-inv-*`).

**Interfaces:**
- Consumes: `T.registerView`, `T.supabase()`, `T.state.tienda`, `T.escapeHtml`, `T.toast`, `T.registerCleanup`; RPC `inventario_resumen` (1a), `inventario_variantes` (Task 1).
- Produces: vista `'inventario'` con estado de módulo `invState = { periodo, filtros:{proveedor_id,categoria_id,buscar}, tab:'general', page:{limit:25,offset:0}, drillCache:{} }`.

- [ ] **Step 1: Wire del route** — admin.js:35, agregar `'inventario'` al array ROUTES:
```js
const ROUTES = ['', 'productos', 'categorias', 'crm', 'pedidos', 'resenas', 'configuracion', 'legales', 'vista-previa', 'editor', 'fotos-ia', 'inventario'];
```
index.html: nav link (junto a los demás `.ta-nav-link`) `'<a href="#/inventario" class="ta-nav-link" data-route="inventario"><span>Inventario</span></a>'` + `<script src="views/inventario.js?v=1"></script>` (en el bloque de scripts de views).

- [ ] **Step 2: Esqueleto del módulo** — `views/inventario.js` con el patrón whenReady/registerView (copiar el patrón de productos.js:99-111), `invState` inicial (período = `T.state.tienda.inv_periodo_default_dias`), `renderInventario()` que pinta header + tab bar + contenedor `#inv-content`, y despacha al tab activo. Sin tabs aún, solo el shell + GENERAL.

- [ ] **Step 3: Header compartido** — período (botones 30/60 + chip del período activo; resalta el que coincide con `invState.periodo`; si el default es custom, el chip lo muestra), filtros (select proveedor desde `sb.from('proveedores').select('id,nombre').eq('tienda_id',…)`, select categoría con padres/hijas desde `categorias`, input buscar debounced 300ms), engranaje "Ajustes" (placeholder, se cablea en Task 5). Cambiar período/filtro → `invState` + re-fetch del tab.

- [ ] **Step 4: GENERAL — fetch + render**:
```js
const { data, error } = await sb.rpc('inventario_resumen', {
  p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo, p_orden: 'referencia',
  p_clasificacion: null, p_proveedor_id: invState.filtros.proveedor_id, p_categoria_id: invState.filtros.categoria_id,
  p_buscar: invState.filtros.buscar || null, p_limit: invState.page.limit, p_offset: invState.page.offset });
```
Tabla densa (patrón tabla de productos.js): miniatura (`foto_principal_url` o placeholder `.ta-inv-thumb--empty`), referencia+nombre, stock, costo (`fmtCOP`), valor (`fmtCOP`), días de inventario con semáforo (`dias_inventario===0`→"Agotado"+danger, `null`→"—", número→badge según `clasificacion`), última venta (`fecha_ultima_venta` o "—"), proveedor. `datos_insuficientes` → notita. Paginación: `total_count` (1ª fila) → "N productos" + prev/next (`page.offset`).

- [ ] **Step 5: Semáforo helper**:
```js
function badgeClasif(clasif){
  if (clasif==='quiebre'||clasif==='ruptura') return 'ta-pill ta-pill--danger';
  if (clasif==='sobrestock') return 'ta-pill ta-pill--warn';
  if (clasif==='sin_ventas') return 'ta-pill ta-inv-pill--mut';
  return ''; // normal sin badge
}
```
CSS `.ta-inv-pill--mut { background: rgba(115,115,115,.14); color: var(--ta-text-mut); border:1px solid rgba(115,115,115,.3); }` en admin.css.

- [ ] **Step 6: Drill-down**:
```js
async function toggleDrill(productoId, rowEl){
  if (invState.drillCache[productoId]) { renderDrill(productoId, rowEl); return; }
  const { data, error } = await sb.rpc('inventario_variantes', { p_tienda_id: T.state.tienda.id, p_producto_id: productoId });
  if (error){ T.toast('No pudimos cargar las variantes: '+error.message,'error'); return; }
  invState.drillCache[productoId] = data || []; renderDrill(productoId, rowEl);
}
```
Clic en fila → expande una sub-fila con stock/reservado/disponible por color·talla (+ `foto_color_url` si hay). Lazy + cache por `producto_id`.

- [ ] **Step 7: Verificación funcional + sintaxis**:
```bash
node --check iapanel/tienda/admin/views/inventario.js   # SYNTAX OK
```
Assert (MCP, impersonando dueño): que la suma de `inventario_variantes` (stock) de una referencia == su `stock_total` en `inventario_resumen`. Que `total_count` == nº de filas del set.

- [ ] **Step 8: Deploy a test + commit + GATE VISUAL**
```bash
git add iapanel/tienda/admin/views/inventario.js iapanel/tienda/admin/admin.js iapanel/tienda/admin/index.html iapanel/tienda/admin/admin.css
git commit -m "feat(inventario): shell + tab GENERAL + drill-down + paginacion (Fase 1b)"
```
Jorge da "Implementar" en Easypanel → curl `https://aimma.com.co/iapanel/tienda/admin/views/inventario.js?cb=$(date +%s)` byte-idéntico al commit → **OK VISUAL de Jorge sobre shell + GENERAL + drill-down**. NO seguir a Task 3 sin ese OK.

---

### Task 3: Tabs SOBRESTOCK & RUPTURA + SIN VENTAS

**Files:** Modify `iapanel/tienda/admin/views/inventario.js` (+ admin.css si hace falta).

**Interfaces:** Consume `inventario_resumen` (1a), `badgeClasif`, drill-down (Task 2).

- [ ] **Step 1: Tab SOBRESTOCK & RUPTURA (NO pagina)** — una llamada:
```js
const { data } = await sb.rpc('inventario_resumen', { p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo,
  p_orden: 'dias_asc', p_clasificacion: ['quiebre','ruptura','sobrestock'],
  p_proveedor_id: invState.filtros.proveedor_id, p_categoria_id: invState.filtros.categoria_id,
  p_buscar: invState.filtros.buscar || null, p_limit: null, p_offset: 0 });
const reponer = data.filter(r => r.clasificacion==='quiebre' || r.clasificacion==='ruptura');
const liquidar = data.filter(r => r.clasificacion==='sobrestock');
```
Render dos secciones: **Reponer** (reponer, ya en dias_asc) y **Liquidar** (liquidar). Cada fila con semáforo + drill-down. Vacío por sección si corresponde.

- [ ] **Step 2: Tab SIN VENTAS (pagina)**:
```js
const { data } = await sb.rpc('inventario_resumen', { p_tienda_id: T.state.tienda.id, p_periodo: invState.periodo,
  p_orden: 'valor', p_clasificacion: ['sin_ventas'], p_proveedor_id: invState.filtros.proveedor_id,
  p_categoria_id: invState.filtros.categoria_id, p_buscar: invState.filtros.buscar || null,
  p_limit: invState.page.limit, p_offset: invState.page.offset });
```
Tabla por valor desc + columna "días desde última venta" (de `fecha_ultima_venta`; "nunca" si NULL) + valor. Paginación igual a GENERAL. Drill-down igual.

- [ ] **Step 3: Verificación**:
```bash
node --check iapanel/tienda/admin/views/inventario.js
```
Assert (MCP): el split Reponer/Liquidar == filtrar la RPC por clasificación; SIN VENTAS == clasificación `sin_ventas` ordenado por valor.

- [ ] **Step 4: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js iapanel/tienda/admin/admin.css
git commit -m "feat(inventario): tabs Sobrestock&Ruptura (Reponer/Liquidar) + Sin Ventas (Fase 1b)"
```

---

### Task 4: Tab KARDEX

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`.

**Interfaces:** Consume `inventario_kardex` (1a). Estado `invState.kardex = { ref:null, producto_id:null, variante_id:null, desde:null, hasta:null }`.

- [ ] **Step 1: Selector de referencia** — input/búsqueda que lista productos de la tienda (`sb.from('productos').select('id,referencia,nombre').eq('tienda_id',…).ilike('referencia', …)`); al elegir → `invState.kardex.producto_id`.

- [ ] **Step 2: Fetch + render del kardex**:
```js
const { data } = await sb.rpc('inventario_kardex', { p_tienda_id: T.state.tienda.id,
  p_producto_id: invState.kardex.producto_id, p_variante_id: invState.kardex.variante_id,
  p_desde: invState.kardex.desde, p_hasta: invState.kardex.hasta, p_limit: 200, p_offset: 0 });
```
Tabla: fecha · tipo · entrada(+) · salida(−) · saldo_acumulado · costo unit · costo saldo. Date-picker de rango (`desde`/`hasta` → re-fetch; filtra por fecha) + select opcional de variante (de `inventario_variantes` del producto elegido).

- [ ] **Step 3: Link "ver kardex" desde drill-down (si trivial)** — botón en cada variante del drill-down que setea `invState.kardex = {producto_id, variante_id}` + `invState.tab='kardex'` + re-render. Si complica, diferir (el selector del tab es el MVP).

- [ ] **Step 4: Verificación** — `node --check`; assert (MCP): kardex de una referencia con rango de fecha real devuelve los movimientos esperados, `saldo_acumulado` por variante == stock real.

- [ ] **Step 5: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js
git commit -m "feat(inventario): tab Kardex (selector + date-picker + variante) (Fase 1b)"
```

---

### Task 5: Ajustes inline de umbrales

**Files:** Modify `iapanel/tienda/admin/views/inventario.js` (+ admin.css).

**Interfaces:** `sb.from('tiendas').update(...)` (camino RLS existente); re-fetch del tab activo.

- [ ] **Step 1: Panel de Ajustes** — el engranaje del header abre un panel/modal inline con 3 inputs number: `inv_umbral_ruptura_dias`, `inv_umbral_sobrestock_dias`, `inv_periodo_default_dias` (prellenados de `T.state.tienda`).

- [ ] **Step 2: Validación + guardado**:
```js
const ruptura = parseInt(...), sobre = parseInt(...), periodo = parseInt(...);
if (!(ruptura>=1)) return T.toast('Ruptura debe ser ≥ 1','error');
if (!(sobre>ruptura)) return T.toast('Sobrestock debe ser mayor que ruptura','error');
if (!(periodo>=1 && periodo<=60)) return T.toast('Período entre 1 y 60','error');
const { error } = await sb.from('tiendas').update({ inv_umbral_ruptura_dias:ruptura, inv_umbral_sobrestock_dias:sobre, inv_periodo_default_dias:periodo }).eq('id', T.state.tienda.id);
if (error){ T.toast('No pudimos guardar: '+error.message,'error'); return; }
Object.assign(T.state.tienda, { inv_umbral_ruptura_dias:ruptura, inv_umbral_sobrestock_dias:sobre, inv_periodo_default_dias:periodo });
T.toast('Umbrales actualizados','success');
// re-fetch del tab activo -> reclasificación en vivo
```

- [ ] **Step 3: Verificación (prueba clave)** — `node --check`; assert (MCP, impersonando dueño): UPDATE de un umbral → `inventario_resumen` re-clasifica la fila (igual que la prueba de 1a, pero ahora gatillada desde el front). El CHECK rechaza inválido (Task 1 step 6).

- [ ] **Step 4: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js iapanel/tienda/admin/admin.css
git commit -m "feat(inventario): ajustes inline de umbrales por tienda (Fase 1b)"
```

---

### Task 6: Gate de build final

**Files:** ninguno (verificación + deploy).

- [ ] **Step 1: Deploy completo a test** — Jorge "Implementar" en Easypanel; curl del `inventario.js` live byte-idéntico al HEAD de la branch.
- [ ] **Step 2: Asserts funcionales end-to-end** (MCP impersonando dueño): datos del front == RPCs en los 4 tabs; paginación (GENERAL/SIN VENTAS) correcta; drill-down suma == total; KARDEX por rango de fecha real; re-clasificación en vivo al editar umbral; seguridad (no-dueño → 'no autorizado' en `inventario_variantes`; anon sin execute).
- [ ] **Step 3: OK VISUAL de Jorge** sobre los 4 tabs + drill-down + ajustes.
- [ ] **Step 4: Merge** — con OK de Jorge: `git checkout main && git merge --no-ff feat/inv-fase1b-ui && git push origin main`. Memoria actualizada.

---

## Self-Review

**1. Spec coverage:** §2.1 RPC → Task 1; §2.2 CHECK → Task 1; §3 shell/header/semáforo/estados → Task 2; GENERAL → Task 2; SOBRESTOCK&RUPTURA (no pagina) + SIN VENTAS → Task 3; KARDEX → Task 4; Ajustes inline → Task 5; gate build (visual+funcional+seguridad+re-clasif) → Task 6 (+ checkpoints). ✓
**2. Placeholder scan:** los pasos de render de tabla referencian "el patrón de tabla de productos.js" en vez de reproducir 800 líneas de HTML — es referencia a un patrón establecido con columnas/clases/orden EXACTOS especificados, no un "implementar luego"; el contrato de datos (RPC calls + params + mapping de clasificación) está literal. El detalle visual fino lo cierra el OK visual de Jorge + /ui-ux-pro-max en build. El "ver kardex desde drill-down" (Task 4 step 3) es condicional explícito (si trivial), no un hueco.
**3. Type consistency:** firmas RPC idénticas entre Task 1 (def) y Tasks 2-5 (uso); `invState` con la misma forma en todas las tasks; `badgeClasif`/`toggleDrill` definidos en Task 2 y reusados. Clasificación ∈ {quiebre,sin_ventas,ruptura,sobrestock,normal}. ✓
