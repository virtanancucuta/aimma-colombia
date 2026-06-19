# Inventario (Tienda IA) — Modelo de datos · Diseño

Fecha: 2026-06-19
Módulo: **Inventario**, nueva view nativa dentro de **Tienda IA** (AIMMA Comercial).
Supabase: proyecto `aimma` (ref `rsmxklkxqsaptchcjszd`). Multi-tenant por `tienda_id`, RLS por dueño.

> **Alcance de este spec:** SOLO el **modelo de datos** + la integración ventas→kardex + el seed inicial. La UI (las 4 sub-vistas, `registerView`, filtros, orden, semáforo, inputs de período/días-óptimos) y el touch de `admin/index.html` son **build posterior**, fuera de este spec. Jorge gatea el modelo antes de construir.

---

## 1. Estado actual del schema (verificado read-only)

- **`tiendas`** — raíz del tenant. Dueño = `tiendas.user_id`.
- **`productos`** (= la REFERENCIA): `referencia`, `nombre`, `costo` (numeric, nullable, **ya se usa**), `precio_venta`, `categoria_id`→categorias, `variante_tipo_1`/`variante_tipo_2` (nombres de los 2 ejes), `created_at`, `estado`. **No** tiene proveedor. **No** tiene stock.
- **`producto_variantes`** (donde vive el STOCK): `producto_id`, `color`, `talla`, `sku`, **`stock` int NOT NULL**, **`reservado` int NOT NULL**, `precio_override`. Soporta 2 ejes: el valor del eje 1 va en `color`, el del eje 2 en `talla` (hoy solo se usa 1 eje, `talla` null).
- **`categorias`**: `tienda_id`, **`parent_id`→categorias.id** → categoría (raíz) / subcategoría (hijo).
- **`pedidos`**: `tienda_id`, `estado` (`pendiente_confirmacion`→`confirmado`→`cerrado`/`cancelado`; `cerrado`→`devuelto`), `cerrado_at`, `created_at`.
- **`pedido_items`**: `pedido_id`, `producto_id`, `variante_id`, `cantidad`, `precio_unitario`, snapshot (`referencia`,`nombre`,`color`,`talla`).
- **`reservas_stock`**: reservas temporales de checkout (no es kardex).

**Flujo de stock hoy:**
- Crear pedido → `reservar_stock_variante(variante, qty)`: `reservado += qty` si `stock − reservado ≥ qty`.
- `pedido_stock_lifecycle()` (trigger BEFORE UPDATE en pedidos):
  - → `cerrado`: por cada item con variante, `stock −= qty` y `reservado −= qty`. **(la venta real)**
  - → `cancelado`: `reservado −= qty` (libera, no toca stock).
  - `cerrado` → `devuelto`: `stock += qty` (reintegra).

**RLS** (patrón uniforme): dueño = `tienda_ia_es_dueno(tienda_id) OR is_admin_or_cofounder()`. Públicas gated por `tiendas.estado = 'publicada'`.

**No existe** hoy ninguna tabla de movimientos/kardex. Stock = `producto_variantes.stock`.

---

## 2. Decisiones aprobadas (Jorge, 2026-06-19)

1. **Enfoque A**: el **kardex es la verdad contable**; `producto_variantes.stock` queda como **proyección sincronizada** (no se reescribe el motor de ventas del storefront).
2. **Fecha de entrada**: editable, con "hoy" por defecto. **Fecha de ingreso** = derivada (primera entrada del kardex).
3. **Costeo**: promedio ponderado a nivel **REFERENCIA** (un costo por producto, igual para sus variantes).
4. **Venta = estado `cerrado`**. Devueltos y cancelados **no** cuentan como venta.
5. **Proveedores**: `nombre` obligatorio + `telefono` opcional.

---

## 3. Tablas y columnas nuevas

### 3.1 `proveedores` (nueva)
| col | tipo | nota |
|---|---|---|
| `id` | uuid PK `gen_random_uuid()` | |
| `tienda_id` | uuid NOT NULL → tiendas(id) | tenant |
| `nombre` | text NOT NULL | |
| `telefono` | text NULL | |
| `created_at` | timestamptz NOT NULL `now()` | |

RLS: `proveedores_select_dueno` (SELECT) + `proveedores_write_dueno` (ALL) con `tienda_ia_es_dueno(tienda_id) OR is_admin_or_cofounder()`. Sin acceso anon.

