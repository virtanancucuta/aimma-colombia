# Inventario · Cierre Fase 1b · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps con checkbox. Trabajar POR BLOQUES con checkpoint entre cada uno — NO de un tiro.

**Goal:** Cerrar Fase 1b: Kardex A (ver-referencia) + B (filtro tipo) [front], y C (vistas Por proveedor / Por categoría) [2 RPCs + seed].

**Architecture:** Bloque 1 front-only sobre el panel del Kardex existente. Bloque 2 = 2 RPCs SECURITY DEFINER + seed QAINV + 2 tabs nuevos. D (Quién) diferido.

**Tech Stack:** JS vanilla TiendaIA, RPCs PL/pgSQL, SheetJS (loadXLSX/xlsxDescargar existentes).

## Global Constraints
- Branch `feat/inv-1b-cierre`; merge a main + Jorge Implementa; deploy-to-prod OFF.
- nunca-asumir-verificar: cada cifra agregada se verifica contra cálculo directo ANTES de UI. RPCs con candado completo (SECURITY DEFINER, dueño 1ª línea, REVOKE public/anon/authenticated + GRANT authenticated, `#variable_conflict use_column`). Asserts EJECUTAN la RPC. Registro de migración alineado al repo (repo=registro=desplegado).
- **Número sagrado: $8.000.000** (costo inventario total). El seed NO lo cambia. Las 3 cifras de C4 deben dar idéntico.
- Bump `?v=` de TODO archivo que cambie. Auditar columnas (head=filas) antes de avisar. /ui-ux-pro-max + /impeccable.

## File Structure
- Modify: `iapanel/tienda/admin/views/inventario.js` — A (filaKxRef botón + panel todas-mode), B (dropdown tipo), C (tabs + render + drill + Excel).
- Modify: `iapanel/tienda/admin/admin.css` — `.ta-inv-grp*` (vistas C) + bump.
- Modify: `iapanel/tienda/admin/index.html` — bump.
- Create: `supabase/migrations/20260623180000_inv_por_proveedor.sql`, `20260623180100_inv_por_categoria.sql`.

---

# BLOQUE 1 — Kardex A + B (front-only) — CHECKPOINT propio

### Task 1.A: Ver movimientos a nivel referencia (todas las variantes)

- [ ] **Step 1: Botón en `filaKxRef`** — agregar a la fila de referencia (antes del cierre del div), un botón que abre el panel en modo todas:
```js
    return '<div class="ta-inv-item ta-inv-item--kx" data-prod="' + T.escapeHtml(r.producto_id) + '" data-open="' + (abierto ? '1' : '0') + '">' +
      '<span class="ta-inv-chevron" aria-hidden="true">▸</span>' +
      '<div class="ta-inv-kxrefname"><strong>' + T.escapeHtml(r.referencia) + '</strong><span>' + T.escapeHtml(r.nombre || '') + '</span></div>' +
      '<button type="button" class="ta-btn ta-inv-kxver" data-prod="' + T.escapeHtml(r.producto_id) + '" data-var="" data-ref="' + T.escapeHtml(r.referencia) + '" data-vlabel="Todas las variantes">Ver movimientos</button>' +
    '</div>';
```
(El delegate `kardexVerDelegate` ya hace `stopPropagation` + `enterKardexPanel(prod, '', ref, 'Todas las variantes')`. `data-var=""` → varianteId vacío → todas.)

