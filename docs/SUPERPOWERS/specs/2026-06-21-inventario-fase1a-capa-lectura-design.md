# Inventario · Fase 1a — Capa de lectura (BD) · Spec build-ready

Fecha: 2026-06-21
Módulo: **Inventario** (Tienda IA / AIMMA Comercial).
Supabase: proyecto `aimma` (ref `rsmxklkxqsaptchcjszd`) — **es el entorno de test** (sin tiendas reales aún).
Branch: `feat/inv-fase1a-lectura`. Deploy a test; **deploy-to-prod OFF**. Gate de Jorge antes de merge.

> **Alcance:** SOLO la capa de lectura en BD para que las 4 vistas tengan de dónde leer. = config de umbrales **por tienda** + **2 RPCs** (`inventario_resumen`, `inventario_kardex`). **Sin UI** (la UI y el control de umbrales en Configuración son Fase 1b). Verificación contra data real antes de cualquier UI.

---

## 1. Hechos confirmados (PASO 0 read-only + C1/C2/C3)

- **No existe capa de lectura hoy:** 0 vistas SQL, 0 vistas materializadas. Todas las funciones son de escritura (`kardex_registrar`, `crear_producto_con_stock`, `actualizar_costo_producto`, `inv_mov_sync_stock`, `pedido_stock_lifecycle`, `reservar_stock_variante`). Hay que construir la lectura entera.
- **C1 — cardinalidad referencia↔producto = 1:1.** Unique constraint `productos_tienda_id_referencia_key` sobre `(tienda_id, referencia)`; 0 referencias duplicadas. **La unidad de fila del resumen es el PRODUCTO** (la referencia es su etiqueta); `stock = SUM(producto_variantes.stock)`.
- **C2 — signo de `inventario_movimientos.cantidad`** (lo setea `pedido_stock_lifecycle`): **`venta = −qty` (negativo), `devolucion = +qty` (positivo)**. Por lo tanto:
  `unidades_vendidas_netas = −1 × SUM(cantidad) WHERE tipo IN ('venta','devolucion')` en el período. (Vendió 10 → −10; devolvió 3 → +3; SUM −7 → ×−1 = **7 neto**.)
- **C3 — joins:** FK `productos.categoria_id → categorias`, FK `productos.proveedor_id → proveedores`. `categorias.parent_id` existe, profundidad máx **2** (raíz + hijo) → el filtro por categoría padre debe **incluir las hijas**.
- **Estado de datos en test:** 4 productos; movimientos = `saldo_inicial`×7, `entrada`×2, `ajuste`×1; **0 `venta` / 0 `devolucion`** (los pedidos cerrados/devueltos existentes son pre-kardex). La verificación (gate 1a) **siembra una venta real** cerrando un pedido de prueba por el camino normal.

---

## 2. Config — umbrales por tienda (mismo patrón que `mostrar_resenas_productos`)

Migración: `ALTER TABLE public.tiendas`:

| columna | tipo | default |
|---|---|---|
| `inv_umbral_ruptura_dias` | `int NOT NULL` | `15` |
| `inv_umbral_sobrestock_dias` | `int NOT NULL` | `90` |
| `inv_periodo_default_dias` | `int NOT NULL` | `30` |

`ADD COLUMN ... NOT NULL DEFAULT` rellena las tiendas existentes con el default automáticamente (backfill nativo de Postgres). Las RPCs leen estos valores de la fila de la tienda; **no se hardcodean**. (El control de UI para editarlos es **1b**.)

---

## 3. RPC `inventario_resumen` (la fuente de GENERAL / SOBRESTOCK&RUPTURA / SIN VENTAS)

```
inventario_resumen(
  p_tienda_id   uuid,
  p_periodo     int       DEFAULT NULL,   -- NULL → tiendas.inv_periodo_default_dias; cap a 60
  p_orden       text      DEFAULT NULL,   -- NULL → 'valor'
  p_clasificacion text[]  DEFAULT NULL,   -- NULL → todas
  p_proveedor_id uuid     DEFAULT NULL,
  p_categoria_id uuid     DEFAULT NULL,   -- incluye hijas
  p_buscar      text      DEFAULT NULL,   -- ILIKE escapado sobre referencia/nombre
  p_limit       int       DEFAULT NULL,
  p_offset      int       DEFAULT 0
) RETURNS TABLE(...)
```

