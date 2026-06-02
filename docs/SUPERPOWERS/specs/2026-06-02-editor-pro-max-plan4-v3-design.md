# AIMMA Tienda IA · Editor PRO-MAX · Plan 4 — Schema v3 + WYSIWYG real

**Fecha:** 2026-06-02
**Autor:** Claude (Opus 4.8) en sesión autónoma autorizada por Jorge
**Meta:** llevar el editor a ~75% de Shopify Online Store 2.0: bonito, consistente, escalable.
**Base aprobada:** reestructurar el modelo de datos (schema v3, secciones apiladas) **antes** del iframe. No diferir. Vanilla JS, sin React. Eliminar GridStack del flujo.

---

## 1. Problema (con evidencia del código real)

El editor actual renderiza, tanto en admin como en storefront, **secciones que son contenedores genéricos de `elementos[]` posicionados en un grid 24-col libre** (`grid:{col_start,col_end,row_start,row_end}` por elemento, manejado por GridStack en el admin y por CSS vars `--col-start...` en `_ElementRenderer.astro`).

Verificado en código:
- `_ElementRenderer.astro` compone `--col-start/--col-end/--row-start/--row-end` desde `el.grid`.
- `HeroIndustrialClean.astro` (y sus 3 hermanos por plantilla) **no tienen layout de hero**: hacen `section.elementos.map(el => <ElementRenderer/>)`. El "hero" es un grid de cajas libres.
- `editor-state.js` modela `selection: {tipo:'section'|'element'}` y `sections[].elementos[]`.

Consecuencias (las quejas de Jorge se explican aquí):
- **"Celda de Excel"**: el canvas dibuja un grid 24-col con cajas → es literalmente una grilla.
- **"Imposible mover / frágil"**: GridStack da posicionamiento 2D libre, frágil en iOS y confuso sin formación.
- **"No se parece a Shopify"**: Shopify = secciones apiladas auto-contenidas y responsive, **sin coordenadas**. Nuestro modelo es lo contrario.
- **No escala**: cada plantilla nueva debe interpretar posiciones 2D arbitrarias.

## 2. Datos reales que de-riesgan el cambio

`SELECT` sobre `tiendas` (2026-06-02):

| slug | schema_version | home sections | elementos | home_draft |
|---|---|---|---|---|
| aimma-test | 2 | 2 | 4 | no |
| dimac | null | 0 | 0 | no |
| maraldo-laureles | null | 0 | 0 | no |

**Solo `aimma-test` (cuenta de test de Jorge) tiene home construida: 2 secciones, 4 elementos.** Dimac y Maraldo usan el render fallback (Fase 9). La "migración con pérdida" es **1 tenant de test trivial**. Se hace snapshot del JSON antes de migrar.

## 3. Modelo de datos v3 (Shopify-style)

### 3.1 Principio

Una página = **lista ordenada de secciones**. Cada sección tiene un `tipo` y un objeto `props` tipado por ese tipo. La sección **se renderiza sola, responsive, sin coordenadas**. Donde hay repetición (botones, imágenes de galería, campos de formulario) se usan **arrays ordenados** (= "blocks" de Shopify), no posicionamiento.

Se **elimina** por completo: `elementos[]`, `GridPositionSchema`, `GridMobileSchema`, `_ElementRenderer.astro`, `blocks.css` grid 24-col, GridStack.

### 3.2 Schema (`supabase/functions/_shared/editor-schema.ts` y `packages/database`)

```
PersonalizacionesSchema {
  schema_version: 3                       // bump de 2 -> 3
  theme?: ThemeSchema                     // sin cambios
  pages: Record<string, PageSchema>       // home, home_draft, ...
}

PageSchema {
  version: 2                              // page-level bump 1 -> 2
  updated_at: datetime
  sections: SectionSchema[]   (max 20)    // el ORDEN del array = orden vertical
}

SectionSchema (base, común a todos los tipos) {
  id: /^sec_[a-z0-9]{4,}$/
  tipo: 'banner'|'texto'|'imagen'|'botones'|'productos'|'galeria'|'espacio'|'formulario'|'video'
  ancho: 'completo'|'contenido'           // full-bleed vs max-width centrado
  fondo: FondoSchema                      // se reusa el existente (color/imagen/gradient/transparente + overlay)
  padding: 'sm'|'md'|'lg'|'xl'
  props: <discriminado por tipo>          // ver 3.3
}
```

