// supabase/functions/tienda-guardar-layout/index.ts
// AIMMA Tienda IA · Editor PRO-MAX Plan 3
// Recibe pages.home edited desde panel admin y guarda en BD.
// Mode draft: guarda en pages.home_draft (auto-save 30s)
// Mode publish: promueve draft -> home + invalida KV via /internal/invalidate-kv
//
// NOTA DE DEPLOY: editor-schema.ts está inlineado aquí porque el bundler MCP de Supabase
// no resuelve imports relativos fuera del directorio de la función (../_shared/).
// La fuente canónica sigue siendo supabase/functions/_shared/editor-schema.ts —
// si se cambia el schema, actualizar ambos archivos en sincronía.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ============================================================
// editor-schema.ts inlineado (fuente: supabase/functions/_shared/editor-schema.ts)
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

const CSS_COLOR_REGEX = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)<>]+\)|hsla?\([^)<>]+\)|ok(lch|lab)\([^)<>]+\)|[a-zA-Z]{3,30})$/;

const EstiloSchema = z.object({
  color_texto: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido').nullable().optional(),
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

const TextoElementSchema = BaseElementSchema.extend({
  tipo: z.literal('texto'),
  props: z.object({
    contenido: z.string().max(5000),
  }),
});

const ImagenElementSchema = BaseElementSchema.extend({
  tipo: z.literal('imagen'),
  props: z.object({
    src: z.string().url().regex(/^https:\/\//, 'imagen debe ser https'),
    alt: z.string().max(200),
    objeto: z.enum(['cover', 'contain']).default('cover'),
    link_url: z.string().url().optional(),
    aspect_ratio: z.enum(['16/9', '4/3', '1/1', '3/4', '4/5']).optional(),
  }),
});

const BotonElementSchema = BaseElementSchema.extend({
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

const ProductosElementSchema = BaseElementSchema.extend({
  tipo: z.literal('productos'),
  props: z.object({
    categoria_id: z.string().uuid().nullable(),
    limite: z.number().int().min(1).max(12).default(8),
    orden: z.enum(['recientes', 'precio_asc', 'precio_desc', 'manual']).default('recientes'),
    columnas: z.union([z.literal('auto'), z.literal(2), z.literal(3), z.literal(4)]).default('auto'),
    mostrar_precio: z.boolean().default(true),
  }),
});

const GaleriaElementSchema = BaseElementSchema.extend({
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

const FormFieldElementSchema = BaseElementSchema.extend({
  tipo: z.literal('form_field'),
  props: z.object({
    tipo_campo: z.enum(['text', 'email', 'tel', 'textarea', 'select', 'checkbox']),
    label: z.string().max(120),
    placeholder: z.string().max(200).optional(),
    requerido: z.boolean().default(false),
    opciones: z.array(z.string().max(100)).max(20).optional(),
  }),
});

const EMBED_ALLOWED_PROVIDERS = '(youtube\\.com|youtube-nocookie\\.com|vimeo\\.com|player\\.vimeo\\.com|codepen\\.io|codesandbox\\.io|maps\\.google\\.com|google\\.com\\/maps|open\\.spotify\\.com)';
const EMBED_ALLOWED_ATTRS = '(width|height|frameborder|allow|allowfullscreen|loading|title|referrerpolicy)';
const EMBED_WHITELIST_REGEX = new RegExp(
  `^<iframe\\s+src=("|')https:\\/\\/(www\\.)?${EMBED_ALLOWED_PROVIDERS}\\/[^"']+\\1` +
  `(\\s+${EMBED_ALLOWED_ATTRS}(="[^"<>]*")?)*` +
  `\\s*>(\\s*<\\/iframe>)?\\s*$`,
  'i'
);

const EmbedElementSchema = BaseElementSchema.extend({
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

const DivisorElementSchema = BaseElementSchema.extend({
  tipo: z.literal('divisor'),
  props: z.object({
    estilo: z.enum(['linea', 'punto', 'icono']).default('linea'),
    color: z.string().regex(CSS_COLOR_REGEX, 'color CSS invalido').nullable().optional(),
  }),
});

const ElementSchema = z.discriminatedUnion('tipo', [
  TextoElementSchema,
  ImagenElementSchema,
  BotonElementSchema,
  ProductosElementSchema,
  GaleriaElementSchema,
  FormFieldElementSchema,
  EmbedElementSchema,
  DivisorElementSchema,
]);

const CSS_GRADIENT_REGEX = /^(linear|radial|conic)-gradient\([^)<>"'`;{}@\\]{1,400}\)$/i;
const HTTPS_URL_REGEX = /^https:\/\/[^"'<>`\s]{4,490}$/;

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

const SectionSchema = z.object({
  id: z.string().regex(/^sec_[a-z0-9]{4,}$/, 'id formato sec_xxxx'),
  tipo: z.enum(['hero', 'texto', 'imagen', 'botones', 'productos', 'galeria', 'espaciador', 'formulario']),
  altura_filas: z.number().int().min(1).max(50),
  fondo: FondoSchema,
  padding: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
  elementos: z.array(ElementSchema).max(30),
});

const PageSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().datetime(),
  sections: z.array(SectionSchema).max(20),
});

const ThemeSchema = z.object({
  color_primary: z.string().nullable().optional(),
  color_accent: z.string().nullable().optional(),
  font_display_url: z.string().url().nullable().optional(),
  font_body_url: z.string().url().nullable().optional(),
});

const PersonalizacionesSchema = z.object({
  schema_version: z.literal(2),
  theme: ThemeSchema.optional(),
  pages: z.record(z.string(), PageSchema),
});

// ============================================================
// EF tienda-guardar-layout
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INVALIDATE_SECRET = Deno.env.get('INVALIDATE_SECRET') || '';

const CORS_ORIGIN = 'https://aimma.com.co';

const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const BodySchema = z.object({
  tienda_id: z.string().uuid(),
  page_id: z.literal('home'),
  mode: z.enum(['draft', 'publish']),
  personalizaciones: PersonalizacionesSchema,
  base_updated_at: z.string().datetime().nullable(),
});

const MAX_PAYLOAD_BYTES = 2_000_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function invalidateKV(slug: string) {
  if (!INVALIDATE_SECRET) return;
  const url = `https://${slug}.tienda.aimma.com.co/_internal/invalidate-kv`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + INVALIDATE_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: 'tenant:' + slug }),
    });
    if (!r.ok) {
      console.error('kv_invalidate_failed', { slug, status: r.status });
    }
  } catch (err) {
    console.error('kv_invalidate_error', { slug, err: String(err) });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // 1) Auth JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) {
    return json({ error: 'unauthorized' }, 401);
  }

  // 2) Body size guard
  const raw = await req.text();
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }

  // 3) Zod validate
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(JSON.parse(raw));
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.errors : String(e);
    return json({ error: 'invalid_body', detail }, 400);
  }

  // 4) Ownership check
  const supabaseSvc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: tienda, error: tErr } = await supabaseSvc
    .from('tiendas')
    .select('id, user_id, slug, subdominio, personalizaciones')
    .eq('id', body.tienda_id)
    .single();
  if (tErr || !tienda) {
    return json({ error: 'tienda_not_found' }, 404);
  }
  if (tienda.user_id !== user.id) {
    return json({ error: 'not_owner' }, 403);
  }

  // 5) Locking optimista
  const currentHome = (tienda.personalizaciones as any)?.pages?.home;
  if (currentHome && body.base_updated_at &&
      currentHome.updated_at > body.base_updated_at) {
    return json({
      error: 'stale_layout',
      server_updated_at: currentHome.updated_at,
      server_personalizaciones: tienda.personalizaciones,
    }, 409);
  }

  // 6) Construir nuevo JSON según mode
  const now = new Date().toISOString();
  const next: any = structuredClone(tienda.personalizaciones || { schema_version: 2, pages: {} });
  next.schema_version = 2;
  if (body.personalizaciones.theme) {
    next.theme = body.personalizaciones.theme;
  }

  const homeFromClient = body.personalizaciones.pages.home;
  if (body.mode === 'draft') {
    next.pages.home_draft = { ...homeFromClient, updated_at: now };
  } else {
    next.pages.home = { ...homeFromClient, updated_at: now };
    delete next.pages.home_draft;
  }

  // 7) Upsert
  const { error: uErr } = await supabaseSvc
    .from('tiendas')
    .update({ personalizaciones: next, updated_at: now })
    .eq('id', body.tienda_id);
  if (uErr) {
    console.error('upsert_failed', uErr);
    return json({ error: 'upsert_failed' }, 500);
  }

  // 8) Si publish, invalidate KV best-effort
  if (body.mode === 'publish' && tienda.subdominio) {
    invalidateKV(tienda.subdominio).catch((e) =>
      console.error('kv_invalidate_async_failed', String(e))
    );
  }

  return json({
    success: true,
    mode: body.mode,
    updated_at: now,
    home: body.mode === 'publish' ? next.pages.home : next.pages.home_draft,
  });
});
