// packages/database/src/editor-schema.ts
// AIMMA Editor PRO-MAX · Zod schemas compartidos
// Validado en: EF tienda-guardar-layout + Storefront BlockRenderer + Panel editor admin

import { z } from 'zod';

// ============================================================
// Element schemas (discriminated union)
// ============================================================

const GridPositionSchema = z.object({
  col_start: z.number().int().min(1).max(25),
  col_end: z.number().int().min(2).max(25),
  row_start: z.number().int().min(1).max(50),
  row_end: z.number().int().min(2).max(51),
}).refine(
  (g) => g.col_end > g.col_start,
  { message: 'col_end debe ser mayor que col_start', path: ['col_end'] }
).refine(
  (g) => g.row_end > g.row_start,
  { message: 'row_end debe ser mayor que row_start', path: ['row_end'] }
);

const GridMobileSchema = z.object({
  orden: z.number().int().min(1).max(100).nullable(),
  col_start: z.number().int().min(1).max(25).optional(),
  col_end: z.number().int().min(2).max(25).optional(),
}).optional();

const EstiloSchema = z.object({
  color_texto: z.string().nullable().optional(),
  alineacion: z.enum(['left', 'center', 'right']).default('left'),
  tamaño: z.enum(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']).default('md'),
  peso: z.enum(['normal', 'medium', 'semibold', 'bold']).default('normal'),
});

const BaseElementSchema = z.object({
  id: z.string().regex(/^el_[a-z0-9]{4,}$/, 'id formato el_xxxx'),
  grid: GridPositionSchema,
  grid_mobile: GridMobileSchema,
  estilo: EstiloSchema,
  ai_generated: z.object({
    generated_at: z.string().datetime(),
    model: z.enum(['claude-haiku-4-5', 'claude-sonnet-4-6']),
    prompt: z.string().max(2000),
    tokens_consumidos: z.number().int().min(0),
  }).optional(),
});

export const TextoElementSchema = BaseElementSchema.extend({
  tipo: z.literal('texto'),
  props: z.object({
    contenido: z.string().max(5000),
  }),
});

export const ImagenElementSchema = BaseElementSchema.extend({
  tipo: z.literal('imagen'),
  props: z.object({
    src: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),
    alt: z.string().max(200),
    objeto: z.enum(['cover', 'contain']).default('cover'),
    link_url: z.string().url().optional(),
    aspect_ratio: z.enum(['16/9', '4/3', '1/1', '3/4', '4/5']).optional(),
  }),
});

