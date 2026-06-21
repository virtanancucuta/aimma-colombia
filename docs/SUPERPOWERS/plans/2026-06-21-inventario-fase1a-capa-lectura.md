# Inventario Fase 1a — Capa de lectura (BD) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la capa de lectura en BD del módulo Inventario — config de umbrales por tienda + 2 RPCs (`inventario_resumen`, `inventario_kardex`) — para que las 4 vistas (1b) tengan de dónde leer, verificada contra data real.

**Architecture:** 2 migraciones SQL en `supabase/migrations/`. (1) columnas de umbrales en `tiendas`. (2) las 2 RPCs `SECURITY DEFINER STABLE`, ownership-checked, con `REVOKE`/`GRANT` explícito a `authenticated`. Se aplican a **test** (proyecto `aimma`, ref `rsmxklkxqsaptchcjszd`) vía MCP `apply_migration`, con el registro alineado al repo a mano. Verificación por SQL impersonando al rol `authenticated` del dueño. Sin UI. Deploy-to-prod OFF.

**Tech Stack:** PostgreSQL 17 (Supabase), PL/pgSQL, MCP Supabase (`apply_migration`/`execute_sql`).

## Global Constraints

- Branch `feat/inv-fase1a-lectura` (NUNCA main; gate de Jorge antes de merge).
- Migraciones con versión alineada al repo (post `20260620182000`). MCP auto-sella versión UTC → tras cada `apply_migration`, `UPDATE supabase_migrations.schema_migrations SET version='<archivo>'`.
- Lección M6: `REVOKE ... FROM public, anon, authenticated` **explícito** + `GRANT EXECUTE ... TO authenticated`. Sin GRANT directo a tablas.
- Ambas RPCs: `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, dueño (`tienda_ia_es_dueno`) en la 1ª línea → si no, `raise exception 'no autorizado'`.
- Costeo/semántica confirmados: `venta = −qty`, `devolucion = +qty` → `unidades_vendidas = −1 × SUM(cantidad)` de venta+devolucion en período. `referencia` 1:1 con producto (fila = producto). Categorías 2 niveles (`parent_id`).
- Período cap a 60; default = `tiendas.inv_periodo_default_dias`.
- Copy/español, sin emojis. Deploy-to-prod OFF; respaldos `schema_migrations_bak_*` intactos.

---

## File Structure

- Create: `supabase/migrations/20260621170000_inv_fase1a_config_umbrales.sql` — 3 columnas en `tiendas`.
- Create: `supabase/migrations/20260621170100_inv_fase1a_rpcs_lectura.sql` — `inventario_resumen` + `inventario_kardex` + grants.
- Spec de referencia: `docs/SUPERPOWERS/specs/2026-06-21-inventario-fase1a-capa-lectura-design.md`.

> **Nota de ejecución:** "test" = assert SQL vía MCP `execute_sql`. "commit" = el archivo `.sql`. "aplicar" = MCP `apply_migration` + alinear versión. NO se aplica nada hasta el gate de Jorge sobre este plan.

---

### Task 1: Config — umbrales por tienda

**Files:**
- Create: `supabase/migrations/20260621170000_inv_fase1a_config_umbrales.sql`

**Interfaces:**
- Produces: `tiendas.inv_umbral_ruptura_dias` (int, def 15), `tiendas.inv_umbral_sobrestock_dias` (int, def 90), `tiendas.inv_periodo_default_dias` (int, def 30). Consumidas por las RPCs de Task 2.

- [ ] **Step 1: Assert previo (las columnas NO existen)** — vía MCP `execute_sql`:
```sql
select count(*) as faltan from (values ('inv_umbral_ruptura_dias'),('inv_umbral_sobrestock_dias'),('inv_periodo_default_dias')) v(c)
where not exists (select 1 from information_schema.columns where table_schema='public' and table_name='tiendas' and column_name=v.c);
```
Expected ANTES: `faltan = 3`.

- [ ] **Step 2: Escribir la migración**
```sql
-- Inventario Fase 1a — umbrales por tienda (mismo patron que mostrar_resenas_productos).
-- NOT NULL DEFAULT rellena las tiendas existentes automaticamente (backfill nativo PG).
alter table public.tiendas
  add column if not exists inv_umbral_ruptura_dias int not null default 15,
  add column if not exists inv_umbral_sobrestock_dias int not null default 90,
  add column if not exists inv_periodo_default_dias int not null default 30;
