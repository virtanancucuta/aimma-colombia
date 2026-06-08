# B-secciones Lote 3 — Plan ejecutable (categorias_destacadas · producto_destacado)

> **For agentic workers:** SUB-SKILL: `superpowers:subagent-driven-development` (renderers) o `executing-plans`. Pasos con checkbox.

**Goal:** Sumar `categorias_destacadas` + `producto_destacado` al Editor PRO-MAX (Fase 1 dormido), referenciando datos vivos del catálogo de la tienda, mismo molde que Lote 1/2.

**Arquitectura:** schema discriminado Zod (+2 tipos = 17) + mirror EF byte-idéntico; section-defs co-autorada (drift 03/04); referencias por **picker** (category existente + product nuevo) con default placeholder-válido + resolver live tenant-scoped al agregar; 2 renderers unificados (4 plantillas, `_SectionShell`, fetch tenant-scoped, empty→público-no-renderiza/preview-hint); golden ×4. Deploy storefront wrangler + EF v12, dormido.

**Tech:** Astro 5 SSR (CF Workers), Zod 3.25.76, JS admin vanilla (`window.TiendaIA.*`), Supabase. **Rama:** `feat/b-secciones-lote3` (ya creada desde main 8a8afef; el spec ya está commiteado ahí).

**Constante:** `SENTINEL_UUID = '00000000-0000-0000-0000-000000000000'` (placeholder all-zeros; no colisiona con id real; el helper lo filtra).

---

## FASE 1 — DORMIDO (todo en la rama; NO merge / NO Easypanel)

### Task 1: Schema TS + mirror EF
**Files:** Modify `packages/database/src/editor-schema.ts`; luego `cp` a `supabase/functions/tienda-guardar-layout/editor-schema.ts`.

- [ ] Tras `LogosProps` agregar:
```ts
// ---- B-secciones Lote 3 (2026-06-08) ----
const CategoriaDestacadaItemSchema = z.object({
  categoria_id: z.string().uuid(),                         // referencia; nombre/slug/foto se tiran vivos
});
const CategoriasDestacadasProps = z.object({
  titulo: z.string().max(200).optional(),
  columnas: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  items: z.array(CategoriaDestacadaItemSchema).min(1).max(12),
});
const ProductoDestacadoProps = z.object({
  producto_id: z.string().uuid(),                          // product-picker (inspector)
  titulo: z.string().max(200).optional(),                  // inline
  texto: z.string().max(2000).optional(),                  // inspector textarea PLANO
  cta_texto: z.string().max(80).optional(),                // inline
});
```
- [ ] En `SectionSchema` (discriminatedUnion), tras el miembro `logos`, agregar:
```ts
  SectionBase.extend({ tipo: z.literal('categorias_destacadas'), props: CategoriasDestacadasProps }),
  SectionBase.extend({ tipo: z.literal('producto_destacado'), props: ProductoDestacadoProps }),
```
- [ ] `cp packages/database/src/editor-schema.ts supabase/functions/tienda-guardar-layout/editor-schema.ts`
- [ ] **Verificar:** `cd tests/editor && node --import tsx --test 04-ef-schema-sync.test.mjs` → PASS (mirror byte-idéntico). Build types ok.
- [ ] Commit: `feat(b-secciones): schema Lote 3 (+categorias_destacadas +producto_destacado) + mirror EF`

### Task 2: section-defs co-autorada
**Files:** Modify `iapanel/tienda/admin/views/editor/section-defs.js`.