- **`SECURITY DEFINER`, `STABLE`, `SET search_path = public`.**
- **Primera línea:** `if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;`
- **Grants (lección M6, explícito):** `REVOKE ALL ... FROM public, anon, authenticated;` luego `GRANT EXECUTE ... TO authenticated;`
- **Período:** `v_periodo := LEAST(COALESCE(p_periodo, t.inv_periodo_default_dias), 60)`.
- **Orden (`p_orden`):** `valor` (default, `valor_inventario DESC`) · `dias_asc` (`dias_inventario ASC NULLS LAST`) · `dias_desc` (`dias_inventario DESC NULLS LAST`) · `unidades` (`unidades_vendidas DESC`) · `referencia` (`referencia ASC`). Valor inválido → trata como `valor`. Tie-breaker estable: `referencia ASC`.

### Columnas (una fila por PRODUCTO)

| columna | definición |
|---|---|
| `producto_id`, `referencia`, `nombre` | de `productos` |
| `foto_principal_url` | `productos.foto_principal_url` (puede ser NULL) |
| `proveedor_id`, `proveedor_nombre` | join a `proveedores` (LEFT; NULL si sin proveedor) |
| `categoria_id`, `categoria_nombre` | join a `categorias` (LEFT) |
| `stock_total` | `SUM(producto_variantes.stock)` (0 si sin variantes) |
| `reservado_total` | `SUM(producto_variantes.reservado)` (informativo) |
| `stock_disponible` | `stock_total − reservado_total` (visibilidad; **no** se clasifica sobre esto — ver decisión C) |
| `costo_unitario` | `COALESCE(productos.costo, 0)` |
| `valor_inventario` | `stock_total × costo_unitario` |
| `unidades_vendidas` | `−1 × COALESCE(SUM(im.cantidad) FILTER (WHERE im.tipo IN ('venta','devolucion') AND im.created_at >= now() − v_periodo·'1 day'), 0)` |
| `dias_efectivos` | `LEAST(v_periodo, GREATEST(1, (CURRENT_DATE − productos.created_at::date)))` |
| `venta_diaria` | `unidades_vendidas / dias_efectivos` (0 si `unidades_vendidas = 0`) |
| `dias_inventario` | **`0` si `stock_total = 0`**; **`NULL` si `stock_total > 0` y `venta_diaria = 0`**; si no `stock_total / venta_diaria` |
| `sin_ventas` | `unidades_vendidas = 0` |
| `datos_insuficientes` | `dias_efectivos < 7` (1b muestra nota en vez de alarmar) |
| `fecha_ultima_venta` | `MAX(im.fecha) FILTER (WHERE im.tipo = 'venta')`; NULL si ninguna |
| `fecha_ingreso` | `COALESCE(MIN(im.fecha) FILTER (WHERE im.tipo IN ('entrada','saldo_inicial')), productos.created_at)` |
| `clasificacion` | UNA por fila, precedencia estricta (abajo) |
| `total_count` | `COUNT(*) OVER()` — conteo del set **filtrado**, antes de `limit/offset`. 1b lo lee de la primera fila |

### Clasificación (precedencia estricta, umbrales DE ESA TIENDA)

1. `stock_total = 0` → **`quiebre`**
2. `sin_ventas` (stock_total > 0 y unidades_vendidas = 0) → **`sin_ventas`**
3. **[guard `dias_efectivos >= 7`]** `dias_inventario < inv_umbral_ruptura_dias` → **`ruptura`**
4. **[guard `dias_efectivos >= 7`]** `dias_inventario > inv_umbral_sobrestock_dias` → **`sobrestock`**
5. else → **`normal`**

El guard (decisión D) envuelve **solo** las reglas 3 y 4: con `dias_efectivos < 7` un producto con stock y ventas cae en `normal` (no se alarma con < 1 ciclo semanal de data). `quiebre` y `sin_ventas` (reglas 1 y 2) disparan siempre, sin importar la antigüedad. En las reglas 3/4, `dias_inventario` siempre es un número positivo (stock>0, velocidad>0; los casos 0/NULL ya los tomaron las reglas 1/2).