Nota de naming: los `tipo` se localizan respecto a v2 — `hero`→`banner`, `espaciador`→`espacio`, `embed`→`video`. El resto se mantiene. La validación CSS-safe (CSS_COLOR_REGEX, HTTPS_URL_REGEX, CSS_GRADIENT_REGEX, EMBED_WHITELIST_REGEX) se **conserva** intacta — es hardening de Plan 1 que no se toca.

### 3.3 `props` por tipo (preservando capacidades actuales)

```
banner   { titulo, subtitulo?, imagen_fondo?{src,alt}, boton?{texto,url,icono,estilo}, alineacion:'left'|'center'|'right' }
texto    { contenido (max5000), alineacion, tamaño:'sm'|'md'|'lg'|'xl' }
imagen   { src, alt, objeto:'cover'|'contain', aspect_ratio?, link_url? }
botones  { items: [{texto,url,icono,estilo_visual,target}] (1..6, ordenado) }
productos{ categoria_id?, limite(1..12), orden:'recientes'|'precio_asc'|'precio_desc', columnas:'auto'|2|3|4, mostrar_precio }
galeria  { imagenes:[{src,alt}] (3..12), layout:'grid'|'carrusel'|'mosaico', gap:'tight'|'normal'|'loose' }
formulario { titulo?, campos:[{tipo_campo,label,placeholder?,requerido,opciones?}] (1..8), boton_texto, section_id se mantiene para form-submit }
espacio  { altura:'sm'|'md'|'lg'|'xl' }
video    { html (iframe whitelisted, mismo EMBED_WHITELIST_REGEX), aspect_ratio:'16/9'|'4/3'|'1/1' }
```

Cada `props` reutiliza las validaciones de seguridad que ya existían a nivel elemento. `ai_generated` se mueve a nivel sección (opcional) para Plan 5.

### 3.4 Compatibilidad y migración

- Runtime: la EF y el storefront aceptan **solo v3**. No hay lectura dual en producción (innecesaria: 1 tenant).
- Migración one-shot (Deno script vía MCP o SQL) **idempotente**:
  1. Snapshot: copiar `personalizaciones` actual de aimma-test a `personalizaciones_backup_v2` (columna jsonb temporal) o a un INSERT en tabla de auditoría.
  2. Mapear las 2 secciones v2 → v3: extraer de `elementos[]` los props (texto→banner.titulo/texto, boton→banner.boton, etc.) según el `tipo` de la sección.
  3. Escribir `schema_version:3`, `pages.home.version:2`.
  4. Idempotente: si ya es v3, no re-migra.
- `parsePersonalizaciones()` para v3; helper legacy `migrateV2toV3()` solo en el script.

## 4. WYSIWYG real (iframe + preview por token-nonce)

### 4.1 Por qué token-nonce y no HMAC

HMAC exige secreto compartido firmado server-side (el admin es vanilla JS en browser, no puede firmar sin filtrar el secreto) → obligaría a `wrangler secret put` + secreto en EF (2x Tipo B). En su lugar:

- Tabla `preview_tokens { token uuid pk default gen_random_uuid(), tienda_id, created_at, expires_at }`. Expira a 15 min.
- EF `tienda-preview-token` (verify_jwt=true): valida ownership de `tienda_id` (igual que guardar-layout), inserta fila, devuelve `{token}`.
- El Worker valida el token contra Supabase (ya tiene `getSupabase()` en middleware). **Cero secretos nuevos.**

### 4.2 Modo preview en el storefront

`apps/storefront/src/middleware.ts` + `src/pages/index.astro`:
- Si `?preview=<uuid>`:
  1. Validar token en `preview_tokens` (no expirado) y que `tienda_id` == tenant resuelto. Inválido/expirado → **403**.
  2. **Bypass de KV**: no leer ni escribir `TENANT_CACHE` (releer tienda fresca de Postgres).
  3. Renderizar `pages.home_draft` si existe, si no `pages.home`.
  4. `<meta name="robots" content="noindex">` en preview.
