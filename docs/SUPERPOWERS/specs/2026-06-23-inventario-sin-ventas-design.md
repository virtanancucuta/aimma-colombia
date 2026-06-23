# Inventario · Tab SIN VENTAS (capital muerto) · Spec

Fecha: 2026-06-23
Módulo: **Inventario** (Tienda IA), tab **Sin ventas** (id `sinventas`). Branch `feat/inv-1b-sinventas`.
Supabase `aimma` (ref `rsmxklkxqsaptchcjszd`) = test. Deploy: merge a main + Jorge Implementa. Deploy-to-prod OFF.

> **Alcance:** tercer tab funcional. Lista de **productos con stock que NO rotaron en el período** (capital muerto, clasificación `sin_ventas`). Vista compacta (consistente con S&R). **Selector de ventana de venta propio del tab: 30 (default) / 45 / 60 / 90 días** → requiere **subir el cap de período (60→120) en las RPCs**. Columna nueva **"Última fecha de ingreso"** (último restock/modificación) → columna nueva en `inventario_resumen`. Filtros proveedor/categoría/subcategoría/buscar **se reúsan del shell** (ya existen). Ancho desktop con el patrón `.ta-main--inv-wide`.

---

## 1. PASO 0 (confirmado, data real 2026-06-23)
- Tipos de kardex existentes: `ajuste, entrada, saldo_inicial, venta`. → **"última fecha de ingreso"** = `max(im.fecha) filter (tipo in ('entrada','saldo_inicial','ajuste'))` (ajuste = modificación de stock por Productos; entrada = Compras futuro).
- Las 5 RPCs cap período a **60** (`LEAST(coalesce(p_periodo, default), 60)`). Pasar 90 hoy → 60. **Bloquea la ventana de 90 días.**
- `inventario_resumen` devuelve `fecha_ingreso` = **min** (primera entrada). Falta la **última** (max).
- **25 productos `sin_ventas`** en el seed (incl. QAINV-M1, 009, 002 = nunca vendidos) → buen set de prueba.
- `inventario_resumen` ya recibe `p_proveedor_id`, `p_categoria_id` (subcategorías por `parent_id`), `p_buscar`, `p_clasificacion` → **los filtros del shell sirven sin cambio**.

## 2bis. RESUELTO (Jorge, 2026-06-23)
- **Cap → 120** (no 90): headroom para un futuro 120 días sin re-tocar BD.
- **"Último ingreso" = solo movimientos que SUMAN stock:** `entrada` + `saldo_inicial` + `ajuste con cantidad > 0`. **Verificado empíricamente:** el kardex guarda `cantidad` con signo y EXISTE un `ajuste = −4` (corrección a la baja) → un ajuste negativo NO es ingreso, se excluye (si no, el dato miente en correcciones a la baja).
- **Proveedor = opción (b):** subtítulo "Proveedor: X" bajo la referencia (no columna propia) → mantiene la vista limpia de 4 columnas; para escanear/agrupar por proveedor está el filtro del shell.
- **Total con la ventana en el texto:** "$X en N producto(s) · sin rotación en los últimos [30/45/60/90] días" (se actualiza con el selector).
- Task 1 (BD) con verificación contra data real ANTES de la UI; gate de Jorge con los números (cap 120 deja pasar 90; fecha_ultimo_ingreso correcta con el filtro de signo).

## 2. Decisiones (Jorge + propuestas para tu review)
- **(D1) Ventana de venta editable SOLO en este tab:** selector **30 (default) · 45 · 60 · 90**. (El toggle global 30/60 se oculta en este tab; Sin Ventas usa su propia ventana `invState.sinventasPeriodo`.)
- **(D2) Columna nueva "Última fecha de ingreso"** = último restock/modificación (entrada/saldo_inicial/ajuste). Mostrar relativo "hace N días" (o "—" si no hay).
- **(D3) Filtros** proveedor/categoría/subcategoría/buscar = reúso del shell (importantísimo, ya está).
- **(D4) Vista compacta** (propuesta, consistente con S&R), columnas: **Referencia · Última venta · Última ingreso · Capital parado**, orden **valor desc** (más capital muerto primero). "Última venta" relativa ("hace N días" / "Nunca vendido"). Sin semáforo de cobertura (sería "Sin ventas" en todas, redundante).
- **(D5) Total arriba:** "$X parados en N productos sin rotación · ventana de N días."
- **(D6) Drill por variante:** stock + capital (stock×costo padre) por variante.
- **(D7) Cap de período → 120** en `inventario_resumen` + `inventario_variantes` (cubre 30/45/60/90 + headroom). GENERAL/S&R pasan ≤60 (toggle), no se afectan. El CHECK del default de la tienda (1-60) NO cambia (Sin Ventas usa ventana por-llamada, no el default).