### 3.2 `productos.proveedor_id` (columna nueva)
`proveedor_id uuid NULL → proveedores(id) ON DELETE SET NULL`. Es atributo de la **referencia** (alimenta el filtro "proveedor" de la vista General). El selector va en el form de producto (build).

### 3.3 `inventario_movimientos` (el KARDEX — nueva)
| col | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `tienda_id` | uuid NOT NULL → tiendas(id) | tenant (scope directo, evita joins en RLS) |
| `producto_id` | uuid NOT NULL → productos(id) | referencia |
| `variante_id` | uuid NOT NULL → producto_variantes(id) | el stock es por variante |
| `tipo` | text NOT NULL CHECK in (`saldo_inicial`,`entrada`,`salida`,`ajuste`,`venta`,`devolucion`) | |
| `cantidad` | integer NOT NULL | **con signo**: + entra, − sale. CHECK `cantidad <> 0` |
| `costo_unitario` | numeric NULL | costo del movimiento (entradas); en salidas = promedio vigente |
| `costo_saldo` | numeric NULL | costo promedio de la referencia tras el movimiento (col "costo saldo" del kardex) |
| `fecha` | timestamptz NOT NULL `now()` | **editable** (default hoy) |
| `pedido_id` | uuid NULL → pedidos(id) | si viene de venta/devolución |
| `nota` | text NULL | doc/observación |
| `creado_por` | uuid NULL | `auth.uid()` cuando es manual; NULL desde el trigger de ventas |
| `created_at` | timestamptz NOT NULL `now()` | sello inmutable de registro |

Índices: `(variante_id, fecha)`, `(producto_id)`, `(tienda_id)`, `(pedido_id)`.
RLS: dueño (SELECT + escritura) igual patrón. Los movimientos de venta los inserta el trigger del lifecycle (SECURITY DEFINER) — no requiere policy anon.

---

## 4. Sincronía del stock (proyección, enfoque A)

**Un único punto muta `producto_variantes.stock`:** un trigger **AFTER INSERT en `inventario_movimientos`**:
```
stock := stock + NEW.cantidad   -- (con GREATEST(0, …) de guarda)
```
Invariante: para toda variante, `producto_variantes.stock == SUM(inventario_movimientos.cantidad)`.
`reservado` **no** lo toca el kardex (lo siguen manejando el storefront y el lifecycle).

---

## 5. Costeo promedio ponderado (por referencia)

Se mantiene el costo promedio de la **referencia** (`productos.costo`) y se sincroniza en cada movimiento que afecte el costo. Estado contable de la referencia: `cant_total = SUM(stock variantes)`, `valor = cant_total × costo_promedio`.

- **Entrada** (`entrada`/`saldo_inicial`/`ajuste con costo`, `cantidad > 0` y `costo_unitario` dado):
  `nuevo_prom = (cant_total·prom_ant + cantidad·costo_unitario) / (cant_total + cantidad)`
  → `productos.costo := nuevo_prom`; `movimiento.costo_saldo := nuevo_prom`.
- **Salida** (`venta`/`salida`, `cantidad < 0`): `costo_unitario := prom vigente` (= COGS); el promedio **no** cambia; `costo_saldo := prom vigente`.
- **Ajuste de solo cantidad** (sin costo): no cambia el promedio; `costo_saldo := prom vigente`.

`prom_ant` se lee de `productos.costo` (si NULL → toma `costo_unitario` de la primera entrada). **Separación de responsabilidades:** la función `kardex_registrar(...)` SECURITY DEFINER calcula el costeo (promedio, `costo_saldo`, actualiza `productos.costo`) e **inserta** el movimiento; el **trigger de §4** (AFTER INSERT) ajusta `producto_variantes.stock`. Ambos corren en la misma transacción → atómicos. `kardex_registrar` es el único camino de escritura de movimientos (manual y de ventas), **salvo el seed de migración de §7** (one-time, con el trigger de sync deshabilitado).

> Implicación: el campo "costo" del form de producto pasa a ser el **costo de la primera entrada**; en adelante `productos.costo` lo mantiene el kardex (no es edición libre; un cambio manual de costo se modela como `ajuste`).

---

## 6. Integración ventas → kardex

Se **modifica `pedido_stock_lifecycle()`**: en vez de `UPDATE stock` directo, **registra el movimiento** (vía `kardex_registrar`), y es el trigger de §4 quien ajusta el stock. Así no hay doble descuento y el kardex queda completo.

