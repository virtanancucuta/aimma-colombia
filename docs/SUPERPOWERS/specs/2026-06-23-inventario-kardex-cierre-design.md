# Inventario · Cierre Fase 1b (Kardex A+B · Vistas C) · Spec

Fecha: 2026-06-23 · Módulo Inventario (Tienda IA). Supabase `aimma` = test. Deploy: merge a main + Jorge Implementa. Deploy-to-prod OFF. Branch nueva `feat/inv-1b-cierre`.

> **Alcance (todo LECTURA):** **Bloque 1** = A (Ver movimientos a nivel referencia, todas las variantes) + B (filtro Entradas/Salidas en el panel) — **front puro, sin BD**. **Bloque 2** = C (2 vistas agregadas: Por proveedor / Por categoría) — **2 RPCs nuevas con candado + seed de prueba**. **D (Quién) → backlog** (atado a Usuarios + POS/Ventas; `creado_por` ya se guarda, la auditoría queda retroactiva). **Fuera de alcance:** crear/editar movimientos (Fase 2 Compras), el ajuste-con-costo, el puente "Comprá 9→orden".

---

## 1. PASO 0 (verificado 2026-06-23, contra BD + código)
- **A:** `inventario_kardex(p_variante_id=null)` ya devuelve TODAS las variantes; el panel actual (`renderKardexPanel`+`loadKardexPanelRows`) acepta varianteId vacío. El kardex devuelve columnas `entrada`/`salida` (signo). El **dropdown de variante se eliminó** en el rediseño a drop progresivo.
- **B:** tipos reales: `saldo_inicial`(+), `entrada`(+), `ajuste`(±), `venta`(−). Entradas = `entrada>0`; Salidas = `salida>0`. Filtro 100% en cliente.
- **C:** `proveedores`(id/tienda_id/nombre NOT NULL/telefono/created_at), 0 existentes. `categorias`(id/tienda_id/parent_id/nombre/slug NOT NULL/orden def 0/foto_url), **profundidad máx 2** (padre→hija). 36 productos: **36 sin proveedor**, 33 sin categoría. **Costo inventario total = $8.000.000** (Σ `stock×costo` directo == `inventario_totales.valor_inventario` de GENERAL, cuadra ✓; 658 unidades). El número sagrado del Bloque 2.
- **Reúsos front:** `filaGeneral`, `toggleDrill`/`drillHtml`, `loadXLSX`, `xlsxDescargar`, `renderKardexPanel`+`loadKardexPanelRows`, patrón de tabla/tabs/`.ta-inv-*`. ✓

## 2. Decisiones
- **(A1)** Botón **"Ver movimientos (todas)"** en la **fila de referencia** del Kardex Nivel 1 (`filaKxRef`), `stopPropagation` para no togglear el drop. Abre el panel en modo **todas-variantes** (`varianteId=''`). Los botones por-variante del drop siguen igual.
- **(A2)** Regla de columnas en el panel (ya diseñada): **todas las variantes → columna Variante por fila, SIN Saldo** (el saldo salta entre variantes); **una variante → CON Saldo corrido, sin Variante**. Flag `todas = !panel.varianteId`.
- **(B1)** Dropdown **Tipo: Todos / Entradas / Salidas** en los controles del panel (junto a Desde/Hasta). Filtro en cliente sobre `panel.rows` (`entrada>0` / `salida>0`). El `saldo_acumulado` mostrado por fila NO se recalcula (es el acumulado real hasta esa fila aunque se oculten otras).
- **(C1)** Seed QAINV aislado y reversible: 3 proveedores (`QAINV Prov A/B/C`) + 1 árbol de categorías QAINV (padre `QAINV Calzado` con 2 hijas `QAINV Tacón`, `QAINV Bota`). Asignar a algunos productos QAINV; **dejar a propósito** varios sin proveedor y sin categoría (para que la fila "Sin proveedor"/"Sin categoría" tenga data). Al menos: productos en las 2 hijas + ≥1 producto directo en el padre → ejercita el rollup. **El seed NO toca stock/costo → el total sigue $8.000.000** (verificar post-seed).
- **(C2)** `inventario_por_proveedor(p_tienda_id)` → filas: proveedor (o "Sin proveedor") con `num_referencias`, `cantidad`(Σstock), `costo_total`(Σstock×costo), `pct`(costo_total/total×100). Orden costo desc, "Sin proveedor" al final.
- **(C3)** `inventario_por_categoria(p_tienda_id, p_parent_id=null)`: modo MAIN (parent null) = agrupar por **ancestro top-level** (`coalesce(cat.parent_id, cat.id)`) → rollup padre-incluye-hijas, cada producto **una vez** + "Sin categoría". Modo DRILL (`p_parent_id=X`) = hijas directas de X + fila "(Directo en categoría)" para productos directos en X. `pct` siempre sobre el total de la tienda (así las hijas suman el % del padre). Profundidad 2 confirmada → sin nietos.
- **(C4) Verificación dura (antes de UI):** (a) Σ `costo_total` de TODAS las filas de `inventario_por_proveedor` == **$8.000.000**; (b) Σ `costo_total` de las filas MAIN de `inventario_por_categoria` == **$8.000.000**; (c) Σ `pct` ≈ 100 en ambas; (d) un grupo puntual vs cálculo directo; (e) Σ filas DRILL de un padre == su `costo_total` rollup; (f) no-dueño rechazado, anon sin execute. Si alguna no da, hay doble conteo → PARAR y reportar.
- **(C5) UI:** 2 tabs nuevos (Por proveedor / Por categoría). Tabla: grupo · # refs · cantidad · costo · **% con barra visual**. Drill a las **referencias del grupo** (reúsa `inventario_resumen` con `p_proveedor_id`/`p_categoria_id` — éste ya hace rollup padre-incluye-hijas). Categoría: drop de **subcategoría** (`inventario_por_categoria` con `p_parent_id`) antes del drill a referencias. **Excel** en ambos (números como número + fila TOTAL). Desktop + mobile (patrón tabla→tarjetas). Filas con grilla propia → flex o `:not()` para no chocar con el grid ancho de GENERAL.

## 3. Candado RPCs (C)
SECURITY DEFINER STABLE, `set search_path to 'public'`, **dueño 1ª línea** (`tienda_ia_es_dueno`), `#variable_conflict use_column`, `REVOKE ALL FROM public, anon, authenticated` + `GRANT EXECUTE TO authenticated`. Asserts EJECUTAN la RPC contra data real (no solo "existe"). Registro alineado al repo tras `apply_migration`.

## 4. Gates
- **Bloque 1 (checkpoint):** saldo de la fila más reciente (1 variante) == stock real; vista todas-variantes muestra Variante y NO saldo; el filtro Tipo cuenta bien entradas/salidas. → números + OK visual de Jorge. No avanzar a Bloque 2 sin OK.
- **Bloque 2 (checkpoint):** verificación dura C4 (las 3 cifras == $8.000.000, sin doble conteo) ANTES de UI; luego UI desktop+mobile + Excel + OK visual. → cierra Fase 1b.

## 5. Fuera de alcance
Escribir el kardex (Fase 2 Compras), D/Quién (backlog Usuarios+POS), Excel del kardex ya existe. Cleanup seed QAINV-* al cerrar (no borrar sin confirmar).
