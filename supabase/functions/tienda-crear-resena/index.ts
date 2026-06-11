// supabase/functions/tienda-crear-resena/index.ts
// AIMMA Tienda IA · Fase F4 · Reseñas de clientes (escritura PUBLICA anonima).
// verify_jwt=false (el comprador final no esta logueado en Supabase).
// Es el UNICO camino de escritura de reseñas: RLS no permite INSERT anon ni dueño,
// solo service-role (esta EF) escribe -> el anti-spam no se puede esquivar.
// Seguridad (mirror tienda-form-submit + tienda-crear-pedido):
//   * CORS: solo subdominios *.tienda.aimma.com.co.
//   * rate-limit 5/h por IP+tienda (ANTES del honeypot, asi honeypot relleno tambien cuenta).
//   * honeypot -> silent 200 (el bot cree que funciono).
//   * tienda resuelta server-side por slug + estado='publicada'.
//   * producto verificado ∈ tienda.
//   * estado FORZADO 'pendiente' (el cliente no puede auto-aprobar; ni siquiera esta en el schema).
//   * comentario crudo (se escapa al render en el storefront).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_PAYLOAD_BYTES = 20_000;
const RATE_LIMIT_PER_HOUR = 5; // reseñas son mas spameables que pedidos (sin friccion de stock)

const ALLOWED_ORIGIN_RE = /^https:\/\/[a-z0-9-]{1,50}\.tienda\.aimma\.com\.co$/;

const BodySchema = z.object({
  tienda_slug: z.string().regex(/^[a-z0-9-]{3,50}$/),
  producto_id: z.string().uuid(),
  calificacion: z.number().int().min(1).max(5),
  nombre_cliente: z.string().trim().min(2).max(80),
  comentario: z.string().trim().max(1000).optional(),
  honeypot: z.string().max(500),
  // NOTA: 'estado' NO existe en el schema -> el cliente no puede sugerirlo siquiera.
});

function corsHeadersFor(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGIN_RE.test(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeadersFor(origin) },
  });
}

serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  // 1) Origin allowlist
  if (!origin || !ALLOWED_ORIGIN_RE.test(origin)) {
    return json({ error: 'origin_not_allowed' }, 403, origin);
  }

  // 2) Body size
  const raw = await req.text();
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return json({ error: 'payload_too_large' }, 413, origin);
  }

  // 3) Zod
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(JSON.parse(raw));
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.errors : String(e);
    return json({ error: 'invalid_body', detail }, 400, origin);
  }

  const supabaseSvc = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 4) Rate limit (ANTES del honeypot, para que bots con honeypot relleno tambien cuenten)
  const ip = req.headers.get('CF-Connecting-IP')
          || req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
          || 'unknown';
  const rateKey = 'crear_resena:' + body.tienda_slug + ':' + ip;
  const { data: rateCount, error: rateErr } = await supabaseSvc.rpc(
    'check_rate_limit_form_submit',
    { p_key: rateKey, p_max: RATE_LIMIT_PER_HOUR, p_window_minutes: 60 }
  );
  if (rateErr) {
    console.error('rate_limit_error', rateErr); // no bloqueamos por error del rate limit
  } else if (rateCount && rateCount > RATE_LIMIT_PER_HOUR) {
    return json({ error: 'rate_limited', retry_after: 3600 }, 429, origin);
  }

  // 5) Honeypot -> silent success (el bot cree que envio)
  if (body.honeypot.trim() !== '') {
    return json({ success: true, message: 'Recibido' }, 200, origin);
  }

  // 6) Tienda publicada (server-side, nunca confiar en otro identificador del cliente)
  const { data: tienda, error: tErr } = await supabaseSvc
    .from('tiendas')
    .select('id, slug, estado')
    .eq('slug', body.tienda_slug)
    .eq('estado', 'publicada')
    .maybeSingle();
  if (tErr || !tienda) {
    return json({ error: 'tienda_no_publicada' }, 404, origin);
  }

  // 7) Producto ∈ tienda (anti cross-tenant)
  const { data: producto, error: pErr } = await supabaseSvc
    .from('productos')
    .select('id')
    .eq('id', body.producto_id)
    .eq('tienda_id', tienda.id)
    .maybeSingle();
  if (pErr || !producto) {
    return json({ error: 'producto_invalido' }, 400, origin);
  }

  // 8) Insert FORZANDO estado='pendiente' (+ tienda_id resuelto server-side)
  const comentario = (body.comentario || '').trim() || null;
  const { error: iErr } = await supabaseSvc.from('resenas').insert({
    tienda_id: tienda.id,
    producto_id: producto.id,
    calificacion: body.calificacion,
    nombre_cliente: body.nombre_cliente,
    comentario,
    estado: 'pendiente',
  });
  if (iErr) {
    console.error('resena_insert_failed', iErr);
    return json({ error: 'insert_failed' }, 500, origin);
  }

  return json({
    success: true,
    message: 'Gracias! Tu reseña fue enviada y se publicara cuando la revisemos.',
  }, 200, origin);
});