- [ ] **Reusar** `OPTS.COLUMNAS_FIJAS` (2/3/4, ya existe) para `columnas`. Tras `logos:` agregar:
```js
    categorias_destacadas: {
      label: 'Categorías destacadas',
      catalog: { group: 'avanzado', icon: '▤', desc: 'Cards de categorías que llevan a su página /c/.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'lg',
      campos: [
        { key: 'titulo', control: 'text', label: 'Titulo (opcional)', default: 'Explora por categoria', optional: true, opts: { maxLength: 200 }, empty_to_undefined: true },
        { key: 'columnas', control: 'select', label: 'Columnas', default: 3, opts: { options: 'COLUMNAS_FIJAS' } },
        { key: 'items', control: 'list', min: 1, max: 12, item_label: 'Categoría',
          add_label: '+ Agregar categoría', add_default: { categoria_id: '00000000-0000-0000-0000-000000000000' },
          max_note: 'Maximo 12 categorias.',
          default: [ { categoria_id: '00000000-0000-0000-0000-000000000000' } ],
          item: [ { key: 'categoria_id', control: 'category', label: 'Categoría' } ] },
      ],
    },

    producto_destacado: {
      label: 'Producto destacado',
      catalog: { group: 'avanzado', icon: '◆', desc: 'Destaca un producto con foto, texto y boton a su pagina.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'lg',
      campos: [
        { key: 'producto_id', control: 'product', label: 'Producto', default: '00000000-0000-0000-0000-000000000000' },
        { key: 'titulo', control: 'text', label: 'Titulo (opcional)', optional: true, opts: { maxLength: 200 }, empty_to_undefined: true },
        { key: 'texto', control: 'textarea', label: 'Texto (opcional)', optional: true, opts: { maxLength: 2000, rows: 3 }, empty_to_undefined: true },
        { key: 'cta_texto', control: 'text', label: 'Texto del boton (opcional)', optional: true, opts: { maxLength: 80 }, empty_to_undefined: true },
      ],
    },
```
- [ ] **Verificar:** `node --import tsx --test 03-drift-guard.test.mjs` → PASS (tipos + campos + opcionalidad + sub-campos). `01-default-props.test.mjs` → PASS (placeholder uuid es Zod-válido).

### Task 3: inline-fields TS + mirror JS + tests
**Files:** Modify `packages/database/src/inline-fields.ts`, `iapanel/.../editor/inline-fields.js`, `apps/storefront/test/inline-fields.test.ts`, `tests/editor/18-inline-fields.test.mjs`.

- [ ] Agregar en ambos registros: `categorias_destacadas: ['titulo']`, `producto_destacado: ['titulo', 'cta_texto']`.
- [ ] Actualizar el key-set esperado (`.sort()`) en los 2 tests para incluir los 2 tipos nuevos.
- [ ] **Verificar:** `node --import tsx --test 18-inline-fields.test.mjs` → PASS (SYNC TS↔JS).

### Task 4: editor-controls — productPicker nuevo + allowAll en categoryPicker
**Files:** Modify `iapanel/tienda/admin/views/editor/editor-controls.js`.

- [ ] En `categoryPicker` agregar soporte `allowAll` (default true; preserva `productos`):
```js
  function categoryPicker(label, value, onChange, opts) {
    opts = opts || {};
    const allowAll = opts.allowAll !== false;
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const current = el('span', { class: 'ed-catpicker__current' },
      value ? 'Categoria seleccionada' : (allowAll ? 'Todas las categorias' : 'Sin categoria'));
    const btn = el('button', {
      type: 'button', class: 'ed-btn ed-btn--secondary ed-catpicker__btn',
      onClick: () => {
        const modal = window.TiendaIA && window.TiendaIA.editorModalCategory;
        if (!modal) return;
        modal.open({ tiendaId: opts.tiendaId, current: value || null, allowAll }, (id, nombre) => {
          current.textContent = id ? (nombre || 'Categoria seleccionada') : (allowAll ? 'Todas las categorias' : 'Sin categoria');
          onChange(id || null);
        });
      },
    }, 'Elegir categoria');
    return fieldWrapper(label, el('div', { class: 'ed-catpicker' }, [current, btn]), errorEl);
  }
```
- [ ] Agregar `productPicker` (espejo, SIN "Todas"):
```js
  // product picker (Lote 3): elige UN producto activo de la tienda. VALOR = producto_id (uuid).
  function productPicker(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const current = el('span', { class: 'ed-prodpicker__current' },
      value ? 'Producto seleccionado' : 'Sin producto');
    const btn = el('button', {
      type: 'button', class: 'ed-btn ed-btn--secondary ed-prodpicker__btn',
      onClick: () => {
        const modal = window.TiendaIA && window.TiendaIA.editorModalProduct;
        if (!modal) return;
        modal.open({ tiendaId: opts.tiendaId, current: value || null }, (id, nombre) => {
          current.textContent = id ? (nombre || 'Producto seleccionado') : 'Sin producto';
          onChange(id || '');
        });
      },
    }, 'Elegir producto');
    return fieldWrapper(label, el('div', { class: 'ed-prodpicker' }, [current, btn]), errorEl);
  }
```
- [ ] Exportar: en `window.TiendaIA.editorControls = { … }` agregar `productPicker`.

