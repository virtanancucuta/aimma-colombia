// AIMMA Fase C — stash-fragment (POST): guarda la seccion del state local del admin en KV bajo un
// nonce cripto-random, para que la pagina GET render-fragment la renderice (Container API muere en
// workerd -> solo el page-render anda). token-gated (autoridad unica = validate_preview_token),
// scoped a la tienda del token, TTL 60s. supabase ANON+RLS (mismo scope que la pagina publica).
import type { APIRoute } from 'astro';
import { getSupabase } from '~/lib/supabase';

export const prerender = false;

// CORS: el admin (aimma.com.co) fetchea este endpoint cross-origin (esta en *.tienda.aimma.com.co).
// Sin esto el browser bloquea el fetch (preflight del POST con Content-Type:application/json).
const CORS = {
  'Access-Control-Allow-Origin': 'https://aimma.com.co',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const NO_STORE = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...CORS };
const fail = (status: number, msg: string) => new Response(msg, { status, headers: NO_STORE });

// Preflight CORS (el POST con application/json lo dispara).
export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });

export const POST: APIRoute = async ({ request, url, locals }) => {
  // 1) token PRIMERO (fail-fast). anon supabase = scope publico, NUNCA service_role.
  const token = url.searchParams.get('preview');
  if (!token) return fail(403, 'forbidden');
  const supabase = getSupabase();
  const { data: tiendaId, error } = await supabase.rpc('validate_preview_token', { p_token: token });
  if (error || !tiendaId) return fail(403, 'forbidden');

  // 2) body solo {section}. No hay body.tienda_id (A1: la tienda sale del token en el render).
  const body: any = await request.json().catch(() => null);
  if (!body || typeof body.section !== 'object' || body.section === null) return fail(400, 'bad request');

  const kv: any = (locals as any).runtime?.env?.TENANT_CACHE;
  if (!kv) return fail(503, 'unavailable');

  // 3) nonce cripto-random (no adivinable) -> otra sesion no puede leer tu fragmento. TTL 60s.
  const nonce = crypto.randomUUID();
  await kv.put('frag:' + nonce, JSON.stringify({ tienda_id: tiendaId, section: body.section }), { expirationTtl: 60 });
  return new Response(JSON.stringify({ nonce }), {
    status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });
};
