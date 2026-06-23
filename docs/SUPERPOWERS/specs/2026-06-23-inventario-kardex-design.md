# Inventario · Tab KARDEX (movimiento por movimiento) · Spec

Fecha: 2026-06-23
Módulo: **Inventario** (Tienda IA), tab **Kardex** (id `kardex`). Branch `feat/inv-1b-kardex`.
Supabase `aimma` = test. Deploy: merge a main + Jorge Implementa. Deploy-to-prod OFF.

> **Alcance:** último tab. Master-detail: el usuario **elige una referencia** y ve **su kardex** (movimiento por movimiento: entradas, ventas, ajustes, saldo). Filtro por **variante** + rango de **fechas**. **Front-only, SIN RPC nueva** (`inventario_kardex` ya existe de Fase 1a; `inventario_resumen` para el selector de referencia; `inventario_variantes` para el dropdown de variantes). Ancho desktop con el patrón `.ta-main--inv-wide` (excluyendo kardex del grid de GENERAL — lección de S&R/Sin Ventas).

---

## 1. PASO 0 (confirmado, 2026-06-23)
- **`inventario_kardex(p_tienda_id, p_producto_id, p_variante_id, p_desde date, p_hasta date, p_limit=200, p_offset=0)`** → `fecha, tipo, cantidad, entrada, salida, costo_unitario, costo_saldo, saldo_acumulado, color, talla, sku, nota, pedido_id`. SECURITY DEFINER, dueño 1ª línea, REVOKE/GRANT. `p_desde/p_hasta` filtran por `fecha`; el saldo se computa sobre todo el historial.
- **`saldo_acumulado` corre POR VARIANTE** (`partition by variante_id order by created_at`). Verificado: con "todas las variantes" el saldo salta entre tallas (QAINV-MV: 19→5→-2→100). → **el saldo solo es legible filtrado a UNA variante.**
- `inventario_resumen` da la lista de referencias (producto_id, referencia, nombre) con los filtros del shell. `inventario_variantes(tienda, [producto_id])` da las variantes (variante_id, color, talla, sku) para el dropdown.
- Tipos de movimiento: `saldo_inicial, entrada, ajuste, venta` (+ `devolucion` posible).

## 2. Decisiones (propuestas para tu verificación)
- **(D1) Master-detail:** estado A = elegir referencia (buscador + lista clickeable, reúsa filtros del shell); estado B = kardex de la referencia elegida + botón "← Cambiar referencia".
- **(D2) Variante:** dropdown "Todas" + cada variante. Default: si la referencia tiene 1 variante → esa; si tiene varias → "Todas".
- **(D3) Columna Saldo SOLO cuando se filtra UNA variante** (donde el saldo corre limpio). Con "Todas", se muestra la **columna Variante** (color/talla) y NO la de saldo (evita el salto confuso 19→-2→100). Esta es la decisión clave por el PASO 0.
- **(D4) Rango de fechas:** inputs `Desde`/`Hasta` (`<input type=date>`). Default: sin filtro (todo el historial). Pasa `p_desde`/`p_hasta`.
- **(D5) Columnas (estado B):** Fecha · Movimiento · Entrada · Salida · [Saldo si 1 variante] · Costo unit · [Variante si Todas] · Nota. Tipos en humano: Venta / Entrada / Saldo inicial / Ajuste / Devolución. Entrada en verde, Salida en ámbar (AA).
- **(D6) Paginación:** `p_limit=200`, botón "Ver más" (offset += 200) que appendea. (Un kardex puede ser largo.)
- **(D7) Shell:** en Kardex se ocultan período global (usa rango de fechas), Ordenar y Exportar Excel. El buscador/proveedor/categoría se usan en el estado A (selector de referencia).

## 3. Arquitectura (front-only)
- **Estado:** `invState.kardex = { productoId, ref, nombre, varianteId, desde, hasta, variantes, rows, offset, fin }`.
- **Routing:** `renderActiveTab` → `if (tab==='kardex') fetchAndRenderKardex(cont)`.
- **Estado A (sin referencia):** `inventario_resumen(tienda, periodo, 'referencia', null, filtros, p_limit=50)` → lista compacta de referencias (referencia + nombre, clickeable). Texto guía. Al click → set `kardex.productoId/ref/nombre`, cargar variantes + kardex.
- **Estado B (con referencia):** cargar `inventario_variantes(tienda, [productoId])` (para el dropdown) + `inventario_kardex(tienda, productoId, varianteId, desde, hasta, 200, offset)`. Render header + controles + tabla + "Ver más".
- **Cambiar variante/fechas** → resetear offset + re-fetch. **"Ver más"** → offset += 200, append.
- **Ancho desktop:** el kardex tiene su propia grilla (`.ta-inv-kx*`); excluirla del grid ancho de GENERAL (`:not(.ta-inv-kxrow)` en el `@media ≥1500`).
- **Mobile:** la tabla del kardex colapsa en filas apiladas con labels (patrón de los otros tabs).

## 4. Gate de build
- `node --check`. **Verificación de datos (impersonando dueño):** kardex de QAINV-MV filtrado a la talla S da saldo limpio (19 → 5); "Todas" muestra la columna Variante sin saldo; rango de fechas filtra; paginación. Cross-check: saldo_acumulado de la última fila de una variante == su stock actual.
- Funcional (Jorge desktop+mobile, QAINV): elegir referencia (buscar/filtrar) → kardex; cambiar variante → saldo limpio; rango de fechas; "Ver más"; tipos legibles; sin período/Ordenar/Excel; ancho desktop; mobile. **OK visual de Jorge.**
- Deploy: merge a main + Implementa; curl byte-idéntico + bump `?v=`. **Audit de columnas (head=filas) antes de avisar** (lección Sin Ventas).

## 5. Fuera de alcance
Editar/crear movimientos (eso es Productos/Compras); exportar kardex a Excel (reusable después); el botón "¿Cómo funciona?" (guía global). Con Kardex se cierra Fase 1b — luego cleanup del seed QAINV-*.
