// AIMMA · tienda-notif-pedido · plantillas de email (confirmacion + rastreo).
// HTML email-safe: layout en tablas + estilos inline (compatibilidad con clientes de correo).
// Branded por tienda (logo o wordmark + nombre). Texto plano de fallback.
// deno-lint-ignore-file no-explicit-any

export interface TiendaBrand {
  nombre_negocio: string;
  logo_url: string | null;
  email_contacto: string | null;
  whatsapp_dueno: string | null;
  slug: string | null;
}
export interface PedidoData {
  codigo_publico: string;
  comprador_nombre: string;
  comprador_direccion: string | null;
  comprador_ciudad: string | null;
  metodo_envio: string | null;
  subtotal_productos: number | null;
  costo_envio: number | null;
  total: number | null;
  numero_guia: string | null;
  transportadora: string | null;
}
export interface ItemData {
  nombre: string;
  referencia: string | null;
  color: string | null;
  talla: string | null;
  cantidad: number;
  precio_unitario: number | null;
  subtotal: number | null;
}
export interface Rendered { subject: string; html: string; text: string }

const ACCENT = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function fmtCOP(n: number | null | undefined): string {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  } catch (_) {
    return '$ ' + Math.round(v).toLocaleString('es-CO');
  }
}
function tiendaUrl(t: TiendaBrand): string | null {
  return t.slug ? `https://${t.slug}.tienda.aimma.com.co` : null;
}
function wppDigits(raw: string | null): string {
  return (raw || '').replace(/\D/g, '');
}

