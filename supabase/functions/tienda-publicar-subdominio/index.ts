// AIMMA Comercial · Tienda IA · Fase 4 #41 · tienda-publicar-subdominio v2
// 2026-05-31
//
// v2 (post-audit pre-push):
//   - CRITICAL: no leakear texto raw de Easypanel al frontend. detail genérico,
//     detalle completo solo en console.error server-side.
//   - HIGH: claim atomic via UPDATE...IS NULL antes de llamar Easypanel +
//     rollback si Easypanel falla. Elimina race entre 2 invocaciones.
//   - HIGH: defense in depth — todos los UPDATE con .eq('user_id', user.id)
//     ademas de id, para mitigar bugs hipoteticos en RLS policies.
//
// Proposito: provisionar automaticamente el subdominio
// <slug>.tienda.aimma.com.co cuando una tienda pasa a estado="publicada".
// Patron Path B — un dominio + cert HTTP-01 por tienda, via API tRPC de
// Easypanel. No usa wildcard porque Traefik HostSNI rechaza wildcards.
//
// Llamado por views/configuracion.js antes del UPDATE estado=publicada.
//
// Idempotente: el claim atomic garantiza que solo 1 invocacion por tienda
// llega a llamar Easypanel. Las concurrentes ven subdominio_publicado_at
// ya marcada y retornan already_published:true.
//
// Auth: JWT del dueño (verify_jwt=true). RLS asegura que solo el owner de la
// tienda pueda leerla. Todos los UPDATE filtran tambien por user_id como
// segunda capa de seguridad.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/;

const EASYPANEL_TIMEOUT_MS = 15_000;

