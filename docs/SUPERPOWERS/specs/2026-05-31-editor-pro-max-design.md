# AIMMA Tienda IA · Fase 7 · Editor PRO-MAX (Wix-style)

**Fecha:** 2026-05-31
**Autor:** Claude + Jorge
**Status:** SPEC para aprobacion Jorge

---

## 1. Objetivo

Editor visual tipo Wix/Webflow integrado en panel admin de Tienda IA. Permitir al duenio personalizar la home page sin tocar codigo, manteniendo el diseno profesional de las 3 plantillas base como punto de partida.

Capacidades minimas requeridas (Jorge 2026-05-31):

1. Mover texto (drag & drop bloques)
2. Editar modo celular (preview mobile/tablet/desktop)
3. Elegir tamano de texto (escala fija sm/md/lg/xl/2xl)
4. Elegir colores (limitados a paleta de la tienda + neutros)
5. Agregar / quitar botones (CTA)
6. Escoger franjas para imagenes (banner full-width)
7. Carrusel de productos por categoria

Adicional Fase 7.2 paralela: WhatsApp checkout E2E (tabla pedidos + OTP + EF). Ver doc separado.

## 2. No-objetivos (YAGNI)

- **NO** custom CSS/HTML libre del usuario (XSS + diseno roto)
- **NO** editor de codigo (no es Webflow real)
- **NO** componentes infinitos custom (solo 8 tipos base)
- **NO** marketplace de plantillas third-party
- **NO** A/B testing visual (futuro)
- **NO** versionado timeline tipo Figma (solo "deshacer ultima publicacion")
- **NO** edicion en vivo del storefront real (solo en panel; publish-then-deploy)

## 3. Arquitectura

### 3.1 Decision de framework

Evaluados 3 opciones:

| Framework | Pros | Contras | Veredicto |
|---|---|---|---|
| **GrapesJS** | Editor visual completo, drag-drop, plugins | 200KB+, output HTML libre (XSS), curva alta | NO — overkill + inseguro |
| **Craft.js (React)** | React-native, custom blocks, headless | Necesita React en panel (hoy vanilla JS), bundle grande | NO — costo migracion |
| **CUSTOM vanilla** | 0 dependencias, control total, schema strict (sin XSS) | Mas trabajo inicial | **SI — el camino correcto** |

**Decision:** Editor custom vanilla JS con **schema strict de bloques** (no HTML libre). Cada bloque es JSON tipado, se renderiza server-side por Astro a HTML seguro.

### 3.2 Schema de bloques

8 tipos de bloques predefinidos. JSON tipado en `tiendas.personalizaciones.home_layout`:

```ts
type Block =
  | { type: 'hero';           id: string; props: HeroProps }
  | { type: 'text';           id: string; props: TextProps }
  | { type: 'image_banner';   id: string; props: ImageBannerProps }
  | { type: 'buttons_row';    id: string; props: ButtonsRowProps }
  | { type: 'product_carousel'; id: string; props: ProductCarouselProps }
  | { type: 'category_grid';  id: string; props: CategoryGridProps }
  | { type: 'spacer';         id: string; props: SpacerProps }
  | { type: 'divider';        id: string; props: DividerProps };

type HeroProps = {
  titulo: string;
  subtitulo?: string;
  cta_texto?: string;
  cta_url?: string;
  imagen_fondo_url?: string;
  altura: 'sm' | 'md' | 'lg' | 'full';
  alineacion: 'left' | 'center' | 'right';
};

type TextProps = {
  contenido: string;             // texto plano (sin HTML)
  tamano: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  alineacion: 'left' | 'center' | 'right';
  color: 'text' | 'text-soft' | 'primary' | 'accent';  // limitado a tokens paleta
  peso: 'normal' | 'medium' | 'semibold' | 'bold';
};

type ImageBannerProps = {
  imagen_url: string;
  alt: string;
  link_url?: string;
  altura: 'sm' | 'md' | 'lg';
  overlay_oscuro: boolean;
};

type ButtonsRowProps = {
  alineacion: 'left' | 'center' | 'right';
  botones: Array<{
    texto: string;
    url: string;
    estilo: 'primary' | 'accent' | 'outline' | 'ghost';
  }>;
};

type ProductCarouselProps = {
  titulo?: string;
  categoria_id?: string | null;   // null = todos
  limite: number;                  // max 12
  orden: 'recientes' | 'precio_asc' | 'precio_desc' | 'aleatorio';
};

type CategoryGridProps = {
  titulo?: string;
  columnas: 2 | 3 | 4;
  categoria_ids: string[];         // max 8
};

type SpacerProps = {
  altura: 'sm' | 'md' | 'lg' | 'xl';
};

type DividerProps = {
  estilo: 'linea' | 'punto' | 'icono';
  color: 'border' | 'text-soft' | 'primary';
};
```