```

- [ ] **Step 3: Aplicar a test** — MCP `apply_migration(name='inv_fase1a_config_umbrales', query=<arriba>)`; luego alinear versión:
```sql
update supabase_migrations.schema_migrations set version='20260621170000'
  where name='inv_fase1a_config_umbrales' and version <> '20260621170000';
```

- [ ] **Step 4: Assert post (columnas existen + tiendas seedeadas 15/90/30)**:
```sql
select count(*) as tiendas_ok from public.tiendas
where inv_umbral_ruptura_dias=15 and inv_umbral_sobrestock_dias=90 and inv_periodo_default_dias=30;
select count(*) as tiendas_total from public.tiendas;
```
Expected: `tiendas_ok = tiendas_total` (todas con los defaults).

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260621170000_inv_fase1a_config_umbrales.sql
git commit -m "feat(inventario): umbrales de inventario por tienda (Fase 1a)"
```

---

### Task 2: RPC `inventario_resumen`

**Files:**
- Create: `supabase/migrations/20260621170100_inv_fase1a_rpcs_lectura.sql` (esta task escribe la 1ª función; Task 3 agrega la 2ª al MISMO archivo antes de aplicar).

**Interfaces:**
- Consumes: columnas de Task 1; `tienda_ia_es_dueno(uuid)`; tablas `productos`, `producto_variantes`, `inventario_movimientos`, `proveedores`, `categorias`.
- Produces: `inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int)` → TABLE con `producto_id, referencia, nombre, foto_principal_url, proveedor_id, proveedor_nombre, categoria_id, categoria_nombre, stock_total bigint, reservado_total bigint, stock_disponible bigint, costo_unitario numeric, valor_inventario numeric, unidades_vendidas bigint, dias_efectivos int, venta_diaria numeric, dias_inventario numeric, sin_ventas boolean, datos_insuficientes boolean, fecha_ultima_venta timestamptz, fecha_ingreso timestamptz, clasificacion text, total_count bigint`.

- [ ] **Step 1: Assert previo (la función NO existe)**:
```sql
select count(*) as existe from pg_proc where proname='inventario_resumen';
```
Expected ANTES: `existe = 0`.

