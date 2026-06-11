// AIMMA Tienda IA · EF tienda-notif-pedido · v1 · 2026-06-09
//
// Envia emails transaccionales al cliente, disparado por Database Webhooks (pg_net) sobre `pedidos`:
//   (A) INSERT  -> confirmacion de pedido.
//   (B) UPDATE  -> rastreo, SOLO en la transicion real a 'cerrado' con numero_guia
//                  (record.estado==='cerrado' && numero_guia && old_record.estado!=='cerrado').
//
// NO toca el flujo de pedido/reserva: solo observa la tabla y envia. Si el email falla, el pedido
// queda intacto (se registra 'fallido' en pedido_notificaciones para reintento manual).
//
// Seguridad: verify_jwt=false (webhook server-to-server) + valida header x-webhook-secret contra
// public.notif_webhook_config.secret (solo service_role lo lee). Idempotente por UNIQUE(pedido_id,tipo).
// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderConfirmacion, renderRastreo, type TiendaBrand, type PedidoData, type ItemData } from './templates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = 'no-reply@send.aimma.com.co';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function buildFrom(nombreNegocio: string): string {
  const name = (nombreNegocio || 'Tienda').replace(/["<>\r\n]/g, '').trim() || 'Tienda';
  return `${name} <${FROM_EMAIL}>`;
}

async function sendResend(opts: { from: string; to: string; replyTo?: string | null; subject: string; html: string; text: string }) {
  const payload: Record<string, unknown> = {
    from: opts.from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  };
  if (opts.replyTo) payload.reply_to = opts.replyTo;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, id: (data as any)?.id ?? null, error: resp.ok ? null : JSON.stringify(data).slice(0, 500) };
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // 1) Validar secret del webhook
  const provided = req.headers.get('x-webhook-secret') || '';
  const { data: cfg } = await svc.from('notif_webhook_config').select('secret').eq('id', 1).maybeSingle();
  const expected = cfg?.secret || '';
  if (!expected || provided !== expected) return json({ error: 'unauthorized' }, 401);

  // 2) Parse payload del webhook
  let body: any;
  try { body = await req.json(); } catch (_) { return json({ error: 'bad_json' }, 400); }
  const type = body?.type;
  const record = body?.record;
  const oldRecord = body?.old_record;
  if (!record?.id || !record?.tienda_id) return json({ skipped: true, reason: 'no_record' });

  // 3) Determinar evento + tipo
  let tipo: 'confirmacion' | 'rastreo' | null = null;
  if (type === 'INSERT') {
    tipo = 'confirmacion';
  } else if (type === 'UPDATE') {
    const transicionCierre = record.estado === 'cerrado' && !!record.numero_guia && (oldRecord?.estado !== 'cerrado');
    if (transicionCierre) tipo = 'rastreo';
  }
  if (!tipo) return json({ skipped: true, reason: 'no_trigger' });

  // 4) Sin email del comprador -> no hay a quien enviar (degradacion graciosa)
  const email = (record.comprador_email || '').trim();
  if (!email) return json({ skipped: true, reason: 'no_email', tipo });

  // 5) Idempotencia: insert 'pendiente'. Si ya existe (pedido,tipo) -> deduped.
  const { error: insErr } = await svc.from('pedido_notificaciones')
    .insert({ pedido_id: record.id, tienda_id: record.tienda_id, tipo, estado: 'pendiente' });
  if (insErr) {
    if ((insErr as any).code === '23505') return json({ deduped: true, tipo });
    console.error('notif_insert_failed', insErr);
    return json({ error: 'notif_insert_failed' }, 200); // no romper el webhook
  }

  // 6) Cargar tienda (branding) tenant-scoped + items
  const { data: tienda } = await svc.from('tiendas')
    .select('nombre_negocio, logo_url, email_contacto, whatsapp_dueno, slug')
    .eq('id', record.tienda_id).maybeSingle();
  if (!tienda) {
    await svc.from('pedido_notificaciones').update({ estado: 'fallido', error: 'tienda_not_found' })
      .eq('pedido_id', record.id).eq('tipo', tipo);
    return json({ error: 'tienda_not_found' }, 200);
  }

  const pedido: PedidoData = {
    codigo_publico: record.codigo_publico,
    comprador_nombre: record.comprador_nombre,
    comprador_direccion: record.comprador_direccion ?? null,
    comprador_ciudad: record.comprador_ciudad ?? null,
    metodo_envio: record.metodo_envio ?? null,
    subtotal_productos: record.subtotal_productos ?? null,
    costo_envio: record.costo_envio ?? null,
    total: record.total ?? null,
    numero_guia: record.numero_guia ?? null,
    transportadora: record.transportadora ?? null,
  };

  let rendered;
  if (tipo === 'confirmacion') {
    const { data: items } = await svc.from('pedido_items')
      .select('nombre, referencia, color, talla, cantidad, precio_unitario, subtotal')
      .eq('pedido_id', record.id);
    rendered = renderConfirmacion(tienda as TiendaBrand, pedido, (items ?? []) as ItemData[]);
  } else {
    rendered = renderRastreo(tienda as TiendaBrand, pedido);
  }

  // 7) Enviar via Resend
  if (!RESEND_API_KEY) {
    await svc.from('pedido_notificaciones').update({ estado: 'fallido', error: 'no_resend_key' })
      .eq('pedido_id', record.id).eq('tipo', tipo);
    return json({ error: 'no_resend_key' }, 200);
  }
  const sent = await sendResend({
    from: buildFrom((tienda as TiendaBrand).nombre_negocio),
    to: email,
    replyTo: (tienda as TiendaBrand).email_contacto,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  // 8) Registrar resultado
  if (sent.ok) {
    await svc.from('pedido_notificaciones')
      .update({ estado: 'enviado', enviado_at: new Date().toISOString(), proveedor_id: sent.id })
      .eq('pedido_id', record.id).eq('tipo', tipo);
    if (tipo === 'confirmacion') {
      await svc.from('pedidos').update({ notif_email_enviado_at: new Date().toISOString() }).eq('id', record.id);
    }
    return json({ sent: true, tipo, id: sent.id });
  } else {
    await svc.from('pedido_notificaciones')
      .update({ estado: 'fallido', error: sent.error })
      .eq('pedido_id', record.id).eq('tipo', tipo);
    console.error('resend_failed', sent.status, sent.error);
    return json({ sent: false, tipo, status: sent.status }, 200);
  }
});
