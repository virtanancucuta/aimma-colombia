# Inventario · GENERAL — Ordenar + Exportar Excel · Spec build-ready

Fecha: 2026-06-21
Módulo: **Inventario** (Tienda IA), tab **GENERAL**. Branch `feat/inv-1b-orden-export`.
Supabase `aimma` (ref `rsmxklkxqsaptchcjszd`) = test. Deploy: merge a main + Jorge Implementa. Deploy-to-prod OFF.

> **Alcance:** (1) dropdown **"Ordenar por"** en GENERAL (server-side, vía RPC); (2) botón **"Exportar Excel"** del view actual (filtros + orden vigentes, completo sin paginar), con categoría/subcategoría y variantes debajo. Toca la capa de datos: 3 casos de orden nuevos en `inventario_resumen` + generalizar `inventario_variantes` a array de producto_ids. Storefront NO se toca. Solo GENERAL (los otros tabs lo reusan después).

---

## 1. Hechos confirmados (PASO 0)
- **SheetJS NO está en el repo** → se carga **lazy** (import dinámico desde CDN al primer click de export), no en el `<script>` inicial.
- **`inventario_resumen.p_orden`** hoy: `valor` (costo total ↓), `unidades`, `dias_asc`, `dias_desc`, `referencia` (default). Faltan: costo total ↑ y cantidad ↓/↑.
- `inventario_resumen` devuelve `categoria_id` + `categoria_nombre` (hoja). Categoría/Subcategoría del Excel se resuelven **en cliente** desde `invState.catalogos.categorias` (`parent_id`) — sin tocar la RPC.
- `inventario_variantes(uuid,uuid,int)` (v2) devuelve cobertura por variante. Se generaliza a array.

## 2. Decisiones (Jorge, 2026-06-21)
- Excel: cliente con **SheetJS**, botón en el header; exporta el **view del momento** (filtros + orden), completo sin paginar. Estructura aprobada (cat/subcat + ref-total + variantes debajo).
- Orden: **dropdown** (no flechas — no viables en mobile). Opciones: **Referencia A-Z (default)** · Cantidad ↓ · Cantidad ↑ · Costo total ↓ · Costo total ↑. (Sin orden por cobertura: eso es la pestaña Sobrestock/Ruptura.)
- Fuente de variantes del export = **Opción A**: generalizar `inventario_variantes` a `p_producto_ids uuid[]` (una RPC sirve al drill con 1 id y al export con N ids). 2 llamadas en el export.
- Solo **GENERAL** por ahora.

---

## 3. BD (capa de datos — verificar en test antes de UI)

Migración `20260621200000_inv_orden_y_variantes_bulk.sql`:

### 3.1 `inventario_resumen` — 3 casos de orden nuevos (CREATE OR REPLACE)
En el `order by`, agregar (sin tocar lo demás):
```
case when v_orden = 'valor_asc'     then f.valor_inventario end asc  nulls last,
case when v_orden = 'cantidad_desc' then f.stock_total      end desc nulls last,
case when v_orden = 'cantidad_asc'  then f.stock_total      end asc  nulls last,
```
(`valor` = costo total ↓ ya existe; `referencia` sigue de default y tie-breaker.) Resto de la función idéntico.

### 3.2 `inventario_variantes` → array (DROP v2 + CREATE v3)
```
drop function if exists public.inventario_variantes(uuid, uuid, int);
inventario_variantes(p_tienda_id uuid, p_producto_ids uuid[], p_periodo int default null)
returns table(producto_id uuid, variante_id uuid, color text, talla text, sku text,
  stock int, reservado int, disponible int, foto_color_url text,
  unidades_vendidas bigint, venta_diaria numeric, dias_inventario numeric,
  clasificacion text, datos_insuficientes boolean)
```
- Misma lógica de cobertura por variante (guard <7, `dias_efectivos` = `LEAST(periodo, GREATEST(1, today − producto.created_at::date))` por el producto de cada variante, join a `productos`).
- `where pv.producto_id = any(p_producto_ids) and p.tienda_id = p_tienda_id` (tenant-safe: ids de otra tienda → 0 filas). Devuelve `producto_id` (para agrupar). Orden: `producto_id, color nulls first, talla nulls first, sku`.
- `SECURITY DEFINER STABLE search_path=public`, dueño 1ª línea, `REVOKE … FROM public, anon, authenticated` + `GRANT EXECUTE TO authenticated`, `#variable_conflict use_column`.
- Registro alineado al repo a mano.