// Header branded: logo si hay, si no wordmark con el nombre.
function header(t: TiendaBrand): string {
  const nombre = escapeHtml(t.nombre_negocio);
  const inner = t.logo_url
    ? `<img src="${escapeHtml(t.logo_url)}" alt="${nombre}" height="40" style="height:40px;max-height:40px;width:auto;display:block;border:0;" />`
    : `<span style="font-size:20px;font-weight:700;color:${ACCENT};font-family:Arial,Helvetica,sans-serif;">${nombre}</span>`;
  return `<tr><td style="padding:24px 28px;border-bottom:1px solid ${BORDER};">${inner}</td></tr>`;
}
function footer(t: TiendaBrand): string {
  const partes: string[] = [];
  if (t.email_contacto) partes.push(`Escribinos a <a href="mailto:${escapeHtml(t.email_contacto)}" style="color:${ACCENT};">${escapeHtml(t.email_contacto)}</a>`);
  const d = wppDigits(t.whatsapp_dueno);
  if (d) partes.push(`o por WhatsApp al <a href="https://wa.me/${d}" style="color:${ACCENT};">+${escapeHtml(d)}</a>`);
  const contacto = partes.length ? `<p style="margin:0 0 6px;">¿Dudas? ${partes.join(' ')}.</p>` : '';
  return `<tr><td style="padding:20px 28px;border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
    ${contacto}
    <p style="margin:0;">${escapeHtml(t.nombre_negocio)} · enviado con AIMMA</p>
  </td></tr>`;
}
function wrap(t: TiendaBrand, bodyRows: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        ${header(t)}
        ${bodyRows}
        ${footer(t)}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function itemsTable(items: ItemData[]): string {
  const rows = items.map((it) => {
    const variante = [it.color, it.talla].filter(Boolean).map(escapeHtml).join(' / ');
    const sub = variante ? `<br><span style="color:${MUTED};font-size:12px;">${variante}</span>` : '';
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:14px;">${escapeHtml(it.nombre)}${sub}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:14px;text-align:center;color:${MUTED};">x${Number(it.cantidad || 0)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:14px;text-align:right;white-space:nowrap;">${fmtCOP(it.subtotal)}</td>
    </tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0;">${rows}</table>`;
}

function totalesTable(p: PedidoData): string {
  const row = (label: string, val: string, strong = false) =>
    `<tr><td style="padding:4px 0;font-size:14px;color:${strong ? ACCENT : MUTED};${strong ? 'font-weight:700;' : ''}">${label}</td>
     <td style="padding:4px 0;font-size:14px;text-align:right;${strong ? 'font-weight:700;color:' + ACCENT + ';' : ''}">${val}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0;">
    ${row('Subtotal', fmtCOP(p.subtotal_productos))}
    ${p.costo_envio && Number(p.costo_envio) > 0 ? row('Envío', fmtCOP(p.costo_envio)) : ''}
    ${row('Total', fmtCOP(p.total), true)}
  </table>`;
}

export function renderConfirmacion(t: TiendaBrand, p: PedidoData, items: ItemData[]): Rendered {
  const url = tiendaUrl(t);
  const envio = [p.comprador_direccion, p.comprador_ciudad].filter(Boolean).map(escapeHtml).join(', ');
  const body = `
    <tr><td style="padding:28px 28px 8px;">
      <h1 style="margin:0 0 6px;font-size:20px;color:${ACCENT};">¡Gracias por tu pedido, ${escapeHtml(p.comprador_nombre)}!</h1>
      <p style="margin:0;color:${MUTED};font-size:14px;line-height:1.6;">Recibimos tu pedido <strong style="color:${ACCENT};">${escapeHtml(p.codigo_publico)}</strong>. Te avisamos por este medio cuando lo despachemos.</p>
    </td></tr>
    <tr><td style="padding:8px 28px 0;">${itemsTable(items)}${totalesTable(p)}</td></tr>
    ${envio ? `<tr><td style="padding:16px 28px 0;font-size:13px;color:${MUTED};line-height:1.6;"><strong style="color:${ACCENT};">Envío a:</strong> ${envio}</td></tr>` : ''}
    ${url ? `<tr><td style="padding:20px 28px 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:7px;">Seguir comprando</a></td></tr>` : `<tr><td style="height:8px;"></td></tr>`}`;
  const text = [
    `Gracias por tu pedido, ${p.comprador_nombre}!`,
    `Pedido ${p.codigo_publico} en ${t.nombre_negocio}.`,
    '',
    ...items.map((it) => `- ${it.nombre}${[it.color, it.talla].filter(Boolean).length ? ' (' + [it.color, it.talla].filter(Boolean).join(' / ') + ')' : ''} x${it.cantidad}  ${fmtCOP(it.subtotal)}`),
    '',
    `Subtotal: ${fmtCOP(p.subtotal_productos)}`,
    p.costo_envio && Number(p.costo_envio) > 0 ? `Envío: ${fmtCOP(p.costo_envio)}` : '',
    `Total: ${fmtCOP(p.total)}`,
    envio ? `Envío a: ${[p.comprador_direccion, p.comprador_ciudad].filter(Boolean).join(', ')}` : '',
    '',
    `Te avisamos cuando despachemos.`,
  ].filter(Boolean).join('\n');
  return { subject: `Confirmación de tu pedido ${p.codigo_publico} — ${t.nombre_negocio}`, html: wrap(t, body), text };
}

// Mapa transportadora -> URL de rastreo. Fallback: búsqueda en Google con transportadora + guía.
function trackingUrl(transportadora: string | null, guia: string): string {
  const g = encodeURIComponent(guia);
  const key = (transportadora || '').toLowerCase();
  if (key.includes('interrapidisimo') || key.includes('inter rapidisimo')) return `https://interrapidisimo.com/sigue-tu-envio/?guia=${g}`;
  if (key.includes('coordinadora')) return `https://www.coordinadora.com/rastreo/rastreo-de-guias/detalle-de-mi-guia/?guia=${g}`;
  if (key.includes('servientrega')) return `https://www.servientrega.com/wps/portal/rastreo-envio`;
  if (key.includes('envia') || key.includes('envía')) return `https://envia.co/`;
  if (key.includes('tcc')) return `https://www.tcc.com.co/`;
  return `https://www.google.com/search?q=${encodeURIComponent((transportadora || 'transportadora') + ' rastreo guia ' + guia)}`;
}

export function renderRastreo(t: TiendaBrand, p: PedidoData): Rendered {
  const guia = p.numero_guia || '';
  const transp = p.transportadora || 'tu transportadora';
  const link = guia ? trackingUrl(p.transportadora, guia) : (tiendaUrl(t) || '#');
  const body = `
    <tr><td style="padding:28px 28px 8px;">
      <h1 style="margin:0 0 6px;font-size:20px;color:${ACCENT};">¡Tu pedido va en camino! 🚚</h1>
      <p style="margin:0;color:${MUTED};font-size:14px;line-height:1.6;">Hola ${escapeHtml(p.comprador_nombre)}, despachamos tu pedido <strong style="color:${ACCENT};">${escapeHtml(p.codigo_publico)}</strong>.</p>
    </td></tr>
    <tr><td style="padding:16px 28px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;">
        <tr><td style="padding:14px 16px;font-size:14px;">
          <div style="color:${MUTED};font-size:12px;">Transportadora</div>
          <div style="font-weight:700;color:${ACCENT};margin-bottom:8px;">${escapeHtml(transp)}</div>
          <div style="color:${MUTED};font-size:12px;">Número de guía</div>
          <div style="font-weight:700;color:${ACCENT};font-size:16px;letter-spacing:0.5px;">${escapeHtml(guia || '—')}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 28px 24px;">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:7px;">Rastrear mi envío</a>
    </td></tr>`;
  const text = [
    `Tu pedido va en camino!`,
    `Pedido ${p.codigo_publico} en ${t.nombre_negocio}.`,
    `Transportadora: ${transp}`,
    `Número de guía: ${guia || '—'}`,
    `Rastrear: ${link}`,
  ].join('\n');
  return { subject: `Tu pedido ${p.codigo_publico} va en camino — ${t.nombre_negocio}`, html: wrap(t, body), text };
}