### Filtros y los 3 tabs

- `p_clasificacion` (array; NULL=todas) → `WHERE clasificacion = ANY(p_clasificacion)` (aplicado **después** de computar la clasificación; el `total_count` cuenta este set filtrado).
- `p_proveedor_id` → `productos.proveedor_id = p_proveedor_id`.
- `p_categoria_id` → `categoria_id = p_categoria_id OR categoria_id IN (SELECT id FROM categorias WHERE parent_id = p_categoria_id)` (incluye hijas).
- `p_buscar` → `referencia ILIKE '%'||esc||'%' OR nombre ILIKE '%'||esc||'%'`, con `esc` = escape de `%` `_` `\` (`replace`), **parametrizado** (no concatenar input crudo).
- `p_limit`/`p_offset` → paginación.

Los 3 tabs de 1b consumen esta RPC:
- **GENERAL** → `p_clasificacion = NULL`, `p_orden = 'referencia'`.
- **SOBRESTOCK & RUPTURA** → `p_clasificacion = ARRAY['quiebre','ruptura','sobrestock']`, `p_orden = 'dias_asc'`.
- **SIN VENTAS** → `p_clasificacion = ARRAY['sin_ventas']`, `p_orden = 'valor'`.

### Estructura de la query (para que `total_count` y el filtro de clasificación cuadren)
CTE que, sobre los productos de la tienda que pasan `proveedor/categoria/buscar`, agrega stock/reservado por variante + ventas del kardex + computa todas las métricas y `clasificacion`. Query externa: filtra por `p_clasificacion`, calcula `COUNT(*) OVER()` como `total_count`, ordena por `p_orden`, y aplica `limit/offset`.

---

## 4. RPC `inventario_kardex` (la vista KARDEX)

```
inventario_kardex(
  p_tienda_id   uuid,
  p_producto_id uuid DEFAULT NULL,
  p_variante_id uuid DEFAULT NULL,
  p_desde       date DEFAULT NULL,
  p_hasta       date DEFAULT NULL,
  p_limit       int  DEFAULT 200,
  p_offset      int  DEFAULT 0
) RETURNS TABLE(...)
```

- Mismo candado: `SECURITY DEFINER`, `STABLE`, `search_path=public`, dueño en la 1ª línea, `REVOKE ... FROM public, anon, authenticated` + `GRANT EXECUTE TO authenticated`.
- Filtra movimientos de la tienda; opcional por `producto_id` y/o `variante_id`.
- **Orden y saldo por `created_at`** (lección hardening: `fecha` es backdateable; el ledger corre por el sello inmutable). `saldo_acumulado = SUM(cantidad) OVER (PARTITION BY variante_id ORDER BY created_at ROWS UNBOUNDED PRECEDING)` → **saldo corre POR variante**, sobre TODO el historial; el filtro de fechas se aplica **después** de la ventana para que el saldo mostrado sea el balance real acumulado.
- **Rango `p_desde`/`p_hasta`:** se filtra por `created_at::date` (consistente con el orden/saldo; `fecha` se muestra como columna informativa). *(Punto a gatear: si preferís filtrar por `fecha`, se ajusta.)*

### Columnas
`fecha` · `tipo` · `cantidad` (signed) · `entrada` (`GREATEST(cantidad,0)`) · `salida` (`GREATEST(−cantidad,0)`, positivo) · `costo_unitario` · `costo_saldo` · `saldo_acumulado` · `color` · `talla` · `sku` · `nota` · `pedido_id`. Orden final: `created_at` (ASC para que el saldo lea natural; 1b puede invertir para mostrar lo más reciente arriba).

---

## 5. Seguridad / multi-tenant

- Ambas RPCs: dueño en la 1ª línea (`tienda_ia_es_dueno`), `SECURITY DEFINER`, `REVOKE` de `public, anon, authenticated` + `GRANT EXECUTE` solo a `authenticated`. **Sin GRANT directo a tablas** (la lectura va por la RPC).
- Neutralización estándar de la migración: el `GRANT/REVOKE` es **explícito a `anon, authenticated`** (no confiar en `PUBLIC`), por la lección M6.
- Inventario es privado del dueño → **sin policies anon**.

---

## 6. Verificación (gate 1a — antes de UI, se reportan números)

1. **Config:** las tiendas existentes quedaron `15/90/30`.
2. **Sembrar velocidad REAL:** cerrar un pedido de prueba **nuevo** por el camino normal (reservar → checkout → `cerrado`) para disparar M5 y generar movimiento(s) `venta` en el kardex (de paso ejercita ventas→kardex, que estaba en la deuda). Limpieza al final.
3. **Asserts vs queries directas:** `stock_total`/`costo`/`valor` correctos; `unidades_vendidas` = lo del pedido (neto, signo C2); `venta_diaria` con el divisor de normalización correcto; `dias_inventario` = stock/velocidad, NULL si velocidad 0, **0 si stock 0**; `clasificacion` correcta en casos forzados (un `quiebre`, un `ruptura`, un `sin_ventas`, idealmente un `sobrestock`); guard `<7` no clasifica ruptura/sobrestock; `kardex.saldo_acumulado` por variante = stock real, ordenado por `created_at`; `total_count` = filas del set filtrado.
4. **Prueba clave (re-clasificación por tienda):** cambiar `inv_umbral_ruptura_dias`/`inv_umbral_sobrestock_dias` de la tienda y verificar que las filas **se re-clasifican solas** → prueba que cada tienda maneja su propio indicador.
5. **Seguridad:** no-dueño rechazado (`no autorizado`); `EXECUTE` solo `authenticated`; sin GRANT directo a tablas; `anon` no ejecuta.

**Sin UI hasta verde.** Todo lo verificable se hace impersonando al rol `authenticated` del dueño (set_config jwt.claims + role) en transacciones con rollback donde se siembre data.

---

## 7. Proceso / deploy

- Branch `feat/inv-fase1a-lectura` desde repo. Migraciones en `supabase/migrations/` con versiones alineadas al repo (post `20260620182000`).
- Migraciones previstas: (a) `inv_fase1a_config_umbrales` (columnas en `tiendas`); (b) `inv_fase1a_rpcs_lectura` (las 2 RPCs + grants).
- Deploy secuenciado a **test** vía MCP `apply_migration`; **registro alineado al repo a mano** (MCP auto-sella versión UTC → `UPDATE schema_migrations` a la versión del archivo; respaldos `schema_migrations_bak_*` intactos).
- **Deploy-to-prod OFF.** Spec en `docs/SUPERPOWERS/specs/`, plan en `docs/SUPERPOWERS/plans/`. **Gate de Jorge antes de merge.**

---

## 8. Fuera de alcance (Fase 1b)

- El route `#/inventario` con los 4 tabs (GENERAL / SOBRESTOCK&RUPTURA / SIN VENTAS / KARDEX) y sus controles (período, orden, filtros, semáforo).
- El control en **Configuración** para editar los umbrales de la tienda (la cara de lo que acá queda en BD).
- Decisiones diferidas con dueño: cobertura sobre `disponible` como toggle por tienda (tras probar reservas); selector de proveedor en el form de producto (ya hay `proveedor_id`).

---

## 9. Decisiones del brainstorming (A/B/C/D — Jorge, 2026-06-21)

- **A.** `p_orden` con `valor`(default DESC)/`dias_asc`/`dias_desc`/`unidades`(DESC)/`referencia`(ASC). `dias_inventario = 0` si `stock=0` (no NULL) → `dias_asc NULLS LAST` deja quiebre→ruptura→sobrestock arriba y "sin consumo" al final. Display: 0 → "Agotado", NULL → "—".
- **B.** `total_count` vía `COUNT(*) OVER()` como columna en cada fila (set filtrado, pre-paginación).
- **C.** Clasificación/cobertura sobre **stock físico** (estable, no depende de `reservado` aún sin probar). `stock_disponible` se expone como columna para visibilidad. Toggle "cobertura sobre disponible" = futuro, tras probar reservas.
- **D.** Guard `dias_efectivos < 7` → no fuerza ruptura/sobrestock (envuelve solo reglas 3/4); `quiebre`/`sin_ventas` siguen disparando. Flag `datos_insuficientes` expuesto. El 7 = un ciclo semanal completo; fijo para el MVP.
