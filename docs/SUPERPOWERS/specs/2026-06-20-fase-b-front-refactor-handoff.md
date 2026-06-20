# HANDOFF — Refactor del front `productos.js` (Inventario Fase B / #1)

> **Para la sesión fresca de CC.** Ejecutá SOLO este refactor de front, en una pasada completa. Leé primero `proyecto_aimma/aimma.md` y la memoria `project_aimma_inventario.md`. Regla #0 del proyecto: nunca-asumir-verificar.

## DISCIPLINA (leer antes que nada)

- **DOS "branches" distintas, no las confundas:**
  - **El código del front (`productos.js`) va a una FEATURE BRANCH DE GIT.** Partí del `origin/main` actual, creá una rama (ej. `feat/inv-fase-b-front`), commiteá ahí. **NO pushees a `main`.** Queda local/feature hasta el gate. (Ya hubo un desliz de algo arrastrado a main sin querer — NO repetir: nada a main acá.)
  - **La branch de SUPABASE es solo la BD de prueba** (para que el RPC exista cuando alguien pruebe el form). NO es donde vive el código.
- **TU TRABAJO TERMINA cuando el refactor está commiteado en la feature branch de git, con el self-check estático (§2bis) en verde.** NO podés probar el form vos (no tenés navegador ni manejás Easypanel). El armado del entorno de prueba (servir el admin apuntando a la BD de la branch de Supabase) y el E2E con navegador corren **por el lado de Jorge**. NO intentes "dejarlo andando" — no es tu trabajo ni podés.
- **NO deployes nada.** El deploy (secuenciado, §5) lo ordena Jorge después del E2E.

## 0. Contexto mínimo (qué ya está hecho)

- Módulo **Inventario** dentro de Tienda IA. **Kardex = verdad contable**; `producto_variantes.stock` y `productos.costo` son proyecciones que SOLO se mueven vía `kardex_registrar` (engine interno) o sus RPCs owner-facing.
- **Capa DB de Fase B YA construida y verificada** (commits LOCALES, sin push): `e34d403` (RPCs) + `fdd3460` (REVOKE). Archivos:
  - `supabase/migrations/20260620180000_inv_hardening_b_rpcs.sql`
  - `supabase/migrations/20260620181000_inv_hardening_b_revoke.sql`
- El REVOKE impone la invariante: tras él, **el cliente (authenticated) NO puede escribir `stock`/`reservado`/`costo` directo** (probado: `permission denied`). Por eso el form DEBE rutear por los RPCs — si queda medio-routeado, tras el REVOKE se cae en los paths no migrados.
- **Esto es ALL-OR-NOTHING.** No hay versión parcial coherente.

## 1. Las dos RPCs (firmas EXACTAS — ya existen en la BD de la branch)

### `crear_producto_con_stock(p_producto jsonb, p_variantes jsonb) returns jsonb`
- Crea producto + variantes + movimiento `saldo_inicial`, atómico. Ownership-checked (dueño de la tienda). Devuelve la **fila del producto creado** como jsonb (usala como `result.data`: tiene `id`, `referencia`, etc.).
- `p_producto` = el MISMO objeto `payload` que el form ya arma (incluye `tienda_id`, `nombre`, `referencia`, `categoria_id`, `variante_tipo_1/2`, `descripcion`, `precio_venta`, **`costo`**, `precio_promo`, `precio_mayorista`, `cantidad_min_mayorista`, `estado`, `guia_tallas_url`, `ficha_editorial`). NO incluye `slug` (trigger lo genera).
- **Costo null/vacío: el RPC lo ACEPTA** (verificado en el código del RPC: `nullif(costo,'')::numeric` → crea con `costo=null`, y el `saldo_inicial` corre con costo null, que el kardex tolera). O sea **el form NO debe exigir costo en creación** (el form viejo permitía crear sin costo — se conserva). No agregues validación que lo bloquee.
- `p_variantes` = array JSON `[{color, talla, sku, stock, precio_override}]`, **siempre ≥1**. Para producto sin variantes (stock simple) = `[{color:null, talla:null, sku:<skuSimple>, stock:<stockSimple>}]`. Para matriz: una entrada por celda con stock != null.
- Llamada: `await sb.rpc('crear_producto_con_stock', { p_producto: payload, p_variantes: arr })`.

### `editar_variantes_producto(p_producto_id uuid, p_variantes jsonb, p_eliminar uuid[] default '{}', p_costo_entrada numeric default null) returns void`
- Aplica cambios de variantes de un producto EXISTENTE. Ownership-checked. Rutea stock por kardex:
  - variante con `id` (existente): actualiza color/talla/sku/precio_override; calcula delta de stock bajo lock → **delta>0 = `entrada` con costo** (`p_costo_entrada` o promedio actual), **delta<0 = `ajuste`**.
  - variante sin `id` (alta): inserta + `entrada` por su stock.
  - `p_eliminar` = uuid[] de variantes a borrar (con guard: aborta si tienen `reservado>0`).