### 3.3 Persistencia

**Sin nueva tabla.** Reusamos `tiendas.personalizaciones jsonb`:

```jsonc
{
  // existente (no tocar)
  "wizard_completado": true,
  "logo_personalizado": "...",
  // nuevo Fase 7
  "home_layout": {
    "version": 1,
    "updated_at": "2026-05-31T22:00:00Z",
    "blocks": [
      { "type": "hero", "id": "blk_001", "props": { ... } },
      { "type": "product_carousel", "id": "blk_002", "props": { ... } }
    ]
  }
}
```

Cuando `home_layout` es `null`/ausente → render por defecto (la plantilla base Fashion/Industrial/Minimal). Esto garantiza que tiendas existentes no rompan.

### 3.4 Render server-side (storefront)

`apps/storefront/src/pages/index.astro` cambia:

```astro
---
const layout = tienda.personalizaciones?.home_layout;
const useCustomLayout = Array.isArray(layout?.blocks) && layout.blocks.length > 0;
---

<Layout ...>
  {useCustomLayout ? (
    <BlockRenderer blocks={layout.blocks} />
  ) : (
    <>
      <Hero />
      <ProductGrid productos={productos} />
    </>
  )}
</Layout>
```

`BlockRenderer.astro` (nuevo) recibe el array, valida con Zod (o type guards), y despacha a 8 sub-componentes:
- `apps/storefront/src/components/blocks/BlockHero.astro`
- `apps/storefront/src/components/blocks/BlockText.astro`
- `apps/storefront/src/components/blocks/BlockImageBanner.astro`
- `apps/storefront/src/components/blocks/BlockButtonsRow.astro`
- `apps/storefront/src/components/blocks/BlockProductCarousel.astro`
- `apps/storefront/src/components/blocks/BlockCategoryGrid.astro`
- `apps/storefront/src/components/blocks/BlockSpacer.astro`
- `apps/storefront/src/components/blocks/BlockDivider.astro`

Cada componente:
- Usa CSS vars de la paleta (`--ta-color-primary` etc.)
- Usa fonts dinamicas (`--ta-font-display`, `--ta-font-body`)
- Sin HTML libre (todos los strings van por `{escape}` de Astro)
- Renderiza solo para mobile/tablet/desktop responsive nativo

### 3.5 UI del editor (panel admin)

Nueva vista: `iapanel/tienda/admin/views/editor.js` + sub-archivos:

```
iapanel/tienda/admin/views/editor/
├── editor.js              (entry — dispatcher hash router)
├── editor-state.js        (Zustand-lite: subscribe/setState patron)
├── editor-canvas.js       (renderiza preview con drag handles)
├── editor-sidebar.js      (panel derecho: lista bloques + add bloque)
├── editor-inspector.js    (panel derecho-bajo: editar props del bloque seleccionado)
├── editor-toolbar.js      (top: device toggle + undo + save + back)
├── editor-blocks/         (componentes vanilla por tipo)
│   ├── hero.js
│   ├── text.js
│   ├── image-banner.js
│   ├── buttons-row.js
│   ├── product-carousel.js
│   ├── category-grid.js
│   ├── spacer.js
│   └── divider.js
└── editor-styles.css      (CSS especifico del editor)
```

**Layout 3-paneles (desktop):**

```
+--------------------------------------------------+
|  TOOLBAR  [Volver] [Mobile|Tab|Desktop] [Undo] [Guardar]
+------+------------------------------------+------+
|      |                                    |      |
|      |                                    |  +   |
|      |       PREVIEW IFRAME-LIKE         | Hero |
|  Blo |      (renderiza bloques en vivo)  | Text |
|  ques|      drag-handles encima          | Img  |
|  list|                                    | Btns |
|      |                                    | Carrl|
|      |                                    | Grid |
|      |                                    +------+
|      |                                    | INSP |
|      |                                    | ECTOR|
|      |                                    |      |
+------+------------------------------------+------+
```