- Sin `?preview` → flujo normal sin cambios (KV TTL, home publicada).

### 4.3 Script de edición inyectado (solo en preview)

`BlockRenderer.astro` (o un wrapper de preview) inyecta `<script>` solo cuando `preview` activo:
- Cada sección renderizada lleva `data-section-id`; cada campo editable `data-field` (p.ej. `data-field="titulo"`).
- En `click` sobre `[data-section-id]` → `parent.postMessage({type:'select', sectionId}, ADMIN_ORIGIN)`.
- Escucha `message {type:'patch', sectionId, props}` → re-render client-side ligero del texto editable (Plan 5 inline) **o** `{type:'reload'}` → recarga el iframe con el draft actualizado (Plan 4 v1).
- **Seguridad**: validar `event.origin === ADMIN_ORIGIN` (`https://aimma.com.co`).

### 4.4 Admin como controlador del iframe

`editor-canvas.js`:
- **Elimina** todo render de mockups y toda init de GridStack; **elimina** carga de `lib/gridstack.*`.
- Renderiza `<iframe sandbox="allow-scripts allow-same-origin" src="https://<slug>.tienda.aimma.com.co/?preview=<token>">`.
- Flujo: al montar el editor, pide token a `tienda-preview-token`, arma la URL, carga el iframe.
- **panel → iframe**: en cambios de estado, debounce 400ms → autosave draft (EF guardar-layout, ya existe) → `iframe.contentWindow.postMessage({type:'reload'}, TENANT_ORIGIN)` (v1: reload; v2 inline: `{type:'patch'}`).
- **iframe → panel**: al recibir `{type:'select', sectionId}` → `EditorState.select(sectionId)` → abre inspector de esa sección. Validar `event.origin === TENANT_ORIGIN` (`https://<slug>.tienda.aimma.com.co`).

El locking optimista de `tienda-guardar-layout` (base_updated_at → 409 stale_layout) **no se toca**.

## 5. Admin UI v3

- `editor-state.js`: `sections[]` con el nuevo shape; `selection` pasa a `{sectionId}` (se elimina selección de elemento). Snapshots/undo/redo se conservan (structuredClone de sections). Se agrega emisión de cambios para el puente postMessage.
- `editor-sidebar.js`: lista de secciones reordenable con **SortableJS** (handle ⋮⋮). El orden del array es la fuente de verdad. Botón "+ Agregar sección".
- `editor-inspector.js`: formularios de `props` **por tipo de sección** usando los helpers de `editor-controls.js` (textInput, urlInput, colorPicker, slider, switch, select). Para arrays (botones/galería/campos) un sub-editor de lista ordenable.
- `editor-modal-catalog.js`: muestra **4 esenciales** (Banner, Productos, Botones, Texto) + botón **"Más"** (Galería, Imagen, Espacio, Formulario, Video/mapa). Copy de ayuda por tipo (QW6).
- `editor-styles.css`: **matar grid lines** (QW1). Shell **responsive**: bajo 1100px el inspector pasa a **drawer** deslizable (QW3).
- `editor-toolbar.js`: botón **"Vista previa"** (abre el draft) (QW5). Botón "Generar con IA" queda como "Próximamente — Plan 5".

## 6. Storefront renderers v3

- `BlockRenderer.astro`: dispatch `[tipo][plantilla]` (ya existe), pero cada componente ahora lee `section.props` y **renderiza un layout real diseñado** (no un grid de elementos).
- Los **32 componentes** (8 tipos × 4 plantillas) se reescriben para consumir `props`. Cada uno queda **más simple** (sin grid). `espacio` (ex espaciador) sigue agnóstico.
- Se **elimina** `_ElementRenderer.astro` y el grid 24-col de `blocks.css` (se conserva el resto de blocks.css útil: tokens, responsive helpers).
- Diseño: aplicar el design system de cada plantilla (tipografía/tokens existentes). Los componentes de `templates/<plantilla>/Hero*.astro` ya son heros diseñados reales → los nuevos `blocks/banner/Banner*.astro` se inspiran en ellos para garantizar consistencia visual con el storefront publicado.

## 7. Edge Functions

