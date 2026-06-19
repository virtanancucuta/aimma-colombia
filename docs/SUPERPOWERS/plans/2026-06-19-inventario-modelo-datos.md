# Inventario — Modelo de datos · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el modelo de datos del módulo Inventario (kardex como verdad contable + `producto_variantes.stock` como proyección), conectar las ventas al kardex y sembrar el saldo inicial — sin romper el motor de ventas del storefront.

**Architecture:** 2 tablas nuevas (`proveedores`, `inventario_movimientos`) + columna `productos.proveedor_id`. Una función `kardex_registrar()` hace el costeo promedio (por referencia) e inserta el movimiento; un trigger `AFTER INSERT` sincroniza `producto_variantes.stock`. El trigger de pedidos `pedido_stock_lifecycle()` pasa a registrar movimientos (venta/devolución) en vez de tocar stock a mano. Seed inicial cuadra el kardex con el stock vigente.

**Tech Stack:** PostgreSQL (Supabase proyecto `aimma`, ref `rsmxklkxqsaptchcjszd`). Migraciones SQL en `supabase/migrations/`. Verificación **server-side con `execute_sql` (MCP Supabase)** — el proyecto no usa framework de tests para migraciones; cada tarea cierra con verificación empírica + commit del archivo `.sql`.

> ⚠️ **Blast radius alto: esto corre sobre PRODUCCIÓN** (3 tiendas reales, pedidos reales). El cambio al lifecycle (Task 5) afecta el descuento de stock real. Cada migración se aplica y se **verifica server-side antes de avanzar**. La aplicación de migraciones a producción requiere el OK de Jorge (Tipo B de hecho, aunque el SQL lo preparo yo).
>
> **Convención de aplicación:** por cada migración (a) crear el archivo `.sql` en `supabase/migrations/`, (b) aplicar vía MCP `apply_migration` (project `rsmxklkxqsaptchcjszd`, name = nombre del archivo sin extensión, query = cuerpo), (c) verificar con `execute_sql`, (d) commit del `.sql` (solo ese archivo; **no `git add -A`** — hay trabajo de Fotos IA/fondo-estudio sin commitear).
>
> **Coordinación:** no se toca `admin/index.html` (Fotos IA en vuelo). Este plan es 100% backend/Supabase.

---

## Estructura de archivos (migraciones nuevas, en orden)

- `supabase/migrations/20260619120000_inv_proveedores.sql` — tabla `proveedores` + `productos.proveedor_id` + RLS.
- `supabase/migrations/20260619120100_inv_movimientos.sql` — tabla `inventario_movimientos` + índices + RLS.
- `supabase/migrations/20260619120200_inv_kardex_registrar.sql` — función `kardex_registrar()` + función/trigger `inv_mov_sync_stock`.
- `supabase/migrations/20260619120300_inv_seed_saldo_inicial.sql` — seed (saldo inicial, con el trigger de sync deshabilitado).
- `supabase/migrations/20260619120400_inv_lifecycle_kardex.sql` — reemplazo de `pedido_stock_lifecycle()` (ventas → kardex).

(Los timestamps son secuenciales y posteriores a la última migración del repo; ajustarlos solo si chocan con migraciones nuevas que entren antes.)

Helpers existentes reutilizados (verificados): `tienda_ia_es_dueno(uuid)`, `is_admin_or_cofounder()`, `auth.uid()`.

---

## Task 1: Tabla `proveedores` + `productos.proveedor_id`

**Files:** Create `supabase/migrations/20260619120000_inv_proveedores.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 20260619120000_inv_proveedores — proveedores por tienda + FK opcional en productos.
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  nombre text not null,
  telefono text,
  created_at timestamptz not null default now()
);
create index if not exists idx_proveedores_tienda on public.proveedores(tienda_id);

alter table public.productos
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;
create index if not exists idx_productos_proveedor on public.productos(proveedor_id);

alter table public.proveedores enable row level security;

create policy proveedores_select_dueno on public.proveedores
  for select to authenticated
  using (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder());

create policy proveedores_write_dueno on public.proveedores
  for all to authenticated
  using (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder())
  with check (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder());
```