### Task 5: editor-modal-product.js (nuevo) + allowAll en editor-modal-category.js + carga en index.html
**Files:** Create `iapanel/tienda/admin/views/editor/editor-modal-product.js`; Modify `editor-modal-category.js`; Modify `iapanel/tienda/admin/views/editor/index.html` (o el HTML que carga los scripts del editor).

- [ ] `editor-modal-category.js`: gatear el botón "Todas las categorias" (líneas ~31-35) con `if (opts.allowAll !== false) { … }`.
- [ ] Crear `editor-modal-product.js` (espejo byte-paralelo de `editor-modal-category.js`, marker `editor-b-modal-product`, **tenant-scoped**):
```js
/* AIMMA Tienda IA · Editor PRO-MAX · Lote 3 · editor-modal-product.js v1
 * Modal del product-picker: lista productos ACTIVOS de la tienda. Devuelve onPick(producto_id, nombre).
 * Mismo patron que editor-modal-category (supabase se invoca en el open, no en el render). SIN "Todas".
 * Marker: editor-b-modal-product. */
(function (window) {
  'use strict';
  let modalEl = null;
  function sb() { return window.TiendaIA && window.TiendaIA.supabase && window.TiendaIA.supabase(); }
  function open(opts, onPick) {
    opts = opts || {};
    const tiendaId = opts.tiendaId;
    const client = sb();
    if (!client || !tiendaId) { if (window.TiendaIA && window.TiendaIA.toast) window.TiendaIA.toast('No se pudo abrir el selector de productos', 'error'); return; }
    if (modalEl) close();
    const E = window.TiendaIA.editorControls.el;
    const grid = E('div', { class: 'ed-cat-grid' });
    const status = E('p', { class: 'ed-img-status' }, 'Cargando productos...');
    const modal = E('div', { class: 'ed-modal' }, [
      E('div', { class: 'ed-modal__header' }, [
        E('h3', { class: 'ed-modal__title' }, 'Elegir producto'),
        E('button', { type: 'button', class: 'ed-modal__close', 'aria-label': 'Cerrar', onClick: close }, '×'),
      ]),
      E('div', { class: 'ed-modal__body' }, [status, grid]),
    ]);
    modalEl = E('div', { class: 'ed-modal-backdrop', role: 'dialog', 'aria-modal': 'true', onClick: (e) => { if (e.target === modalEl) close(); } }, [modal]);
    document.body.appendChild(modalEl);
    document.addEventListener('keydown', onEsc);
    client.from('productos').select('id, nombre, foto_principal_url, precio_venta, precio_promo, estado')
      .eq('tienda_id', tiendaId).eq('estado', 'activo').order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { status.textContent = 'No se pudieron cargar los productos.'; return; }
        if (!data || !data.length) { status.textContent = 'Aun no tenes productos activos.'; return; }
        status.remove();
        data.forEach((prod) => {
          grid.appendChild(E('button', {
            type: 'button',
            class: 'ed-cat-card' + (opts.current === prod.id ? ' ed-cat-card--active' : ''),
            title: prod.nombre,
            onClick: () => { onPick(prod.id, prod.nombre); close(); },
          }, [
            prod.foto_principal_url ? E('img', { class: 'ed-cat-card__img', src: prod.foto_principal_url, alt: '', loading: 'lazy' }) : null,
            E('span', { class: 'ed-cat-card__name' }, prod.nombre),
          ]));
        });
      })
      .catch(() => { status.textContent = 'No se pudieron cargar los productos.'; });
  }
  function close() { if (!modalEl) return; modalEl.remove(); modalEl = null; document.removeEventListener('keydown', onEsc); }
  function onEsc(e) { if (e.key === 'Escape') close(); }
  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorModalProduct = { open, close };
})(window);
```
- [ ] Agregar el `<script>` de `editor-modal-product.js` en el HTML del editor (junto a `editor-modal-category.js`). Cache-buster real se bumpea en Fase 2.

### Task 6: dispatch del inspector — `product` (top-level) + `category` (en ítem)
**Files:** Modify `iapanel/tienda/admin/views/editor/editor-inspector.js`.

