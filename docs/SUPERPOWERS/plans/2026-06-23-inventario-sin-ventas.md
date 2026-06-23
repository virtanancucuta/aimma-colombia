# Inventario · Tab SIN VENTAS · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps con checkbox.

**Goal:** Tab Sin ventas (capital muerto): lista de productos sin rotación en una ventana editable (30/45/60/90), con columnas Referencia · Última venta · Última ingreso · Capital parado, filtros del shell, drill por variante, ancho desktop.

**Architecture:** BD: subir cap de período 60→120 (resumen+variantes) + columna `fecha_ultimo_ingreso` en `inventario_resumen` (DROP+CREATE). Front: tab `sinventas` con ventana propia (`invState.sinventasPeriodo`), reúsa `inventario_resumen(p_clasificacion=['sin_ventas'])` + filtros del shell; vista compacta propia; drill via dispatcher.

**Tech Stack:** PL/pgSQL (MCP), JS vanilla TiendaIA, tokens `--ta-*`.

## Global Constraints
- Branch `feat/inv-1b-sinventas`; merge a main + Jorge Implementa; deploy-to-prod OFF.
- Cap período 120 (cubre 30/45/60/90). El CHECK del default de tienda sigue 1-60 (no se toca). GENERAL/S&R pasan ≤60.
- "Última ingreso" = `max(fecha) filter (tipo in entrada/saldo_inicial/ajuste)`. Filtros proveedor/categoría/subcategoría/buscar = del shell (ya existen). Orden valor desc. Sin RPC de totales (suma en cliente). Copy criollo, AA, sin emojis nuevos. Auditar /ui-ux-pro-max + /impeccable.

---

## File Structure
- Create: `supabase/migrations/20260623170000_inv_sin_ventas.sql`.
- Modify: `iapanel/tienda/admin/views/inventario.js` — estado, shell (ocultar período global en sinventas), routing, ventana, render sv, drill sv.
- Modify: `iapanel/tienda/admin/admin.css` — `.ta-inv-item--sv`/`.ta-inv-vrow--sv`/`.ta-inv-svhead` + ancho ≥1500 + mobile.
- Modify: `iapanel/tienda/admin/index.html` — bump css/js.

---

### Task 1: BD — cap 120 + columna fecha_ultimo_ingreso

**Files:** Create `supabase/migrations/20260623170000_inv_sin_ventas.sql`

**Interfaces:** `inventario_resumen(...)` gana columna `fecha_ultimo_ingreso timestamptz` y cap 120; `inventario_variantes(...)` cap 120.