- [ ] **Step 2: Aplicar**

MCP `apply_migration` (project `rsmxklkxqsaptchcjszd`, name `20260619120000_inv_proveedores`, query = el SQL de Step 1).

- [ ] **Step 3: Verificar (server-side)**

`execute_sql`:
```sql
select
  (select count(*) from information_schema.tables where table_schema='public' and table_name='proveedores') as tabla_proveedores,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='productos' and column_name='proveedor_id') as col_proveedor_id,
  (select count(*) from pg_policies where schemaname='public' and tablename='proveedores') as policies_proveedores;
```
Esperado: `tabla_proveedores=1`, `col_proveedor_id=1`, `policies_proveedores=2`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619120000_inv_proveedores.sql
git commit -m "feat(inventario): tabla proveedores + productos.proveedor_id + RLS"
```

---

## Task 2: Tabla `inventario_movimientos` (kardex)

**Files:** Create `supabase/migrations/20260619120100_inv_movimientos.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 20260619120100_inv_movimientos — kardex: libro de movimientos de inventario.
create table if not exists public.inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  variante_id uuid not null references public.producto_variantes(id) on delete cascade,
  tipo text not null check (tipo in ('saldo_inicial','entrada','salida','ajuste','venta','devolucion')),
  cantidad integer not null check (cantidad <> 0),
  costo_unitario numeric,
  costo_saldo numeric,
  fecha timestamptz not null default now(),
  pedido_id uuid references public.pedidos(id) on delete set null,
  nota text,
  creado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_invmov_variante_fecha on public.inventario_movimientos(variante_id, fecha);
create index if not exists idx_invmov_producto on public.inventario_movimientos(producto_id);
create index if not exists idx_invmov_tienda on public.inventario_movimientos(tienda_id);
create index if not exists idx_invmov_pedido on public.inventario_movimientos(pedido_id);

alter table public.inventario_movimientos enable row level security;

create policy invmov_select_dueno on public.inventario_movimientos
  for select to authenticated
  using (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder());

create policy invmov_write_dueno on public.inventario_movimientos
  for all to authenticated
  using (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder())
  with check (tienda_ia_es_dueno(tienda_id) or is_admin_or_cofounder());
```

- [ ] **Step 2: Aplicar** — MCP `apply_migration` name `20260619120100_inv_movimientos`.

- [ ] **Step 3: Verificar**

```sql
select
  (select count(*) from information_schema.tables where table_schema='public' and table_name='inventario_movimientos') as tabla,
  (select count(*) from pg_indexes where schemaname='public' and tablename='inventario_movimientos') as indices,
  (select count(*) from pg_policies where schemaname='public' and tablename='inventario_movimientos') as policies;
```
Esperado: `tabla=1`, `indices>=4` (más el PK), `policies=2`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619120100_inv_movimientos.sql
git commit -m "feat(inventario): tabla inventario_movimientos (kardex) + indices + RLS"
```

---

## Task 3: `kardex_registrar()` + trigger de sincronía de stock

