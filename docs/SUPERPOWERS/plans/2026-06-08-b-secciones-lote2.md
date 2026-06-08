# B-secciones Lote 2 — Plan ejecutable

> **Sub-skill:** subagent-driven para los 3 renderers; resto hands-on. Pasos con checkbox.

**Goal:** Sumar testimonios + faq + logos al Editor PRO-MAX (Fase 1 dormido), idéntico al molde de Lote 1.

**Arquitectura:** schema discriminado Zod + mirror EF byte-idéntico; section-defs co-autorada (drift 03/04); 3 renderers unificados (4 plantillas, `_SectionShell`); inline data-field gated isPreview + SIMPLE_TEXT_FIELDS; golden ×4. Deploy storefront wrangler + EF, dormido.

**Rama:** `feat/b-secciones-lote2` (desde main a89bbfa).

---

### Task 1: Schema TS + mirror EF
- [ ] `packages/database/src/editor-schema.ts`: agregar tras `CitaProps` el bloque Lote 2 (TestimonioItem/Testimonios, FaqItem/Faq, LogoItem/Logos) con los maxes del spec; agregar 3 union members tras `cita`.
- [ ] `cp` a `supabase/functions/tienda-guardar-layout/editor-schema.ts` (byte-idéntico).
- [ ] Verificar: drift 04 verde (mirror), build types ok.

### Task 2: section-defs co-autorada
- [ ] `iapanel/.../editor/section-defs.js`: 3 defs tras `cita` con `label` + `catalog{group:'avanzado',icon,desc}` + `campos` (keys/optionality 1:1 con Zod). OPTS nuevos: `COLUMNAS_TESTIM` (1/2/3), `RATING_OPTS` (''/1..5), `LOGOS_LAYOUT` (grilla/tira). texto/respuesta = control `textarea`; foto/logo = `image`; rating = `select` optional empty_to_undefined; link = `url` optional; items = `list`.
- [ ] Verificar: **drift 03 verde** (tipos + campos + opcionalidad).

### Task 3: inline-fields TS + mirror JS
- [ ] `packages/database/src/inline-fields.ts` + `iapanel/.../editor/inline-fields.js`: agregar `testimonios:['titulo','items.*.autor','items.*.cargo']`, `faq:['titulo']`, `logos:['titulo']`.
- [ ] Actualizar key-set esperado en `apps/storefront/test/inline-fields.test.ts` y `tests/editor/18-inline-fields.test.mjs` (agregar faq, logos, testimonios al `.sort()`).
- [ ] Verificar: SYNC 18 verde.

### Task 4: 3 renderers unificados (subagentes)
- [ ] `blocks/testimonios/Testimonios.astro`: grilla cards columnas 1/2/3; avatar foto opc; estrellas SVG (rating llenas/vacías, sin rating→sin fila); `h2 data-field={isPreview?'titulo':undefined}`; por item autor/cargo en span condicional `{isPreview?<span data-field=\`items.${i}.autor\`>…</span>:…}`; texto en div sin marker; 4 `<style>` ic/fb/ma/em.
- [ ] `blocks/faq/Faq.astro`: `h2` titulo data-field gated; `<details><summary>{pregunta}</summary><div>{respuesta}</div></details>` por item (pregunta/respuesta SIN data-field); 4 `<style>`.
- [ ] `blocks/logos/Logos.astro`: titulo data-field gated; grilla(auto-fit)/tira(flex-wrap) por `layout`; `<img>` envuelto en `<a>` si link; sin per-item inline; 4 `<style>`.
- [ ] Todos: usar `_SectionShell`, `isPreview = Astro.locals?.isPreview`, `prefix` por `tienda.plantilla?.slug`. Build verde.

### Task 5: BlockRenderer
- [ ] `BlockRenderer.astro`: import + UNIFIED `{testimonios,faq,logos}`.

### Task 6: Golden ×4
- [ ] 3 `*.golden.test.ts` (TEMPLATES×combos): testimonios (col3-rating-foto / col2-sin-rating / col1-min), faq (con-titulo / sin-titulo), logos (grilla-link / tira-sin-link). `renderNormalized` PUBLICO.
- [ ] `vitest -u` → snapshots. Confirmar **0 data-field** en snapshots (render público limpio).

### Task 7: Suite completa
- [ ] Storefront `vitest run` verde. Admin `node --test tests/editor/*.test.mjs` (drift 03/04, SYNC 18) — solo fail pre-existente 15-shared-sanitize.

### Task 8: Build + A5 + deploy + gate
- [ ] Build storefront; A5 CSS rule-set diff (parent vs HEAD): delta = solo reglas nuevas, 0 selectores existentes alterados/dropeados.
- [ ] Deploy: `wrangler deploy` storefront + EF `tienda-guardar-layout` v11 (verify_jwt=true; verificar desplegado==local).
- [ ] Dormant gate: catálogo 0 refs; DB 0 tiendas usan tipos; live tienda 200 sin markup nuevo.
- [ ] Commit en `feat/b-secciones-lote2`. **PARAR. Reportar. No merge / no Easypanel.**
