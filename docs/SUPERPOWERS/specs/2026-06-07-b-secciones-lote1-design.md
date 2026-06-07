# B-secciones · Lote 1 — Diseño (imagen-con-texto · características · cita)

**Fecha:** 2026-06-07
**Estado:** SPEC — pendiente OK de Jorge en el gate de diseño. Read-only, nada de prod.
**Base:** receta verificada en el descubrimiento B-secciones. Reusa _SectionShell (C.1 patch + chrome Paso 1 automáticos), inspector auto-generado de section-defs, C.2 inline (data-field gateado).

## Principios transversales (aplican a las 3)
- **Sin rich-text** en estas 3 → los párrafos son `textarea` PLANO (Astro auto-escapa `{valor}` en render). **No se toca `validateAndSanitizeSection`** (solo sanitiza `texto.contenido`; ningún campo nuevo es richtext). Si se quisiera formato en algún párrafo, es follow-up (+ extender el sanitize).
- **Sin control nuevo del inspector**: todo cae en `text/textarea/url/select/image/switch` + sub-editores `list`/`toggle-object`. La única adición es un **enum de íconos** para características (datos + SVG en el renderer, no un control).
- **Renderer UNIFICADO** (1 archivo, `prefix` ic/fb/ma/em + 4 `<style>` scopeados), salvo que la estructura cambie de verdad (no es el caso). Todos via `_SectionShell`.
- **Schema en DOS lugares sincronizados**: `packages/database/src/editor-schema.ts` + mirror `supabase/functions/tienda-guardar-layout/editor-schema.ts` (la EF Deno no importa el paquete). El test de drift los guarda.

---

## Sección 1 — `imagen_con_texto`
Imagen + bloque de texto al lado (título + texto + botón opcional), imagen izq/der, stack en móvil.

### 1.1 Schema (Zod, TS + mirror EF idénticos)
```ts
const ImagenConTextoProps = z.object({
  src: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),
  alt: z.string().max(200),
  titulo: z.string().max(200),
  texto: z.string().max(2000).optional(),     // parrafo PLANO (textarea) -> inspector
  boton: BotonSchema.optional(),               // reusa BotonSchema existente
  posicion_imagen: z.enum(['izquierda', 'derecha']).default('izquierda'),
});
// + SectionBase.extend({ tipo: z.literal('imagen_con_texto'), props: ImagenConTextoProps }) en el union
```
(src/alt FLAT como la sección `imagen`, no anidado → inspector simple.)

### 1.2 section-defs
- `label`: 'Imagen con texto' · `catalog`: { group: 'esencial', icon: '◧', desc: 'Una imagen al lado de un titulo y texto, con boton opcional.' }
- `ancho_default`: 'contenido' · `padding_default`: 'lg'
- `campos`: `src`(image) · `alt`(text) · `titulo`(text) · `texto`(textarea, opcional) · `posicion_imagen`(select izquierda/derecha) · `boton`(toggle-object con subfields texto/url/estilo_visual/icono/target — copia exacta del `boton` de banner)

### 1.3 Inline (C.2)
- `titulo` → **INLINE** (título visible 1 línea). `boton.texto` → **INLINE** (etiqueta).
- `texto` → **inspector** (párrafo multilínea). `alt` → inspector (atributo).
- `SIMPLE_TEXT_FIELDS.imagen_con_texto = ['titulo', 'boton.texto']` (TS + mirror JS).

### 1.4 Renderer (unificado)
- **Estructura:** `<SectionShell>` → `<div class="grid md:grid-cols-2 gap-…">` con 2 celdas: **imagen** (`<img src alt>`) y **bloque texto** (`<h2 data-field=titulo>` + `<div class="whitespace-pre-line" >{texto}</div>` + botón opcional `<a>` con el texto en `<span data-field=boton.texto>` condicional, como los heroes). `posicion_imagen='derecha'` invierte el orden (clase `md:order-…` o `md:[direction]`). Móvil: `grid-cols-1` (stack, imagen arriba).
- **Por plantilla** (mismo layout, 4 `<style>`):
  - **industrial_clean**: IBM Plex Sans, h2 semibold tracking ajustado, imagen con borde sutil + radius 2px, botón `block-button` sólido.
  - **fashion_bold**: Anton uppercase en el h2, imagen edge-to-edge sin radius, botón rectangular alto contraste.
  - **minimal_artesanal**: Fraunces opsz en h2, radius 4px, espaciado aireado, botón pill.
  - **editorial_magazine**: Fraunces 300 + acento italic, hairline/accent en el bloque, imagen con hover-scale sutil (como `em-imagen`).