**Files:** Create `supabase/migrations/20260619120200_inv_kardex_registrar.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 20260619120200_inv_kardex_registrar — costeo promedio (por referencia) + sync de stock.

-- Trigger: cada movimiento ajusta el stock de su variante (UNICA fuente de mutacion).
create or replace function public.inv_mov_sync_stock()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.producto_variantes
    set stock = greatest(0, stock + NEW.cantidad)
    where id = NEW.variante_id;
  return NEW;
end; $$;

drop trigger if exists trg_inv_mov_sync_stock on public.inventario_movimientos;
create trigger trg_inv_mov_sync_stock
  after insert on public.inventario_movimientos
  for each row execute function public.inv_mov_sync_stock();

-- Funcion unica de escritura de movimientos: calcula costeo promedio ponderado por REFERENCIA e inserta.
create or replace function public.kardex_registrar(
  p_producto_id uuid,
  p_variante_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_costo_unitario numeric default null,
  p_fecha timestamptz default now(),
  p_pedido_id uuid default null,
  p_nota text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tienda uuid; v_prom_ant numeric; v_cant_total integer;
  v_costo_unit numeric; v_costo_saldo numeric; v_nuevo_prom numeric; v_mov_id uuid;
begin
  select tienda_id, costo into v_tienda, v_prom_ant from public.productos where id = p_producto_id;
  if v_tienda is null then raise exception 'producto inexistente'; end if;

  -- saldo de cantidad de la REFERENCIA antes del movimiento
  select coalesce(sum(stock),0) into v_cant_total from public.producto_variantes where producto_id = p_producto_id;

  if p_cantidad > 0 and p_costo_unitario is not null then
    -- ENTRADA con costo: recalcular promedio ponderado de la referencia
    if v_prom_ant is null or (v_cant_total + p_cantidad) = 0 then
      v_nuevo_prom := p_costo_unitario;
    else
      v_nuevo_prom := (v_cant_total * v_prom_ant + p_cantidad * p_costo_unitario) / (v_cant_total + p_cantidad);
    end if;
    update public.productos set costo = v_nuevo_prom where id = p_producto_id;
    v_costo_unit := p_costo_unitario;
    v_costo_saldo := v_nuevo_prom;
  else
    -- SALIDA, devolucion o ajuste sin costo: el promedio no cambia; valor al promedio vigente
    v_costo_unit := coalesce(p_costo_unitario, v_prom_ant);
    v_costo_saldo := v_prom_ant;
  end if;

  insert into public.inventario_movimientos
    (tienda_id, producto_id, variante_id, tipo, cantidad, costo_unitario, costo_saldo, fecha, pedido_id, nota, creado_por)
  values
    (v_tienda, p_producto_id, p_variante_id, p_tipo, p_cantidad, v_costo_unit, v_costo_saldo, p_fecha, p_pedido_id, p_nota, auth.uid())
  returning id into v_mov_id;

  return v_mov_id;
end; $$;
grant execute on function public.kardex_registrar(uuid,uuid,text,integer,numeric,timestamptz,uuid,text) to authenticated;
```

- [ ] **Step 2: Aplicar** — MCP `apply_migration` name `20260619120200_inv_kardex_registrar`.

- [ ] **Step 3: Verificar con un movimiento de prueba (sembrar → registrar → comprobar → limpiar)**

Sembrar un producto + variante de prueba en una tienda real, registrar una entrada y comprobar stock + costeo. `execute_sql` (un solo bloque):
```sql
do $$
declare v_tienda uuid; v_prod uuid; v_var uuid; v_stock int; v_costo numeric;
begin
  select id into v_tienda from public.tiendas limit 1;
  insert into public.productos (tienda_id, referencia, nombre, costo, precio_venta, slug)
    values (v_tienda, 'ZZTEST', 'ZZ Prueba Kardex', null, 1000, 'zztest-kardex-'||substr(gen_random_uuid()::text,1,8))
    returning id into v_prod;
  insert into public.producto_variantes (producto_id, color, sku, stock)
    values (v_prod, 'U', 'ZZTEST-U', 0) returning id into v_var;
  -- entrada 10 a costo 100  -> promedio 100, stock 10
  perform public.kardex_registrar(v_prod, v_var, 'entrada', 10, 100, now(), null, 'prueba');
  -- entrada 10 a costo 200  -> promedio (10*100+10*200)/20 = 150, stock 20
  perform public.kardex_registrar(v_prod, v_var, 'entrada', 10, 200, now(), null, 'prueba');
  -- salida 5 (venta)        -> promedio sigue 150, stock 15
  perform public.kardex_registrar(v_prod, v_var, 'venta', -5, null, now(), null, 'prueba');
  select stock into v_stock from public.producto_variantes where id = v_var;
  select costo into v_costo from public.productos where id = v_prod;
  raise notice 'STOCK=% COSTO_PROM=% (esperado STOCK=15 COSTO=150)', v_stock, v_costo;
  -- limpiar
  delete from public.inventario_movimientos where producto_id = v_prod;
  delete from public.producto_variantes where id = v_var;
  delete from public.productos where id = v_prod;
end $$;
```
Esperado en los logs/NOTICE: `STOCK=15 COSTO_PROM=150`. Confirmar además que la limpieza dejó 0 filas de prueba:
```sql
select count(*) as resto from public.productos where referencia='ZZTEST';
```
Esperado: `resto=0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619120200_inv_kardex_registrar.sql
git commit -m "feat(inventario): kardex_registrar (costeo promedio por referencia) + trigger sync stock"
```

