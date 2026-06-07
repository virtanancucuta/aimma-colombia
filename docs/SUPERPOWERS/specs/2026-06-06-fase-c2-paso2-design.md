# Fase C.2 · Paso 2 — Edición inline de texto simple · Diseño

**Fecha:** 2026-06-06
**Estado:** SPEC — pendiente OK de Jorge en el gate de diseño. Spike hecho (abajo). Nada de código de prod hasta el OK.
**Predecesores:** C.1 (preview por PATCH) + C.2 Paso 1 (chrome de selección + section-action), ambos LIVE. Ver [[project_aimma_editor_c2_paso1]].

---

## 1. Objetivo
Click en un campo de **texto simple** del lienzo (título, subtítulo, etiqueta de botón, texto corto de una línea) → se edita ahí mismo en el preview, sin ir al inspector. **Rich-text / multilínea / formato → SIEMPRE por inspector** (nunca inline). Esto cierra C.2.

## 2. SPIKE Q3 (runtime real) — RESULTADO: PASS, sin pivote
Spike descartable (Playwright vs iframe real SSR-workerd + admin v11 con `applyPatch` monkeypatcheado = suspend simulado):
- **a)** Un nodo de texto SSR se vuelve `contenteditable` en el iframe y captura el typing real (cursor incluido). PASS.
- **b-RIESGO)** SIN suspend, un `replace`-patch a esa sección mid-edit **destruye el contenteditable** (la sección se reemplaza por outerHTML → nodo `exists:false`, texto+cursor perdidos). RIESGO CONFIRMADO.
- **b-FIX)** CON suspend (saltear el patch de la sección en edición), texto + foco + cursor **preservados**. PASS.
- **c)** Adversarial mid-edit: tema (CSS-var), patch a OTRA sección, cambio de selección → **no tocan el nodo editado** (texto intacto). PASS.
- **commit)** `updateSectionProps` (misma ruta) con el patch del nodo **salteado** → `state == DOM`, sin clobber. PASS.

**Conclusión:** los dos carriles (escribís→DOM / estado→preview) se reconcilian suspendiendo el patch de la sección en edición. No hace falta pivote. El spike además mostró que el inline-edit NO es dormido por sí solo → necesita **enable explícito** del admin nuevo (ver Q-dormido).

## 3. Decisiones de diseño (Q1–Q5)

### Q1 — La edición vive DENTRO del iframe (contenteditable, preview-gated)
El nodo marcado se vuelve `contenteditable` en el iframe; el usuario tipea ahí. Al confirmar → postMessage al admin. **El admin NUNCA manipula el DOM del iframe desde afuera** (lección de Paso 1; el admin solo recibe el valor y actualiza estado). El cursor/typing viven en el iframe.

### Q2 — Marcador de campo `data-ed-field`, preview-gated, self-marking
- Los renderers emiten `data-ed-field="<ruta>"` en los campos de **texto simple**, **SOLO cuando `isPreview`** (gateado por `Astro.locals.isPreview`). El público (isPreview=false) NO lo emite → **A3 intacta + cero presencia en la página pública** (verificado por byte-compare público).
- `render-fragment.astro` renderiza con `isPreview=true` → los nodos patcheados **self-mark** (traen el marcador), sin re-marcado por JS.
- **Ruta (`<ruta>`)**: path dentro de `props`. Simple: `titulo`. Anidado/array: `botones.2.label`. El admin la resuelve a la prop con un setter por-path.
- **Registro** `SIMPLE_TEXT_FIELDS[tipo] = Set(rutas válidas)` (compartido): (a) el renderer sabe qué emitir; (b) el admin **valida** que la ruta sea un campo de texto-simple CONOCIDO del tipo antes de mutar (G3). Texto rich/multilínea NO está en el registro → nunca inline.

