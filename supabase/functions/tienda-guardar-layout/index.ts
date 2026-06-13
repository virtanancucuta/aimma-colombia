// supabase/functions/tienda-guardar-layout/index.ts
// AIMMA Tienda IA · Editor PRO-MAX · SCHEMA v3
// verify_jwt=true: el gateway valida el JWT (defensa en profundidad) y la funcion
// ADEMAS revalida via getUser(jwt) + ownership. (Fase A.1 revierte el downgrade
// temporal a false de Fase 0, cuyo diagnostico de "el gateway rechaza ES256"
// estaba confundido: el fix real fue getUser(jwt), no bajar verify_jwt.)
//
// Fase A.1 (dedupe Zod): el schema YA NO se inlinea. Se importa de ./editor-schema.ts,
// que es un mirror byte-identico de packages/database/src/editor-schema.ts (verificado
// por tests/editor/04-ef-schema-sync.test.mjs). zod se resuelve via deno.json import_map
// (esm.sh/zod@3.25.76 = misma version que el npm del paquete) -> validan identico.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { z } from 'zod';
import { PersonalizacionesSchema } from './editor-schema.ts';
import { validateAndSanitizeSection } from './validate-section.ts';
import { buildNextPersonalizaciones } from './build-next-personalizaciones.ts';

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

// page_id = clave logica de pagina en personalizaciones.pages. Allowlist por PATRON
// (no enum cerrado): 'home', 'coleccion', y 'pagina:<slug>' (paginas personalizadas, L5).
// Asi multi-pagina entra sin re-tocar el write path. El slug es DNS-safe.
const PAGE_ID_RE = /^(home|coleccion|pagina:[a-z0-9][a-z0-9-]{0,38}[a-z0-9])$/;

const BodySchema = z.object({
  tienda_id: z.string().uuid(),
  page_id: z.string().regex(PAGE_ID_RE),
  mode: z.enum(['draft', 'publish']),
  personalizaciones: PersonalizacionesSchema,
  base_updated_at: z.string().datetime().nullable(),
  // M4 (Administrador de Paginas): claves de pagina a borrar. El merge SOLO borra pagina:<slug>
  // (guardrail en buildNextPersonalizaciones); aca solo validamos forma + tope.
  deletePages: z.array(z.string().max(60)).max(200).optional(),
}).superRefine((b, ctx) => {
  // La pagina que se guarda DEBE venir en el payload (cross-field: depende de page_id).
  if (b.personalizaciones.pages[b.page_id] === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'personalizaciones.pages[' + b.page_id + '] es requerido',
      path: ['personalizaciones', 'pages', b.page_id],
    });
  }
});

const MAX_PAYLOAD_BYTES = 2_000_000;

// Sanitize-and-store AUTORITATIVO: parse Zod + limpia el HTML de cada seccion 'texto' antes de persistir.
// La BD nunca guarda HTML sucio, aunque alguien postee directo a la EF. Fuente unica: validate-section.ts
// (mirror byte-identico del canonico packages/database/src/validate-section.ts, test 15 prueba byte-inalterado).
function sanitizePage(page: any): void {
  if (!page || !Array.isArray(page.sections)) return;
  // Fuente unica: parse(Zod)+sanitize por seccion (test 15 prueba byte-inalterado del save).
  page.sections = page.sections.map(validateAndSanitizeSection);
}

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

  // 1) Auth JWT (gateway verify_jwt=true + la funcion revalida via getUser(jwt))
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const jwt = authHeader.replace('Bearer ', '');
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser(jwt);
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

  // 3.5) Sanitizar HTML de secciones texto (autoritativo, antes de construir el JSON a guardar)
  sanitizePage(body.personalizaciones.pages[body.page_id]);

  // 4) Ownership check
  const supabaseSvc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: tienda, error: tErr } = await supabaseSvc
    .from('tiendas')
    .select('id, user_id, slug, personalizaciones')
    .eq('id', body.tienda_id)
    .single();
  if (tErr || !tienda) {
    return json({ error: 'tienda_not_found' }, 404);
  }
  if (tienda.user_id !== user.id) {
    return json({ error: 'not_owner' }, 403);
  }

  // 5) Locking optimista por pagina (compara contra la pagina PUBLICADA correspondiente)
  const currentPage = (tienda.personalizaciones as any)?.pages?.[body.page_id];
  if (currentPage && body.base_updated_at &&
      currentPage.updated_at > body.base_updated_at) {
    return json({
      error: 'stale_layout',
      server_updated_at: currentPage.updated_at,
      server_personalizaciones: tienda.personalizaciones,
    }, 409);
  }

  // 6) Construir nuevo JSON según mode. La logica de merge/preservacion (estructura que garantiza
  //    que escribir una pagina NO pisa las otras keys) vive en build-next-personalizaciones.ts:
  //    mirror byte-identico del canonico packages/database/src (sync-test 04), ejercido como
  //    CODIGO REAL por el test de preservacion tests/editor/20.
  const now = new Date().toISOString();
  const draftKey = body.page_id + '_draft';
  const next: any = buildNextPersonalizaciones(
    tienda.personalizaciones,
    body.page_id,
    body.mode,
    body.personalizaciones.pages[body.page_id],
    body.personalizaciones.theme,
    body.personalizaciones.nav,
    now,
    body.deletePages,
  );

  // 7) Upsert
  const { error: uErr } = await supabaseSvc
    .from('tiendas')
    .update({ personalizaciones: next, updated_at: now })
    .eq('id', body.tienda_id);
  if (uErr) {
    console.error('upsert_failed', uErr);
    return json({ error: 'upsert_failed' }, 500);
  }

  // 8) Si publish, invalidate KV best-effort (slug = subdominio del storefront)
  if (body.mode === 'publish' && tienda.slug) {
    invalidateKV(tienda.slug).catch((e) =>
      console.error('kv_invalidate_async_failed', String(e))
    );
  }

  // 'home' = nombre legacy del campo; carrea la PAGINA guardada (sea cual sea page_id).
  // editor.js lo lee como r.home en syncTiendaCache. Se agrega 'page' como alias claro.
  const savedPage = body.mode === 'publish' ? next.pages[body.page_id] : next.pages[draftKey];
  return json({
    success: true,
    mode: body.mode,
    page_id: body.page_id,
    updated_at: now,
    home: savedPage,
    page: savedPage,
    theme: next.theme,
    theme_draft: next.theme_draft,
  });
});
