# Inventario · Ajustes (3 umbrales) + Tab SOBRESTOCK & RUPTURA con sugerencia de compra · Spec

Fecha: 2026-06-22
Módulo: **Inventario** (Tienda IA). Branch `feat/inv-1b-ajustes-accion`.
Supabase `aimma` (ref `rsmxklkxqsaptchcjszd`) = test. Deploy: merge a main + Jorge Implementa. Deploy-to-prod OFF.
**Reemplaza** el plan previo de S&R (commit b38ec9a, descartado).

> **Arquitectura central (Jorge):** UN control —los 3 umbrales de la tienda en **Ajustes**— gobierna las 3 vistas. El comerciante pone sus 3 números una vez; GENERAL pinta alarmas, S&R dice cuánto comprar / cuánto capital parado, y (próximo) Sin Ventas hereda el período. **Ajustes se construye PRIMERO** (alimenta todo). Audiencia: emprendedores sin experiencia comercial pero con lógica → copy en criollo.

## Los 3 umbrales (editables por tienda, con default recomendado)
- **Ruptura:** menos de X días (default **15**) — alarma roja.
- **Inventario óptimo:** X días (default **30**) — META de compra (hasta acá se repone). **Columna nueva.**
- **Sobrestock:** más de X días (default **60**) — alarma de exceso.
- Orden forzado: **ruptura < óptimo < sobrestock**.

---

## PASO 0 (confirmado, empírico 2026-06-22)
- **0.1** `inv_umbral_optimo_dias` NO existe. Las 3 tiendas (maraldo-laureles/dimac/aimma-test) = ruptura 15 / sobrestock 90 / período 30 → **todas cumplen 15<30<90** (ALTER con default 30 seguro). CHECK actual: `ruptura>=1 AND sobrestock>ruptura AND periodo∈[1,60]`.
- **0.2** Guardado por RLS `tiendas_update_propia` (UPDATE del dueño) — mismo camino que `mostrar_resenas_productos`. No se abre otro.
- **0.3** `inventario_resumen` devuelve venta_diaria, dias_efectivos, costo_unitario, datos_insuficientes, stock_total, dias_inventario, clasificacion. `inventario_variantes` (firma array `uuid[]`) devuelve **por variante** venta_diaria, dias_inventario, datos_insuficientes, stock (NO costo → usar el del producto padre). **Sin RPC nueva.**
- **0.4** ⚙ Ajustes hoy = toast placeholder.

## Puntos abiertos surfaceados + resolución propuesta (ajustables en gate)
- **OC1 — dónde se muestra la sugerencia (la grilla de `filaGeneral` es fija de 9 columnas, compartida con GENERAL):** en S&R, debajo de cada fila de referencia se inserta una **sub-fila full-width `filaSugerencia(r)`** (no toca la grilla ni a GENERAL). El **drill por variante** en S&R usa `filaDrillAccion` (variante de `filaDrill`) que agrega la sugerencia por variante. `toggleDrill` se mantiene; se introduce un dispatcher `drillHtml(productoId)` que elige `filaDrill` (GENERAL) o `filaDrillAccion` (accion) según `invState.tab`.
- **OC2 — quiebre/agotado SIN histórico (stock 0 y venta_diaria 0):** no se puede sugerir cantidad → "Sin histórico de venta — definí vos cuánto pedir." (igual trato que datos_insuficientes).
- **OC3 — costo por variante:** `inventario_variantes` no trae costo (es product-level); la sugerencia por variante usa `costo_unitario` del producto padre (de la fila `inventario_resumen`, vía `invState.accion.rows`).
- **OC4 — VER (segmented):** Ruptura (default) · Sobrestock · Agotado. Una sola llamada `inventario_resumen` con `p_clasificacion=['quiebre','ruptura','sobrestock']`, sin paginar; se filtra en cliente por el botón activo (Agotado=quiebre, Ruptura=ruptura, Sobrestock=sobrestock).
- **OC5 — redondeo:** cantidad a comprar = `max(0, ceil(optimo × venta_diaria − stock))`; unidades de más (sobrestock) = `max(0, round(stock − sobrestock × venta_diaria))`. velocidad = `venta_diaria` (la RPC ya la normaliza por `dias_efectivos = LEAST(período, edad)`), así que no recalculo edad en cliente.

---

## PARTE 1 — AJUSTES (construir PRIMERO)

### 1.1 Migración `20260622180000_inv_umbral_optimo.sql` (rigor de capa de datos)
- `ALTER TABLE public.tiendas ADD COLUMN inv_umbral_optimo_dias int NOT NULL DEFAULT 30;`
- Reemplazar `chk_inv_umbrales`:
  `CHECK (inv_umbral_ruptura_dias >= 1 AND inv_umbral_optimo_dias > inv_umbral_ruptura_dias AND inv_umbral_sobrestock_dias > inv_umbral_optimo_dias AND inv_periodo_default_dias BETWEEN 1 AND 60)`