---

## Task 4: Seed inicial (cuadrar el kardex con el stock vigente)

**Files:** Create `supabase/migrations/20260619120300_inv_seed_saldo_inicial.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 20260619120300_inv_seed_saldo_inicial — saldo de arranque para el stock que ya existe.
-- El trigger de sync sumaria el stock otra vez -> se siembra con el trigger DESHABILITADO.
alter table public.inventario_movimientos disable trigger trg_inv_mov_sync_stock;

insert into public.inventario_movimientos
  (tienda_id, producto_id, variante_id, tipo, cantidad, costo_unitario, costo_saldo, fecha)
select p.tienda_id, p.id, v.id, 'saldo_inicial', v.stock, p.costo, p.costo, p.created_at
from public.producto_variantes v
join public.productos p on p.id = v.producto_id
where v.stock > 0
  and not exists (
    select 1 from public.inventario_movimientos m where m.variante_id = v.id
  );

alter table public.inventario_movimientos enable trigger trg_inv_mov_sync_stock;
```

- [ ] **Step 2: Aplicar** — MCP `apply_migration` name `20260619120300_inv_seed_saldo_inicial`.

- [ ] **Step 3: Verificar la invariante `stock == SUM(kardex)`**

```sql
select count(*) as descuadres
from public.producto_variantes v
left join (
  select variante_id, coalesce(sum(cantidad),0) as suma
  from public.inventario_movimientos group by variante_id
) k on k.variante_id = v.id
where v.stock <> coalesce(k.suma, 0) and v.stock > 0;
```
Esperado: `descuadres=0`. (Variantes con stock=0 y sin movimientos quedan fuera — correcto, no se sembraron.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619120300_inv_seed_saldo_inicial.sql
git commit -m "feat(inventario): seed saldo inicial (kardex cuadrado con stock vigente)"
```

---

## Task 5: Conectar ventas al kardex (reemplazar `pedido_stock_lifecycle`)

**Files:** Create `supabase/migrations/20260619120400_inv_lifecycle_kardex.sql`

> El trigger `trg_pedido_stock_lifecycle` (BEFORE UPDATE en `pedidos`) ya existe y apunta a esta función; solo se reemplaza el **cuerpo** con `create or replace`. No se crea/borra el trigger.

- [ ] **Step 1: Escribir la migración**

```sql
-- 20260619120400_inv_lifecycle_kardex — el ciclo de vida del pedido registra movimientos de kardex
-- en vez de tocar stock a mano. reservado se sigue manejando aqui; el stock lo mueve el kardex.
create or replace function public.pedido_stock_lifecycle()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_item record;
begin
  if TG_OP = 'UPDATE' and OLD.estado = NEW.estado then return NEW; end if;

  -- pendiente_confirmacion/confirmado -> cerrado: VENTA (kardex salida + liberar reserva)
  if TG_OP = 'UPDATE' and NEW.estado = 'cerrado' and OLD.estado in ('pendiente_confirmacion','confirmado') then
    for v_item in select producto_id, variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      perform public.kardex_registrar(v_item.producto_id, v_item.variante_id, 'venta', -v_item.cantidad, null, now(), NEW.id, null);
      update public.producto_variantes set reservado = greatest(0, reservado - v_item.cantidad) where id = v_item.variante_id;
    end loop;
    NEW.cerrado_at := coalesce(NEW.cerrado_at, now());
    return NEW;
  end if;

  -- -> cancelado: liberar reservas (sin kardex, sin tocar stock)
  if TG_OP = 'UPDATE' and NEW.estado = 'cancelado' and OLD.estado in ('pendiente_confirmacion','confirmado') then
    for v_item in select variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      update public.producto_variantes set reservado = greatest(0, reservado - v_item.cantidad) where id = v_item.variante_id;
    end loop;
    NEW.cancelado_at := coalesce(NEW.cancelado_at, now());
    return NEW;
  end if;

  -- cerrado -> devuelto: reintegrar (kardex devolucion)
  if TG_OP = 'UPDATE' and NEW.estado = 'devuelto' and OLD.estado = 'cerrado' then
    for v_item in select producto_id, variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      perform public.kardex_registrar(v_item.producto_id, v_item.variante_id, 'devolucion', v_item.cantidad, null, now(), NEW.id, null);
    end loop;
    NEW.devuelto_at := coalesce(NEW.devuelto_at, now());
    return NEW;
  end if;

  return NEW;
end; $$;
```

- [ ] **Step 2: Aplicar** — MCP `apply_migration` name `20260619120400_inv_lifecycle_kardex`.

- [ ] **Step 3: Verificar E2E con un pedido de prueba (cerrar y devolver), SIN doble descuento**

`execute_sql` (un bloque que siembra producto+variante+pedido, lo cierra, comprueba, lo devuelve, comprueba, y limpia):
```sql
do $$
declare
  v_tienda uuid; v_prod uuid; v_var uuid; v_ped uuid;
  v_stock_post_cierre int; v_ventas int; v_stock_post_dev int;
begin
  select id into v_tienda from public.tiendas limit 1;
  insert into public.productos (tienda_id, referencia, nombre, costo, precio_venta, slug)
    values (v_tienda,'ZZTEST2','ZZ Prueba Lifecycle', 100, 1000, 'zztest-lc-'||substr(gen_random_uuid()::text,1,8))
    returning id into v_prod;
  insert into public.producto_variantes (producto_id, color, sku, stock) values (v_prod,'U','ZZTEST2-U',0) returning id into v_var;
  perform public.kardex_registrar(v_prod, v_var, 'entrada', 10, 100, now(), null, 'prueba');  -- stock 10
  insert into public.pedidos (tienda_id, codigo_publico, comprador_nombre, comprador_telefono, comprador_direccion, comprador_ciudad, subtotal_productos, total, estado)
    values (v_tienda,'ZZ-'||substr(gen_random_uuid()::text,1,6),'Prueba','3000000000','x','x',3000,3000,'confirmado') returning id into v_ped;
  insert into public.pedido_items (pedido_id, producto_id, variante_id, referencia, nombre, cantidad, precio_unitario, subtotal)
    values (v_ped, v_prod, v_var, 'ZZTEST2','ZZ Prueba Lifecycle', 3, 1000, 3000);

  update public.pedidos set estado='cerrado' where id = v_ped;  -- venta
  select stock into v_stock_post_cierre from public.producto_variantes where id = v_var;
  select count(*) into v_ventas from public.inventario_movimientos where pedido_id = v_ped and tipo='venta';

  update public.pedidos set estado='devuelto' where id = v_ped;  -- devolucion
  select stock into v_stock_post_dev from public.producto_variantes where id = v_var;

  raise notice 'POST_CIERRE stock=% (esp 7) ventas=% (esp 1) | POST_DEVOLUCION stock=% (esp 10)',
    v_stock_post_cierre, v_ventas, v_stock_post_dev;

  -- limpiar
  delete from public.inventario_movimientos where producto_id = v_prod;
  delete from public.pedido_items where pedido_id = v_ped;
  delete from public.pedidos where id = v_ped;
  delete from public.producto_variantes where id = v_var;
  delete from public.productos where id = v_prod;
end $$;
```
Esperado (NOTICE): `POST_CIERRE stock=7 ventas=1 | POST_DEVOLUCION stock=10`. (7 = 10 − 3 una sola vez; 1 movimiento de venta; 10 reintegrado.) Confirmar limpieza:
```sql
select count(*) as resto from public.productos where referencia='ZZTEST2';
```
Esperado: `resto=0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619120400_inv_lifecycle_kardex.sql
git commit -m "feat(inventario): pedido_stock_lifecycle registra ventas/devoluciones en el kardex"
```

---

## Task 6: Auditoría final + RLS + advisors

**Files:** ninguno (verificación)

- [ ] **Step 1: Invariante global stock == SUM(kardex)** (vuelve a correr la query del Task 4 Step 3) → `descuadres=0`.

- [ ] **Step 2: RLS tenant — un dueño no ve inventario de otra tienda**

```sql
-- Con dos tiendas distintas, simular el rol del dueño de la tienda A y comprobar que NO ve proveedores/movimientos de B.
-- (Ejecutar como prueba dirigida cuando haya 2 tiendas con dueños distintos; documentar resultado.)
select t.id, t.user_id, t.nombre_negocio from public.tiendas t order by t.created_at limit 3;
```
Verificación dirigida: insertar un `proveedor` de prueba en la tienda A, mintear/usar el JWT del dueño de B (patrón del proyecto: Management PAT → service_role → generate_link/verify, ver memoria `project_aimma_editor_b_tema_global`) y confirmar `select * from proveedores` devuelve 0 filas de A. Limpiar.

- [ ] **Step 3: Advisors de seguridad/performance**

MCP `get_advisors` (type `security`) y (type `performance`) para el proyecto. Esperado: 0 nuevos `critical` sobre `proveedores`/`inventario_movimientos` (RLS habilitada con policies). Reportar cualquier hallazgo.

- [ ] **Step 4: Reporte de cierre a Jorge**

Resumen: 5 migraciones aplicadas, invariante verde, E2E lifecycle verde (cierre+devolución sin doble descuento), RLS tenant verde, advisors limpios. Pendiente del build (siguiente fase, fuera de este plan): las 4 vistas + `registerView` + UI, y el touch de `admin/index.html` (después del merge de Fotos IA). Push de las migraciones a `main` cuando Jorge coordine con Fotos IA.

---

## Self-review (cobertura del spec)

- §3.1 proveedores + §3.2 productos.proveedor_id → **Task 1**. ✓
- §3.3 inventario_movimientos + índices + RLS → **Task 2**. ✓
- §4 sincronía stock (trigger único) → **Task 3** (`inv_mov_sync_stock`). ✓
- §5 costeo promedio por referencia → **Task 3** (`kardex_registrar`). ✓
- §6 integración ventas→kardex (modificar lifecycle, sin doble descuento) → **Task 5** + verificación E2E. ✓
- §7 seed inicial (trigger off, invariante) → **Task 4**. ✓
- §9 RLS multi-tenant → Tasks 1/2 (policies) + **Task 6 Step 2** (verificación tenant). ✓
- §10 criterios de éxito (invariante, sin doble descuento, devolución, costeo, RLS, storefront intacto) → **Tasks 3/4/5/6**. ✓
- §8 (las 4 vistas/UI) → **fuera de alcance** (build posterior), declarado en el spec y en el cierre.

Sin placeholders. Nombres consistentes: `proveedores`, `inventario_movimientos`, `kardex_registrar`, `inv_mov_sync_stock`/`trg_inv_mov_sync_stock`, `pedido_stock_lifecycle`, columnas `cantidad`/`costo_unitario`/`costo_saldo`/`fecha`.