- [ ] **Step 2: Escribir la función en el archivo de migración**
```sql
create or replace function public.inventario_resumen(
  p_tienda_id uuid,
  p_periodo int default null,
  p_orden text default null,
  p_clasificacion text[] default null,
  p_proveedor_id uuid default null,
  p_categoria_id uuid default null,
  p_buscar text default null,
  p_limit int default null,
  p_offset int default 0
)
returns table(
  producto_id uuid, referencia text, nombre text, foto_principal_url text,
  proveedor_id uuid, proveedor_nombre text, categoria_id uuid, categoria_nombre text,
  stock_total bigint, reservado_total bigint, stock_disponible bigint,
  costo_unitario numeric, valor_inventario numeric,
  unidades_vendidas bigint, dias_efectivos int, venta_diaria numeric, dias_inventario numeric,
  sin_ventas boolean, datos_insuficientes boolean,
  fecha_ultima_venta timestamptz, fecha_ingreso timestamptz,
  clasificacion text, total_count bigint
)
language plpgsql security definer stable set search_path to 'public'
as $function$
declare
  v_periodo int; v_ruptura int; v_sobrestock int;
  v_orden text := coalesce(p_orden, 'valor');
  v_buscar text;
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then
    raise exception 'no autorizado';
  end if;

  select least(coalesce(p_periodo, t.inv_periodo_default_dias), 60),
         t.inv_umbral_ruptura_dias, t.inv_umbral_sobrestock_dias
    into v_periodo, v_ruptura, v_sobrestock
    from public.tiendas t where t.id = p_tienda_id;
  if v_periodo is null then raise exception 'tienda inexistente'; end if;

  if p_buscar is not null and length(trim(p_buscar)) > 0 then
    v_buscar := '%' || replace(replace(replace(p_buscar, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with base as (
    select p.id, p.referencia, p.nombre, p.foto_principal_url, p.costo, p.created_at,
           p.proveedor_id, prov.nombre as proveedor_nombre,
           p.categoria_id, cat.nombre as categoria_nombre
    from public.productos p
    left join public.proveedores prov on prov.id = p.proveedor_id
    left join public.categorias cat on cat.id = p.categoria_id
    where p.tienda_id = p_tienda_id
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
      and (p_categoria_id is null
           or p.categoria_id = p_categoria_id
           or p.categoria_id in (select c.id from public.categorias c where c.parent_id = p_categoria_id))
      and (v_buscar is null or p.referencia ilike v_buscar or p.nombre ilike v_buscar)
  ),
  stk as (
    select pv.producto_id,
           coalesce(sum(pv.stock),0)::bigint as stock_total,
           coalesce(sum(pv.reservado),0)::bigint as reservado_total
    from public.producto_variantes pv
    where pv.producto_id in (select id from base)
    group by pv.producto_id
  ),
  vta as (
    select im.producto_id,
           (-1 * coalesce(sum(im.cantidad) filter (
              where im.tipo in ('venta','devolucion')
                and im.created_at >= now() - make_interval(days => v_periodo)
           ),0))::bigint as unidades_vendidas,
           max(im.fecha) filter (where im.tipo = 'venta') as fecha_ultima_venta,
           min(im.fecha) filter (where im.tipo in ('entrada','saldo_inicial')) as fecha_primera_entrada
    from public.inventario_movimientos im
    where im.producto_id in (select id from base)
    group by im.producto_id
  ),
  metrics as (
    select b.id, b.referencia, b.nombre, b.foto_principal_url,
           b.proveedor_id, b.proveedor_nombre, b.categoria_id, b.categoria_nombre,
           coalesce(s.stock_total,0)::bigint as stock_total,
           coalesce(s.reservado_total,0)::bigint as reservado_total,
           coalesce(b.costo,0)::numeric as costo_unitario,
           (coalesce(s.stock_total,0) * coalesce(b.costo,0))::numeric as valor_inventario,
           coalesce(v.unidades_vendidas,0)::bigint as unidades_vendidas,
           least(v_periodo, greatest(1, (current_date - b.created_at::date)))::int as dias_efectivos,
           v.fecha_ultima_venta,
           coalesce(v.fecha_primera_entrada, b.created_at) as fecha_ingreso
    from base b
    left join stk s on s.producto_id = b.id
    left join vta v on v.producto_id = b.id
  ),
  computed as (
    select m.*,
           case when m.unidades_vendidas = 0 then 0::numeric
                else m.unidades_vendidas::numeric / m.dias_efectivos end as venta_diaria,
           case when m.stock_total = 0 then 0::numeric
                when m.unidades_vendidas = 0 then null::numeric
                else m.stock_total::numeric / (m.unidades_vendidas::numeric / m.dias_efectivos)
           end as dias_inventario,
           (m.unidades_vendidas = 0) as sin_ventas,
           (m.dias_efectivos < 7) as datos_insuficientes
    from metrics m
  ),
  clasif as (
    select c.*,
      case
        when c.stock_total = 0 then 'quiebre'
        when c.unidades_vendidas = 0 then 'sin_ventas'
        when c.dias_efectivos >= 7 and c.dias_inventario < v_ruptura then 'ruptura'
        when c.dias_efectivos >= 7 and c.dias_inventario > v_sobrestock then 'sobrestock'
        else 'normal'
      end as clasificacion
    from computed c
  ),
  filtered as (
    select * from clasif
    where (p_clasificacion is null or clasificacion = any(p_clasificacion))
  )
  select
    f.id, f.referencia, f.nombre, f.foto_principal_url,
    f.proveedor_id, f.proveedor_nombre, f.categoria_id, f.categoria_nombre,
    f.stock_total, f.reservado_total, (f.stock_total - f.reservado_total)::bigint as stock_disponible,
    f.costo_unitario, f.valor_inventario,
    f.unidades_vendidas, f.dias_efectivos, f.venta_diaria, f.dias_inventario,
    f.sin_ventas, f.datos_insuficientes,
    f.fecha_ultima_venta, f.fecha_ingreso,
    f.clasificacion,
    count(*) over()::bigint as total_count
  from filtered f
  order by
    case when v_orden = 'valor' then f.valor_inventario end desc nulls last,
    case when v_orden = 'unidades' then f.unidades_vendidas end desc nulls last,
    case when v_orden = 'dias_asc' then f.dias_inventario end asc nulls last,
    case when v_orden = 'dias_desc' then f.dias_inventario end desc nulls last,
    case when v_orden = 'referencia' then f.referencia end asc,
    f.referencia asc
  limit p_limit offset coalesce(p_offset, 0);
end;
$function$;

revoke all on function public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int) from public, anon, authenticated;
grant execute on function public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int) to authenticated;
```

- [ ] **Step 3: (aplazado a Task 3)** No aplicar todavía — la migración incluye también `inventario_kardex`. Continuar en Task 3, aplicar ambas juntas.

---

### Task 3: RPC `inventario_kardex` + aplicar la migración

