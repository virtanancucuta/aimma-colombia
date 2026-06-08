# B-secciones Lote 3 — Diseño (categorias_destacadas · producto_destacado)

**Fecha:** 2026-06-08 · **Molde:** idéntico a Lote 1/2 (`2026-06-07-b-secciones-lote1-design.md`, `2026-06-08-b-secciones-lote2-design.md`).

## Objetivo
Sumar **2 secciones** al Editor PRO-MAX que **referencian datos vivos del catálogo de la tienda**
(no texto libre): `categorias_destacadas` (cards → `/c/<slug>`) y `producto_destacado`
(un producto destacado → `/p/<slug>`). Mismo molde probado: schema Zod discriminado + mirror
EF byte-idéntico, section-defs co-autorada (drift 03/04 verde), renderer unificado con `<style>` ×4
plantillas, golden ×4, deploy en 3 fases (Fase 1 dormido → Fase 2 wake → Fase 3 verificación).

> **`tabla_de_tallas` salió de Lote 3 → Fase F** (es contextual al PRODUCTO, vive en la página de
> producto, no en la home; se diseña cuando se haga la edición de la página de producto).

## Decisiones (cerradas con Jorge)
- **`categorias_destacadas` APROBADO.** Lista de categorías; cada ítem referencia una `categoria_id`
  elegida con el **picker de categoría EXISTENTE** (no control nuevo). Nombre/slug/foto se **tiran vivos**.
- **`producto_destacado` = OPCIÓN A.** Se **construye un product-picker nuevo** (espejo del modal de
  categoría) + control `product` en el dispatch. Scope **SINGLE** (card grande + texto plano + CTA →
  `/p/<slug>`). **"Colección destacada" (set) diferida.**
- **TENANT-SCOPING (crítico).** El query del product-picker **Y** los helpers (`getProductoPorId`,
  `getCategoriasPorIds`) van **scopeados a la tienda** (`.eq('tienda_id', tiendaId)` + RLS). Un picker
  NUNCA lista ni resuelve data de otra tienda.
- **inline vs inspector:**
  - `categorias_destacadas`: `titulo` **inline**; picks (`items.*.categoria_id`) **inspector**.
  - `producto_destacado`: `titulo` + `cta_texto` **inline** (single-line); `texto` **plano por inspector**;
    `producto_id` **inspector** (picker).
- **Párrafo `texto` = PLANO** (textarea, sin richtext, sin tocar sanitize). **Sin JS cliente.**
- **Renderer unificado ×4** por sección; **golden ×4** por sección.

## Novedad estructural — referencias a datos dinámicos REQUERIDAS
Ninguna sección previa tenía un campo cuya validez dependiera de datos vivos. Esto introduce 3 sub-decisiones
(todas dentro del molde, ninguna es control nuevo salvo el product-picker ya aprobado):

1. **Invariante "siempre Zod-válido".** El save (draft **y** publish) corre `SectionSchema.parse` por sección
   en la EF. Por eso una sección recién agregada DEBE ya contener referencias válidas (`categoria_id`/`producto_id`
   son `uuid` requeridos). Solución:
   - **Default estático placeholder-válido** en section-defs (`uuid` constante `00000000-…-000000000000`) → mantiene
     verdes `01-default-props`, `03-drift`, `19-coverage` con el patrón estándar.
   - **Resolver de default en vivo al agregar**: el flujo "agregar" (editor-modal-catalog) intenta reemplazar el
     placeholder con data real de ESA tienda — `categorias_destacadas` ← primeras ≤3 categorías por `orden`;
     `producto_destacado` ← producto activo más reciente. Si la tienda tiene 0 categorías / 0 productos, se inserta
     el placeholder (estado vacío + hint en inspector "Elegí…"). **Query scopeada a `tiendaId`.**
2. **Picker de categoría sin "Todas" en este contexto.** El `categoryPicker` actual ofrece "Todas las categorías"
   (`null`), válido para `productos.categoria_id`. En `categorias_destacadas` un card DEBE apuntar a una categoría
   concreta → el item-dispatch pasa **`allowAll:false`** y el modal oculta esa opción. El comportamiento de
   `productos` no cambia (default `allowAll:true`).
3. **Degradación graciosa en el render.** Si una referencia apunta a algo borrado / placeholder / de otra tienda,
   el helper la filtra y el renderer muestra estado vacío. Nunca 500.

---

## Sección 1 — categorias_destacadas

```ts
const CategoriaDestacadaItemSchema = z.object({
  categoria_id: z.string().uuid(),                         // referencia; nombre/slug/foto se tiran vivos
});
const CategoriasDestacadasProps = z.object({
  titulo: z.string().max(200).optional(),                  // inline
  columnas: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3), // select (reusa set 2/3/4)
  items: z.array(CategoriaDestacadaItemSchema).min(1).max(12),
});
```
- **section-defs:** `titulo` (text, inline, `empty_to_undefined`) · `columnas` (select 2/3/4) · `items`
  (list min1 max12, `item_label:'Categoría'`, `item:[{ key:'categoria_id', control:'category', label:'Categoría' }]`,
  `default` placeholder-válido con 1 ítem). `render_strategy:'unified'`, `ancho_default:'contenido'`,
  `padding_default:'lg'`. Catálogo: grupo `avanzado`, icono p.ej. `▥`.