**En mobile (panel admin):** stack vertical, toolbar fijo arriba, swipe entre canvas/sidebar/inspector via tabs.

**Device preview toggle:** No usa iframe real (cross-origin). Aplica `class="device-mobile|device-tablet|device-desktop"` al canvas + width fija + scale CSS si necesario.

### 3.6 Flow drag & drop

Usar HTML5 Drag and Drop API nativo (sin dependencia):
- `draggable=true` en bloques del sidebar y en preview
- `dragover` + `drop` en zonas de canvas
- Indicador visual de drop position (linea horizontal blue 2px)

**Limites:**
- Solo reordenar bloques (no anidar)
- No mover columnas dentro de un bloque (los bloques son atomicos)
- Maximo 30 bloques por home (suficiente, evita layouts deformes)

### 3.7 Save flow

1. Usuario edita en canvas/inspector → `editor-state.js` mutate (in-memory)
2. Boton "Guardar cambios" → POST a Supabase Edge Function nueva: `tienda-guardar-layout`
3. EF valida con Zod, sanea strings, upserta en `tiendas.personalizaciones.home_layout`
4. EF dispara invalidate KV via worker /__invalidate (Fase 7.5)
5. Frontend muestra "Cambios publicados. Refresca la vista previa."

### 3.8 Undo (1 nivel)

`editor-state.js` mantiene snapshot anterior al `save()`. Boton "Deshacer ultima publicacion" llama la EF con el snapshot anterior. Suficiente para MVP.

### 3.9 Modo celular (preview)

Toggle en toolbar: `mobile (375px) / tablet (768px) / desktop (1280px)`.
- Canvas wrappea con `width: <Npx>; margin: 0 auto;`
- Bordes redondeados estilo dispositivo (light visual cue)
- Renderizado real con media queries Tailwind. Lo que se ve es lo que se publica.

### 3.10 Limites de paleta y tipografia

El editor NUNCA permite color libre (hex picker). Solo permite elegir entre los tokens de la paleta de la tienda:
- `text` (text-base) / `text-soft` / `primary` / `accent` / `bg-base`

Esto garantiza:
- Auto-contrast WCAG sigue funcionando
- No se rompe el diseno de la plantilla base
- Cambiar paleta en Configuracion afecta tambien al layout custom

Tipografia: usa siempre `--ta-font-display` y `--ta-font-body` de la plantilla. El usuario solo elige tamano (sm-3xl) y peso (normal-bold).

## 4. Seguridad

### 4.1 XSS
- Todos los strings del schema (titulo, subtitulo, contenido, alt, etc.) se renderizan via `{value}` de Astro (auto-escape)
- `cta_url`, `link_url`, `imagen_url` validados como URL valida + whitelist scheme (`http`, `https`, mailto, tel, wa.me)
- NUNCA `set:html` en BlockRenderer

### 4.2 Storage de imagenes
- Reusar bucket Supabase Storage existente para tienda (mismo de productos)
- Path: `tienda/{tienda_id}/layout/blk_xxx.{webp,jpg}`
- Limite 2MB por imagen, WebP preferido
- EF firma URLs (no public read directo)

### 4.3 RLS
- `tiendas.personalizaciones` solo writeable por user owner (RLS existente)
- EF `tienda-guardar-layout` valida `auth.uid() = tiendas.user_id`

### 4.4 Validacion Zod
EF y editor-state.js comparten schema Zod (paquete `@aimma/types` futuro, o duplicado por ahora). Si JSON invalido → 400 + log.

## 5. Plan de implementacion (fases)

### Fase 7.1.A — BD + schema (1h)
- [ ] No migration de schema (reusa `personalizaciones jsonb`)
- [ ] `apps/storefront/src/lib/blocks-schema.ts` (tipos + Zod)
- [ ] Documentar formato en CLAUDE.md

### Fase 7.1.B — Storefront renderer (3h)
- [ ] `BlockRenderer.astro` dispatcher
- [ ] 8 componentes `blocks/Block*.astro` (responsive, paleta, fonts)
- [ ] Cambio en `pages/index.astro` (custom vs default)
- [ ] Test E2E: poner `home_layout` manualmente en BD → ver render OK