- [ ] **Step 1: Migración**
```sql
-- inventario_variantes: solo subir cap 60 -> 120 (return type sin cambios)
-- (CREATE OR REPLACE reproduciendo la funcion de 20260621200000 con least(...,120))
-- ... [reproducir inventario_variantes(uuid,uuid[],int) cambiando 60->120] ...

-- inventario_resumen: agrega columna -> cambia RETURNS TABLE -> DROP + CREATE
drop function if exists public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int);
create or replace function public.inventario_resumen(
  p_tienda_id uuid, p_periodo int default null, p_orden text default null,
  p_clasificacion text[] default null, p_proveedor_id uuid default null,
  p_categoria_id uuid default null, p_buscar text default null,
  p_limit int default null, p_offset int default 0
)
returns table(
  producto_id uuid, referencia text, nombre text, foto_principal_url text,
  proveedor_id uuid, proveedor_nombre text, categoria_id uuid, categoria_nombre text,
  stock_total bigint, reservado_total bigint, stock_disponible bigint,
  costo_unitario numeric, valor_inventario numeric,
  unidades_vendidas bigint, dias_efectivos int, venta_diaria numeric, dias_inventario numeric,
  sin_ventas boolean, datos_insuficientes boolean,
  fecha_ultima_venta timestamptz, fecha_ingreso timestamptz, fecha_ultimo_ingreso timestamptz,
  clasificacion text, total_count bigint
)
language plpgsql security definer stable set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_periodo int; v_ruptura int; v_sobrestock int; v_orden text := coalesce(p_orden,'valor'); v_buscar text;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;
  select least(coalesce(p_periodo, t.inv_periodo_default_dias), 120),
         t.inv_umbral_ruptura_dias, t.inv_umbral_sobrestock_dias
    into v_periodo, v_ruptura, v_sobrestock from public.tiendas t where t.id = p_tienda_id;
  if v_periodo is null then raise exception 'tienda inexistente'; end if;
  if p_buscar is not null and length(trim(p_buscar)) > 0 then
    v_buscar := '%' || replace(replace(replace(p_buscar,'\','\\'),'%','\%'),'_','\_') || '%';
  end if;
  return query
  with base as (
    select p.id, p.referencia, p.nombre, p.foto_principal_url, p.costo, p.created_at,
           p.proveedor_id, prov.nombre as proveedor_nombre, p.categoria_id, cat.nombre as categoria_nombre
    from public.productos p
    left join public.proveedores prov on prov.id = p.proveedor_id
    left join public.categorias cat on cat.id = p.categoria_id
    where p.tienda_id = p_tienda_id
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
      and (p_categoria_id is null or p.categoria_id = p_categoria_id
           or p.categoria_id in (select c.id from public.categorias c where c.parent_id = p_categoria_id))
      and (v_buscar is null or p.referencia ilike v_buscar or p.nombre ilike v_buscar)
  ),
  stk as (
    select pv.producto_id, coalesce(sum(pv.stock),0)::bigint as stock_total, coalesce(sum(pv.reservado),0)::bigint as reservado_total
    from public.producto_variantes pv where pv.producto_id in (select id from base) group by pv.producto_id
  ),
  vta as (
    select im.producto_id,
      (-1 * coalesce(sum(im.cantidad) filter (where im.tipo in ('venta','devolucion') and im.created_at >= now() - make_interval(days => v_periodo)),0))::bigint as unidades_vendidas,
      max(im.fecha) filter (where im.tipo = 'venta') as fecha_ultima_venta,
      min(im.fecha) filter (where im.tipo in ('entrada','saldo_inicial')) as fecha_primera_entrada,
      max(im.fecha) filter (where im.tipo in ('entrada','saldo_inicial','ajuste')) as fecha_ultimo_ingreso
    from public.inventario_movimientos im where im.producto_id in (select id from base) group by im.producto_id
  ),
  metrics as (
    select b.id, b.referencia, b.nombre, b.foto_principal_url, b.proveedor_id, b.proveedor_nombre, b.categoria_id, b.categoria_nombre,
      coalesce(s.stock_total,0)::bigint as stock_total, coalesce(s.reservado_total,0)::bigint as reservado_total,
      coalesce(b.costo,0)::numeric as costo_unitario, (coalesce(s.stock_total,0)*coalesce(b.costo,0))::numeric as valor_inventario,
      coalesce(v.unidades_vendidas,0)::bigint as unidades_vendidas,
      least(v_periodo, greatest(1, (current_date - b.created_at::date)))::int as dias_efectivos,
      v.fecha_ultima_venta, coalesce(v.fecha_primera_entrada, b.created_at) as fecha_ingreso, v.fecha_ultimo_ingreso
    from base b left join stk s on s.producto_id=b.id left join vta v on v.producto_id=b.id
  ),
  computed as (
    select m.*,
      case when m.unidades_vendidas=0 then 0::numeric else m.unidades_vendidas::numeric/m.dias_efectivos end as venta_diaria,
      case when m.stock_total=0 then 0::numeric when m.unidades_vendidas=0 then null::numeric else m.stock_total::numeric/(m.unidades_vendidas::numeric/m.dias_efectivos) end as dias_inventario,
      (m.unidades_vendidas=0) as sin_ventas, (m.dias_efectivos<7) as datos_insuficientes
    from metrics m
  ),
  clasif as (
    select c.*, case when c.stock_total=0 then 'quiebre' when c.unidades_vendidas=0 then 'sin_ventas'
      when c.dias_efectivos>=7 and c.dias_inventario<v_ruptura then 'ruptura'
      when c.dias_efectivos>=7 and c.dias_inventario>v_sobrestock then 'sobrestock' else 'normal' end as clasificacion
    from computed c
  ),
  filtered as (select * from clasif where (p_clasificacion is null or clasif.clasificacion = any(p_clasificacion)))
  select f.id, f.referencia, f.nombre, f.foto_principal_url, f.proveedor_id, f.proveedor_nombre, f.categoria_id, f.categoria_nombre,
    f.stock_total, f.reservado_total, (f.stock_total-f.reservado_total)::bigint, f.costo_unitario, f.valor_inventario,
    f.unidades_vendidas, f.dias_efectivos, f.venta_diaria, f.dias_inventario, f.sin_ventas, f.datos_insuficientes,
    f.fecha_ultima_venta, f.fecha_ingreso, f.fecha_ultimo_ingreso, f.clasificacion, count(*) over()::bigint
  from filtered f
  order by
    case when v_orden='valor' then f.valor_inventario end desc nulls last,
    case when v_orden='valor_asc' then f.valor_inventario end asc nulls last,
    case when v_orden='cantidad_desc' then f.stock_total end desc nulls last,
    case when v_orden='cantidad_asc' then f.stock_total end asc nulls last,
    case when v_orden='unidades' then f.unidades_vendidas end desc nulls last,
    case when v_orden='dias_asc' then f.dias_inventario end asc nulls last,
    case when v_orden='dias_desc' then f.dias_inventario end desc nulls last,
    case when v_orden='referencia' then f.referencia end asc, f.referencia asc
  limit p_limit offset coalesce(p_offset,0);
end; $function$;
revoke all on function public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int) from public, anon, authenticated;
grant execute on function public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int) to authenticated;
```