- [ ] **Step 2: Panel en modo todas — columnas** — en `renderKardexPanel`, calcular `const todas = !p.varianteId;` y construir filas/encabezado según `todas` (Variante sin Saldo / Saldo sin Variante). Reemplazar el bloque de filas+headRow:
```js
      const filas = visibles.map(m => {
        const ent = m.entrada > 0 ? '<span class="ta-inv-kxin">+' + m.entrada + '</span>' : '—';
        const sal = m.salida > 0 ? '<span class="ta-inv-kxout">-' + m.salida + '</span>' : '—';
        return '<div class="ta-inv-kxrow ' + (todas ? 'ta-inv-kxrow--var' : 'ta-inv-kxrow--saldo') + '">' +
          '<div class="ta-inv-kxcell"><span class="ta-inv-cell__label">Fecha</span>' + fmtFecha(m.fecha) + '</div>' +
          '<div class="ta-inv-kxcell"><span class="ta-inv-cell__label">Movimiento</span>' + tipoLabel(m) + '</div>' +
          '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Entrada</span>' + ent + '</div>' +
          '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Salida</span>' + sal + '</div>' +
          (todas
            ? '<div class="ta-inv-kxcell"><span class="ta-inv-cell__label">Variante</span>' + T.escapeHtml([m.color, m.talla].filter(Boolean).join(' · ') || (m.sku || '—')) + '</div>'
            : '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Saldo</span>' + Number(m.saldo_acumulado) + '</div>') +
          '<div class="ta-inv-kxcell num"><span class="ta-inv-cell__label">Costo unit.</span>' + (m.costo_unitario != null ? fmtCOP(Number(m.costo_unitario)) : '—') + '</div>' +
        '</div>';
      }).join('');
      const headRow = '<div class="ta-inv-kxhrow ' + (todas ? 'ta-inv-kxrow--var' : 'ta-inv-kxrow--saldo') + '"><span>Fecha</span><span>Movimiento</span><span style="text-align:right;">Entrada</span><span style="text-align:right;">Salida</span>' +
        (todas ? '<span>Variante</span>' : '<span style="text-align:right;">Saldo</span>') + '<span style="text-align:right;">Costo unit.</span></div>';
```
(`ta-inv-kxrow--var` ya existe en el CSS del Kardex original — 6 cols con Variante. El Excel del panel: incluir Variante o Saldo según `todas`.)

- [ ] **Step 3: Excel del panel según modo** — en `exportarExcelKardex`, header/filas condicionales por `!p.varianteId` (Variante vs Saldo). (Mismo patrón.)

- [ ] **Step 4: Verificar** `node --check`. **Commit** `feat(inventario): Kardex A — ver movimientos a nivel referencia (todas las variantes, columna Variante sin saldo)`

### Task 1.B: Filtro Tipo (Entradas/Salidas) en el panel

- [ ] **Step 1: Estado** — en `enterKardexPanel`, agregar `tipoFiltro: 'todos'` al objeto `panel`.
- [ ] **Step 2: Dropdown en controles** — en `renderKardexPanel`, dentro de `controls` (antes del Exportar):
```js
      '<select id="kx-tipo" class="ta-select" style="max-width:170px;">' +
        ['todos:Todos','entradas:Entradas','salidas:Salidas'].map(o => { const [v,l]=o.split(':'); return '<option value="'+v+'"'+(p.tipoFiltro===v?' selected':'')+'>'+l+'</option>'; }).join('') +
      '</select>' +
```
- [ ] **Step 3: Aplicar filtro** — al construir el cuerpo, derivar la lista filtrada antes del slice:
```js
      const filtradas = p.rows.filter(m => p.tipoFiltro === 'entradas' ? m.entrada > 0 : p.tipoFiltro === 'salidas' ? m.salida > 0 : true);
```
y usar `filtradas` para `!filtradas.length` (vacío), `filtradas.slice(0, p.shown)`, y el "Ver más" (`p.shown < filtradas.length`). El Excel exporta `filtradas` (respeta el filtro vigente).
- [ ] **Step 4: Wire** — `const tf = cont.querySelector('#kx-tipo'); if (tf) tf.addEventListener('change', (e)=>{ p.tipoFiltro = e.target.value; p.shown = 200; renderKardexPanel(cont); });` (no recarga BD; re-render sobre lo cargado).
- [ ] **Step 5: Verificar** `node --check`. Bump `inventario.js`. **Commit** `feat(inventario): Kardex B — filtro Tipo (Todos/Entradas/Salidas) en el panel`