### Q3 — Suspender patches durante la edición + saltear el del commit (SPIKE VALIDADO)
- **edit-start** (iframe→admin): el admin marca `editingField={sectionId,fieldPath}` → **SUSPENDE** los patches de esa sección (el carril patch saltea `applyPatch` para ese sectionId).
- **Durante**: el typing va al DOM (no al estado → no hay mutación → no hay patch propio). Tema/otra-sección/selección son inocuos (spike).
- **commit** (iframe→admin): `updateSectionProps(sectionId, setByPath(fieldPath, value))` = **MISMA RUTA** (Q5) → dispara un patch `replace` que se **saltea** (el DOM ya muestra lo tipeado) → luego se limpia `editingField`. El salteo del commit se cubre manteniendo el suspend hasta que ese patch drena (cola serial v10), después se limpia.
- **cancel** (Escape): el iframe revierte su contenteditable al texto original (que capturó en edit-start) y manda `inline-cancel` → el admin limpia `editingField` (sin cambio de estado, sin patch).

### Q4 — Confirmar / cancelar / pegar (iframe-side)
- **Confirmar**: `blur` / `Enter` (una línea → `preventDefault`) / click-afuera (→ blur). Todos → commit.
- **Cancelar**: `Escape` → revierte al original.
- **Pegar**: interceptar `paste` → insertar SOLO texto plano (strip HTML).

### Q5 — Misma ruta que el inspector; sanitize = texto plano; EF autoritativo
- Commit = `updateSectionProps` (la ruta del inspector) → autosave (hotfix C.3) + snapshot undo. **Nada de camino paralelo.**
- El valor es **texto plano** (`textContent` del contenteditable, NUNCA innerHTML). El renderer lo escapa (Astro auto-escapa `{value}`) → cero inyección de markup. El EF (`validateAndSanitizeSection`) sigue autoritativo al guardar (prop string validada por Zod).

### Q-dormido — Enable explícito (lo reveló el spike)
- El admin NUEVO envía `{type:'inline-enable'}` al iframe al montar. El iframe **solo permite entrar en edición inline tras recibirlo**. El admin viejo (Paso 1) no lo envía → inline-edit **dormido**. Así el storefront se despliega primero sin activar nada hasta el redeploy del admin.

## 4. Contratos de mensajes (G3)
Origin: `ADMIN_ORIGIN=https://aimma.com.co`, `tenantOrigin=https://<slug>.tienda.aimma.com.co`.

**Nuevos admin→iframe:**
- `{type:'inline-enable'}` — habilita el inline-edit (solo admin nuevo). origin-validado en el iframe.

**Nuevos iframe→admin** (el admin valida ANTES de mutar: `origin===tenantOrigin` + `sectionId` conocido + `fieldPath ∈ SIMPLE_TEXT_FIELDS[tipo]` + `value` string ≤ cap):
- `{type:'inline-edit-start', sectionId, fieldPath}` → suspende patches de la sección.
- `{type:'inline-commit', sectionId, fieldPath, value}` → `updateSectionProps` by-path + saltea el patch + limpia suspend.
- `{type:'inline-cancel', sectionId, fieldPath}` → limpia suspend (sin mutar).

## 5. No-negociables (cómo se cumplen)
- **Preview-gated**: `data-ed-field` + contenteditable solo en preview (isPreview + inline-enable). Byte-compare público lo prueba.
- **G3**: origin exacto + sección conocida + **fieldPath conocido** antes de mutar (registro). Un frame hostil no escribe props arbitrarias.
- **A3 intacta**: marcador gateado por isPreview → público sin cambios; render-fragment (preview) self-marca → paridad render==página byte-idéntica (preview-vs-preview).
- **Reusa C.1–C.3 + Paso 1**: commit = `updateSectionProps` (patch/save/undo); selección/chrome de Paso 1 (entrar a editar requiere la sección seleccionada).
- **Hotfix**: commit pasa por autosave (latch/retry-401/re-mint) — re-verificar en vivo que sobrevive con el suspend nuevo.

## 6. Mapa de archivos
**Storefront (deploy primero, dormido):**
- `apps/storefront/src/middleware.ts` o `index.astro` + `render-fragment.astro`: setear `Astro.locals.isPreview`.
- `apps/storefront/src/components/BlockRenderer.astro` + renderers con texto-simple (banner/heading/botones/etc.): emitir `data-ed-field` cuando `locals.isPreview`.
- `packages/database` (o storefront lib): `SIMPLE_TEXT_FIELDS` registry + `setByPath`/`getByPath` (compartido con el admin para validación).
- Nuevo `apps/storefront/src/components/InlineEdit.astro` (is:inline, preview-gated): lifecycle contenteditable (activar en `data-ed-field` cuando seleccionado + inline-enable; Enter/blur/Escape/paste; postMessage start/commit/cancel).
- `index.astro`: incluir `{isPreview && <InlineEdit/>}`.