- [ ] **Step 2: Aplicar a test** (MCP apply_migration, name `inv_sin_ventas`) + alinear versión a `20260623170000`.

- [ ] **Step 3: Verificar (impersonando dueño, rollback)**
```sql
do $$
declare v_t uuid:='69915581-c0d1-4961-ab76-80dacde9169a'; v_o uuid:='4bd6d4eb-65df-4225-8dde-1883d00bb32e'; r text:=''; rec record; n90 int; n60 int;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_o::text)::text, true);
  select count(*) into n60 from inventario_resumen(v_t,60,'valor',array['sin_ventas'],null,null,null,1000,0);
  -- 90 ya NO se capa a 60: v_periodo debe ser 90 (ventana mas amplia)
  select count(*) into n90 from inventario_resumen(v_t,90,'valor',array['sin_ventas'],null,null,null,1000,0);
  r := r||E'\nsin_ventas @60='||n60||'  @90='||n90||' (cap subido: 90 no se capa)';
  -- fecha_ultimo_ingreso (max) vs fecha_ingreso (min): ultimo >= primero
  select referencia, fecha_ingreso, fecha_ultimo_ingreso into rec from inventario_resumen(v_t,30,'valor',null,null,null,'009',1,0);
  r := r||E'\n009 primera='||rec.fecha_ingreso||' ultima='||rec.fecha_ultimo_ingreso||' ok='||(rec.fecha_ultimo_ingreso>=rec.fecha_ingreso);
  raise exception '%', r;
end $$;
```
Expected: 90 corre con ventana 90 (v_periodo=90); fecha_ultimo_ingreso ≥ fecha_ingreso.

- [ ] **Step 4: Static** — `select pg_get_function_result(oid) ilike '%fecha_ultimo_ingreso%' from pg_proc where proname='inventario_resumen'` = true; grants authenticated/anon OK; cap 120 en ambas funciones.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260623170000_inv_sin_ventas.sql
git commit -m "feat(inventario): cap periodo 60->120 + columna fecha_ultimo_ingreso en inventario_resumen (Sin Ventas Task 1)"
```

---

### Task 2: Front — tab Sin Ventas

**Files:** Modify `iapanel/tienda/admin/views/inventario.js`

- [ ] **Step 1: Estado** — `initState`: `sinventasPeriodo: 30,` y `sinventas: null,`.

- [ ] **Step 2: Shell** — ocultar el toggle global de período cuando `invState.tab === 'sinventas'`:
```js
            (invState.tab !== 'sinventas' ? ('<span style="color:var(--ta-text-soft);font-size:13px;">Ventas de los últimos</span>' + btn(30) + btn(60) + chip + '<span style="color:var(--ta-text-soft);font-size:13px;">días</span>') : '') +