### 1.5 Golden test
`imagen_con_texto.golden.test.ts`: fixtures (con/sin botón · izquierda/derecha · sin texto) × 4 plantillas, byte-idéntico.

---

## Sección 2 — `caracteristicas`
Grid de ítems {icono, título, texto} + título de sección opcional, N columnas.

### 2.1 Schema
```ts
const FEATURE_ICONS = ['envio','garantia','pago','calidad','soporte','reloj','estrella','check','regalo','corazon'] as const;
const CaracteristicaItemSchema = z.object({
  icono: z.enum(FEATURE_ICONS),
  titulo: z.string().max(120),
  texto: z.string().max(300).optional(),
});
const CaracteristicasProps = z.object({
  titulo: z.string().max(200).optional(),
  columnas: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  items: z.array(CaracteristicaItemSchema).min(1).max(8),
});
```

### 2.2 section-defs
- `label`: 'Caracteristicas' · `catalog`: { group: 'avanzado', icon: '✦', desc: 'Grilla de beneficios con icono: envio, garantia, pago seguro.' }
- `ancho_default`: 'contenido' · `padding_default`: 'lg'
- `campos`: `titulo`(text, opcional) · `columnas`(select 2/3/4) · `items`(list min1 max8: `icono`(select con FEATURE_ICONS) · `titulo`(text) · `texto`(textarea, opcional))
- **Nuevo dato (no control):** `OPTS.FEATURE_ICONOS` (las 10 opciones) en section-defs/editor-inspector + SVG paths en el renderer.

### 2.3 Inline (C.2)
- `titulo`(sección) → **INLINE**. `items.*.titulo` → **INLINE** (título corto del ítem).
- `items.*.texto` → **inspector** (descripción que puede envolver). `icono` → inspector (select).
- `SIMPLE_TEXT_FIELDS.caracteristicas = ['titulo', 'items.*.titulo']`.

### 2.4 Renderer (unificado)
- **Estructura:** `<SectionShell>` → `{titulo && <h2 data-field=titulo>}` + `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-{columnas}">` de cards. Card = ícono (SVG resuelto de `icono` vía un map `ICON_PATHS`) + `<h3 data-field="items.${idx}.titulo">` + `<p>{texto}</p>`.
- **Por plantilla:**
  - **industrial_clean**: íconos line (stroke), cards con borde sutil, h3 semibold.
  - **fashion_bold**: íconos grandes, sin card-border, h3 Anton uppercase, contraste fuerte.
  - **minimal_artesanal**: íconos finos, mucho aire, h3 Fraunces, centrado.
  - **editorial_magazine**: ícono pequeño + accent line, h3 Fraunces, tono editorial.

### 2.5 Golden test
`caracteristicas.golden.test.ts`: fixtures (2/3/4 col · varios íconos · con/sin título · con/sin texto-ítem) × 4 plantillas.

---

## Sección 3 — `cita`
Frase grande destacada + autor opcional.

### 3.1 Schema
```ts
const CitaProps = z.object({
  texto: z.string().max(500),                 // la frase (render 1-linea-ish, sin white-space:pre-line)
  autor: z.string().max(120).optional(),
  alineacion: AlineacionEnum.default('center'),
});
```

### 3.2 section-defs
- `label`: 'Cita destacada' · `catalog`: { group: 'avanzado', icon: '❝', desc: 'Una frase grande destacada, con autor opcional.' }
- `ancho_default`: 'contenido' · `padding_default`: 'xl'
- `campos`: `texto`(textarea) · `autor`(text, opcional) · `alineacion`(select)