- `p_variantes` = `[{id?, color, talla, sku, stock, precio_override}]`.
- `p_costo_entrada` = costo unitario para las entradas (subidas de stock). Default = promedio actual. **Decisión de diseño aprobada:** las subidas de stock del form son `entrada` con costo (default = promedio); las entradas-con-costo-de-COMPRA reales son del futuro Módulo de Compras. Para el form: pasá el promedio actual como default, o un campo de costo opcional para la reposición.
- Llamada: `await sb.rpc('editar_variantes_producto', { p_producto_id, p_variantes: arr, p_eliminar: ids, p_costo_entrada: costo })`.

## 2. Los cambios EXACTOS en `iapanel/tienda/admin/views/productos.js`

(Las líneas son aproximadas — verificá por contexto, el archivo evoluciona.)

1. **CREATE** (handler de guardado del producto, ~1948-2093): hoy hace `sb.from('productos').insert(payload)` (~1955) y DESPUÉS inserta variantes (matriz ~2023, default ~2057/~2082). Reemplazar TODO el flujo de creación por **una** llamada a `crear_producto_con_stock(payload, variantesArr)`. Hay que **construir `variantesArr` ANTES** de la llamada (matriz o default), y **eliminar los bloques de inserción de variantes posteriores** para el caso create (la RPC ya los crea — si los dejás, doble-creación).
2. **EDIT producto** (~1953): `sb.from('productos').update(patch)` — **sacar `costo` del patch** (`const { tienda_id, costo, ...patch } = payload`). El costo no se edita post-creación (lo maneja el kardex/Compras).
3. **EDIT default variant stock** (~2067-2079): el update de stock de la variante default → `editar_variantes_producto(producto_id, [{id, sku, stock}])`.
4. **`guardarVariantes`** (función aparte, botón `btn-guardar-variantes`, ~1690-1814): hoy hace insert (~1759) / update con stock (~1775) / delete (~1797) directos. Reemplazar TODO por **una** llamada a `editar_variantes_producto(producto_id, variantesArr, eliminarIds, costoEntrada)`. Construir `variantesArr` (existentes con `id` + nuevas sin `id`) y `eliminarIds` desde el diff que ya calcula. El guard de "no eliminar con reservas" ya está en el front Y en la RPC (doble red — ok).
5. **Transición default→variantes en edición** (~2037-2045): el delete de la default variant al activar variantes → incluirlo en `p_eliminar` de `editar_variantes_producto`, o manejarlo en el mismo flujo. Que NO quede un delete directo huérfano.
6. **UI campo costo**: editable en **creación**; **read-only en edición** (mostrar el promedio actual, deshabilitado). Texto de ayuda: "El costo se actualiza con las compras (próximamente)".
7. **NO TOCAR** (no están protegidos, siguen por write directo): `foto_color_url` (~960), `foto_principal_url` (~935), `fotos_galeria` (~951). El REVOKE NO los bloquea.

### ⚠️ COLISIÓN con Fotos IA (coordinación real, no hipotética)
Otra sesión trabaja **Fotos IA** y toca ESTE MISMO archivo (integración cross-módulo Estudio Visual + posible AI-badge de fondo-estudio). En `productos.js` ya hay: `abrirEstudioVisual()` (~1014), `window.open('/iapanel/estudio/...')` (~1025), botones "Editar con IA" en la sección de fotos (~756/828). Por eso:
- **Partí del `productos.js` del `origin/main` ACTUAL** (no de una copia vieja) — puede haber llegado más de Fotos IA (un badge, etc.).
- **PRESERVÁ todo lo de Fotos IA/Estudio Visual** (el `abrirEstudioVisual`, el link a `/iapanel/estudio`, los botones "Editar con IA", cualquier badge). NO los pises.
- **Tocá SOLO los write-paths del §2** (create, guardarVariantes, default↔variantes, campo costo). NO reescribas el archivo entero — editá quirúrgico, o clobbereás el trabajo paralelo.

