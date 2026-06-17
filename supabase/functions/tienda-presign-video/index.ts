// supabase/functions/tienda-presign-video/index.ts
// FASE D (2b) · Presign de subida de MP4 a Cloudflare R2 (el navegador sube DIRECTO a R2 via PUT firmado).
//
// Sobre de seguridad (defensa en profundidad):
//  1) Auth: verify_jwt=true (gateway) + getUser(jwt) + ownership (tiendas.user_id === user.id) -> SOLO el
//     dueno obtiene un PUT firmado, y SOLO para SU tienda.
//  2) Request Zod ESTRICTO: content_type literal 'video/mp4' + size_bytes 1..15MB. Nada mas pasa.
//  3) La RUTA la genera el SERVIDOR: <tienda_id>/<uuid>.mp4. El cliente NO elige nombre ni carpeta
//     -> no hay path traversal ni pisar objetos de otra tienda (la carpeta es el tienda_id ya verificado).
//  4) El PUT firmado fija content-type=video/mp4 y content-length=<size> como headers FIRMADOS -> R2
//     rechaza por firma si el body no coincide (el cap de 15MB es real a nivel R2, no solo en el front).
//  5) Expiracion corta (120s). CORS solo https://aimma.com.co.
//
// SigV4 query-presigning hecho a mano con Web Crypto (sin deps). Las llaves R2 viven en los secrets del EF.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { z } from 'zod';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!;
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')!;
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')!;
const R2_BUCKET = Deno.env.get('R2_BUCKET') || 'aimma-videos';
const R2_PUBLIC_BASE = 'https://videos.aimma.com.co';
const R2_HOST = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_REGION = 'auto';

const CORS_ORIGIN = 'https://aimma.com.co';
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const EXPIRES = 120;                 // segundos de validez del PUT firmado

const BodySchema = z.object({
  tienda_id: z.string().uuid(),
  content_type: z.literal('video/mp4'),
  size_bytes: z.number().int().positive().max(MAX_BYTES),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

// ── SigV4 (Web Crypto) ────────────────────────────────────────────────────
const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}
async function sha256hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)));
}

// Genera un PUT presignado (auth por query). Firma content-length;content-type;host -> el navegador DEBE
// subir exactamente ese tamano y tipo o R2 rechaza por firma. payload = UNSIGNED-PAYLOAD (estandar presign).
async function presignPut(key: string, sizeBytes: number): Promise<string> {
  const amzdate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const datestamp = amzdate.slice(0, 8);
  const scope = `${datestamp}/${R2_REGION}/s3/aws4_request`;
  const canonicalUri = `/${R2_BUCKET}/${key}`;             // key = <uuid>/<uuid>.mp4 (chars seguros)
  const signedHeaders = 'content-length;content-type;host';
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${R2_ACCESS_KEY_ID}/${scope}`,
    'X-Amz-Date': amzdate,
    'X-Amz-Expires': String(EXPIRES),
    'X-Amz-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.keys(params).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const canonicalHeaders = `content-length:${sizeBytes}\ncontent-type:video/mp4\nhost:${R2_HOST}\n`;
  const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzdate, scope, await sha256hex(canonicalRequest)].join('\n');
  const kDate = await hmac(enc.encode('AWS4' + R2_SECRET_ACCESS_KEY), datestamp);
  const kRegion = await hmac(kDate, R2_REGION);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));
  return `https://${R2_HOST}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1) Auth (gateway verify_jwt=true + revalidacion getUser)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const jwt = authHeader.slice(7);
  const supaUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await supaUser.auth.getUser(jwt);
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  // 2) Body Zod estricto
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json({ error: 'invalid_body', detail: e instanceof z.ZodError ? e.errors : String(e) }, 400);
  }

  // 3) Ownership: el dueno solo firma para SU tienda
  const supaSvc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: tienda, error: tErr } = await supaSvc.from('tiendas').select('id, user_id').eq('id', body.tienda_id).single();
  if (tErr || !tienda) return json({ error: 'tienda_not_found' }, 404);
  if (tienda.user_id !== user.id) return json({ error: 'not_owner' }, 403);

  // 4) Ruta server-side + presign
  const key = `${body.tienda_id}/${crypto.randomUUID()}.mp4`;
  const put_url = await presignPut(key, body.size_bytes);
  return json({ put_url, public_url: `${R2_PUBLIC_BASE}/${key}`, expires_in: EXPIRES });
});
