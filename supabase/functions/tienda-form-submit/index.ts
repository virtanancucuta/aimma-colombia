// supabase/functions/tienda-form-submit/index.ts
// AIMMA Tienda IA · Editor PRO-MAX Plan 3
// Handler publico de submits del block Formulario en storefront.
// verify_jwt=false (cliente final no esta logueado en Supabase).
// CORS: solo subdominios *.tienda.aimma.com.co.
// Anti-spam: honeypot + rate limit 10/h por IP+tienda.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_FIELDS = 8;
const MAX_PAYLOAD_BYTES = 100_000;
const RATE_LIMIT_PER_HOUR = 10;

const ALLOWED_ORIGIN_RE = /^https:\/\/[a-z0-9-]{1,50}\.tienda\.aimma\.com\.co$/;

const BodySchema = z.object({
  tienda_slug: z.string().regex(/^[a-z0-9-]{3,50}$/),
  section_id: z.string().regex(/^sec_[a-z0-9]{4,}$/),
  fields: z.record(z.string(), z.string().max(10000)),
  honeypot: z.string().max(500),
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

  // 1) Validar Origin
  if (!origin || !ALLOWED_ORIGIN_RE.test(origin)) {
    return json({ error: 'origin_not_allowed' }, 403, origin);
  }

  // 2) Body size
  const raw = await req.text();
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return json({ error: 'payload_too_large' }, 413, origin);
  }

  // 3) Zod validate
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(JSON.parse(raw));
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.errors : String(e);
    return json({ error: 'invalid_body', detail }, 400, origin);
  }

  // 4) Honeypot - silent drop si tiene valor
  if (body.honeypot.trim() !== '') {
    // 200 success para que el bot crea que funciono
    return json({ success: true, message: 'Recibido' }, 200, origin);
  }

  // 5) Max fields
  if (Object.keys(body.fields).length > MAX_FIELDS) {
    return json({ error: 'too_many_fields' }, 400, origin);
  }

  // 6) IP rate limit
  const ip = req.headers.get('CF-Connecting-IP')
          || req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
          || 'unknown';
  const rateKey = 'form_submit:' + body.tienda_slug + ':' + ip;

  const supabaseSvc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: rateCount, error: rateErr } = await supabaseSvc.rpc(
    'check_rate_limit_form_submit',
    { p_key: rateKey, p_max: RATE_LIMIT_PER_HOUR, p_window_minutes: 60 }
  );
  if (rateErr) {
    console.error('rate_limit_error', rateErr);
    // No bloqueamos por error de rate limit
  } else if (rateCount && rateCount > RATE_LIMIT_PER_HOUR) {
    return json({ error: 'rate_limited', retry_after: 3600 }, 429, origin);
  }

  // 7) Lookup tienda + verificar section_id es formulario
  const { data: tienda, error: tErr } = await supabaseSvc
    .from('tiendas')
    .select('id, slug, nombre_negocio, personalizaciones, notif_email')
    .eq('slug', body.tienda_slug)
    .single();
  if (tErr || !tienda) {
    return json({ error: 'tienda_not_found' }, 404, origin);
  }

  const home = (tienda.personalizaciones as any)?.pages?.home;
  const sectionDecl = home?.sections?.find((s: any) => s.id === body.section_id);
  if (!sectionDecl || sectionDecl.tipo !== 'formulario') {
    return json({ error: 'invalid_section' }, 400, origin);
  }

  // 8) Mapear field_N -> labels reales segun declaracion
  const formFields = sectionDecl.elementos
    .filter((el: any) => el.tipo === 'form_field')
    .map((el: any, idx: number) => ({
      idx,
      label: el.props.label as string,
      tipo: el.props.tipo_campo as string,
      requerido: !!el.props.requerido,
    }));

  const fieldsLabeled: Record<string, string> = {};
  for (const def of formFields) {
    const value = (body.fields['field_' + def.idx] || '').trim();
    if (def.requerido && !value) {
      return json({ error: 'missing_required_field', field: def.label }, 400, origin);
    }
    if (def.tipo === 'email' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      return json({ error: 'invalid_email', field: def.label }, 400, origin);
    }
    fieldsLabeled[def.label] = value;
  }

  // 9) Sanitizar anti-XSS basico
  const fieldsSafe: Record<string, string> = {};
  for (const [k, v] of Object.entries(fieldsLabeled)) {
    fieldsSafe[k] = v.replace(/[<>]/g, '');
  }

  // 10) Insert submission
  const { data: insertedSubmission, error: iErr } = await supabaseSvc
    .from('form_submissions')
    .insert({
      tienda_id: tienda.id,
      section_id: body.section_id,
      fields: fieldsSafe,
      ip,
      user_agent: req.headers.get('User-Agent')?.slice(0, 500) || null,
    })
    .select('id')
    .single();
  if (iErr) {
    console.error('insert_failed', iErr);
    return json({ error: 'insert_failed' }, 500, origin);
  }

  // 11) Cola notif email (stub Plan 3)
  if (tienda.notif_email) {
    const cuerpo = JSON.stringify(fieldsSafe, null, 2);
    await supabaseSvc.from('form_submission_notifications').insert({
      tienda_id: tienda.id,
      submission_id: insertedSubmission.id,
      destino: tienda.notif_email,
      asunto: 'Nuevo mensaje en ' + tienda.nombre_negocio,
      cuerpo,
    });
  }

  return json({
    success: true,
    message: 'Gracias! Recibimos tu mensaje. Te contactamos pronto.',
  }, 200, origin);
});