- **Antes del ALTER del CHECK:** confirmar (ya hecho en PASO 0) que toda tienda cumple ruptura<optimo(30)<sobrestock. Verificar POST: las 3 tiendas pasan; un UPDATE que cruce los números (ej. optimo=100) es rechazado por el CHECK.
- No se tocan los valores existentes (sobrestock sigue 90 en las 3; el default 60 es la recomendación que muestra la UI para tiendas nuevas).

### 1.2 UI — panel inline de Ajustes (el engranaje ⚙ de GENERAL)
- Click en ⚙ → abre un **panel inline** (no modal pesado; reusar patrón de cards del admin) con 3 campos numéricos + copy criollo (una línea c/u):
  - **Ruptura** (15): "Avisame cuando a un producto le queden menos de estos días de stock."
  - **Óptimo** (30): "Cuántos días de stock querés tener como meta. Lo usamos para sugerirte cuánto comprar."
  - **Sobrestock** (60): "Avisame cuando un producto tenga más de estos días de stock (capital parado)."
- Botón Guardar + Cancelar. **Validación cliente:** enteros ≥1 y ruptura<óptimo<sobrestock; si cruzan → mensaje claro ("El óptimo debe ser mayor que ruptura y menor que sobrestock"), no se envía.
- Guarda por `tiendas.update` (set inv_umbral_ruptura_dias/optimo/sobrestock). Si el CHECK rechaza igual → mensaje amable, no error crudo.
- Tras guardar: actualizar `T.state.tienda` en memoria + `invState.general=null/totales=null` → re-render → **la clasificación se re-pinta en vivo** (prueba clave: subir el óptimo/ruptura cambia colores al instante).

## PARTE 2 — TAB SOBRESTOCK & RUPTURA (id `accion`)

### 2.1 Estructura
- Reúso total de GENERAL (tabla, semáforo, drill por variante, responsive). Sin vista nueva.
- **Segmented "Ver:"** `Ruptura` (default) · `Sobrestock` · `Agotado`. Una llamada `inventario_resumen(p_clasificacion=['quiebre','ruptura','sobrestock'], p_limit=NULL, filtros)`, split en cliente por el botón activo (`invState.accion.ver`).
- Período 30/60 + buscador + proveedor + categoría **activos**. Se **ocultan** "Ordenar" y "Exportar Excel" (de GENERAL).

### 2.2 Sugerencia de compra (Ruptura y Agotado — solo MOSTRAR)
Por referencia (sub-fila `filaSugerencia`) Y por variante (en el drill `filaDrillAccion`):
- `cantidad = max(0, Math.ceil(optimo × venta_diaria − stock))`.
- `costo = cantidad × costo_unitario(padre)`.
- Texto: **"Comprá ~{cantidad} ≈ {fmtCOP(costo)}"** (subtítulo discreto: "para llegar a tu óptimo de {optimo} días").
- Si `datos_insuficientes` → "Pocos datos, usá tu criterio". Si `venta_diaria==0` (sin histórico) → "Sin histórico de venta — definí vos cuánto pedir".

### 2.3 Capital amarrado (Sobrestock — solo MOSTRAR)
- `unidades_de_mas = max(0, Math.round(stock − sobrestock × venta_diaria))`.
- `capital = unidades_de_mas × costo_unitario`.
- Texto por fila: **"Te sobran ~{unidades} ≈ {fmtCOP(capital)} parados"**.
- **Mini-dato de sección:** suma del capital amarrado de toda la lista visible.

### 2.4 NO genera orden
"Convertir en orden de compra real (entra al kardex)" = **Fase 2 (Compras), fuera de alcance.** Acá solo se VE qué / cuánto / cuánto cuesta.

## Gate de build
- **PARTE 1 migración con rigor:** aplicar a test + verificar (las 3 tiendas pasan el CHECK; el óptimo se guarda vía tiendas.update; un cruce es rechazado) ANTES de la UI.
- `node --check`. Verificación de la sugerencia: para una referencia y una variante, `cantidad` calculada == cálculo directo (`ceil(optimo×venta_diaria−stock)`).
- Funcional (Jorge desktop+mobile sobre QAINV): editar un umbral en Ajustes → GENERAL re-clasifica en vivo; tab S&R con Ver Ruptura/Sobrestock/Agotado; sugerencia por ref y por variante; capital amarrado + mini-dato; sin Ordenar/Excel en este tab; vacíos positivos; responsive. **OK visual de Jorge.**
- Deploy: merge a main + Implementa; curl byte-idéntico.

## Fuera de alcance (anotar, no construir)
- Generar orden de compra real (Fase 2 Compras).
- Botón "¿Cómo funciona?" por módulo (→ guía global del SaaS, pre-lanzamiento).
- Tab Sin Ventas (próximo, hereda período) y Kardex.