**Verificación BD (impersonando dueño, rollback):**
- Drill (1 id): `inventario_variantes(tienda, ARRAY[QAINV-MV], 30)` → talla S ruptura / talla L sobrestock (igual que v2).
- Export (N ids): `inventario_variantes(tienda, ARRAY[varias refs], 30)` → variantes de todas, agrupables por `producto_id`, cobertura por variante == cálculo directo.
- Tenant-safe: incluir un producto_id de otra tienda → no aparece.
- Grants: authenticated sí / anon no; firma vieja (uuid,uuid,int) eliminada.

## 4. Front

### 4.1 Estado
`invState.orden = 'referencia'` (default). El drill pasa a llamar `inventario_variantes(tienda, [productoId], periodo)`.

### 4.2 Dropdown "Ordenar por" (header, junto a los filtros)
`<select id="inv-orden">` con: Referencia (A-Z)=`referencia` · Cantidad: mayor a menor=`cantidad_desc` · Cantidad: menor a mayor=`cantidad_asc` · Costo total: mayor a menor=`valor` · Costo total: menor a mayor=`valor_asc`. Cambiar → `invState.orden` + `page.offset=0` + `general=null` + re-render. `fetchAndRenderGeneral` pasa `p_orden: invState.orden`. (Orden server-side: ordena TODO el set, después pagina.)

### 4.3 Botón "Exportar Excel" (header)
- Lazy-load SheetJS al primer click: `import('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.mjs')` (o CDN equivalente), con estado de carga ("Exportando…") y manejo de error (toast).
- Datos: 
  1. `inventario_resumen(tienda, periodo, invState.orden, NULL, filtros…, p_limit=NULL, 0)` → todas las filas del view (filtros + orden vigentes, sin paginar). Capturar `producto_id[]`.
  2. `inventario_variantes(tienda, producto_ids, periodo)` → todas las variantes; agrupar por `producto_id` en cliente.
- Construir workbook (SheetJS, `aoa_to_sheet`): encabezado **Categoría · Subcategoría · Referencia · Nombre · Stock · Costo · Valor · Cobertura (días) · Clasificación · Última venta · Proveedor**. Por cada referencia: una fila con su total; debajo, una fila por variante (Categoría/Subcategoría vacías o "↳", Referencia=color/talla, Stock/Cobertura/Clasificación de la variante, Costo/Valor en blanco o el de la variante si aplica). Categoría/Subcategoría se resuelven del catálogo (`parent_id`): si la categoría del producto tiene parent → Categoría=parent.nombre, Subcategoría=cat.nombre; si no → Categoría=cat.nombre, Subcategoría vacía.
- Descarga: `XLSX.writeFile(wb, 'Inventario_<slug>_<YYYY-MM-DD>.xlsx')` (fecha del cliente).
- Si 0 filas: toast "No hay productos para exportar con esos filtros" (no descarga).

### 4.4 Responsive
El header ya hace `flex-wrap`; el dropdown y el botón se acomodan en mobile. El export funciona igual en mobile (no depende de flechas).

## 5. Gate de build
- BD verificada en test (asserts §3) antes de la UI.
- `node --check`.
- Funcional: ordenar por cada opción reordena el set completo (no solo la página); el Excel descarga con los filtros+orden del momento, con cat/subcat y variantes debajo; cobertura por variante en el Excel == la del drill.
- **OK visual de Jorge** (desktop + celular): dropdown y botón legibles/usables; el Excel abre bien con la estructura pedida.
- Deploy: merge a main + Jorge Implementa.

## 6. Fuera de alcance
Export de los otros 3 tabs (reusar después); flechas en headers de columna (no, dropdown); orden por cobertura en GENERAL (es la pestaña Sobrestock/Ruptura); estilos avanzados del Excel (colores de celda por semáforo) — MVP en texto.