```
(Reemplaza el bloque actual período del header por este condicional.)

- [ ] **Step 3: Routing** — en `renderActiveTab`: `if (invState.tab === 'sinventas') { fetchAndRenderSinVentas(cont); return; }`.

- [ ] **Step 4: Helpers + fetch + render** (agregar tras `renderAccion`):
```js
  function haceTxt(fecha) {
    if (!fecha) return '—';
    const ms = window.__nowInv ? (window.__nowInv - new Date(fecha)) : (new Date(new Date().toISOString()) - new Date(fecha));
    const d = Math.max(0, Math.floor(ms / 86400000));
    return d === 0 ? 'hoy' : 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
  async function fetchAndRenderSinVentas(cont) {
    const T = window.TiendaIA, sb = T.supabase();
    cont.innerHTML = loadingCard();
    try {
      const { data, error } = await sb.rpc('inventario_resumen', {
        p_tienda_id: T.state.tienda.id, p_periodo: invState.sinventasPeriodo, p_orden: 'valor',
        p_clasificacion: ['sin_ventas'],
        p_proveedor_id: invState.filtros.proveedor_id || null,
        p_categoria_id: invState.filtros.categoria_id || null,
        p_buscar: invState.filtros.buscar || null, p_limit: null, p_offset: 0,
      });
      if (error) { cont.innerHTML = errorCard(error.message); return; }
      invState.sinventas = { rows: data || [] };
      renderSinVentas(cont);
    } catch (e) { cont.innerHTML = errorCard(e.message || String(e)); }
  }
  function filaSinVentas(r) {
    const T = window.TiendaIA;
    const abierto = !!invState.drillOpen[r.producto_id];
    const foto = r.foto_principal_url ? '<img class="ta-inv-athumb" src="' + T.escapeHtml(r.foto_principal_url) + '" alt="">' : '<div class="ta-inv-athumb ta-inv-athumb--empty">📦</div>';
    return '<div class="ta-inv-item ta-inv-item--sv" data-prod="' + T.escapeHtml(r.producto_id) + '" data-open="' + (abierto ? '1' : '0') + '">' +
      '<span class="ta-inv-chevron" aria-hidden="true">▸</span>' +
      '<div class="ta-inv-aref">' + foto + '<div class="ta-inv-aref__txt"><strong>' + T.escapeHtml(r.referencia) + '</strong><span>' + T.escapeHtml(r.nombre || '') + '</span></div></div>' +
      '<div class="ta-inv-svcell"><span class="ta-inv-cell__label">Última venta</span>' + (r.fecha_ultima_venta ? haceTxt(r.fecha_ultima_venta) : 'Nunca vendido') + '</div>' +
      '<div class="ta-inv-svcell"><span class="ta-inv-cell__label">Último ingreso</span>' + haceTxt(r.fecha_ultimo_ingreso) + '</div>' +
      '<div class="ta-inv-svcap"><span class="ta-inv-cell__label">Capital parado</span><b>' + fmtCOP(Number(r.valor_inventario || 0)) + '</b></div>' +
    '</div>';
  }
  function filaDrillSinVentas(productoId) {
    const T = window.TiendaIA;
    const vs = invState.drillCache[productoId];
    const padre = ((invState.sinventas && invState.sinventas.rows) || []).find(x => x.producto_id === productoId) || {};
    const costo = padre.costo_unitario;
    const msg = (t) => '<div class="ta-inv-vrow ta-inv-vrow--sv ta-inv-vrow--msg"><span></span><div class="ta-inv-aref" style="color:var(--ta-text-mut);font-size:12px;">' + t + '</div></div>';
    if (!vs) return msg('Cargando variantes…');
    if (!vs.length) return msg('Sin variantes.');
    return vs.map(v => {
      const etiqueta = [v.color, v.talla].filter(Boolean).join(' · ') || (v.sku || '—');
      return '<div class="ta-inv-vrow ta-inv-vrow--sv">' +
        '<span class="ta-inv-vmark" aria-hidden="true"></span>' +
        '<div class="ta-inv-aref ta-inv-aref--v"><strong>' + T.escapeHtml(etiqueta) + '</strong> <code>' + T.escapeHtml(v.sku || '') + '</code></div>' +
        '<div class="ta-inv-svcell num"><span class="ta-inv-cell__label">Stock</span>' + Number(v.stock) + '</div>' +
        '<div class="ta-inv-svcap"><span class="ta-inv-cell__label">Capital</span>' + fmtCOP(Number(v.stock) * Number(costo || 0)) + '</div>' +
      '</div>';
    }).join('');
  }
  function renderSinVentas(cont) {
    const rows = invState.sinventas.rows;
    const cap = rows.reduce((s, r) => s + Number(r.valor_inventario || 0), 0);
    const per = invState.sinventasPeriodo;
    const seg = (n) => '<button type="button" class="ta-btn inv-svper' + (per === n ? ' ta-btn--primary' : '') + '" data-per="' + n + '">' + n + '</button>';
    const ventana = '<div class="ta-inv-svwin"><span style="color:var(--ta-text-soft);font-size:13px;">Ventana de venta:</span>' + seg(30) + seg(45) + seg(60) + seg(90) + '<span style="color:var(--ta-text-soft);font-size:13px;">días</span></div>';
    let body;
    if (!rows.length) {
      body = '<div class="ta-card"><div class="ta-empty" style="padding:28px 16px;"><p class="ta-empty__text">Todo tu stock está rotando. Sin capital muerto en esta ventana.</p></div></div>';
    } else {
      let filas = '';
      rows.forEach(r => { filas += filaSinVentas(r); if (invState.drillOpen[r.producto_id]) filas += drillHtml(r.producto_id); });
      body = '<div class="ta-card" style="padding:0;overflow:hidden;"><div class="ta-inv-list ta-inv-list--sv">' +
        '<div class="ta-inv-svhead"><span></span><span>Referencia</span><span>Última venta</span><span>Último ingreso</span><span style="text-align:right;">Capital parado</span></div>' +
        filas + '</div></div>';
    }
    cont.innerHTML = ventana +
      '<p class="ta-inv-secc__sub">' + fmtCOP(cap) + ' parados en ' + rows.length + ' producto(s) sin rotación · ventana de ' + per + ' días.</p>' +
      body;
    cont.querySelectorAll('.inv-svper').forEach(b => b.addEventListener('click', () => {
      const n = parseInt(b.getAttribute('data-per'), 10);
      if (invState.sinventasPeriodo === n) return;
      invState.sinventasPeriodo = n; invState.sinventas = null; invState.drillCache = {}; invState.drillOpen = {};
      fetchAndRenderSinVentas(cont);
    }));
    wireGeneral(cont);
  }
```

- [ ] **Step 5: drillHtml dispatcher** — agregar rama sv:
```js
  function drillHtml(productoId) {
    if (invState.tab === 'accion') return filaDrillAccion(productoId);
    if (invState.tab === 'sinventas') return filaDrillSinVentas(productoId);
    return filaDrill(productoId);
  }
```

- [ ] **Step 6: Verificar** — `node --check`.

- [ ] **Step 7: Commit**
```bash
git add iapanel/tienda/admin/views/inventario.js
git commit -m "feat(inventario): tab Sin Ventas (capital muerto) — ventana 30/45/60/90 + ultima venta/ingreso + capital (Task 2)"
```

---

### Task 3: CSS + bump + merge

- [ ] **Step 1: CSS** (`admin.css`, zona inventario):
```css
/* Tab Sin Ventas: vista compacta (Referencia · Última venta · Último ingreso · Capital parado) */
.ta-inv-svwin { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; }
.ta-inv-svhead, .ta-inv-item.ta-inv-item--sv, .ta-inv-vrow.ta-inv-vrow--sv {
  grid-template-columns: 26px minmax(160px,2fr) minmax(120px,1fr) minmax(120px,1fr) minmax(130px,1fr);
}
.ta-inv-svhead { display:grid; align-items:center; gap:0 12px; padding:0 12px 8px; font-size:11px; text-transform:uppercase; letter-spacing:.03em; font-weight:600; color:var(--ta-text-soft); border-bottom:1px solid var(--ta-border); }
.ta-inv-svcell { font-size:13px; color:var(--ta-text-soft); min-width:0; }
.ta-inv-svcap { text-align:right; font-size:13px; min-width:0; }
.ta-inv-svcap b { font-size:15px; font-weight:700; color:var(--ta-text); }
@media (min-width:1500px) {
  .ta-main--inv-wide .ta-inv-svhead, .ta-main--inv-wide .ta-inv-item.ta-inv-item--sv, .ta-main--inv-wide .ta-inv-vrow.ta-inv-vrow--sv {
    grid-template-columns: 26px minmax(220px,2.2fr) minmax(150px,1fr) minmax(150px,1fr) minmax(170px,1.1fr);
  }
}
@media (max-width:760px) {
  .ta-inv-svhead { display:none; }
  .ta-inv-item.ta-inv-item--sv { grid-template-columns:1fr auto; grid-template-areas:"ref chev" "uv cap" "ui cap"; gap:6px 12px; padding:12px; margin-bottom:10px; border:1px solid var(--ta-border); border-radius:12px; background:var(--ta-surface); }
  .ta-inv-item--sv .ta-inv-chevron { grid-area:chev; justify-self:end; }
  .ta-inv-item--sv .ta-inv-aref { grid-area:ref; }
  .ta-inv-item--sv .ta-inv-svcell:nth-of-type(1) { grid-area:uv; }
  .ta-inv-item--sv .ta-inv-svcell:nth-of-type(2) { grid-area:ui; }
  .ta-inv-item--sv .ta-inv-svcap { grid-area:cap; align-self:center; }
  .ta-inv-vrow.ta-inv-vrow--sv { grid-template-columns:1fr auto; grid-template-areas:"ref ref" "stk cap"; gap:6px 12px; padding:10px 12px; background:var(--ta-bg-soft); border-bottom:1px solid var(--ta-border); }
  .ta-inv-vrow--sv .ta-inv-vmark { display:none; }
}
```
(Verificar tokens/contraste con /ui-ux-pro-max + /impeccable.)

- [ ] **Step 2: Bump** — `index.html` css + inventario.js (siguiente número).

- [ ] **Step 3: Verificar** — `node --check`.

- [ ] **Step 4: Commit + merge**
```bash
git add iapanel/tienda/admin/admin.css iapanel/tienda/admin/index.html
git commit -m "feat(inventario): estilos Sin Ventas + bump (Task 3)"
git checkout main && git merge --no-ff feat/inv-1b-sinventas -m "merge: Inventario tab Sin Ventas" && git push origin main
```

---

### Task 4: Gate
- [ ] Jorge Implementa; curl byte-idéntico (ojo caché Easypanel; verificar bump vivo).
- [ ] Funcional desktop+mobile (QAINV): tab Sin ventas lista los sin_ventas; ventana 30/45/60/90 cambia el set y el total; columnas (última venta "Nunca/hace N", último ingreso "hace N", capital); filtros proveedor/categoría/subcategoría/buscar afinan; drill por variante (stock+capital); vacío positivo; ancho desktop; sin Ordenar/Excel; toggle global de período oculto. **OK visual de Jorge.**

## Self-Review
- Cap 120 + fecha_ultimo_ingreso → Task 1; ventana propia/filtros/columnas/drill/ancho → Task 2-3; gate → Task 4. ✓
- Tipos: `invState.sinventas={rows}`, `invState.sinventasPeriodo`; `inventario_resumen` con nueva col `fecha_ultimo_ingreso`; `drillHtml` con rama sv → `filaDrillSinVentas`; `haceTxt(fecha)`. ✓
- **Nota build:** `haceTxt` usa `new Date()` (navegador, permitido — la restricción Date es de workflows). Filtros del shell se reúsan (no se ocultan en sinventas). El cap 120 no afecta GENERAL/S&R (pasan ≤60).