- **inline/inspector:** `titulo` → inline (single-line, consistente con resto). picks → inspector (modal,
  `allowAll:false`). Justificación: la pregunta de qué categoría es una elección discreta (modal), no texto
  editable en canvas.
- **Dispatch (editor-inspector.js):** agregar rama **`category` dentro del item-dispatch de listas**
  (hoy `editor-inspector.js:248-268` soporta text/url/image/textarea/select/switch, **NO category**). Es wiring
  del `categoryPicker` que YA existe en el dispatch top-level (`:178`), no control nuevo. **`19-coverage` lo fuerza**
  (igual que forzó el fix del FAQ): si no se wirea, el label "Categoría" del ítem no renderiza y el test falla.
- **Helper nuevo (lib/catalogo.ts, aditivo, tenant-scoped):**
  ```ts
  getCategoriasPorIds(supabase, tiendaId, ids: string[]): Promise<{id;nombre;slug;foto_url}[]>
  // from('categorias').select('id,nombre,slug,foto_url').eq('tienda_id', tiendaId).in('id', ids)
  // luego REORDENA según `ids` y DESCARTA los no devueltos (borrados / otra tienda / placeholder).
  ```
- **Renderer unificado ×4:** async; `ids = items.map(i=>i.categoria_id)` → `getCategoriasPorIds(...)`; grid de cards
  (`foto_url` o placeholder + `nombre`) → `<a href="/c/${slug}">`. Empty → estado vacío. Sin JS. `data-field` solo preview.

## Sección 2 — producto_destacado  (control nuevo aprobado)

```ts
const ProductoDestacadoProps = z.object({
  producto_id: z.string().uuid(),                          // inspector: product-picker NUEVO
  titulo: z.string().max(200).optional(),                  // inline
  texto: z.string().max(2000).optional(),                  // inspector textarea PLANO
  cta_texto: z.string().max(80).optional(),                // inline
});
```
- **section-defs:** `producto_id` (control `product` NUEVO) · `titulo` (text inline) · `texto` (textarea plano) ·
  `cta_texto` (text inline). `default` placeholder-válido (`producto_id` = uuid placeholder). `render_strategy:'unified'`,
  `ancho_default:'contenido'`, `padding_default:'lg'`. Catálogo: grupo `avanzado`, icono p.ej. `◆`.
- **inline/inspector:** `titulo` + `cta_texto` → inline. `texto` → inspector (plano). `producto_id` → inspector (picker).
- **Control nuevo `product` (editor-controls.js):** `productPicker(label, value, onChange, {tiendaId})` espejo de
  `categoryPicker` — muestra el producto elegido (nombre, resuelto al pick) + botón "Elegir producto". `supabase`
  se invoca al abrir el modal (no en render), igual que category → `19-coverage` (jsdom, sin supabase) pasa con el
  label presente.
- **Modal nuevo `editor-modal-product.js`** (espejo byte-paralelo de `editor-modal-category.js`, marker
  `editor-b-modal-product`):
  ```js
  from('productos').select('id, nombre, foto_principal_url, precio_venta, precio_promo, estado')
    .eq('tienda_id', tiendaId).eq('estado','activo').order('updated_at',{ascending:false})
  // grid de cards (foto + nombre + precio). onPick(producto_id, nombre). SIN opción "Todas" (pick único requerido).
  ```
  **Tenant-scoped** por `.eq('tienda_id', tiendaId)`. (Buscador por nombre = nice-to-have opcional.)
- **Dispatch (editor-inspector.js):** agregar **`case 'product'`** en el switch top-level (`:157`) →
  `C.productPicker(campo.label, p[campo.key]||'', …, { tiendaId: ES.tienda_id })`. `19-coverage` lo fuerza.
- **Helper nuevo (lib/catalogo.ts, aditivo, tenant-scoped):**
  ```ts
  getProductoPorId(supabase, tiendaId, id): Promise<ProductoListItem|null>
  // from('productos').select('id,nombre,slug,precio_venta,precio_promo,foto_principal_url,estado,
  //   producto_variantes(stock,reservado)').eq('tienda_id', tiendaId).eq('estado','activo')
  //   .eq('id', id).maybeSingle()  -> normalizarProducto (reusa el normalizador existente)
  ```
- **Renderer unificado ×4:** async; `getProductoPorId(...)`; si `null` → estado vacío/"Producto no disponible";
  si ok → card grande (foto + nombre + precio/precio_anterior) + `titulo` (heading opc) + `texto` (párrafo plano opc) +
  botón CTA (`cta_texto || 'Ver producto'`) → `/p/${slug}`. Sin JS. `data-field` solo preview.