const EP_PROJECT = 'aimma-colombia';
const EP_SERVICE = 'aimma-web';
const EP_PORT = 80;
const EP_PROTOCOL = 'http';
const SUBDOMAIN_BASE = 'tienda.aimma.com.co';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) {
      return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
    }

    const body = await req.json().catch(() => ({}));
    const tiendaId = String(body.tienda_id || '').trim();
    if (!tiendaId || !UUID_REGEX.test(tiendaId)) {
      return Response.json({ error: 'tienda_id_invalido' }, { status: 400, headers: CORS });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const epUrl = Deno.env.get('EASYPANEL_API_URL');
    const epToken = Deno.env.get('EASYPANEL_API_TOKEN');
    if (!epUrl || !epToken) {
      console.error('[tienda-publicar-subdominio] faltan secrets EASYPANEL_*');
      return Response.json({ error: 'config_incompleta' }, { status: 500, headers: CORS });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRole);
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return Response.json({ error: 'invalid_jwt' }, { status: 401, headers: CORS });
    }

    // Read tienda (RLS asegura ownership). Si null: no existe o no es del user.
    const { data: tienda, error: tiendaErr } = await userClient
      .from('tiendas')
      .select('id, slug, easypanel_domain_id, subdominio_publicado_at')
      .eq('id', tiendaId)
      .maybeSingle();

    if (tiendaErr) {
      console.error('[tienda-publicar-subdominio] error leyendo tienda:', tiendaErr);
      return Response.json({ error: 'lectura_tienda_fallo' }, { status: 500, headers: CORS });
    }
    if (!tienda) {
      return Response.json({ error: 'tienda_no_encontrada' }, { status: 404, headers: CORS });
    }

    // Idempotencia rapida: si BD ya tiene timestamp, ni intentamos claim.
    if (tienda.subdominio_publicado_at) {
      return Response.json({
        ok: true,
        already_published: true,
        domain_id: tienda.easypanel_domain_id,
        host: `${tienda.slug}.${SUBDOMAIN_BASE}`,
      }, { headers: CORS });
    }

    if (!tienda.slug || !SLUG_REGEX.test(tienda.slug)) {
      console.error('[tienda-publicar-subdominio] slug invalido en BD:', tienda.slug);
      return Response.json({ error: 'slug_invalido' }, { status: 400, headers: CORS });
    }

    const host = `${tienda.slug}.${SUBDOMAIN_BASE}`;
    const domainId = `tienda-${tienda.id.replace(/-/g, '')}`;
    const claimedAt = new Date().toISOString();

    // CLAIM ATOMIC: marcar subdominio_publicado_at IS NULL → now() WHERE
    // user_id matches. Solo 1 invocacion gana, las demas ven 0 rows y
    // retornan already_published. Sin claim, dos pestañas concurrentes
    // crearian 2 entradas en Easypanel.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('tiendas')
      .update({ subdominio_publicado_at: claimedAt })
      .eq('id', tienda.id)
      .eq('user_id', user.id)
      .is('subdominio_publicado_at', null)
      .select('id')
      .maybeSingle();

    if (claimErr) {
      console.error('[tienda-publicar-subdominio] claim error:', claimErr);
      return Response.json({ error: 'claim_fallo' }, { status: 500, headers: CORS });
    }
    if (!claimed) {
      // Otro proceso gano la carrera. Re-leer para devolver datos actuales.
      const { data: actual } = await userClient
        .from('tiendas')
        .select('easypanel_domain_id, slug')
        .eq('id', tienda.id)
        .maybeSingle();
      return Response.json({
        ok: true,
        already_published: true,
        domain_id: actual?.easypanel_domain_id || null,
        host: `${actual?.slug || tienda.slug}.${SUBDOMAIN_BASE}`,
      }, { headers: CORS });
    }

    // Llamar Easypanel. Si falla, rollback del claim.
    const epPayload = {
      json: {
        id: domainId,
        https: true,
        host,
        path: '/',
        middlewares: [],
        certificateResolver: '',
        wildcard: false,
        destinationType: 'service',
        serviceDestination: {
          projectName: EP_PROJECT,
          serviceName: EP_SERVICE,
          port: EP_PORT,
          protocol: EP_PROTOCOL,
        },
      },
    };

    const rollbackClaim = async (reason: string) => {
      const { error: rbErr } = await supabaseAdmin
        .from('tiendas')
        .update({ subdominio_publicado_at: null })
        .eq('id', tienda.id)
        .eq('user_id', user.id)
        .eq('subdominio_publicado_at', claimedAt);
      if (rbErr) {
        console.error('[tienda-publicar-subdominio] rollback claim fallo:', rbErr, 'reason:', reason);
      }
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), EASYPANEL_TIMEOUT_MS);
    let epRes: Response;
    try {
      epRes = await fetch(`${epUrl}/api/trpc/domains.createDomain`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${epToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(epPayload),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      console.error('[tienda-publicar-subdominio] fetch Easypanel fallo:', e);
      await rollbackClaim('fetch_failed');
      return Response.json({
        error: 'easypanel_unreachable',
        message: 'No pudimos contactar al servidor de dominios. Intenta de nuevo en 1 minuto.',
      }, { status: 502, headers: CORS });
    }
    clearTimeout(timer);

    const epText = await epRes.text();

    const isOk = epRes.ok;
    const isDuplicate = !isOk && /already exists|unique|duplicate/i.test(epText);

    if (!isOk && !isDuplicate) {
      // Detalle completo SOLO en log server-side, no leak al frontend.
      console.error('[tienda-publicar-subdominio] Easypanel error', epRes.status, epText.slice(0, 1000));
      await rollbackClaim(`easypanel_${epRes.status}`);
      return Response.json({
        error: 'easypanel_error',
        message: 'El servidor de dominios rechazo la creacion. Reporta a soporte si persiste.',
      }, { status: 502, headers: CORS });
    }

    // Easypanel OK (o duplicate recuperable). Persistir easypanel_domain_id.
    // subdominio_publicado_at ya quedo seteado por el claim.
    const { error: updErr } = await supabaseAdmin
      .from('tiendas')
      .update({ easypanel_domain_id: domainId })
      .eq('id', tienda.id)
      .eq('user_id', user.id);

    if (updErr) {
      console.error('[tienda-publicar-subdominio] UPDATE domain_id fallo:', updErr);
      // Dominio creado en Easypanel, BD tiene timestamp pero no domain_id.
      // Estado recuperable: el frontend puede re-llamar y la idempotencia
      // ya marcara already_published; el domain_id quedara null pero la
      // tienda esta funcional. No rollback porque el dominio ya existe.
      return Response.json({
        ok: true,
        warning: 'persist_domain_id_failed',
        host,
        already_published: isDuplicate,
      }, { headers: CORS });
    }

    return Response.json({
      ok: true,
      domain_id: domainId,
      host,
      already_published: isDuplicate,
    }, { headers: CORS });

  } catch (e) {
    console.error('[tienda-publicar-subdominio] internal error:', e);
    return Response.json({
      error: 'internal',
      message: 'Error interno. Reporta a soporte si persiste.',
    }, { status: 500, headers: CORS });
  }
});
