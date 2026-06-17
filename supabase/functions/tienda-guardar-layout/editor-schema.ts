// packages/database/src/editor-schema.ts
// AIMMA Editor PRO-MAX · Zod schemas compartidos · SCHEMA v3 (2026-06-02)
// Modelo Shopify-style: secciones apiladas auto-contenidas con props tipadas.
// SIN grid 2D, SIN elementos posicionados. El orden del array = orden vertical.
// Validado en: EF tienda-guardar-layout + Storefront BlockRenderer + Panel editor admin.

import { z } from 'zod';

// ============================================================
// Regex de seguridad (conservados de v1/v2 — hardening Plan 1)
// ============================================================

// CSS-safe color: bloquea CSS injection en style="color:${valor}".
export const CSS_COLOR_REGEX = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)<>]+\)|hsla?\([^)<>]+\)|ok(lch|lab)\([^)<>]+\)|[a-zA-Z]{3,30})$/;
// CSS-safe gradient: solo linear/radial/conic-gradient.
const CSS_GRADIENT_REGEX = /^(linear|radial|conic)-gradient\([^)<>"'`;{}@\\]{1,400}\)$/i;
// CSS-safe https URL: bloquea javascript:, data:, etc.
const HTTPS_URL_REGEX = /^https:\/\/[^"'<>`\s]{4,490}$/;

// Embed: solo iframes de proveedores whitelisted (defense-in-depth XSS).
const EMBED_ALLOWED_PROVIDERS = '(youtube\\.com|youtube-nocookie\\.com|vimeo\\.com|player\\.vimeo\\.com|codepen\\.io|codesandbox\\.io|maps\\.google\\.com|google\\.com\\/maps|open\\.spotify\\.com)';
const EMBED_ALLOWED_ATTRS = '(width|height|frameborder|allow|allowfullscreen|loading|title|referrerpolicy)';
const EMBED_WHITELIST_REGEX = new RegExp(
  `^<iframe\\s+src=("|')https:\\/\\/(www\\.)?${EMBED_ALLOWED_PROVIDERS}\\/[^"']+\\1` +
  `(\\s+${EMBED_ALLOWED_ATTRS}(="[^"<>]*")?)*` +
  `\\s*>(\\s*<\\/iframe>)?\\s*$`,
  'i'
);

// ============================================================
// FASE D (2a) · Video por URL · builder server-side (la EF es la autoridad)
// ============================================================
// Toma una URL de proveedor SOPORTADO (YouTube / Vimeo) y CONSTRUYE el iframe embed canonico,
// extrayendo SOLO el id seguro hacia un template hardcodeado -> NUNCA pasa la URL cruda al `src`
// (anti-XSS). Devuelve null si el proveedor no es soportado o la URL es invalida (Spotify / Maps /
// CodePen siguen disponibles via el paste-iframe legacy `html`). El iframe construido pasa, por
// diseno, EMBED_WHITELIST_REGEX. Pura (new URL + regex) -> identica en Deno (EF), Node (tests) y
// Cloudflare Workers (storefront). Es la frontera de confianza: cualquier cosa que no parsee a un
// id de proveedor conocido se rechaza.
const YT_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID_RE = /^[0-9]{6,12}$/;

export function buildEmbedFromUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const seg = u.pathname.split('/').filter(Boolean);
  let src: string | null = null;

  // ---- YouTube ----
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    let id = '';
    if (seg[0] === 'watch') id = u.searchParams.get('v') || '';
    else if ((seg[0] === 'embed' || seg[0] === 'shorts' || seg[0] === 'v') && seg[1]) id = seg[1];
    if (YT_ID_RE.test(id)) src = `https://www.youtube.com/embed/${id}`;
  } else if (host === 'youtu.be') {
    const id = seg[0] || '';
    if (YT_ID_RE.test(id)) src = `https://www.youtube.com/embed/${id}`;
  }
  // ---- Vimeo ----
  else if (host === 'vimeo.com') {
    const id = seg.filter((s) => /^[0-9]+$/.test(s)).pop() || '';
    if (VIMEO_ID_RE.test(id)) src = `https://player.vimeo.com/video/${id}`;
  } else if (host === 'player.vimeo.com') {
    const id = (seg[0] === 'video' && seg[1]) ? seg[1] : '';
    if (VIMEO_ID_RE.test(id)) src = `https://player.vimeo.com/video/${id}`;
  }

  if (!src) return null;
  return `<iframe src="${src}" width="100%" height="100%" frameborder="0" ` +
    `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
    `allowfullscreen loading="lazy" title="Video"></iframe>`;
}

// ============================================================
// Enums + sub-schemas compartidos
// ============================================================

const AlineacionEnum = z.enum(['left', 'center', 'right']);
const AnchoEnum = z.enum(['completo', 'contenido']);
const PaddingEnum = z.enum(['sm', 'md', 'lg', 'xl']);
const TamanioEnum = z.enum(['sm', 'md', 'lg', 'xl']);
const IconoEnum = z.enum(['arrow', 'whatsapp', 'email', 'phone', 'location', 'link']);
const EstiloVisualEnum = z.enum(['primary', 'secondary', 'ghost', 'outline']);

export const BotonSchema = z.object({
  texto: z.string().max(80),
  url: z.string().regex(
    /^(https:\/\/|mailto:|tel:|#|\/)/,
    'url debe ser https, mailto, tel, # o /'
  ),
  estilo_visual: EstiloVisualEnum.default('primary'),
  target: z.enum(['_self', '_blank']).default('_self'),
  icono: IconoEnum.optional(),
});

const ImagenRefSchema = z.object({
  src: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),
  alt: z.string().max(200),
});

const CampoSchema = z.object({
  tipo_campo: z.enum(['text', 'email', 'tel', 'textarea', 'select', 'checkbox']),
  label: z.string().max(120),
  placeholder: z.string().max(200).optional(),
  requerido: z.boolean().default(false),
  opciones: z.array(z.string().max(100)).max(20).optional(),
});

// ============================================================
// Fondo (conservado de v2)
// ============================================================

const FondoSchema = z.object({
  tipo: z.enum(['color', 'imagen', 'gradient', 'transparente']).default('transparente'),
  valor: z.string().max(500),
  overlay: z.object({
    color: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
    opacity: z.number().min(0).max(1),
  }).optional(),
}).refine((f) => {
  if (f.tipo === 'transparente') return true;
  if (f.tipo === 'color') return CSS_COLOR_REGEX.test(f.valor);
  if (f.tipo === 'imagen') return HTTPS_URL_REGEX.test(f.valor);
  if (f.tipo === 'gradient') return CSS_GRADIENT_REGEX.test(f.valor);
  return false;
}, { message: 'fondo.valor invalido para tipo declarado', path: ['valor'] });

// ============================================================
// Props por tipo de seccion
// ============================================================

const BannerProps = z.object({
  titulo: z.string().max(200),
  subtitulo: z.string().max(500).optional(),
  imagen_fondo: ImagenRefSchema.extend({
    objeto: z.enum(['cover', 'contain']).default('cover'),
  }).optional(),
  boton: BotonSchema.optional(),
  alineacion: AlineacionEnum.default('left'),
});

const TextoProps = z.object({
  contenido: z.string().max(5000),
  alineacion: AlineacionEnum.default('left'),
  tamanio: TamanioEnum.default('md'),
});

const ImagenProps = z.object({
  src: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),
  alt: z.string().max(200),
  objeto: z.enum(['cover', 'contain']).default('cover'),
  aspect_ratio: z.enum(['16/9', '4/3', '1/1', '3/4', '4/5']).optional(),
  link_url: z.string().url().optional(),
});

const BotonesProps = z.object({
  items: z.array(BotonSchema).min(1).max(6),
});

const ProductosProps = z.object({
  categoria_id: z.string().uuid().nullable(),
  limite: z.number().int().min(1).max(12).default(8),
  orden: z.enum(['recientes', 'precio_asc', 'precio_desc', 'manual']).default('recientes'),
  columnas: z.union([z.literal('auto'), z.literal(2), z.literal(3), z.literal(4)]).default('auto'),
  mostrar_precio: z.boolean().default(true),
});

const GaleriaProps = z.object({
  imagenes: z.array(ImagenRefSchema).min(3).max(12),
  layout: z.enum(['grid', 'carrusel', 'mosaico']).default('grid'),
  gap: z.enum(['tight', 'normal', 'loose']).default('normal'),
});

const FormularioProps = z.object({
  titulo: z.string().max(200).optional(),
  campos: z.array(CampoSchema).min(1).max(8),
  boton_texto: z.string().max(80).default('Enviar'),
});

const EspacioProps = z.object({
  altura: TamanioEnum.default('md'),
});

// FASE D (2b): MP4 subido a Cloudflare R2. La URL final guardada DEBE ser del dominio publico de R2
// con ruta <tienda_id:uuid>/<archivo:uuid>.mp4. Anti-SSRF: el <video src> JAMAS puede apuntar a otro
// host; el path lo genera server-side la EF de presign (tienda-presign-video), no el cliente. Literal
// (no env) -> mirror EF byte-identico. El navegador sube por presigned PUT; aca validamos la URL final.
const R2_UUID_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const R2_VIDEO_URL_REGEX = new RegExp(`^https:\\/\\/videos\\.aimma\\.com\\.co\\/${R2_UUID_SRC}\\/${R2_UUID_SRC}\\.mp4$`);

// FASE D (2a): el video acepta `url` (link de YouTube/Vimeo -> la EF construye el iframe) O `html`
// (paste-iframe legacy/avanzado para Maps/Spotify/CodePen). FASE D (2b): O `mp4_url` (archivo subido a
// R2). Backward-compat: filas viejas con solo `html` siguen validando por EMBED_WHITELIST_REGEX. Al menos
// una fuente requerida. PRECEDENCIA: mp4_url es la fuente si esta presente (la modal setea UNA sola). Si
// viene `url`, la EF construye `html` autoritativamente; aca validamos que sea parseable a un proveedor.
const VideoProps = z.object({
  url: z.string().max(500).optional(),
  html: z.string().max(2000).optional(),
  mp4_url: z.string().max(200).optional(),
  aspect_ratio: z.enum(['16/9', '4/3', '1/1']).default('16/9'),
}).superRefine((p, ctx) => {
  const hasUrl = typeof p.url === 'string' && p.url.trim() !== '';
  const hasHtml = typeof p.html === 'string' && p.html.trim() !== '';
  const hasMp4 = typeof p.mp4_url === 'string' && p.mp4_url.trim() !== '';
  if (!hasUrl && !hasHtml && !hasMp4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'el video necesita un archivo MP4, un link (YouTube/Vimeo) o un codigo iframe', path: ['url'] });
    return;
  }
  // mp4_url es la fuente prioritaria: si esta, solo validamos su dominio (anti-SSRF) y cortamos.
  if (hasMp4) {
    if (!R2_VIDEO_URL_REGEX.test(p.mp4_url!.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'el archivo de video no es valido', path: ['mp4_url'] });
    }
    return;
  }
  if (hasUrl && buildEmbedFromUrl(p.url!.trim()) === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'link de video no soportado (pega un link de YouTube o Vimeo)', path: ['url'] });
  }
  // Si no hay url, el html legacy/avanzado debe ser un iframe de proveedor permitido.
  if (!hasUrl && hasHtml && !EMBED_WHITELIST_REGEX.test(p.html!.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'el iframe no es de un proveedor permitido (YouTube, Vimeo, Maps, Spotify, CodePen, CodeSandbox)', path: ['html'] });
  }
});

// ---- B-secciones Lote 1 (2026-06-07) ----

// Iconos de la seccion caracteristicas (11). El renderer resuelve cada uno a un SVG path.
const FEATURE_ICONS = ['envio', 'garantia', 'pago', 'calidad', 'soporte', 'reloj', 'estrella', 'check', 'regalo', 'corazon', 'devoluciones'] as const;

const ImagenConTextoProps = z.object({
  src: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),
  alt: z.string().max(200),
  titulo: z.string().max(200),
  texto: z.string().max(2000).optional(),       // parrafo PLANO (sin richtext)
  boton: BotonSchema.optional(),
  posicion_imagen: z.enum(['izquierda', 'derecha']).default('izquierda'),
});

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

const CitaProps = z.object({
  texto: z.string().max(500),
  autor: z.string().max(120).optional(),
  alineacion: AlineacionEnum.default('center'),
});

// ---- B-secciones Lote 2 (2026-06-08) ----

const TestimonioItemSchema = z.object({
  texto: z.string().max(600),                              // reseña PLANA (sin richtext) -> inspector
  autor: z.string().max(120),                              // inline
  cargo: z.string().max(120).optional(),                  // inline (rol/empresa)
  foto: z.string().url().regex(/^https:\/\//, 'imagen debe ser https').optional(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
});
const TestimoniosProps = z.object({
  titulo: z.string().max(200).optional(),
  columnas: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
  items: z.array(TestimonioItemSchema).min(1).max(9),
});

const FaqItemSchema = z.object({
  pregunta: z.string().max(300),
  respuesta: z.string().max(1500),                         // PLANA -> inspector
});
const FaqProps = z.object({
  titulo: z.string().max(200).optional(),
  items: z.array(FaqItemSchema).min(1).max(12),
});

const LogoItemSchema = z.object({
  logo: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),
  alt: z.string().max(200),
  link: z.string().regex(/^(https:\/\/|\/(?!\/))/, 'link debe ser https o ruta interna').optional(),
});
const LogosProps = z.object({
  titulo: z.string().max(200).optional(),
  layout: z.enum(['grilla', 'tira']).default('grilla'),
  items: z.array(LogoItemSchema).min(1).max(12),
});

// ---- B-secciones Lote 3 (2026-06-08) ----
// Secciones que REFERENCIAN datos vivos del catalogo (no texto libre). Solo guardan el id;
// nombre/slug/foto/precio se tiran vivos al render (helpers tenant-scoped). El editor reemplaza
// el placeholder all-zeros por data real al agregar (resolver tenant-scoped). Si la referencia
// no resuelve (borrada/placeholder/otra tienda): publico no renderiza nada; preview muestra hint.

const CategoriaDestacadaItemSchema = z.object({
  categoria_id: z.string().uuid(),                         // referencia (category-picker, allowAll:false)
  imagen: z.string().url().regex(/^https:\/\//, 'imagen debe ser https').optional(), // per-seccion, opcional (image-picker existente -> Storage)
});
const CategoriasDestacadasProps = z.object({
  titulo: z.string().max(200).optional(),                  // inline
  columnas: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3), // select (COLUMNAS_FIJAS)
  items: z.array(CategoriaDestacadaItemSchema).min(1).max(12),
});

const ProductoDestacadoProps = z.object({
  producto_id: z.string().uuid(),                          // product-picker NUEVO (inspector)
  titulo: z.string().max(200).optional(),                  // inline
  texto: z.string().max(2000).optional(),                  // inspector textarea PLANO
  cta_texto: z.string().max(80).optional(),                // inline
});

// ============================================================
// Section (discriminated union por tipo)
// ============================================================

const SectionBase = z.object({
  id: z.string().regex(/^sec_[a-z0-9]{4,}$/, 'id formato sec_xxxx'),
  ancho: AnchoEnum.default('completo'),
  fondo: FondoSchema,
  padding: PaddingEnum.default('md'),
  ai_generated: z.object({
    generated_at: z.string().datetime(),
    model: z.enum(['claude-haiku-4-5', 'claude-sonnet-4-6']),
    prompt: z.string().max(2000),
    tokens_consumidos: z.number().int().min(0),
  }).optional(),
});

// ============================================================
// FASE D · Bloques anidables (sections + blocks) · contenedor + union hija
// ============================================================
// Un `contenedor` es una seccion top-level (18o miembro de SectionSchema) que agrupa BLOQUES
// HIJOS en columnas. PROFUNDIDAD MAXIMA 2 NIVELES (contenedor -> hijo): la union hija NO incluye
// `contenedor`, asi la profundidad queda acotada POR CONSTRUCCION (sin z.lazy, sin recursion, sin
// contador runtime). Aditivo: la data sin contenedor valida y renderiza identico (igual que los
// Lotes 1/2/3 sumaron tipos sin bump de schema_version).

// ChildBase = SectionBase + columna destino. Tipos hoja permitidos dentro de un contenedor (PASO 0):
// texto, imagen, botones, imagen_con_texto, cita, video, espacio, producto_destacado. Excluidos a
// proposito: productos-grid, galeria, formulario, categorias_destacadas, banner y el propio contenedor.
const ChildBase = SectionBase.extend({
  // columna destino dentro del contenedor (0..columnas-1). El render (D2) reparte por este indice;
  // en mobile el contenedor colapsa a 1 columna. Default 0 (primera columna).
  columna: z.number().int().min(0).max(3).default(0),
});

export const HijoSchema = z.discriminatedUnion('tipo', [
  ChildBase.extend({ tipo: z.literal('texto'), props: TextoProps }),
  ChildBase.extend({ tipo: z.literal('imagen'), props: ImagenProps }),
  ChildBase.extend({ tipo: z.literal('botones'), props: BotonesProps }),
  ChildBase.extend({ tipo: z.literal('imagen_con_texto'), props: ImagenConTextoProps }),
  ChildBase.extend({ tipo: z.literal('cita'), props: CitaProps }),
  ChildBase.extend({ tipo: z.literal('video'), props: VideoProps }),
  // FASE D · P2-2: 'espacio' REMOVIDO de los hijos (redundante: la columna ya separa con row-gap;
  // verificado en prod: 0 hijos 'espacio'). 'espacio' SIGUE como seccion top-level (SectionSchema).
  ChildBase.extend({ tipo: z.literal('producto_destacado'), props: ProductoDestacadoProps }),
]);

export type Hijo = z.infer<typeof HijoSchema>;
export type HijoTipo = Hijo['tipo'];

const ContenedorProps = z.object({
  // 1 = pila vertical; 2-4 = fila que colapsa a 1 columna en mobile (render = D2).
  columnas: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
  gap: z.enum(['tight', 'normal', 'loose']).default('normal'),
  alineacion_vertical: z.enum(['start', 'center', 'stretch']).default('start'),
  // Tope 8 hijos por contenedor (PASO 0). El contenedor cuenta como 1 de las 20 secciones de la pagina.
  bloques: z.array(HijoSchema).min(1).max(8),
});

// ============================================================
// FASE F (Franja de imagenes) · banda FULL-BLEED con hasta 3 slides (slider si >1), cada slide con
// 1-3 imagenes lado a lado, overlay de texto + link OPCIONAL por imagen. `franja` = 19o miembro de
// SectionSchema (seccion TOP-LEVEL, no hija del contenedor). Aditivo -> SIN bump de schema_version
// (igual que contenedor fue el 18). Bounded, sin recursion: slides 1..3 -> imagenes 1..3 = MAX 9.
// La EF es la AUTORIDAD: el overlay.texto se sanitiza en validate-section (capa write-side).
// ============================================================
// Link de overlay: allowlist https / mailto / tel (NO protocol-relative //, NO javascript:).
const FRANJA_LINK_RE = /^(https:\/\/|mailto:|tel:)/;

const FranjaOverlay = z.object({
  texto: z.string().max(160).optional(),
  posicion: z.enum(['centro', 'arriba-izquierda', 'arriba-derecha', 'abajo-izquierda', 'abajo-centro', 'abajo-derecha']).default('centro'),
  color_texto: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido').default('#ffffff'),
  color_fondo: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido').default('rgba(0,0,0,0.4)'), // scrim
  borde: z.enum(['ninguno', 'fino', 'grueso']).default('ninguno'),
});

const FranjaImagen = z.object({
  url: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),
  alt: z.string().max(160).optional(),
  overlay: FranjaOverlay.optional(),
  link: z.string().regex(FRANJA_LINK_RE, 'link debe ser https, mailto o tel').optional(),
});

const FranjaSlide = z.object({
  imagenes: z.array(FranjaImagen).min(1).max(3),
});

const FranjaProps = z.object({
  slides: z.array(FranjaSlide).min(1).max(3),         // tope 3 slides x 3 imagenes = 9
  gap: z.enum(['none', 'min', 'small']).default('min'), // nivel franja; aplica a todos los slides (incluido 0 = 'none')
  autorotar: z.boolean().default(false),               // slider: auto-rotar (default OFF; respeta reduced-motion en el render)
  intervalo_seg: z.number().int().min(3).max(15).optional(),
});

export const SectionSchema = z.discriminatedUnion('tipo', [
  SectionBase.extend({ tipo: z.literal('banner'), props: BannerProps }),
  SectionBase.extend({ tipo: z.literal('texto'), props: TextoProps }),
  SectionBase.extend({ tipo: z.literal('imagen'), props: ImagenProps }),
  SectionBase.extend({ tipo: z.literal('botones'), props: BotonesProps }),
  SectionBase.extend({ tipo: z.literal('productos'), props: ProductosProps }),
  SectionBase.extend({ tipo: z.literal('galeria'), props: GaleriaProps }),
  SectionBase.extend({ tipo: z.literal('formulario'), props: FormularioProps }),
  SectionBase.extend({ tipo: z.literal('espacio'), props: EspacioProps }),
  SectionBase.extend({ tipo: z.literal('video'), props: VideoProps }),
  SectionBase.extend({ tipo: z.literal('imagen_con_texto'), props: ImagenConTextoProps }),
  SectionBase.extend({ tipo: z.literal('caracteristicas'), props: CaracteristicasProps }),
  SectionBase.extend({ tipo: z.literal('cita'), props: CitaProps }),
  SectionBase.extend({ tipo: z.literal('testimonios'), props: TestimoniosProps }),
  SectionBase.extend({ tipo: z.literal('faq'), props: FaqProps }),
  SectionBase.extend({ tipo: z.literal('logos'), props: LogosProps }),
  SectionBase.extend({ tipo: z.literal('categorias_destacadas'), props: CategoriasDestacadasProps }),
  SectionBase.extend({ tipo: z.literal('producto_destacado'), props: ProductoDestacadoProps }),
  // FASE D: contenedor (bloques hijos anidados, profundidad 2). Aditivo.
  SectionBase.extend({ tipo: z.literal('contenedor'), props: ContenedorProps }),
  // FASE F: franja (banda full-bleed de imagenes con slider). Aditivo; ultimo miembro (19o).
  SectionBase.extend({ tipo: z.literal('franja'), props: FranjaProps }),
]);

export type Section = z.infer<typeof SectionSchema>;
export type SectionTipo = Section['tipo'];

// ============================================================
// Page + Personalizaciones
// ============================================================

export const PageSchema = z.object({
  version: z.literal(2),
  updated_at: z.string().datetime(),
  sections: z.array(SectionSchema).max(20),
});

export type Page = z.infer<typeof PageSchema>;

// Colores: reusa CSS_COLOR_REGEX (definido arriba) -> bloquea inyeccion CSS. partial = override parcial.
const ThemeColorsSchema = z.object({
  primary: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
  accent: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
  text_base: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
  bg_base: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido'),
}).partial();

// IDs del enum INLINE (no import de ./font-pairings): el mirror EF es Deno, que exige extension .ts
// en imports relativos -> un import romperia el bundle. font-pairings.ts (storefront/admin) es la
// fuente de verdad del allowlist; drift-guard en tests/editor/12 verifica que estos 6 == sus IDs.
const THEME_FONT_PAIRINGS = ['industrial', 'moderno', 'geometrico', 'impacto', 'editorial', 'elegante'] as const;

const ThemeSchema = z.object({
  colors: ThemeColorsSchema.optional(),
  font_pairing: z.enum(THEME_FONT_PAIRINGS).optional(),
  // M5.C: tamano de texto del menu (3 presets). El storefront mapea sm->0.875 / md->1 / lg->1.15
  // a la var --nav-text-scale; ausente o 'md' => sin var => tamano actual (byte-identico visual).
  nav_text_size: z.enum(['sm', 'md', 'lg']).optional(),
});

// ============================================================
// Administrador de Paginas (M1) · arbol de navegacion
// ============================================================
// Lista PLANA de nodos; el arbol se deriva por parentId. PROFUNDIDAD MAXIMA 2 niveles
// (padre -> subpagina), enforced en NavSchema. El arbol maneja el menu del storefront (M5);
// se siembra desde categorias (M1) para que el menu no cambie. tipos: home/coleccion/blanco.
const NAV_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/; // DNS-safe (== slug de pagina:<slug>)
const NAV_ID_RE = /^nav_[a-z0-9]{4,}$/;

export const NavNodeSchema = z.object({
  id: z.string().regex(NAV_ID_RE, 'id formato nav_xxxx'),
  tipo: z.enum(['home', 'coleccion', 'blanco']),
  label: z.string().max(80),                                   // renombrable siempre
  parentId: z.string().regex(NAV_ID_RE).nullable().default(null),
  orden: z.number().int().min(0),
  mostrar_en_menu: z.boolean().default(true),
  categoria_id: z.string().uuid().optional(),                 // coleccion -> referencia a Categorias
  slug: z.string().regex(NAV_SLUG_RE).optional(),             // coleccion: slug categoria; blanco: slug propio
}).superRefine((n, ctx) => {
  if (n.tipo === 'coleccion') {
    if (!n.categoria_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'coleccion requiere categoria_id', path: ['categoria_id'] });
    if (!n.slug) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'coleccion requiere slug', path: ['slug'] });
  } else if (n.tipo === 'blanco') {
    if (!n.slug) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pagina en blanco requiere slug', path: ['slug'] });
  }
});

export type NavNode = z.infer<typeof NavNodeSchema>;

// Lista de nodos. 2 NIVELES MAX (el padre de un nodo NO puede tener padre) + parentId valido.
export const NavSchema = z.array(NavNodeSchema).max(200).superRefine((nodes, ctx) => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  nodes.forEach((n, i) => {
    if (n.parentId) {
      const p = byId.get(n.parentId);
      if (!p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'parentId inexistente', path: [i, 'parentId'] });
      else if (p.parentId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'profundidad maxima 2 niveles', path: [i, 'parentId'] });
    }
  });
});

export const PersonalizacionesSchema = z.object({
  schema_version: z.literal(3),
  theme: ThemeSchema.optional(),
  theme_draft: ThemeSchema.optional(),
  nav: NavSchema.optional(),
  nav_draft: NavSchema.optional(),
  pages: z.record(z.string(), PageSchema),
});

export type Personalizaciones = z.infer<typeof PersonalizacionesSchema>;

// ============================================================
// Helper: parse safe (devuelve null si invalido para fallback graceful)
// ============================================================

export function parsePersonalizaciones(raw: unknown): Personalizaciones | null {
  const result = PersonalizacionesSchema.safeParse(raw);
  return result.success ? result.data : null;
}
