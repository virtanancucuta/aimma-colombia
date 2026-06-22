# Inventario · GENERAL — KPIs + Cobertura general (por costo) · Spec build-ready

Fecha: 2026-06-22
Módulo: **Inventario** (Tienda IA), tab **GENERAL**. Branch `feat/inv-1b-kpis-totales`.
Supabase `aimma` (ref `rsmxklkxqsaptchcjszd`) = test. Deploy: merge a main + Jorge Implementa. Deploy-to-prod OFF.

> **Alcance:** barra de KPIs arriba (3 cifras) + fila de totales abajo + totales en el Excel, todo **recalculado con el set filtrado del momento** (proveedor/categoría/buscador), sin paginar. Nueva RPC `inventario_totales`. Storefront NO se toca. Solo GENERAL.

---

## 1. Hechos confirmados (PASO 0, data real test)
- `inv_periodo_default_dias` = **30** (ya es el default que Jorge quiere; editable a futuro 90/120).
- Las ventas del kardex traen `costo_unitario` poblado (**10/10, 0 sin costo**) → el COGS (costo de venta del período) es calculable desde `inventario_movimientos`.
- Validación de la fórmula con la tienda test (sin filtros): unidades=658, valor_inventario=$8.000.000, COGS_30=$1.216.000 → cobertura general = 8.000.000 / (1.216.000/30) = **197,4 días**.

## 2. Decisiones (Jorge, 2026-06-22)
- **3 KPIs arriba:** **Unidades** (total stock) · **Valor de inventario** (SUM stock×costo) · **Cobertura general** (por costo).
- **Cobertura general = `Valor de inventario ÷ (Costo de venta del período ÷ días)`** (= métrica DIO/Días de Inventario). **Solo número, SIN color/semáforo.** Etiqueta inline **"(cobertura según tu costo)"** + "últimos N días".
- **Recalcula con el filtro:** los 3 KPIs reflejan el set filtrado (proveedor/categoría/subcategoría/buscador) del momento, NO solo la página visible.
- **Fila de totales abajo:** solo numérica — **cantidad (unidades) + costo total (valor)** — alineada a las columnas STOCK y VALOR.
- **Excel:** fila de totales (unidades + valor) + la cobertura general como cifra etiquetada.
- La cobertura **por referencia** (tabla) NO cambia: sigue por unidades, con su explicación actual ("Cobertura = para cuántos días te alcanza el stock, según tu ritmo de venta") y su semáforo. Las dos coberturas son complementarias (unidades=operativa por SKU / costo=financiera agregada).
- Período **30 default**.

## 3. BD — `inventario_totales` (capa de datos, verificar en test antes de UI)

Migración `20260622170000_inv_totales.sql`. RPC nueva (agrega sobre el set filtrado completo, sin paginar):