---

## Guards / tests (qué fuerza qué)
- **`03-drift-guard`** (tipos + campos + opcionalidad + **sub-campos de items**): al sumar los 2 tipos en section-defs
  + Zod quedan forzados a coincidir, incluido `categorias_destacadas.items[].categoria_id`.
- **`04-ef-schema-sync`**: el `editor-schema.ts` de la EF debe ser **mirror byte-idéntico** (re-`cp` tras editar el canónico).
- **`19-inspector-field-coverage`**: fuerza que el dispatch renderice `category` (en ítem) y `product` (top-level);
  sin las ramas nuevas, falla (mismo mecanismo que atrapó el bug del FAQ).
- **`01-default-props`**: los `default` placeholder-válidos parsean OK (uuid constante). Se documenta que el contenido
  real lo pone el resolver de add-time.
- **Golden** (`capture-golden` / `*.golden.test`): **×4 plantillas por sección** (≥8 snapshots nuevos); público
  limpio (0 `data-field`, 0 `<script>`).
- **Gate A5 (CSS aditivo):** las reglas nuevas deben ser EXCLUSIVamente `.{ic,fb,ma,em}-{catdest,proddest}*`; 0 selectores
  existentes alterados; verificar `@layer` sin drop de utilidades; DB 0/3 tiendas usan los tipos nuevos (dormancy).

## Plan por fases (Tipo A salvo el último paso)
- **Fase 1 — DORMIDO** (rama `feat/b-secciones-lote3`, sin tocar catálogo):
  schema Zod +2 (17 tipos) + mirror EF byte-idéntico · section-defs co-autoradas (drift 03/04 verde) · 2 helpers
  catalogo tenant-scoped · `productPicker` + `editor-modal-product.js` · ramas dispatch (`category` en ítem,
  `product` top-level) · `allowAll:false` en categoryPicker · resolver de add-default en vivo · 2 renderers unificados
  + BlockRenderer + golden ×4. Deploy: **storefront wrangler** + **EF tienda-guardar-layout v12** (verify_jwt=true,
  vía Supabase CLI desde disco = byte-idéntico). **NO merge a main, NO Easypanel** → dormancy (catálogo sin los tipos).
- **Fase 2 — WAKE:** los 2 tipos al `editor-modal-catalog` (AVANZADOS) + cache-busters (section-defs, inline-fields,
  editor-controls, editor-modal-catalog, + nuevo editor-modal-product) + merge `--no-ff` a main. **Tipo B Jorge:
  redeploy Easypanel aimma-web.**
- **Fase 3 — VERIFICACIÓN** (mismo bar que Lote 1/2, tras redeploy): agregar los 2 a aimma-test, render ×4 plantillas,
  inspector (incl. category-en-ítem y product-picker), C.1 patch, chrome, inline (titulo/cta_texto), **tenant-scoping
  real** (el picker NO muestra productos/categorías de otra tienda), adversarial Zod TS + **EF REAL v12** (inválidas 400
  / válida 200). **Aclaración de la garantía cross-tenant:** la protección es **render-side** — un `producto_id`/
  `categoria_id` de OTRA tienda parsea y se guarda (uuid válido), pero el helper tenant-scoped **no lo resuelve** →
  estado vacío; la EF valida ownership del SAVE por `tienda_id`, **no** por-referencia. Verificar ambos. hotfix intacto
  (editar→persiste, F5→draft), **restaurar aimma-test**. **NO cerrar hasta que Jorge vea las 2 × 4 plantillas EN VIVO.**

## Archivos (estimado)
**Nuevos:** `editor-modal-product.js` · `apps/storefront/src/components/blocks/categorias_destacadas/CategoriasDestacadas.astro` ·
`.../producto_destacado/ProductoDestacado.astro` · golden nuevos.
**Modificados:** `packages/database/src/editor-schema.ts` (+ mirror EF) · `section-defs.js` · `editor-controls.js`
(`productPicker` + `allowAll` en categoryPicker) · `editor-inspector.js` (2 ramas dispatch) · `editor-modal-category.js`
(`allowAll`) · `editor-modal-catalog.js` (2 tipos + resolver add-default) · `lib/catalogo.ts` (2 helpers) ·
`BlockRenderer.astro` (2 imports + UNIFIED) · `inline-fields` (registro: catdest.titulo, proddest.titulo, proddest.cta_texto) ·
`index.html` (cache-busters).

## Riesgos / no-retornos
- **No-retorno:** deploy EF v12 (reversible re-desplegando v11 desde disco) y merge a main. Dormancy lo aísla hasta Fase 2.
- **Riesgo tenant-leak** si un picker/helper omite `.eq('tienda_id')` → mitigado por: filtro explícito en cada query +
  RLS + verificación en Fase 3 con 2 tiendas.
- **Riesgo invariante-Zod** si una sección queda sin `categoria_id`/`producto_id` válido → mitigado por default
  placeholder-válido + resolver de add-time + degradación graciosa en render.