- `tienda-guardar-layout`: aceptar `schema_version:3` + `PageSchema.version:2`. **No tocar** locking ni el flujo draft/publish/invalidate-KV. Inline del schema v3 (misma limitación MCP de imports `../_shared/` documentada en Plan 3).
- `tienda-preview-token` (NUEVA, verify_jwt=true): ownership check + insert en `preview_tokens` + return token.
- `tienda-form-submit`: ajustar el lookup de campos al nuevo shape `formulario.props.campos` (antes leía elementos `form_field`). Mantener CORS/rate-limit/honeypot/Zod intactos.

## 8. Orden de ejecución (modelo primero)

1. **Fase 0** (safe, agnóstico): QW1 grid lines off, QW6 copy ayuda, QW5 botón Vista previa. Commit + (Tipo B redeploy admin opcional para alivio inmediato).
2. **Schema v3**: editor-schema.ts + packages/database + EF guardar-layout acepta v3 + migración aimma-test (snapshot primero).
3. **Renderers storefront v3**: 32 componentes + BlockRenderer + eliminar _ElementRenderer/grid. `pnpm build` local para verificar compilación.
4. **Preview nonce**: tabla + EF tienda-preview-token + index.astro/middleware modo preview.
5. **Iframe + postMessage**: editor-canvas.js controlador + puente. Eliminar GridStack.
6. **Inspector/sidebar/catálogo/toolbar v3** + form-submit ajustado.
7. **Audit + verificación server-side + memoria + checklist Tipo B**.

## 9. Criterios de aceptación (todos)

- El canvas del editor = la home **idéntica** al storefront publicado (iframe real).
- Reordenar secciones por drag (SortableJS) se refleja en el iframe.
- Editar props en el inspector actualiza el iframe (reload v1).
- Seleccionar una sección dentro del iframe abre su inspector.
- Guardar (draft) y Publicar funcionan; locking 409 stale_layout intacto.
- `schema_version:3` validado por la EF; aimma-test migrado sin perder contenido (verificable contra el snapshot).
- No queda GridStack ni `_ElementRenderer` ni grid 24-col en el flujo.
- Build del storefront compila sin errores.
- Verificado LIVE en las 4 plantillas tras los deploys Tipo B.

## 10. Constraints duros (no violar)

- Admin = vanilla JS, `<script src>`, namespace `window.TiendaIA.editorX`.
- Multi-tenant: subdominios con CSS vars `--ta-color-*`.
- Render real = Astro SSR; admin solo gestiona el JSON `personalizaciones.pages.home.sections`.
- PersonalizacionesSchema (Zod) validado por EF; cambio de schema = versionado (v3).
- Cloudflare KV TTL + invalidate on publish; **draft no se cachea** (bypass en preview).
- Tipografía admin Exo 2 + JetBrains Mono; copy español colombiano con ñ correcta.
- No migrar a React/Vue.

## 11. Dependencias Tipo B (solo Jorge, al final)

1. `pnpm build && pnpm wrangler deploy` del storefront (CF Workers) — activa renderers v3 + modo preview.
2. Redeploy Easypanel de aimma-web — activa el editor admin v3.

Todo lo demás (código, migración BD, deploy de EFs, commits, push) es Tipo A (Claude).

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Reescritura de 32 componentes introduce regresiones visuales | Inspirarse en `templates/<plantilla>/Hero*.astro` ya diseñados; build local; verificación LIVE 4 plantillas post-deploy |
| Migración aimma-test con pérdida | Snapshot previo; mapeo supervisado; reversible |
| postMessage cross-origin mal validado (XSS/clickjacking) | Validar `event.origin` en ambos lados; iframe sandbox; token preview expira 15min |
| Re-render por reload causa flicker | Aceptable v1 (Shopify también recarga secciones); inline patch en Plan 5 |
| EF guardar-layout romper locking al tocar schema | No tocar el bloque de locking; solo cambiar el Zod de validación |
| Deuda: schema inline duplicado en EFs (MCP no resuelve ../_shared) | Documentado desde Plan 3; build step `deno bundle` queda para Plan 6 |

---

**Resultado esperado:** modelo de datos Shopify-grade, editor que muestra la tienda real, base escalable para inline-edit + templates por industria + IA (Plan 5) sin rehacer nada.