**Admin (merge a main → Easypanel):**
- `editor-canvas.js`: handlers inline-edit-start/commit/cancel (G3 + suspend + updateSectionProps by-path) + enviar `inline-enable` al montar el iframe.
- `editor.js`: el carril patch respeta `editingField` (saltea patches de esa sección) + salteo del commit + limpieza.
- `editor-state.js` o helper: `updateSectionPropByPath(sectionId, path, value)` (reusa updateSectionProps; setter por-path) + `SIMPLE_TEXT_FIELDS` registry (mismo que storefront).
- `index.html`: cache-busters + nuevo script si aplica.

## 7. Tests + gates (estilo Paso 1)
- **SSR (vitest)**: `data-ed-field` presente en render preview, **ausente** en público; paridad render-fragment byte-idéntica (preview-vs-preview) sin regresión.
- **Admin (node:test)**: validación G3 del inline-commit (origin/sección/fieldPath desconocido → rechazado); setByPath correcto; suspend saltea patches de la sección en edición; commit saltea su patch.
- **Adversarial chromium-real**: inline-commit con fieldPath desconocido / origin forjado → no muta; sanity positivo primero.
- **Live**: editar inline un campo → typing → commit → guardado (estado+DB) + sin clobber + cursor preservado; patch mid-edit suspendido; cancel revierte; paste plano; **hotfix sobrevive**; chrome de Paso 1 sigue; rich-text sigue SOLO inspector.
- **Byte-compare público** (no-negociable): `data-ed-field` ausente en público + cuerpo sin cambios (caracterizar CSS-chunk como 7a).
- **Orden de deploy ADITIVO/DORMIDO**: storefront primero (inline-edit inerte sin `inline-enable`) → gate dormido (admin viejo: no se activa) → admin → live.

## 8. YAGNI / fuera de alcance
- Solo texto **simple de una línea**. Multilínea/rich-text/formato → inspector (sin cambios).
- Sin nuevos tipos de campo. Sin drag. Sin edición de imágenes/links inline.

## 9. Refinamientos aprobados en el gate
**Fase A:**
- **Marcador IDÉNTICO en los DOS caminos de render** (preview inicial de `index.astro` Y `render-fragment.astro` del patch) → los nodos patcheados se auto-marcan consistente (nada de editable-al-cargar-pero-no-tras-patch). **Verificar** byte-a-byte que el `data-ed-field` aparece igual en ambos.
- **Captura del valor = `textContent` LIMPIADO** de artefactos del contenteditable (br espurio, `&nbsp;`→espacio, spans/divs que mete el navegador) → texto plano limpio; el valor guardado nunca arrastra basura de edición.
- **Gate dormido**: marcadores **presentes-pero-inertes** (sin `inline-enable` no hay contenteditable) + C.1 patch sigue andando + byte-compare público **SIN** marcadores.

**Fase B:**
- **SUSPEND con AUTO-RECUPERACIÓN** (lección del hotfix: nada de congelado silencioso): si `inline-commit`/`inline-cancel` se pierde (iframe crashea / mensaje perdido / navegación), el suspend NO puede quedar trabado. Auto-clear defensivo: **timeout** (ej. ~20s) **y/o on-next-interaction** (cambio de selección / nuevo `inline-edit-start` para OTRA sección) → el suspend se libera solo.
- **`setByPath` a prueba de inyección de ruta**: el allowlist del registro ya cubre, pero el impl **además** guardea `__proto__`/`constructor`/`prototype` (defensa en profundidad).
- El suspend vive en el carril patch **SIN tocar** la lógica del hotfix (latch/retry-401/re-mint).

**Fase C (verificación):**
- Tras un commit inline (patch salteado), un patch **POSTERIOR** a esa sección renderiza el campo correcto (snap al valor limpio, sin doblar ni perder).
- Tras reload, el campo editado **byte-matchea el render SSR** (paridad a nivel nodo).
- Adversarial chromium-real sobre los 4 mensajes: origin / action fuera de enum / sección desconocida / **fieldPath fuera del registro** / value no-string → **rechazados ANTES de mutar**.