export const BotonElementSchema = BaseElementSchema.extend({
  tipo: z.literal('boton'),
  props: z.object({
    texto: z.string().max(80),
    url: z.string().regex(
      /^(https:\/\/|mailto:|tel:|#|\/)/,
      'url debe ser https, mailto, tel, # o /'
    ),
    estilo_visual: z.enum(['primary', 'secondary', 'ghost', 'outline']).default('primary'),
    target: z.enum(['_self', '_blank']).default('_self'),
    icono: z.enum(['arrow', 'whatsapp', 'email', 'phone', 'location', 'link']).optional(),
  }),
});

export const ProductosElementSchema = BaseElementSchema.extend({
  tipo: z.literal('productos'),
  props: z.object({
    categoria_id: z.string().uuid().nullable(),
    limite: z.number().int().min(1).max(12).default(8),
    orden: z.enum(['recientes', 'precio_asc', 'precio_desc', 'manual']).default('recientes'),
    columnas: z.union([z.literal('auto'), z.literal(2), z.literal(3), z.literal(4)]).default('auto'),
    mostrar_precio: z.boolean().default(true),
  }),
});

export const GaleriaElementSchema = BaseElementSchema.extend({
  tipo: z.literal('galeria'),
  props: z.object({
    imagenes: z.array(z.object({
      src: z.string().url().regex(/^https:\/\//),
      alt: z.string().max(200),
    })).min(3).max(12),
    layout: z.enum(['grid', 'carrusel', 'mosaico']).default('grid'),
    gap: z.enum(['tight', 'normal', 'loose']).default('normal'),
  }),
});

export const FormFieldElementSchema = BaseElementSchema.extend({
  tipo: z.literal('form_field'),
  props: z.object({
    tipo_campo: z.enum(['text', 'email', 'tel', 'textarea', 'select', 'checkbox']),
    label: z.string().max(120),
    placeholder: z.string().max(200).optional(),
    requerido: z.boolean().default(false),
    opciones: z.array(z.string().max(100)).max(20).optional(),
  }),
});

// Embed solo permite iframes de proveedores whitelisted (defense-in-depth contra XSS).
// El renderer en Plan 2 sigue siendo responsable de sanitizar adicional, pero el schema
// bloquea event handlers (onload/onerror/etc) limitando atributos a una whitelist
// explicita despues de src.
const EMBED_ALLOWED_PROVIDERS = '(youtube\\.com|youtube-nocookie\\.com|vimeo\\.com|player\\.vimeo\\.com|codepen\\.io|codesandbox\\.io|maps\\.google\\.com|google\\.com\\/maps|open\\.spotify\\.com)';
const EMBED_ALLOWED_ATTRS = '(width|height|frameborder|allow|allowfullscreen|loading|title|referrerpolicy)';
// src obligatorio primero; despues 0+ atributos de la whitelist (booleanos o key="val")
const EMBED_WHITELIST_REGEX = new RegExp(
  `^<iframe\\s+src=("|')https:\\/\\/(www\\.)?${EMBED_ALLOWED_PROVIDERS}\\/[^"']+\\1` +
  `(\\s+${EMBED_ALLOWED_ATTRS}(="[^"<>]*")?)*` +
  `\\s*>(\\s*<\\/iframe>)?\\s*$`,
  'i'
);

export const EmbedElementSchema = BaseElementSchema.extend({
  tipo: z.literal('embed'),
  props: z.object({
    html: z.string()
      .max(2000)
      .refine(
        (val) => EMBED_WHITELIST_REGEX.test(val.trim()),
        'embed.html solo permite iframes de YouTube, Vimeo, CodePen, CodeSandbox, Google Maps o Spotify'
      ),
    aspect_ratio: z.enum(['16/9', '4/3', '1/1']).default('16/9'),
  }),
});

export const DivisorElementSchema = BaseElementSchema.extend({
  tipo: z.literal('divisor'),
  props: z.object({
    estilo: z.enum(['linea', 'punto', 'icono']).default('linea'),
    color: z.string().nullable().optional(),
  }),
});

export const ElementSchema = z.discriminatedUnion('tipo', [
  TextoElementSchema,
  ImagenElementSchema,
  BotonElementSchema,
  ProductosElementSchema,
  GaleriaElementSchema,
  FormFieldElementSchema,
  EmbedElementSchema,
  DivisorElementSchema,
]);

export type Element = z.infer<typeof ElementSchema>;

// ============================================================
// Section
// ============================================================

const FondoSchema = z.object({
  tipo: z.enum(['color', 'imagen', 'gradient', 'transparente']).default('transparente'),
  valor: z.string().max(500),
  overlay: z.object({
    color: z.string(),
    opacity: z.number().min(0).max(1),
  }).optional(),
});

export const SectionSchema = z.object({
  id: z.string().regex(/^sec_[a-z0-9]{4,}$/, 'id formato sec_xxxx'),
  tipo: z.enum(['hero', 'texto', 'imagen', 'botones', 'productos', 'galeria', 'espaciador', 'formulario']),
  altura_filas: z.number().int().min(1).max(50),
  fondo: FondoSchema,
  padding: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
  elementos: z.array(ElementSchema).max(30),
});

export type Section = z.infer<typeof SectionSchema>;

// ============================================================
// Page + Personalizaciones
// ============================================================

export const PageSchema = z.object({
  version: z.literal(1),
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
  schema_version: z.literal(2),
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