- [ ] **Primero verificar que el guard atrapa el gap:** `node --import tsx --test 19-inspector-field-coverage.test.mjs` → **FALLA** en `producto_destacado` (label "Producto") y `categorias_destacadas` (sub-campo "Categoría") — confirma que el dispatch no los cubre aún (mismo mecanismo que el bug del FAQ).
- [ ] En `renderCampo` (switch top-level, tras `case 'category'`):
```js
      case 'product':
        wrap.appendChild(C.productPicker(campo.label, p[campo.key] || '',
          v => setProp(ES, sec, campo.key, v, campo), { tiendaId: ES.tienda_id }));
        break;
```
- [ ] En `renderList` (item-dispatch, tras la rama `sf.control === 'switch'`):
```js
        } else if (sf.control === 'category') {
          card.body.appendChild(C.categoryPicker(sf.label, it[sf.key] || null,
            v => upd({ [sf.key]: v }), { tiendaId: ES.tienda_id, allowAll: false }));
```
- [ ] **Verificar:** `node --import tsx --test 19-inspector-field-coverage.test.mjs` → **PASS** (17 tipos). El wiring quedó forzado por el guard.

### Task 7: resolver de default live (tenant-scoped) al agregar
**Files:** Modify `iapanel/tienda/admin/views/editor/editor.js` (`openCatalog`, ~líneas 310-315).

- [ ] Reemplazar `openCatalog` por:
```js
  function openCatalog() {
    window.TiendaIA.editorModalCatalog.open(async (tipo) => {
      const ES = window.TiendaIA.editorState;
      const id = ES.addSection(tipo);
      if (!id) return;
      ES.select(id);
      try { await resolveLiveDefault(tipo, id, ES); } catch (_) { /* placeholder queda -> degradacion graciosa */ }
    });
  }

  // Reemplaza el uuid placeholder por data REAL de ESTA tienda (tenant-scoped). Si la tienda no tiene
  // categorias/productos, el placeholder queda (render publico no muestra nada; inspector muestra hint).
  async function resolveLiveDefault(tipo, id, ES) {
    const sb = window.TiendaIA.supabase && window.TiendaIA.supabase();
    if (!sb || !ES.tienda_id) return;
    if (tipo === 'categorias_destacadas') {
      const { data } = await sb.from('categorias')
        .select('id').eq('tienda_id', ES.tienda_id).order('orden', { ascending: true }).limit(3);
      if (data && data.length) ES.updateSectionProps(id, { items: data.map((c) => ({ categoria_id: c.id })) });
    } else if (tipo === 'producto_destacado') {
      const { data } = await sb.from('productos')
        .select('id').eq('tienda_id', ES.tienda_id).eq('estado', 'activo')
        .order('updated_at', { ascending: false }).limit(1);
      if (data && data.length) ES.updateSectionProps(id, { producto_id: data[0].id });
    }
  }
```
- [ ] **Verificar:** `node --check editor.js` ok. (El efecto live se prueba en Fase 3.)

### Task 8: helpers catalogo (tenant-scoped) + 2 renderers unificados
**Files:** Modify `apps/storefront/src/lib/catalogo.ts`; Create `apps/storefront/src/components/blocks/categorias_destacadas/CategoriasDestacadas.astro`, `apps/storefront/src/components/blocks/producto_destacado/ProductoDestacado.astro`.