### Task 1.GATE (Checkpoint Bloque 1)
- [ ] `node --check`; merge a main; Jorge Implementa; curl byte-idéntico + bump vivo.
- [ ] **Verificación funcional (QAINV, desktop+mobile):** QAINV-MV "Ver movimientos" (todas) → columna Variante, SIN Saldo, todas las variantes. Una variante → CON Saldo; **saldo de la fila más reciente == stock real**. Filtro Entradas → solo `entrada>0`; Salidas → solo `salida>0` (contar y cuadrar). Audit de columnas (head=filas). **OK visual de Jorge → NO avanzar a Bloque 2 sin OK.**

---

# BLOQUE 2 — Vistas C (Por proveedor / Por categoría) — CHECKPOINT propio

### Task 2.1: Seed QAINV (proveedores + árbol de categorías) — reversible

- [ ] **Step 1: Sembrar** (vía MCP execute_sql; nombres QAINV para cleanup; dejar productos sin grupo a propósito):
```sql
-- 3 proveedores QAINV
insert into proveedores (tienda_id, nombre) values
  ('69915581-c0d1-4961-ab76-80dacde9169a','QAINV Prov A'),
  ('69915581-c0d1-4961-ab76-80dacde9169a','QAINV Prov B'),
  ('69915581-c0d1-4961-ab76-80dacde9169a','QAINV Prov C');
-- árbol QAINV: 1 padre + 2 hijas
insert into categorias (tienda_id, nombre, slug, parent_id) values
  ('69915581-c0d1-4961-ab76-80dacde9169a','QAINV Calzado','qainv-calzado',null);
insert into categorias (tienda_id, nombre, slug, parent_id) values
  ('69915581-c0d1-4961-ab76-80dacde9169a','QAINV Tacon','qainv-tacon',(select id from categorias where slug='qainv-calzado' and tienda_id='69915581-c0d1-4961-ab76-80dacde9169a')),
  ('69915581-c0d1-4961-ab76-80dacde9169a','QAINV Bota','qainv-bota',(select id from categorias where slug='qainv-calzado' and tienda_id='69915581-c0d1-4961-ab76-80dacde9169a'));
-- asignar: ~1/3 a proveedores (dejar el resto sin proveedor); algunos a las 2 hijas + 1 directo al padre (dejar el resto sin categoría)
-- (usar referencia QAINV-* ordenadas; ver Step 2 para el reparto exacto, ejecutado con cuidado)
```
- [ ] **Step 2: Reparto** (UPDATE por referencia, distribuyendo entre A/B/C y entre Tacón/Bota/Calzado-directo; dejar varios null). Ejecutar y luego listar el reparto para confirmar grupos.
- [ ] **Step 3: VERIFICAR cuadre post-seed** — Σ `stock×costo` sigue **$8.000.000** (el seed no toca stock/costo). Si no da $8M, algo se rompió → PARAR.
```sql
select coalesce(sum(pv.stock*p.costo),0) as total from producto_variantes pv join productos p on p.id=pv.producto_id where p.tienda_id='69915581-c0d1-4961-ab76-80dacde9169a';
-- esperado 8000000
```

### Task 2.2: RPC `inventario_por_proveedor` (migración + candado + verificación)

- [ ] **Step 1: Migración** `supabase/migrations/20260623180000_inv_por_proveedor.sql`:
```sql
create or replace function public.inventario_por_proveedor(p_tienda_id uuid)
returns table(grupo_id uuid, grupo_nombre text, es_sin_grupo boolean, num_referencias bigint, cantidad bigint, costo_total numeric, pct numeric)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_total numeric;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select coalesce(sum(pv.stock * p.costo),0) into v_total
    from public.producto_variantes pv join public.productos p on p.id=pv.producto_id where p.tienda_id=p_tienda_id;
  return query
  with prod as (
    select p.id, p.proveedor_id, prov.nombre as proveedor_nombre, coalesce(p.costo,0) as costo,
           coalesce((select sum(pv.stock) from public.producto_variantes pv where pv.producto_id=p.id),0) as stock_total
    from public.productos p left join public.proveedores prov on prov.id=p.proveedor_id
    where p.tienda_id=p_tienda_id
  )
  select prod.proveedor_id, coalesce(prod.proveedor_nombre,'Sin proveedor'), (prod.proveedor_id is null),
    count(*)::bigint, coalesce(sum(prod.stock_total),0)::bigint, coalesce(sum(prod.stock_total*prod.costo),0)::numeric,
    case when v_total>0 then round((sum(prod.stock_total*prod.costo)/v_total*100)::numeric,1) else 0 end
  from prod group by prod.proveedor_id, prod.proveedor_nombre
  order by coalesce(sum(prod.stock_total*prod.costo),0) desc, (prod.proveedor_id is null);
end;
$function$;
revoke all on function public.inventario_por_proveedor(uuid) from public, anon, authenticated;
grant execute on function public.inventario_por_proveedor(uuid) to authenticated;
```
- [ ] **Step 2: Aplicar** (apply_migration) + realinear registro al nombre de archivo.
- [ ] **Step 3: Verificar EJECUTANDO** (impersonando dueño): Σ `costo_total` == 8000000; Σ `pct` ≈ 100; un grupo vs cálculo directo; no-dueño → excepción.