**Files:**
- Modify: `supabase/migrations/20260621170100_inv_fase1a_rpcs_lectura.sql` (append la 2ª función).

**Interfaces:**
- Produces: `inventario_kardex(uuid,uuid,uuid,date,date,int,int)` → TABLE `fecha timestamptz, tipo text, cantidad int, entrada int, salida int, costo_unitario numeric, costo_saldo numeric, saldo_acumulado bigint, color text, talla text, sku text, nota text, pedido_id uuid`.

- [ ] **Step 1: Assert previo**:
```sql
select count(*) as existe from pg_proc where proname='inventario_kardex';
```
Expected ANTES: `existe = 0`.

- [ ] **Step 2: Append la función al archivo de migración**
```sql
create or replace function public.inventario_kardex(
  p_tienda_id uuid,
  p_producto_id uuid default null,
  p_variante_id uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_limit int default 200,
  p_offset int default 0
)
returns table(
  fecha timestamptz, tipo text, cantidad int, entrada int, salida int,
  costo_unitario numeric, costo_saldo numeric, saldo_acumulado bigint,
  color text, talla text, sku text, nota text, pedido_id uuid
)
language plpgsql security definer stable set search_path to 'public'
as $function$
begin
  if not public.tienda_ia_es_dueno(p_tienda_id) then
    raise exception 'no autorizado';
  end if;

  return query
  with mov as (
    select im.id, im.fecha, im.tipo, im.cantidad, im.costo_unitario, im.costo_saldo,
           im.variante_id, im.nota, im.pedido_id, im.created_at,
           sum(im.cantidad) over (partition by im.variante_id order by im.created_at rows unbounded preceding) as saldo_acum
    from public.inventario_movimientos im
    where im.tienda_id = p_tienda_id
      and (p_producto_id is null or im.producto_id = p_producto_id)
      and (p_variante_id is null or im.variante_id = p_variante_id)
  )
  select
    m.fecha, m.tipo, m.cantidad,
    greatest(m.cantidad, 0)::int as entrada,
    greatest(-m.cantidad, 0)::int as salida,
    m.costo_unitario, m.costo_saldo,
    m.saldo_acum::bigint as saldo_acumulado,
    pv.color, pv.talla, pv.sku,
    m.nota, m.pedido_id
  from mov m
  left join public.producto_variantes pv on pv.id = m.variante_id
  where (p_desde is null or m.created_at::date >= p_desde)
    and (p_hasta is null or m.created_at::date <= p_hasta)
  order by m.created_at asc
  limit coalesce(p_limit, 200) offset coalesce(p_offset, 0);
end;
$function$;

revoke all on function public.inventario_kardex(uuid,uuid,uuid,date,date,int,int) from public, anon, authenticated;
grant execute on function public.inventario_kardex(uuid,uuid,uuid,date,date,int,int) to authenticated;
```

- [ ] **Step 3: Aplicar la migración a test** — MCP `apply_migration(name='inv_fase1a_rpcs_lectura', query=<archivo completo: ambas funciones + grants>)`; alinear versión:
```sql
update supabase_migrations.schema_migrations set version='20260621170100'
  where name='inv_fase1a_rpcs_lectura' and version <> '20260621170100';
```