- [ ] En `catalogo.ts` (aditivo, **tenant-scoped**, order-preserving/filtra-borradas):
```ts
export async function getCategoriasPorIds(
  supabase: SB, tiendaId: string, ids: string[]
): Promise<{ id: string; nombre: string; slug: string; foto_url: string | null }[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, slug, foto_url')
    .eq('tienda_id', tiendaId)               // TENANT-SCOPED
    .in('id', ids);
  if (error) { console.error('[catalogo] getCategoriasPorIds error:', error.message); return []; }
  const byId = new Map((data || []).map((c: any) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as any[]; // orden de `ids`, descarta borradas/otra-tienda/placeholder
}

export async function getProductoPorId(
  supabase: SB, tiendaId: string, id: string
): Promise<ProductoListItem | null> {
  const { data, error } = await supabase
    .from('productos')
    .select(`id, nombre, slug, referencia, precio_venta, precio_promo, foto_principal_url, estado,
             producto_variantes(stock, reservado)`)
    .eq('tienda_id', tiendaId)               // TENANT-SCOPED
    .eq('estado', 'activo')
    .eq('id', id)
    .maybeSingle();
  if (error) { console.error('[catalogo] getProductoPorId error:', error.message); return null; }
  return data ? normalizarProducto(data) : null;
}
```
- [ ] `CategoriasDestacadas.astro` (molde = `Logos.astro`: `prefix` por plantilla, `_SectionShell`, `data-field` solo `titulo` en preview, 4 `<style>` `.{ic,fb,ma,em}-catdest-*`). Lógica clave (empty-guard público/preview):
```astro
const { tienda, supabase } = Astro.locals;
const isPreview = Astro.locals?.isPreview;
let cats = [];
try { cats = await getCategoriasPorIds(supabase, tienda.id, p.items.map((i) => i.categoria_id)); }
catch (err) { console.error('[CategoriasDestacadas]', err); cats = []; }
const vacio = cats.length === 0;
---
{(vacio && !isPreview) ? null : (
  <SectionShell section={section}>
    {p.titulo && <h2 class={`${prefix}-catdest-title`} data-field={isPreview ? 'titulo' : undefined}>{p.titulo}</h2>}
    {vacio
      ? <p class={`${prefix}-catdest-empty`}>Agregá categorías para destacarlas.</p>
      : <div class={`${prefix}-catdest-grid ${prefix}-catdest-grid--${p.columnas}`}>
          {cats.map((c) => (
            <a class={`${prefix}-catdest-card`} href={`/c/${c.slug}`}>
              {c.foto_url
                ? <img class={`${prefix}-catdest-img`} src={c.foto_url} alt={c.nombre} loading="lazy" />
                : <div class={`${prefix}-catdest-ph`} aria-hidden="true"></div>}
              <span class={`${prefix}-catdest-name`}>{c.nombre}</span>
            </a>
          ))}
        </div>}
  </SectionShell>
)}
```
- [ ] `ProductoDestacado.astro` (mismo molde, empty-guard idéntico):
```astro
let prod = null;
try { prod = await getProductoPorId(supabase, tienda.id, p.producto_id); }
catch (err) { console.error('[ProductoDestacado]', err); prod = null; }
const vacio = !prod;
---
{(vacio && !isPreview) ? null : (
  <SectionShell section={section}>
    {vacio
      ? <p class={`${prefix}-proddest-empty`}>Elegí un producto para destacar.</p>
      : <div class={`${prefix}-proddest-card`}>
          {prod.foto_principal && <img class={`${prefix}-proddest-img`} src={prod.foto_principal} alt={prod.nombre} loading="lazy" />}
          <div class={`${prefix}-proddest-body`}>
            {p.titulo && <h2 class={`${prefix}-proddest-title`} data-field={isPreview ? 'titulo' : undefined}>{p.titulo}</h2>}
            <p class={`${prefix}-proddest-name`}>{prod.nombre}</p>
            <p class={`${prefix}-proddest-precio`}>{/* prod.precio (+ precio_anterior tachado) */}</p>
            {p.texto && <p class={`${prefix}-proddest-texto`} style="white-space:pre-wrap">{p.texto}</p>}
            <a class={`${prefix}-proddest-cta`} href={`/p/${prod.slug}`} data-field={isPreview ? 'cta_texto' : undefined}>{p.cta_texto || 'Ver producto'}</a>
          </div>
        </div>}
  </SectionShell>
)}
```
- [ ] Ambos: `prefix` derivado de `tienda.plantilla?.slug` (igual que Logos.astro); 4 `<style>` scopeados por prefijo. Build storefront verde.

### Task 9: BlockRenderer
**Files:** Modify `apps/storefront/src/components/BlockRenderer.astro`.
- [ ] Imports + entradas en `UNIFIED`:
```ts
import CategoriasDestacadas from '~/components/blocks/categorias_destacadas/CategoriasDestacadas.astro';
import ProductoDestacado from '~/components/blocks/producto_destacado/ProductoDestacado.astro';
// en UNIFIED: categorias_destacadas: CategoriasDestacadas, producto_destacado: ProductoDestacado,
```

### Task 10: Golden ×4 (con data-layer stubeada — NUEVO vs Lote 2)
**Files:** Create `apps/storefront/test/categorias-destacadas.golden.test.ts`, `apps/storefront/test/producto-destacado.golden.test.ts` + snapshots.
- [ ] **Diferencia con Lote 2:** estos renderers hacen fetch async → el golden DEBE stubear `getCategoriasPorIds`/`getProductoPorId` (o el `supabase` de `Astro.locals`) con fixtures deterministas. Casos: categorias_destacadas (con-titulo cols3 / sin-titulo cols2 / **vacío→público sin marco**); producto_destacado (con-titulo+texto+cta / mínimo / **vacío→público sin marco**). `renderNormalized` PÚBLICO ×4 plantillas.
- [ ] **Verificar:** snapshots con **0 `data-field`** y **0 `<script>`** (público limpio); el caso vacío-público no emite `<section>`.