### Task 2.3: RPC `inventario_por_categoria` (rollup, migración + candado + verificación)

- [ ] **Step 1: Migración** `supabase/migrations/20260623180100_inv_por_categoria.sql`:
```sql
create or replace function public.inventario_por_categoria(p_tienda_id uuid, p_parent_id uuid default null)
returns table(grupo_id uuid, grupo_nombre text, es_sin_grupo boolean, num_referencias bigint, cantidad bigint, costo_total numeric, pct numeric)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_total numeric;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select coalesce(sum(pv.stock * p.costo),0) into v_total
    from public.producto_variantes pv join public.productos p on p.id=pv.producto_id where p.tienda_id=p_tienda_id;
  return query
  with prod as (
    select p.id, coalesce(p.costo,0) as costo,
           coalesce((select sum(pv.stock) from public.producto_variantes pv where pv.producto_id=p.id),0) as stock_total,
           cat.id as cat_id, cat.parent_id as cat_parent,
           coalesce(cat.parent_id, cat.id) as top_id   -- ancestro top-level (profundidad 2)
    from public.productos p left join public.categorias cat on cat.id = p.categoria_id
    where p.tienda_id=p_tienda_id
  ),
  agrupado as (
    -- MAIN: por ancestro top-level (rollup padre-incluye-hijas), cada producto UNA vez
    select prod.top_id as gid,
           (case when prod.top_id = p_parent_id then '(Directo en categoría)' else null end) as gname_drill,
           count(*)::bigint nref, sum(prod.stock_total)::bigint cant, sum(prod.stock_total*prod.costo)::numeric costo
    from prod where p_parent_id is null group by prod.top_id
    union all
    -- DRILL (p_parent_id=X): hijas directas de X + "(Directo en categoría)" para productos cuya cat = X
    select coalesce(prod.cat_id, p_parent_id) as gid,
           (case when prod.cat_id = p_parent_id then '(Directo en categoría)' else null end) as gname_drill,
           count(*)::bigint, sum(prod.stock_total)::bigint, sum(prod.stock_total*prod.costo)::numeric
    from prod where p_parent_id is not null and (prod.cat_id = p_parent_id or prod.cat_parent = p_parent_id)
    group by prod.cat_id
  )
  select a.gid,
    coalesce(a.gname_drill, c.nombre, 'Sin categoría'),
    (a.gid is null),
    a.nref, a.cant, a.costo,
    case when v_total>0 then round((a.costo/v_total*100)::numeric,1) else 0 end
  from agrupado a left join public.categorias c on c.id = a.gid
  order by a.costo desc, (a.gid is null);
end;
$function$;
revoke all on function public.inventario_por_categoria(uuid, uuid) from public, anon, authenticated;
grant execute on function public.inventario_por_categoria(uuid, uuid) to authenticated;
```
- [ ] **Step 2: Aplicar** + realinear registro.
- [ ] **Step 3: Verificar EJECUTANDO** (impersonando dueño): MAIN Σ `costo_total` == **8000000** (sin doble conteo); Σ `pct` ≈ 100; DRILL de QAINV Calzado: Σ filas == su `costo_total` del MAIN; un grupo vs cálculo directo; no-dueño → excepción; anon sin execute.