### Fase 7.1.C — Edge Function guardar layout (1h)
- [ ] `supabase/functions/tienda-guardar-layout/index.ts`
- [ ] Validacion Zod + RLS check + upsert
- [ ] Trigger invalidate KV (Fase 7.5)
- [ ] deploy verify_jwt=true

### Fase 7.1.D — UI editor en panel (8h — MVP)
- [ ] `editor.js` + sub-archivos
- [ ] Canvas con preview en vivo
- [ ] Sidebar con 8 bloques drag-source
- [ ] Inspector con form dinamico por tipo de bloque
- [ ] Toolbar (device toggle + save + undo + back)
- [ ] Estilos CSS

### Fase 7.1.E — Integration test E2E (2h)
- [ ] Test manual: crear layout from scratch en aimma-test
- [ ] Verificar persistencia en BD
- [ ] Verificar render en storefront LIVE
- [ ] Verificar mobile/tablet/desktop
- [ ] Auditoria code-reviewer agent

### Fase 7.1.F — Documentar para usuario (1h)
- [ ] Tooltip onboarding en primer uso
- [ ] Help text inline en cada inspector
- [ ] Doc Notion / Google Doc para clientes (opcional)

**Total Fase 7.1 (Editor):** ~16h estimadas

## 6. Mockups (text-based)

### Toolbar
```
[<- Volver]   [Mobile] [Tablet] [Desktop]   [Deshacer]   [Guardar y publicar]
```

### Sidebar bloques
```
+ AGREGAR BLOQUE
[Hero]
[Texto]
[Imagen banner]
[Botones]
[Carrusel productos]
[Grid categorias]
[Espacio]
[Separador]

EN ORDEN ACTUAL:
1. Hero "Bienvenidos" [editar] [x]
2. Texto "Nuestra historia" [editar] [x]
3. Carrusel "Mas vendidos" [editar] [x]
4. Categorias 3-col [editar] [x]
```

### Inspector (cuando selecciona Hero)
```
HERO
Titulo:      [Bienvenidos a Maraldo                  ]
Subtitulo:   [Calzado para toda la familia           ]
CTA texto:   [Ver catalogo                           ]
CTA url:     [/c/destacados                          ]
Imagen fondo: [Subir...] o [URL...]
Altura:      ( ) sm  ( ) md  (X) lg  ( ) full
Alineacion:  ( ) Izq  (X) Centro  ( ) Der
```

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigacion |
|---|---|---|
| Layout custom rompe responsive | Media | Componentes Block* son responsive nativos Tailwind |
| Usuario pone imagen 10MB | Alta | Limite 2MB en client + EF rechaza > 5MB |
| Drag-drop bugs en touch | Media | Pruebas E2E mobile + fallback "mover arriba/abajo" buttons |
| XSS via URL field | Baja | Whitelist schemes + validacion Zod |
| Schema future-proof | Media | Field `version: 1` para futuras migraciones forward-compat |
| Editor lento en tienda grande | Baja | Preview no carga productos reales, usa fixtures |

## 8. Metricas de exito

- [ ] Jorge puede crear layout custom para Maraldo en <5 min sin ayuda
- [ ] Render storefront sin regresion vs plantillas base
- [ ] Cero XSS verificado (test payload `<script>alert(1)</script>` no ejecuta)
- [ ] Lighthouse storefront mantiene 90+ con layout custom
- [ ] Mobile editor usable (no requiere mouse)

## 9. Decisiones pendientes (Jorge)

1. **Aprobar schema 8 bloques** o pedir cambios (agregar/quitar tipos)
2. **Drag-drop nativo HTML5** vs libreria pequena (sortablejs ~30KB) — recomiendo nativo
3. **Modo edit inline** texto (click → editable directo) vs solo via Inspector — recomiendo solo Inspector para evitar bugs cross-origin
4. **Undo ilimitado** vs 1-nivel — recomiendo 1-nivel para MVP

## 10. Siguientes pasos

1. Jorge revisa este spec
2. Si OK → implementar Fase 7.1.A + 7.1.B + 7.1.C esta semana
3. UI editor (7.1.D) la semana siguiente
4. Lanzar a Maraldo como beta tester