### Task 11: suite completa
- [ ] Storefront `vitest run` verde. Admin `node --import tsx --test tests/editor/*.test.mjs`: drift 03/04, 18-inline, **19-coverage (17 tipos)**, 01-default — solo fail pre-existente conocido (si reaparece 15-shared-sanitize).

### Task 12: build + A5 + deploy + dormant gate + STOP
- [ ] Build storefront. **A5 CSS diff** (parent vs HEAD): delta = SOLO reglas nuevas `.{ic,fb,ma,em}-{catdest,proddest}*`; 0 selectores existentes alterados/dropeados; `@layer` sin drop de utilidades.
- [ ] Deploy storefront: `npm run build && npx wrangler deploy` (respetar `public/.assetsignore`; token CF guardado).
- [ ] Deploy EF v12: `SUPABASE_ACCESS_TOKEN=<Management PAT> npx supabase@2.105.0 functions deploy tienda-guardar-layout --project-ref rsmxklkxqsaptchcjszd` (verify_jwt=true preservado). **Verificar desplegado == local** (get_edge_function → version 12, schema con los 17 tipos).
- [ ] **Dormant gate:** catálogo 0 refs a los 2 tipos; DB 0 tiendas usan los tipos; live aimma-test 200 sin markup nuevo.
- [ ] Commit en `feat/b-secciones-lote3`. **PARAR. Reportar. NO merge / NO Easypanel.**

---

## FASE 2 — WAKE (merge + Easypanel)
- [ ] `editor-modal-catalog.js`: agregar `'categorias_destacadas', 'producto_destacado'` al array `AVANZADOS` (+ al texto del botón "Mas opciones").
- [ ] `index.html`: cache-busters (`section-defs`, `inline-fields`, `editor-controls`, `editor-inspector`, `editor.js`, `editor-modal-catalog`, **+ nuevo `editor-modal-product`**).
- [ ] Merge `--no-ff` a main. Verificar neto = solo archivos de Lote 3.
- [ ] **Tipo B Jorge:** redeploy Easypanel aimma-web.

## FASE 3 — VERIFICACIÓN (tras redeploy; mismo bar que Lote 1/2)
- [ ] Agregar los 2 a aimma-test (catalogo → AVANZADOS). Render ×4 plantillas.
- [ ] Inspector: `categoria`-en-ítem (modal sin "Todas") + `product`-picker (modal lista productos de la tienda).
- [ ] **Resolver live al agregar:** la sección nace con categorías reales / producto reciente de la tienda.
- [ ] **Tenant-scoping real:** el product-picker / category-picker NO muestran data de otra tienda; `getProductoPorId`/`getCategoriasPorIds` de otra tienda → no resuelven (estado vacío). (La garantía cross-tenant es render-side; la EF valida ownership del SAVE por tienda, no por-referencia.)
- [ ] **Degradación graciosa:** sección con 0 referencias resueltas → público NO muestra marco; preview muestra hint.
- [ ] C.1 patch, chrome, inline (titulo/cta_texto). Adversarial Zod TS + **EF REAL v12** (inválidas 400 / válida 200).
- [ ] Hotfix intacto (editar→persiste, F5→draft). **Restaurar aimma-test.**
- [ ] **NO cerrar hasta que Jorge vea las 2 × 4 plantillas EN VIVO y apruebe el look.**

---

## Cobertura del spec (self-review)
- categorias_destacadas (schema/defs/dispatch-category-en-ítem/helper/renderer/inline) → Tasks 1,2,3,6,8,9,10. ✓
- producto_destacado + product-picker nuevo (modal/control/dispatch/helper/renderer/inline) → Tasks 1,2,3,4,5,6,8,9,10. ✓
- Tenant-scoping (picker + helpers + resolver) → Tasks 5,7,8 (`.eq('tienda_id')` en cada query). ✓
- Novedad estructural (placeholder all-zeros / resolver live / degradación graciosa pública-vs-editor) → Tasks 2,7,8. ✓
- Guards (drift-03 sub-campos / 04-EF / 19-coverage fuerza wiring / golden ×4) → Tasks 1,2,6,10,11. ✓
- Fases 1 dormido → 2 wake → 3 verif → secciones FASE. ✓