### Task 2.GATE-datos (Checkpoint duro ANTES de UI)
- [ ] Reportar a Jorge las 3 cifras: Σ proveedor, Σ categoría (MAIN), total GENERAL — **las 3 == $8.000.000**. Si alguna difiere → doble conteo, PARAR y reportar. **OK de Jorge a los números antes de tocar UI.**

### Task 2.4: UI — 2 tabs (Por proveedor / Por categoría) + Excel

- [ ] **Step 1: TABS** — agregar `{ id: 'proveedor', label: 'Por proveedor' }` y `{ id: 'categoria', label: 'Por categoría' }` al array `TABS`. En el shell, ocultar período/Ordenar (no aplican); el Exportar se muestra y despacha a los nuevos exports.
- [ ] **Step 2: Routing** — en `renderActiveTab`: `if (tab==='proveedor') fetchAndRenderGrupo(cont,'proveedor'); if (tab==='categoria') fetchAndRenderGrupo(cont,'categoria');`
- [ ] **Step 3: Render genérico de grupos** — `fetchAndRenderGrupo(cont, modo)`: llama `inventario_por_proveedor` o `inventario_por_categoria` (parent null), guarda en `invState.grupo`, renderiza tabla: grupo · # refs · cantidad · costo · **% con barra** (`.ta-inv-grp-bar` width=pct%). Fila clickeable → drill. Mobile = tarjetas. Fila TOTAL al pie ($8M).
- [ ] **Step 4: Drill** — proveedor: click → `inventario_resumen(p_proveedor_id=grupo_id)` → lista de referencias (reúsa `filaGeneral` o una fila compacta). Categoría: click en padre → `inventario_por_categoria(p_parent_id=grupo_id)` (subcategorías) → click en subcategoría → `inventario_resumen(p_categoria_id=sub_id)`. "Sin proveedor"/"Sin categoría" → drill con el filtro correspondiente (productos sin grupo: requiere que `inventario_resumen` soporte el caso — si no, listar por el set; **verificar** en build).
- [ ] **Step 5: Excel** — `exportarExcelGrupo(btn, modo)`: hoja con grupo·#refs·cantidad·costo·% + fila TOTAL. Números como número. Reúsa `xlsxDescargar`.
- [ ] **Step 6: CSS** `.ta-inv-grp*` (grilla propia, excluida del grid ancho de GENERAL vía flex o `:not()`). Bump css + js + index.
- [ ] **Step 7: Verificar** `node --check`; **Commit + merge** a main.

### Task 2.GATE-UI (Checkpoint final Bloque 2)
- [ ] Jorge Implementa; curl byte-idéntico + bump vivo. Funcional desktop+mobile: las 2 vistas, % con barra, drill, subcategoría drop, Excel (cuadra $8M), "Sin proveedor"/"Sin categoría" con data. Audit columnas. **OK visual de Jorge → cierra Fase 1b.** Luego: decidir cleanup seed QAINV-* (no borrar sin confirmar).

## Self-Review
- Bloque 1 A1/A2/B1 → Task 1.A/1.B (front, sin BD). Bloque 2 C1 seed → 2.1; C2 → 2.2; C3 rollup → 2.3; C4 verificación dura → 2.GATE-datos; C5 UI → 2.4. ✓
- Número sagrado $8M: verificado post-seed (2.1.3) + en cada RPC (2.2.3/2.3.3) + gate de datos (2.GATE-datos). ✓
- Reúsos: `renderKardexPanel`/`loadKardexPanelRows`/`exportarExcelKardex`/`kardexVerDelegate` (Bloque 1); `inventario_resumen` (drill, ya hace rollup categoría); `xlsxDescargar`/`loadXLSX`/`filaGeneral`/`toggleDrill` (Bloque 2). Candado RPC idéntico al de las RPCs 1a. ✓
- Riesgo rollup doble conteo: `top_id = coalesce(parent_id, id)` agrupa cada producto una vez por su ancestro; la verificación dura (Σ MAIN == $8M) lo caza. ✓