### §2bis — SELF-CHECK ESTÁTICO (obligatorio, antes de terminar — NO necesita navegador)
Como es all-or-nothing, tras el refactor corré un grep en `productos.js` y confirmá que NO sobrevive NINGÚN write directo de stock/costo/variantes:
- `grep -nE "from\('producto_variantes'\)" iapanel/tienda/admin/views/productos.js` → debe quedar **0** insert/update/delete (todo por `editar_variantes_producto`/`crear_producto_con_stock`). (El update de `foto_color_url` a `producto_variantes` SÍ puede quedar — es foto, no protegido.)
- `grep -nE "from\('productos'\)\.insert" ...` → **0** (creación va por RPC).
- `grep -nE "from\('productos'\)\.update" ...` → solo el de campos del producto, y el patch **sin `costo`**.
- Si queda cualquier otro write directo a stock/costo, es un path que se te escapó al all-or-nothing — arreglalo antes de cerrar. Este check es gratis y caza el agujero sin esperar al E2E.

### Manejo de errores
- Las RPCs lanzan `raise exception` con mensajes claros (ej. `no autorizado`, `No se puede eliminar variantes con reservas activas`, `Stock insuficiente...`, `No se puede dejar el stock (X) por debajo de lo reservado (Y)`). En `.rpc()`, el error viene en `{ error }` con `error.message`. Mostralos con `T.toast(error.message, 'error')`. Conservá los códigos existentes que tengan sentido (ej. `23505` SKU duplicado puede venir adentro del mensaje).

## 3. Setup de la branch (para testear)

Las branches creadas por API replayan el REGISTRO de prod (solo baseline) — NO jalan el repo. Por eso:
1. Crear una Supabase branch (MCP `create_branch`, confirmar costo).
2. Esperar ACTIVE + 49 tablas.
3. `npx supabase db push --db-url <session-pooler-de-la-branch>` → aplica las migraciones pendientes del working tree (hardening A `20260620171000` + RPCs `20260620180000` + REVOKE `20260620181000`). Es el mecanismo del deploy.
4. Conexión: **session pooler** `aws-1-us-east-2.pooler.supabase.com:5432`, user `postgres.<branch-ref>`, password vía `npx supabase branches get <name> -o env` → `POSTGRES_URL`. `pg_dump`/`psql` 17.10 en `C:\Program Files\PostgreSQL\17\bin\` (NO en PATH — ruta completa). Token/creds: leer de `aimma.md` con `grep`, NUNCA literal en comandos.
5. **BORRAR la branch al terminar** (las branches cuestan plata mientras viven, $0.01344/h). Si la sesión fresca crea una branch solo para confirmar que las migraciones aplican, que la borre al cerrar (MCP `delete_branch`). Si Jorge va a usarla para el E2E, dejala viva y que Jorge la borre tras la prueba — coordinarlo explícito, que no quede una branch huérfana corriendo.

> Nota: si la sesión fresca NO va a tocar la BD (solo escribe el front), puede saltar el §3 entero — el RPC ya está probado (Fase B DB verificada). El §3 es por si quiere confirmar que las migraciones aplican o dejar una branch lista para el E2E de Jorge. El front no necesita una branch propia para escribirse.

## 4. Gate E2E (lo prueba Jorge / Claude-in-Chrome — NO la sesión de CC sola)

**Entregable de la sesión fresca = la feature branch de git commiteada + el self-check §2bis en verde.** Ahí entrega. Este §4 lo corre Jorge (arma el admin apuntando a la BD de la branch de Supabase y prueba con navegador). Confirmar, logueado como dueño de una tienda:
1. **Crear** producto simple (stock N) y con matriz color×talla → se crea, stock correcto, kardex `saldo_inicial`, costo seteado.
2. **Editar** matriz: subir stock de una celda → `entrada` (pide/usa costo); bajar stock → `ajuste`. Stock refleja, invariante `stock==SUM(kardex)` cuadra.
3. **Editar** producto: campo costo **read-only**; cambiar nombre/precio/fotos → guarda OK.
4. **Borrar** variante sin reservas → ok; con reservas → bloqueado con mensaje.
5. **Fotos** (color/principal/galería) siguen editables.
6. Confirmar (SQL en la branch) que **NO** hay write directo de stock/costo (todo pasó por kardex; `permission denied` si se intenta directo).

## 5. Deploy (NO en esta sesión — solo cuando Jorge lo ordene, secuenciado)

PR/push RPCs (`20260620180000`) → deploy → front a Easypanel + verificar → PR/push REVOKE (`20260620181000`) → deploy. **El REVOKE va ÚLTIMO, después del front vivo.** Nunca antes (rompe el form viejo).

## 6. Pendiente aparte (no en este refactor)
- **Guard-test permanente** que afirme que `stock`/`reservado`/`costo` NO están en el grant de update de `authenticated` (falla ruidoso si una migración futura re-otorga el update de tabla). Más el matiz: el grant de columnas es un snapshot (columna nueva = re-otorgar). Documentado en la migración REVOKE.
- Rotar el Management PAT `sbp_…` (quedó literal en un log de una sesión previa — comprometido).