- pedido → `cerrado`: por cada `pedido_item` con variante, movimiento **`venta`** (`cantidad = −qty`, `costo_unitario = productos.costo` vigente, `pedido_id`, `fecha = now()`).
- pedido → `devuelto`: movimiento **`devolucion`** (`cantidad = +qty`, `pedido_id`).
- `reservado` lo sigue ajustando el lifecycle igual que hoy (cerrar/cancelar). `cancelado` **no** genera movimiento (no es inventario).

El lifecycle es BEFORE UPDATE; insertar en `inventario_movimientos` dentro de él corre en la misma transacción (el ajuste de stock vía el AFTER INSERT del movimiento se aplica a `producto_variantes`, tabla distinta — sin recursión).

---

## 7. Seed inicial (saldo de arranque)

Migración de datos de una sola vez: por cada variante con `stock > 0`, insertar un movimiento `saldo_inicial` (`cantidad = stock actual`, `costo_unitario = productos.costo`, `costo_saldo = productos.costo`, `fecha = productos.created_at`).
⚠️ El trigger de §4 sumaría el stock otra vez → el seed corre con el trigger de sync **deshabilitado** (`ALTER TABLE … DISABLE TRIGGER`), inserta los `saldo_inicial`, y rehabilita. Verificación post-seed: `stock == SUM(kardex)` para todas las variantes.
Variantes con `stock = 0` no se siembran; su fecha de ingreso saldrá de su primera entrada futura (o `productos.created_at` como fallback en la vista Sin Ventas).

---

## 8. Cómo las 4 vistas consumen el modelo (validación de soporte, no UI)

Se implementarán como RPCs/queries en el build; aquí solo se confirma que el modelo las soporta:
- **`venta_diaria`(referencia, período)** = unidades vendidas (movimientos `venta` netos de `devolucion`, o `pedido_items` de pedidos `cerrado`) en el período ÷ días efectivos. **Normalización tienda nueva**: si la tienda tiene < 30 días de operación, días efectivos = días reales.
- **General**: cantidad = `SUM(stock)` por referencia; costo unit = `productos.costo`; costo total = cant×costo; **días inv** = `stock ÷ venta_diaria` (sin ventas → "—"). Filtros: `productos.proveedor_id`, `categorias`(+`parent_id`), `producto_variantes.color`/`talla` (la variante/subvariante acota la cantidad).
- **Sobrestock/Ruptura**: indicador = `stock − (venta_diaria × dias_optimos)`; semáforo rojo<0 / ámbar>0 / verde en rango; `dias_optimos` = input editable aparte.
- **Sin ventas**: referencias con 0 unidades vendidas en el período, orden por **fecha_ingreso** = `COALESCE(MIN(fecha de movimientos de entrada), productos.created_at)`.
- **Kardex**: `SELECT … FROM inventario_movimientos WHERE variante (o referencia) ORDER BY fecha` → fecha · tipo · entrada(+) · salida(−) · saldo (acumulado) · costo unit · costo saldo.
- **Período de ventas**: editable, default 30 días, máx 60.

---

## 9. RLS / multi-tenant

`proveedores` e `inventario_movimientos` llevan `tienda_id` directo y replican el patrón dueño (`tienda_ia_es_dueno(tienda_id) OR is_admin_or_cofounder()`) para SELECT y escritura. Inventario es privado del dueño → **sin policies anon**. Las funciones (`kardex_registrar`, lifecycle) son SECURITY DEFINER, escriben con `tienda_id` derivado del producto/pedido.

---

## 10. Criterios de éxito (verificación del modelo)

1. Post-seed: para cada variante, `stock == SUM(inventario_movimientos.cantidad)`.
2. Cerrar un pedido genera un movimiento `venta` y baja el stock **exactamente una vez** (sin doble descuento).
3. Devolver un pedido genera `devolucion` y reintegra el stock.
4. Una entrada a costo distinto recalcula `productos.costo` (promedio referencia) según la fórmula de §5.
5. RLS: el dueño de la tienda A no lee ni escribe inventario de la tienda B.
6. El storefront sigue vendiendo igual (reserva/cierre/agotados sin cambios funcionales).

---

## 11. Fuera de alcance / coordinación

- UI de las 4 vistas, `registerView`, controles de período/días-óptimos, semáforo → **build**.
- Compras/órdenes de compra formales, proveedor por movimiento (solo por referencia), costo por variante → futuro.
- **`admin/index.html` está en vuelo por Fotos IA**: el touch de ese archivo para registrar la view de Inventario va **después** del merge/rebase de Fotos IA. Este spec no lo toca.
