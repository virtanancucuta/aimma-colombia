// AIMMA Storefront · /internal/invalidate-kv · v2 · 2026-06-01
// FIX 2026-06-01: renombrado de _internal/ a internal/ porque Astro EXCLUYE
// carpetas con prefijo `_` del build (endpoint nunca llegaba al bundle deploy).
//
// Endpoint POST que invalida cache KV para un slug de tienda.
// Llamado desde:
// 1. Database webhook Supabase (al UPDATE/INSERT/DELETE en tiendas/productos/etc)
// 2. EF tienda-publicar-subdominio al publicar
// 3. EF tienda-guardar-layout al guardar Editor PRO-MAX
//
// Auth: Bearer token con INVALIDATE_SECRET (CF Worker secret).
// Middleware excluye /internal/ — este endpoint corre sin tenant lookup.
//
// Payload soportado:
//   { "slug": "aimma-test" }                         simple
//   { "type": "UPDATE", "record": {"slug": "..."} }  formato webhook Supabase
//   { "slugs": ["a", "b"] }                          batch (max 50)

import type { APIRoute } from 'astro';

export const prerender = false;

type Payload =
  | { slug: string }
  | { slugs: string[] }
  | { type: string; record: { slug?: string; tienda_id?: string }; old_record?: { slug?: string } };

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env;
  if (!env?.INVALIDATE_SECRET) {
    return json({ error: 'misconfigured: INVALIDATE_SECRET no set' }, 500);
  }
  if (!env.TENANT_CACHE) {
    return json({ error: 'misconfigured: TENANT_CACHE binding no set' }, 500);
  }

  // Auth bearer
  const auth = request.headers.get('authorization') || '';
  const expected = `Bearer ${env.INVALIDATE_SECRET}`;
  if (auth !== expected) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: Payload;
  try {
    body = await request.json() as Payload;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const slugs = extractSlugs(body);
  if (slugs.length === 0) {
    return json({ error: 'no slug found in payload', payload: body }, 400);
  }
  if (slugs.length > 50) {
    return json({ error: 'too many slugs (max 50)' }, 400);
  }

  // Invalida cada slug en paralelo
  const results = await Promise.allSettled(
    slugs.map(slug => env.TENANT_CACHE!.delete(`tienda:${slug}`))
  );

  const deleted = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.length - deleted;

  return json({
    success: true,
    invalidated: slugs,
    deleted_count: deleted,
    failed_count: failed,
  });
};

function extractSlugs(body: Payload): string[] {
  // Formato batch
  if ('slugs' in body && Array.isArray(body.slugs)) {
    return body.slugs.filter(isValidSlug);
  }
  // Formato simple
  if ('slug' in body && typeof body.slug === 'string') {
    return isValidSlug(body.slug) ? [body.slug] : [];
  }
  // Formato webhook Supabase (tabla tiendas)
  if ('record' in body && body.record?.slug && isValidSlug(body.record.slug)) {
    const out = [body.record.slug];
    // Si renombro slug, invalidar el viejo tambien
    if (body.old_record?.slug && body.old_record.slug !== body.record.slug && isValidSlug(body.old_record.slug)) {
      out.push(body.old_record.slug);
    }
    return out;
  }
  return [];
}

function isValidSlug(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/.test(s);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET responde 404 — no revelamos existencia del endpoint a scanners.
// El healthcheck deberia hacerlo con POST y bearer valido.
export const GET: APIRoute = async () => {
  return new Response('Not Found', { status: 404 });
};
