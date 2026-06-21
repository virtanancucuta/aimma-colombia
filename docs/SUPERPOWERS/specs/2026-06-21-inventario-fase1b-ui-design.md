# Inventario · Fase 1b — UI (4 vistas + drill-down + umbrales inline) · Spec build-ready

Fecha: 2026-06-21
Módulo: **Inventario** (Tienda IA / AIMMA Comercial) — la CARA de la capa de lectura de 1a.
Supabase: proyecto `aimma` (ref `rsmxklkxqsaptchcjszd`) = entorno de test. Branch `feat/inv-fase1b-ui`. Deploy-to-prod OFF. **Gate de build = revisión funcional de Jorge + su OK visual** (shell+GENERAL primero).

> **Alcance:** route `#/inventario` (admin plano) con 4 tabs leyendo de las RPCs de 1a + drill-down por referencia (1 RPC nueva chica) + edición inline de umbrales (por el camino RLS existente). **Storefront NO se toca.** Única BD de 1b: la RPC `inventario_variantes` + un CHECK de umbrales.

---

## 1. Hechos confirmados (PASO 0 read-only)

- **Puntos de inserción del admin (sin cambios tras merge 1a):** `ROUTES` (admin.js:35) no incluye `'inventario'`; index.html sin nav/script de inventario. Patrón: `registerView('inventario', renderInventario)` desde `views/inventario.js`, `'inventario'` en ROUTES, nav link `data-route="inventario"` + `<script src="views/inventario.js?v=1">` en index.html.
- **Camino de escritura de settings:** `configuracion.js` usa `sb.from('tiendas').update(patch).eq('id', tienda.id)` — UPDATE directo RLS por el dueño. El REVOKE de Fase B NO tocó `tiendas` → el dueño puede actualizar sus columnas, incluidas `inv_umbral_*`/`inv_periodo_default_dias`. **Los umbrales se guardan por ESTE mismo camino** (no se abre uno nuevo).
- **`foto_principal_url`:** columna de `productos`, poblada por upload del dueño; puede ser NULL.
- **Campos de variante (drill-down):** `producto_variantes(stock, reservado, color, talla, sku, foto_color_url)` — confirmados.
- **Tokens de estado del admin (admin.css):** `--ta-danger` (rojo #d72c0d), `--ta-warn` (ámbar #b78103), `--ta-success` (verde), `--ta-text-mut` (gris). Componentes `.ta-pill--ok/--warn/--danger`. El semáforo reusa/extiende esto.
- **RPCs de 1a disponibles:** `inventario_resumen(p_tienda_id,p_periodo,p_orden,p_clasificacion,p_proveedor_id,p_categoria_id,p_buscar,p_limit,p_offset)` y `inventario_kardex(p_tienda_id,p_producto_id,p_variante_id,p_desde,p_hasta,p_limit,p_offset)`.

---

## 2. BD de 1b (única pieza backend)

### 2.1 RPC `inventario_variantes` (drill-down, mismo patrón que 1a)
```
inventario_variantes(p_tienda_id uuid, p_producto_id uuid)
returns table(variante_id uuid, color text, talla text, sku text,
              stock int, reservado int, disponible int, foto_color_url text)
```
- `SECURITY DEFINER`, `STABLE`, `SET search_path=public`. 1ª línea: `if not public.tienda_ia_es_dueno(p_tienda_id) then raise exception 'no autorizado'; end if;`
- Query tenant-scoped: `from producto_variantes pv join productos p on p.id = pv.producto_id where p.id = p_producto_id and p.tienda_id = p_tienda_id` (si el producto no es de la tienda → 0 filas). `disponible = stock - reservado`. Orden: `color nulls first, talla nulls first, sku`.
- Grants: `revoke all ... from public, anon, authenticated; grant execute ... to authenticated;`
- Migración `supabase/migrations/20260621180000_inv_variantes_rpc.sql`, registro alineado, deploy a test.

### 2.2 CHECK de umbrales (defensa BD, decisión D)
Migración `20260621180100_inv_umbrales_check.sql`:
```
alter table public.tiendas add constraint chk_inv_umbrales
  check (inv_umbral_ruptura_dias >= 1
         and inv_umbral_sobrestock_dias > inv_umbral_ruptura_dias
         and inv_periodo_default_dias between 1 and 60);
```
Display-only (no es seguridad), pero hace el invariante real a nivel BD: ningún valor inválido entra por ninguna vía. Las tiendas existentes (15/90/30) lo cumplen → no falla. Es complemento de la validación de cliente, no reemplazo.

---

## 3. Arquitectura del front

**Un archivo `views/inventario.js`** (consistente con productos.js/crm.js; el editor se parte por su tamaño, este módulo MVP no lo necesita). Estructura interna por funciones: `renderInventario` (shell + estado), render del header, un renderer por tab, drill-down, panel de ajustes. Estado de módulo: `{ periodo, filtros:{proveedor_id,categoria_id,buscar}, tab, page:{limit,offset}, drillCache:{}, kardex:{ref,variante,desde,hasta} }`.

**Shell (compartido por las 4 vistas):**
- **Header:** selector de período (botones **30 / 60**; el período activo se inicializa con `tienda.inv_periodo_default_dias`; si el default es 30 o 60 se resalta ese botón, si es custom — ej. 45 — se muestra como chip activo y 30/60 quedan como override rápido de **sesión**, no persisten) + filtros (proveedor [select de `proveedores` de la tienda], categoría [select con padres/hijas], buscador [input, debounced]) + engranaje **"Ajustes de inventario"**.
- **Tab bar:** GENERAL · SOBRESTOCK & RUPTURA · SIN VENTAS · KARDEX.
- Período y filtros **persisten al cambiar de tab**; cambiarlos dispara re-fetch del tab activo.
- **Ajustes (engranaje):** panel/modal inline con los 3 umbrales (`inv_umbral_ruptura_dias`, `inv_umbral_sobrestock_dias`, `inv_periodo_default_dias`). Validación cliente: `ruptura ≥ 1`, `sobrestock > ruptura`, `periodo 1–60`. Guarda con `sb.from('tiendas').update({...}).eq('id', tienda.id)` → actualiza `T.state.tienda` → **re-fetch del tab activo → la clasificación se re-renderiza en vivo**.

**Semáforo (5 clases):** rojo (`quiebre`, `ruptura`) → `.ta-pill--danger`; ámbar (`sobrestock`) → `.ta-pill--warn`; gris (`sin_ventas`) → pill `--ta-text-mut`; `normal` → sin color. `datos_insuficientes` → notita discreta ("pocos días de data"), NO alarma.

**Estados:** loading (skeleton/spinner), vacío (mensaje por tab), error (toast/inline + reintento). Miniatura NULL → placeholder (ícono).

---

## 4. Las 4 vistas

### GENERAL (paginada)
- `inventario_resumen(tienda, periodo, 'referencia', NULL, proveedor, categoria, buscar, p_limit, p_offset)`.
- Tabla densa: miniatura (o placeholder) · referencia+nombre · stock · costo · valor · **días de inventario con semáforo** (0→"Agotado", NULL→"—") · última venta · proveedor.
- Paginación: `total_count` (de la 1ª fila) + `p_limit`/`p_offset` → "N productos" + controles. `datos_insuficientes` como notita en la fila.
- **Clic en fila → drill-down** (`inventario_variantes`): despliega stock/reservado/disponible por color·talla (con `foto_color_url` si hay). Fetch lazy al expandir, cacheado por `producto_id` en sesión.

### SOBRESTOCK & RUPTURA (NO paginada — lista de acción)
- **Una** llamada `inventario_resumen(tienda, periodo, 'dias_asc', ['quiebre','ruptura','sobrestock'], filtros, p_limit=alto/sin tope, 0)` → **split en cliente**:
  - **Reponer** (arriba): `quiebre` + `ruptura`, lo urgente primero (dias_asc ya deja quiebre[0]→ruptura).
  - **Liquidar** (abajo): `sobrestock`.
- Es una lista de problemas para trabajar, no el catálogo → no se pagina (si algún día crece mucho, se pasa a dos llamadas paginadas por sección — fuera de alcance MVP). Mismo drill-down.

### SIN VENTAS (paginada)
- `inventario_resumen(tienda, periodo, 'valor', ['sin_ventas'], filtros, p_limit, p_offset)` → por valor desc (capital muerto primero) + **días desde la última venta** (de `fecha_ultima_venta`; "nunca" si NULL). Mismo drill-down.

### KARDEX
- **Selector de referencia dentro del tab** (buscar/elegir producto de la tienda). Al elegir → `inventario_kardex(tienda, producto_id, variante_id?, desde?, hasta?, limit, offset)`.
- **Date-picker de rango** (filtra por `fecha`) + filtro opcional por variante. Columnas: fecha · tipo · entrada(+) · salida(−) · saldo_acumulado · costo unit · costo saldo. (Acá se re-confirma empíricamente el filtro por fecha con rangos reales.)
- **Link "ver kardex" desde el drill-down** (si trivial): como el drill-down ya tiene `producto_id`, un botón que cambia al tab KARDEX pre-filtrado por esa referencia. Si no sale barato, se difiere; el selector del tab es el camino MVP.

---

## 5. Gate de build

- **(1) shell + GENERAL + drill-down + paginación → OK VISUAL de Jorge** (checkpoint antes del resto).
- (2) SOBRESTOCK&RUPTURA (Reponer/Liquidar) + SIN VENTAS.
- (3) KARDEX (selector + date-picker + variante).
- (4) Ajustes inline de umbrales.
- **Asserts funcionales:** datos del front == RPCs; paginación (total_count/limit/offset); drill-down (suma de variantes == total de la referencia); KARDEX por fecha (rango real); **prueba clave: editar un umbral inline → la clasificación se re-renderiza sola**; seguridad (RPC nueva con candado dueño/anon; umbrales por el camino RLS existente).
- Deploy a test (Easypanel es manual → Jorge da "Implementar"; verificar live byte-idéntico al commit antes del OK visual).

---

## 6. Fuera de alcance (después)

Filtro global por color/talla; toggle "cobertura sobre disponible" (tras probar reservas); multi-página de la lista de acción; deep-linking de tabs/kardex por sub-route.

---

## 7. Decisiones del brainstorming (A/B/C/D/E — Jorge, 2026-06-21)

- **A.** Miniatura NULL → placeholder en GENERAL; foto por color solo en drill-down (no tocar 1a).
- **B.** SOBRESTOCK&RUPTURA: una llamada + split en cliente; **ese tab NO pagina** (set de acción completo); GENERAL y SIN VENTAS sí paginan.
- **C.** Selector de referencia en el tab KARDEX (acceso directo); + link "ver kardex" desde drill-down si es trivial.
- **D.** Validación cliente (ruptura≥1, sobrestock>ruptura, periodo 1–60) **+ CHECK constraint en BD** (invariante real, display-only).
- **E.** Período header = override de sesión (`p_periodo`, no persiste); `inv_periodo_default_dias` se cambia solo en Ajustes (persiste). Al cargar, el período activo refleja el default de la tienda.
