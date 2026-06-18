# Migración Fotos IA → Tienda IA (PASO 1: estructura)

Fecha: 2026-06-18 · Estado: diseño aprobado (enfoque gateado por Jorge), pendiente revisión de spec.

## 1. Contexto y objetivo

El Panel IA (`iapanel/index.html`) es un grid de 3 cards estáticas, cada una con deep-link en JS, gateadas por plan:
- **Dashboard AIMMA** → `/dashboard/` (gate `acceso.pro`).
- **Contenido IA** → `/iapanel/estudio/` (gate `acceso.pro`, card `#cardContenidoIA` + `configurarContenidoIA`).
- **Tienda IA** → `/iapanel/tienda/admin/` (gate distinto: tener una tienda).

"Contenido IA" (`iapanel/estudio/`) es una app standalone single-page con: subir imagen · `fondo_estudio` · `quitar_fondo` · `mejorar_luz` · `fondo_lifestyle` · instrucción libre (prompt) · Generar · Descargar · Ver URL · Recargar (→ `recargas.html`) · `admin.html` (monitoreo).

**Objetivo (PASO 1, solo estructura):** mover SOLO dos herramientas — **`fondo_estudio`** + **instrucción libre (editar foto con prompt)** — adentro de Tienda IA como una pestaña nativa "Fotos IA". Retirar el card de Contenido IA del panel. Parquear (no borrar) el resto. **El backend NO se toca:** mismas llamadas de IA, mismo descuento de créditos, misma cola de jobs, mismo Storage. Robustez y fidelidad (recorte/composición de fondo estudio), "Restaurante IA" y el badge IA en Productos = pasos futuros, fuera de alcance.

## 2. Cadena backend (NO se toca — referencia)

```
Subir imagen → bucket studio-inputs → callEnqueue() POST EF studio-enqueue
  (/functions/v1/studio-enqueue, estudio.js:1018)
  body: { modelo:'nano-banana', input_path, accion_rapida, instruccion }
    · fondo_estudio → accion_rapida:'fondo_estudio', instruccion:null
    · editar prompt → accion_rapida:null,            instruccion:'<texto>'
→ CRÉDITOS: la EF (server-side) reserva 1 token vía RPC reservar_tokens.
   El cliente SOLO lee profiles.token_balance. (RPCs reservar/reembolsar/acreditar_tokens)
→ COLA: tabla image_jobs (estado, tokens_reservados, input_url, output_url, kie_task_id,
   source/return_to/target_producto_id/target_campo). Worker KIE.ai (fuera del repo).
→ STORAGE: resultado en bucket studio-outputs (output_url); cliente baja por signed URL.
→ RESULTADO: realtime UPDATE en image_jobs + polling 3s hasta estado done/failed.
```
Verificado en DB: `profiles.token_balance`, `image_jobs`, RPCs de tokens, buckets `studio-inputs`/`studio-outputs` existen. **Nada de esto se modifica ni se redeploya.**

## 3. Arquitectura (enfoque A: nativo enmarcado con iframe interno)

Mismo patrón que el canvas del editor (que también es un iframe del storefront en preview):
- Sidebar de Tienda IA (`iapanel/tienda/admin/index.html`): nueva entrada `<a href="#/fotos-ia" class="ta-nav-link" data-route="fotos-ia">Fotos IA</a>`.
- Nueva view `iapanel/tienda/admin/views/fotos-ia.js` que llama `registerView('fotos-ia', renderFotosIA)` (API en `admin.js:377`). Script include + cache-buster en index.html.
- `renderFotosIA` pinta en el área principal (`dom.mainView`): **chip de tokens nativo** (arriba) + **`<iframe src="/iapanel/estudio/?embed=tienda">`** (el "canvas").
- Dentro del iframe corre `estudio.js` EXACTO → mismas llamadas, mismo descuento, misma cola, mismo Storage. Cero drift.
- La pestaña es el **flujo general de estudio** (subir cualquier imagen → herramienta → descargar), SIN params cross-modulo (esos son del flujo de productos, aparte). No queda atado a un producto.

`estudio.js` (+ `index.html` de estudio) gana un modo **`embed=tienda`** (lee `?embed=tienda` del query): oculta su header/footer propio (Tienda IA ya aporta chrome).

## 4. Must-verify #1 — Preservar el gate de plan (PRO)

**Hallazgo (verificado):** el gate de Contenido IA era SOLO el card del panel (`acceso.pro`, RPC `tiene_acceso_pro`). `estudio.js` solo hace `requireAuth()` (logueado), NO chequea plan; el único límite de uso es tokens server-side. Tienda IA gatea por algo DISTINTO (tener tienda + `plan_tienda`). → Un usuario con tienda pero sin `acceso.pro` accedería a Fotos IA si no replicamos el gate.

**Solución:** la pestaña Fotos IA chequea `tiene_acceso_pro(user).pro` (mismo gate que el card). 
- Si `pro === true` → la pestaña aparece y funciona.
- Si `pro !== true` → **la pestaña NO se muestra** (decisión: oculta, no locked-upsell; alinea con "nav sin entradas muertas"; flip de 1 línea a locked si se quiere el funnel después). El route `#/fotos-ia` tampoco renderiza la herramienta para no-PRO (guard en la view, no solo ocultar el link).
- Los tokens siguen gateando el USO server-side; este es el gate de ACCESO a la feature, que se mantiene idéntico al original.

