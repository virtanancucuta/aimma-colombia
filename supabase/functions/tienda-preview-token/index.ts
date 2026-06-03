// supabase/functions/tienda-preview-token/index.ts
// AIMMA Tienda IA · Editor PRO-MAX Plan 4 · WYSIWYG preview
// El panel admin pide un token efimero para abrir el storefront en modo preview
// (renderiza pages.home_draft). verify_jwt=true + ownership check. El token se
// valida luego en el Worker del storefront contra la tabla preview_tokens.
// Sin secretos HMAC: el token es un uuid opaco con expiry en BD.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_ORIGIN = 'https://aimma.com.co';
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const BodySchema = z.object({ tienda_id: z.string().uuid() });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Auth JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  // Body
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(JSON.parse(await req.text()));
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.errors : String(e);
    return json({ error: 'invalid_body', detail }, 400);
  }

  // Ownership
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: tienda, error: tErr } = await svc
    .from('tiendas')
    .select('id, user_id, slug')
    .eq('id', body.tienda_id)
    .single();
  if (tErr || !tienda) return json({ error: 'tienda_not_found' }, 404);
  if (tienda.user_id !== user.id) return json({ error: 'not_owner' }, 403);

  // Limpieza best-effort + emitir token
  svc.rpc('cleanup_preview_tokens').then(() => {}).catch(() => {});
  const { data: tok, error: insErr } = await svc
    .from('preview_tokens')
    .insert({ tienda_id: tienda.id })
    .select('token, expires_at')
    .single();
  if (insErr || !tok) {
    console.error('preview_token_insert_failed', insErr);
    return json({ error: 'token_failed' }, 500);
  }

  // El subdominio del storefront es el slug de la tienda (<slug>.tienda.aimma.com.co).
  const slug = tienda.slug;
  return json({
    token: tok.token,
    expires_at: tok.expires_at,
    preview_url: `https://${slug}.tienda.aimma.com.co/?preview=${tok.token}`,
  });
});