```
inventario_totales(p_tienda_id uuid, p_periodo int default null,
  p_proveedor_id uuid default null, p_categoria_id uuid default null, p_buscar text default null)
returns table(total_unidades bigint, valor_inventario numeric, costo_venta_periodo numeric,
              cobertura_general_dias numeric, periodo int)
```
Lógica:
- Candado: `SECURITY DEFINER STABLE search_path=public`, dueño 1ª línea (`tienda_ia_es_dueno`), `REVOKE … FROM public, anon, authenticated` + `GRANT EXECUTE TO authenticated`, `#variable_conflict use_column`.
- `v_periodo = LEAST(coalesce(p_periodo, inv_periodo_default_dias), 60)`.
- `v_dias_efectivos = LEAST(v_periodo, GREATEST(1, current_date - tiendas.created_at::date))` (normaliza tienda nueva; para tienda establecida = v_periodo).
- **MISMOS filtros que `inventario_resumen`** (CTE `base` idéntico: proveedor + categoría con hijos por `parent_id` + buscador escapado con `\`).
- `total_unidades` = SUM(pv.stock) sobre variantes de `base`.
- `valor_inventario` = SUM(pv.stock × productos.costo) sobre `base`.
- `costo_venta_periodo` = `-1 × SUM(im.cantidad × im.costo_unitario)` para `im.tipo in ('venta','devolucion')` con `im.created_at >= now() - make_interval(days => v_periodo)`, sobre productos de `base`.
- `cobertura_general_dias` = `case when valor_inventario = 0 then 0 when costo_venta_periodo <= 0 then null else valor_inventario / (costo_venta_periodo / v_dias_efectivos) end`.

**Verificación BD (impersonando dueño, rollback):**
- Sin filtros: total_unidades=658, valor_inventario=8.000.000, costo_venta_periodo=1.216.000, cobertura ≈197,4 (== cálculo directo, == PASO 0).
- Con filtro de categoría/proveedor: los totales bajan al subconjunto (probar 1 categoría → recomputar a mano y comparar).
- COGS=0 (filtro sin ventas) → cobertura NULL. valor=0 → cobertura 0.
- Grants: authenticated sí / anon no.

## 4. Front (`iapanel/tienda/admin/views/inventario.js` + `admin.css`)

### 4.1 Estado
`invState.totales = null`. Se invalida (`= null`) al cambiar período o filtros (proveedor/categoría/buscador) — NO en paginación ni orden (la suma es independiente de orden/página).

### 4.2 Fetch
En el flujo de render de GENERAL, si `invState.totales == null`, llamar `inventario_totales(tienda, periodo, proveedor_id, categoria_id, buscar)` y cachear. (Va en paralelo con `inventario_resumen`.)

### 4.3 Barra KPI (arriba, entre filtros y tabla)
3 cifras inline (contraste AA, **sin gradiente, sin tarjetas-cliché**, sin hero-metric):
- **Unidades:** `fmtNum(total_unidades)` + label "unidades".
- **Valor de inventario:** `fmtCOP(valor_inventario)` + label "en inventario".
- **Cobertura general:** número de días (sin color) — `cobTextoGeneral(t)`: si valor=0 → "Sin inventario"; si cobertura NULL → "Sin ventas"; else `Math.round(dias) + " días"`. Subtítulo: **"(cobertura según tu costo · últimos N días)"**.
Diseño con ui-ux-pro-max + impeccable (clase `.ta-inv-kpis`).

### 4.4 Fila de totales (abajo, tras la lista, antes de la paginación)
Fila alineada a la grilla del padre (`.ta-inv-totes`, comparte `grid-template-columns`): etiqueta "TOTALES" en la celda de referencia, `total_unidades` bajo STOCK, `fmtCOP(valor_inventario)` bajo VALOR; resto vacío. Solo numérica.

### 4.5 Excel
Tras las filas de producto/variante, agregar fila vacía + fila **TOTALES** (unidades en col Stock, valor en col Valor). Y una fila/celda con **"Cobertura general (según tu costo): N días"**. Usa los mismos datos de `inventario_totales` (llamada en `exportarExcel` con los filtros vigentes).

### 4.6 Responsive
La barra KPI se apila/wrap en mobile (las 3 cifras en columna o 2+1). La fila de totales en mobile se muestra como bloque "TOTALES: N unidades · $X".

## 5. Gate de build
- BD verificada en test (asserts §3) antes de la UI.
- `node --check`.
- Funcional (Jorge desktop + celular): los 3 KPIs cambian al aplicar filtro de categoría/proveedor (recomputan el subconjunto); la fila de totales abajo coincide; el Excel trae los totales + cobertura general. Cobertura general sin color. **OK visual de Jorge.**
- Deploy: merge a main + Jorge Implementa; curl byte-idéntico.

## 6. Fuera de alcance
KPIs en los otros 3 tabs (reusar después); semáforo en la cobertura general (no, número limpio); período editable >60 (futuro); cobertura general por unidades (no aplica — unidades no agregan entre SKUs).
