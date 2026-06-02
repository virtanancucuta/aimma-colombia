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
const CSS_COLOR_REGEX = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)<>]+\)|hsla?\([^)<>]+\)|ok(lch|lab)\([^)<>]+\)|[a-zA-Z]{3,30})$/;
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

const ThemeSchema = z.object({
  color_primary: z.string().nullable().optional(),
  color_accent: z.string().nullable().optional(),
  font_display_url: z.string().url().nullable().optional(),
  font_body_url: z.string().url().nullable().optional(),
});

export const PersonalizacionesSchema = z.object({
  schema_version: z.literal(3),
  theme: ThemeSchema.optional(),
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