### 3.3 Inline (C.2)
- `texto` → **INLINE single-line** (es una frase; se renderiza sin `white-space:pre-line` → wrap natural, sin saltos manuales; idéntico criterio al subtítulo del banner; el inspector textarea queda para edición). `autor` → **INLINE**.
- `SIMPLE_TEXT_FIELDS.cita = ['texto', 'autor']`.
- Justificación: ambos son texto visible de una línea en display.

### 3.4 Renderer (unificado)
- **Estructura:** `<SectionShell>` → `<blockquote class="text-{alineacion}">` con `<p data-field=texto>` (frase grande) + `{autor && <cite data-field=autor>}`.
- **Por plantilla** (donde más se nota la personalidad):
  - **industrial_clean**: IBM Plex, frase grande semibold, cite mono pequeño.
  - **fashion_bold**: Anton uppercase enorme, alto contraste, cite tracked.
  - **minimal_artesanal**: Fraunces italic opsz, comillas decorativas suaves.
  - **editorial_magazine**: Fraunces 300 italic + dropquote/accent, cite serif.

### 3.5 Golden test
`cita.golden.test.ts`: fixtures (con/sin autor · alineaciones) × 4 plantillas.

---

## PLAN DEL LOTE (gates + rollback)

### Fase 1 — Storefront + EF (DORMIDO)
- Schemas (×2 mirrors: packages + EF) + `SIMPLE_TEXT_FIELDS` (TS+JS) para los inline + 3 renderers unificados + registrar en `BlockRenderer` (UNIFIED) + `FEATURE_ICONS`/SVG + golden tests.
- Deploy: `wrangler deploy` (storefront) + redeploy EF (`tienda-guardar-layout`).
- **GATE dormido (CARACTERIZADO como A5, NO asumir "byte-idéntico"):** el catálogo (admin) NO tiene entrada para los 3 tipos → ningún usuario los agrega.
  - **HTML de páginas existentes** (stores que no usan los tipos nuevos): **byte-idéntico** (strip-compare antes/después; los tipos nuevos no se renderizan → cero cambio en el markup).
  - **CSS: el chunk VA A CRECER** (3 renderers nuevos meten reglas). Caracterizar el delta: las reglas agregadas deben ser **SOLO** las de las secciones nuevas (`.ic-/.fb-/.ma-/.em-{imagen-con-texto,caracteristicas,cita}-*` + utilidades que solo ellas usan). **Para stores actuales ese CSS está presente-pero-sin-usar → benigno.** CONFIRMAR con el diff de reglas (como en A5/Paso 2): **ningún selector existente cambió ni se dropeó**, solo se SUMARON reglas de los tipos nuevos. Si aparece otra cosa (un selector existente modificado/removido, o reglas ajenas) → **FRENAR y reportar**.
  - El schema valida + el renderer renderiza si un tipo existe. Drift-test del schema mirror verde. Suite storefront verde.
- **Rollback:** `wrangler rollback` + redeploy EF anterior.

### Fase 2 — Admin (DESPIERTA)
- `section-defs` (3 entradas: label/catalog/campos/defaults) + `editor-modal-catalog` (agregar los 3 tipos a ESENCIALES/AVANZADOS) + cache-busters. Tests admin verdes.
- **GATE:** confirmar diff → merge `--no-ff` a main → **Jorge redeploya Easypanel** → curl markers nuevos.
- **Rollback:** revert del merge + redeploy.

### Fase 3 — Verificación (LIVE)
- Por cada sección: agregar a un store de prueba → **render en las 4 plantillas** + **inspector** (campos correctos) + **C.1 patch** (editar prop → preview se actualiza) + **chrome Paso 1** (seleccionar) + **C.2 inline** (los campos marcados editan inline; los de inspector no) + **adversarial Zod** (props inválidas / fuera de enum → rechazadas por la EF al guardar).
- Restaurar aimma-test. Reportar resultados concretos.

## Cobertura del plan
3 secciones × {schema TS+EF · section-defs · inline · renderer 4-plantillas · golden} + el FEATURE_ICONS (único dato nuevo). Sin control nuevo, sin tocar el sanitize. Patrón limpio reutilizado de C.1/C.2.