- [ ] **Step 4: Assert post (ambas funciones existen + grants correctos)**:
```sql
select
  (select count(*) from pg_proc where proname='inventario_resumen') as resumen,
  (select count(*) from pg_proc where proname='inventario_kardex') as kardex,
  has_function_privilege('authenticated','public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int)','execute') as auth_resumen,
  has_function_privilege('anon','public.inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int)','execute') as anon_resumen,
  has_function_privilege('authenticated','public.inventario_kardex(uuid,uuid,uuid,date,date,int,int)','execute') as auth_kardex;
```
Expected: `resumen=1, kardex=1, auth_resumen=true, anon_resumen=false, auth_kardex=true`.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260621170100_inv_fase1a_rpcs_lectura.sql
git commit -m "feat(inventario): RPCs de lectura inventario_resumen + inventario_kardex (Fase 1a)"
```

---

### Task 4: Gate de verificación contra data real

**Files:** ninguno (verificación SQL vía MCP; sin cambios de archivos salvo que un assert revele un bug → volver a Task 2/3).

**Interfaces:** Consume las RPCs de Task 2/3 y la config de Task 1.

- [ ] **Step 1: Sembrar una venta REAL por el camino normal** — en transacción con rollback (no persiste), impersonando al dueño de la tienda de test (`tienda 69915581-c0d1-4961-ab76-80dacde9169a`, owner `4bd6d4eb-65df-4225-8dde-1883d00bb32e`). Crear un producto con stock vía `crear_producto_con_stock`, reservar (`reservar_stock_variante`), crear pedido + items, y transicionar a `cerrado` para disparar `pedido_stock_lifecycle` → movimiento `venta` en el kardex. Capturar los IDs. *(El detalle exacto del seed se redacta en ejecución según el contrato real de pedidos/pedido_items; el objetivo: ≥1 `venta` real en el kardex para ejercitar ventas→kardex.)*

- [ ] **Step 2: Asserts de métricas** (vía `execute_sql`, comparando `inventario_resumen` contra queries directas):
```sql
-- como dueño (set_config jwt.claims + role authenticated), dentro de la misma tx del seed:
-- a) stock_total/costo/valor de un producto = SUM directa
-- b) unidades_vendidas = qty del pedido sembrado (neto, signo C2)
-- c) venta_diaria = unidades_vendidas / dias_efectivos
-- d) dias_inventario = stock/venta_diaria ; NULL si velocidad 0 ; 0 si stock 0
-- e) clasificacion correcta en casos forzados (quiebre stock0, sin_ventas, ruptura, sobrestock)
-- f) total_count = nº de filas del set filtrado
```
Expected: cada assert `true`. Reportar números a Jorge.

- [ ] **Step 3: Assert kardex**:
```sql
-- saldo_acumulado por variante (última fila de cada variante) = stock real de esa variante;
-- orden por created_at; entrada/salida con signo correcto.
```
Expected: `saldo_acumulado(última) == producto_variantes.stock` por variante.

- [ ] **Step 4: Prueba clave — re-clasificación por tienda**:
```sql
-- 1) leer clasificacion de un producto con los umbrales actuales (15/90)
-- 2) UPDATE tiendas SET inv_umbral_sobrestock_dias = <bajo> (forzar sobrestock) y/o ruptura alto
-- 3) re-leer inventario_resumen → la clasificacion del producto CAMBIA sola
-- 4) restaurar umbrales (o rollback)
```
Expected: la fila se re-clasifica al cambiar el umbral de ESA tienda. Reportar el antes/después.

- [ ] **Step 5: Asserts de seguridad**:
```sql
-- no-dueño (jwt sub distinto) ejecutando inventario_resumen/inventario_kardex -> 'no autorizado'
-- anon no tiene EXECUTE (has_function_privilege anon = false, ya en Task 3)
-- sin GRANT directo de SELECT a las tablas para anon/authenticated mas alla de lo preexistente
```
Expected: no-dueño rechazado; anon sin execute.

- [ ] **Step 6: Reportar el gate a Jorge** — números de todos los asserts. **NO merge hasta su OK.** Tras el gate: merge a main + (1b: UI + control de umbrales en Configuración).

---

## Self-Review

**1. Spec coverage:**
- §2 config umbrales → Task 1. ✓
- §3 `inventario_resumen` (todas las columnas A/B/C/D, clasificación, guard <7, p_orden, total_count, filtros, categoría con hijas, ILIKE escapado) → Task 2. ✓
- §4 `inventario_kardex` (orden/saldo por created_at, saldo por variante, entrada/salida) → Task 3. ✓
- §5 seguridad (definer, owner 1ª línea, REVOKE/GRANT) → Tasks 2/3 + Task 4 step 5. ✓
- §6 verificación (seed venta real, asserts, re-clasificación, seguridad) → Task 4. ✓
- §7 proceso (branch, migraciones, versión alineada, deploy test, prod OFF) → Global Constraints + steps de aplicar. ✓

**2. Placeholder scan:** Task 4 steps 1-4 describen el seed/asserts en prosa + esqueleto SQL en vez de SQL literal completo, porque el seed depende del contrato exacto de `pedidos`/`pedido_items`/`reservar_stock_variante` que se confirma en ejecución (camino normal de venta). Es intencional y acotado (un solo punto), no un hueco de diseño; el resto del plan tiene SQL completo. Marcar como el único punto que se concreta en ejecución.

**3. Type consistency:** firmas de RPC idénticas entre Task 2/3 (definición) y Task 4 (uso) y los grants. `stock_total/reservado/stock_disponible/total_count/unidades_vendidas` = bigint; `costo/valor/venta_diaria/dias_inventario` = numeric; `dias_efectivos` = int. `clasificacion` ∈ {quiebre, sin_ventas, ruptura, sobrestock, normal}. ✓