## 3. BD (capa de datos — rigor: aplicar a test + verificar antes de la UI)

Migración `20260623170000_inv_sin_ventas.sql`:

### 3.1 `inventario_resumen` — DROP + CREATE (agrega columna → cambia RETURNS TABLE)
- Reproducir la función de `20260621200000` con 2 cambios:
  1. Cap: `least(coalesce(p_periodo, t.inv_periodo_default_dias), 120)` (60→120).
  2. En la CTE `vta`, agregar `max(im.fecha) filter (where im.tipo in ('entrada','saldo_inicial','ajuste')) as fecha_ultimo_ingreso`; exponer **nueva columna** `fecha_ultimo_ingreso timestamptz` en RETURNS TABLE + en el SELECT final.
- Como cambia el RETURNS TABLE → `DROP FUNCTION inventario_resumen(uuid,int,text,text[],uuid,uuid,text,int,int)` + CREATE. Mismo candado, `#variable_conflict use_column`, REVOKE/GRANT.

### 3.2 `inventario_variantes` — CREATE OR REPLACE (solo cap)
- Cambiar `60`→`120` en el `least(...)`. Return type sin cambios (no DROP). Mismo candado.

### 3.3 Verificación (impersonando dueño, rollback)
- `sin_ventas @90` ahora puede diferir de `@60` (cap subido). Confirmar que pasa 90 sin capar (v_periodo=90).
- `fecha_ultimo_ingreso` = max(entrada/saldo_inicial/ajuste) ≥ `fecha_ingreso` (min) por producto; spot-check 1 producto contra sus movimientos directos.
- Filtros: contar sin_ventas con/sin filtro de 1 categoría/proveedor coincide.
- Grants authenticated sí / anon no; firma vieja de resumen eliminada.

## 4. Front (`inventario.js` + `admin.css`)

### 4.1 Estado
`invState.sinventasPeriodo = 30`. Holder `invState.sinventas = null`.

### 4.2 Shell
Ocultar el toggle global de período (30/60) cuando `invState.tab === 'sinventas'` (Sin Ventas trae su propia ventana). Mantener buscador/proveedor/categoría (los filtros). Ordenar/Excel siguen ocultos fuera de GENERAL.

### 4.3 Vista (`fetchAndRenderSinVentas` + `renderSinVentas`)
- Selector **"Ventana de venta: [30][45][60][90]"** (segmented) arriba del listado → setea `invState.sinventasPeriodo` + re-fetch.
- `inventario_resumen(tienda, sinventasPeriodo, 'valor', ['sin_ventas'], proveedor, categoria, buscar, NULL, 0)` (sin paginar). Total capital = suma de `valor_inventario` en cliente.
- Lista compacta (grid propio `.ta-inv-item--sv`): **Referencia · Última venta · Última ingreso · Capital parado**. Orden valor desc.
  - Última venta / Última ingreso: helper `haceTxt(fecha)` → "hace N días" / "Nunca" / "—".
- Drill por variante (`drillHtml` con rama sv → stock + capital).
- Estado vacío positivo: "Todo tu stock está rotando. Sin capital muerto en esta ventana."
- Ancho desktop: el `.ta-main--inv-wide` ya se agrega para todo Inventario; agregar grilla ancha ≥1500 para `.ta-inv-item--sv` (repartir las 4 columnas).

## 5. Gate de build
- BD verificada en test (cap 90 funciona, fecha_ultimo_ingreso correcta vs cálculo directo) ANTES de la UI.
- `node --check`. Funcional (Jorge desktop+mobile, QAINV): tab Sin ventas lista los 25; ventana 30/45/60/90 cambia el set; columnas correctas (última venta/ingreso relativas, capital); total; filtros proveedor/categoría/subcategoría/buscar afinan; drill por variante; vacío positivo; ancho desktop; sin Ordenar/Excel; toggle global oculto. **OK visual de Jorge.**
- Deploy: merge a main + Implementa; curl byte-idéntico + bump `?v=`.

## 6. Fuera de alcance
Generar orden / devolución a proveedor (Fase 2 Compras); editar inline; Kardex (próximo tab); cambiar el default global de período (sigue 1-60).
