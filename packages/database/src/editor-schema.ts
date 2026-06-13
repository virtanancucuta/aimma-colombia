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

const VideoProps = z.object({
  html: z.string().max(2000).refine(
    (val) => EMBED_WHITELIST_REGEX.test(val.trim()),
    'video.html solo permite iframes de YouTube, Vimeo, CodePen, CodeSandbox, Google Maps o Spotify'
  ),
  aspect_ratio: z.enum(['16/9', '4/3', '1/1']).default('16/9'),
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