`admin.js` hoy no llama `tiene_acceso_pro` → se agrega esa consulta (1 RPC) en el init o en la view, cacheada en `state`.

## 5. Must-verify #2 — Chip de tokens nativo sincroniza post-generación

El chip nativo (en **Inicio** `views/inicio.js` y en el header de la pestaña **Fotos IA**) lee `profiles.token_balance` (misma query que estudio). Como la generación pasa DENTRO del iframe y descuenta server-side, el chip del padre quedaría stale.

**Solución:** al terminar el job, `estudio.js` (en modo embed) hace `window.parent.postMessage({ type: 'fotos-ia:job-done' }, 'https://aimma.com.co')`. El padre (la view Fotos IA) escucha ese mensaje (validando `origin === 'https://aimma.com.co'`) y re-consulta `profiles.token_balance` → actualiza TODOS los chips nativos (pestaña + Inicio si visible). Fallback: re-consulta al recuperar foco de ventana (`visibilitychange`/`focus`).

**Verificación viva (E2E):** tras una generación real, el saldo del **chip nativo** baja, no solo el de adentro del iframe.

**Recargar nativo:** como el header de estudio (con su botón "Recargar") queda oculto en embed, el chip de tokens nativo incluye un link **"Recargar" → `recargas.html`** (la compra de tokens por MercadoPago no cambia).

## 6. Must-verify #3 — Iframe autenticado

Mismo origen `aimma.com.co` → la sesión de Supabase en localStorage (`sb-rsmxklkxqsaptchcjszd-auth-token`) la comparten padre e iframe → el iframe NO debería pedir re-login.

**E2E:** confirmar que el iframe carga autenticado (sin redirect a login). Si pidiera login adentro, pasarle la sesión (no esperado por same-origin, pero se verifica).

## 7. Parqueo global y reversible

`fondo_estudio` + instrucción libre se MANTIENEN. `quitar_fondo` / `mejorar_luz` / `fondo_lifestyle` se **parquean GLOBALMENTE** (flag de config en `estudio.js`, default = parqueado): se ocultan en estudio en todos lados (la pestaña Fotos IA Y el flujo de productos `productos.js`), no solo en embed. **No se borra código** (reversible: flip del flag los reactiva).

## 8. Retiro del card + deep-links

- `iapanel/index.html`: ocultar/comentar `#cardContenidoIA` (líneas 247-265) + su JS `configurarContenidoIA` (421-462) + la llamada a `configurarContenidoIA()` (531). **Reversible** (comentar, no borrar).
- **`/iapanel/estudio/` NO se toca / NO se borra** — lo siguen usando la pestaña Fotos IA (vía iframe) y `productos.js:1025` (editar foto de producto, cross-modulo).
- `productos.js:1025` (`window.open('/iapanel/estudio/?...return_to...')`) se mantiene funcional (cross-modulo intacto). `dashboard/index.html:59` es solo un comentario.
- Resultado: nav sin links muertos (el card se retira limpio).

## 9. Cache-busters

Bump de los JS/CSS tocados: `iapanel/index.html` (panel), `iapanel/tienda/admin/index.html` (nuevo script `views/fotos-ia.js`, `views/inicio.js`, `admin.js` si se toca), `iapanel/estudio/index.html` (estudio.js con embed+parqueo).

## 10. Reversibilidad

Migración no destructiva: el card se comenta (no se borra), las herramientas parqueadas quedan por flag, `/iapanel/estudio/` intacto. Todo vuelve flipando flags / descomentando.

## 11. Testing / Gate antes de mergear

E2E REAL de **LAS DOS** herramientas (no asumir ninguna), cada una: subir imagen → correr → ver resultado → **token descontado** (verificado en `profiles.token_balance`) → guardado en bucket `studio-outputs`. Más los 3 checks:
1. Gate PRO: un usuario sin `acceso.pro` NO ve/accede la pestaña Fotos IA; uno con PRO sí.
2. Chip nativo: el saldo nativo baja tras una generación (no solo el de adentro).
3. Iframe autenticado: carga sin pedir re-login.
Además: nav sin entradas/rutas muertas; suites/guards del editor verdes (no se rompió nada de Tienda IA).

## 12. Deploy

Admin → Easypanel (lo redeploya Jorge tras el gate). **NO** se toca storefront (wrangler) ni EFs (la EF `studio-enqueue` no se mueve — solo se relocaliza UI).

## 13. Fuera de alcance (pasos futuros)

Fidelidad de fondo estudio (recorte + composición), módulo "Restaurante IA", badge IA en Productos, y portar el DOM a 100% nativo (PASO 2 robustez/fidelidad). Este PASO 1 es solo estructura.

## 14. Decisiones resueltas

- Enfoque: (A) nativo enmarcado con iframe interno (gateado).
- Nombre de pestaña: **"Fotos IA"**.
- Pestaña para no-PRO: **oculta** (no locked-upsell).
