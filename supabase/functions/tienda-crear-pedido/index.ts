// AIMMA Tienda IA · EF tienda-crear-pedido · v1 · 2026-06-01
//
// ARQUITECTURA OPCION 2 HIBRIDA:
// - AIMMA es plataforma SaaS, NO marketplace.
// - La transaccion es entre comprador y tienda (vendedor), no participa AIMMA.
// - AIMMA solo registra el pedido para conveniencia del dueno (CRM leads).
// - NO envia emails ni notificaciones al cliente final.
// - El cliente abre wa.me directo desde su browser tras crear el pedido.
//
// FLUJO:
// 1. POST /functions/v1/tienda-crear-pedido (publico, verify_jwt=false)
// 2. Valida con Zod schema estricto
// 3. Verifica tienda publicada + recalcula subtotales server-side (no trust client)
// 4. Reserva stock atomico (UPDATE WHERE stock-reservado >= cantidad)
// 5. Upsert tienda_cliente si email
// 6. Insert pedido (trigger genera codigo_publico PED-YYYYMMDD-XXXXXX)
// 7. Insert pedido_items
// 8. Devuelve { codigo_publico, wa_url } al cliente para abrir wa.me
//
// USA SERVICE_ROLE_KEY (no anon) porque RLS no tiene INSERT policies en pedidos.

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';

// ============================================================
// CORS
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================
// Zod schema — validacion estricta del payload del cliente
// ============================================================

const TELEFONO_REGEX = /^[\d\s+\-()]{7,20}$/;
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/;

const CreatePedidoSchema = z.object({
  tienda_slug: z.string().regex(SLUG_REGEX, 'slug invalido'),
  comprador: z.object({
    nombre: z.string().trim().min(2).max(120),
    telefono: z.string().regex(TELEFONO_REGEX, 'telefono invalido'),
    email: z.string().email().max(180).optional().or(z.literal('').transform(() => undefined)),
    direccion: z.string().trim().min(5).max(220),
    ciudad: z.string().trim().min(2).max(80),
    observ: z.string().trim().max(500).optional(),
  }),
  items: z.array(z.object({
    producto_id: z.string().uuid(),
    variante_id: z.string().uuid().nullable(),
    cantidad: z.number().int().min(1).max(100),
  })).min(1).max(50),
  metodo_envio: z.enum(['a_coordinar', 'tarifa_fija', 'por_ciudad']).default('a_coordinar'),
});

type CreatePedidoInput = z.infer<typeof CreatePedidoSchema>;

// ============================================================
// Helpers
// ============================================================

function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function buildWhatsAppMessage(
  codigoPublico: string,
  tiendaNombre: string,
  comprador: CreatePedidoInput['comprador'],
  items: Array<{ nombre: string; color?: string | null; talla?: string | null; cantidad: number; subtotal: number }>,
  total: number,
): string {
  const lineas: string[] = [];
  lineas.push(`Hola! Soy ${comprador.nombre}, hice el pedido *${codigoPublico}* en ${tiendaNombre}:`);
  lineas.push('');
  items.forEach((it) => {
    const variante = [it.color, it.talla].filter(Boolean).join(' / ');
    const varStr = variante ? ` (${variante})` : '';
    lineas.push(`- ${it.cantidad}x ${it.nombre}${varStr} = ${formatCOP(it.subtotal)}`);
  });
  lineas.push('');
  lineas.push(`*Total: ${formatCOP(total)}*`);
  lineas.push('');
  lineas.push(`Envio a: ${comprador.direccion}, ${comprador.ciudad}`);
  lineas.push(`Telefono: ${comprador.telefono}`);
  if (comprador.email) lineas.push(`Email: ${comprador.email}`);
  if (comprador.observ) lineas.push(`Notas: ${comprador.observ}`);
  return lineas.join('\n');
}

// ============================================================
// Main handler
// ============================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'misconfigured: missing supabase env' }, 500);
  }

  // Parse + validar
  let payload: CreatePedidoInput;
  try {
    const body = await req.json();
    payload = CreatePedidoSchema.parse(body);
  } catch (e: any) {
    return jsonResponse({
      error: 'invalid_payload',
      details: e?.errors ?? String(e?.message ?? e),
    }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Resolver tienda publicada
  const { data: tienda, error: errTienda } = await supabase
    .from('tiendas')
    .select('id, slug, nombre_negocio, whatsapp_dueno, estado')
    .eq('slug', payload.tienda_slug)
    .eq('estado', 'publicada')
    .maybeSingle();
  if (errTienda || !tienda) {
    return jsonResponse({ error: 'tienda_no_publicada', slug: payload.tienda_slug }, 404);
  }

  // 2. Resolver productos + variantes (recalcular precios server-side)
  const productoIds = [...new Set(payload.items.map((i) => i.producto_id))];
  const varianteIds = payload.items.map((i) => i.variante_id).filter(Boolean) as string[];

  const { data: productos, error: errProd } = await supabase
    .from('productos')
    .select('id, nombre, referencia, precio_venta, precio_promo, estado')
    .eq('tienda_id', tienda.id)
    .eq('estado', 'activo')
    .in('id', productoIds);
  if (errProd) {
    return jsonResponse({ error: 'productos_query_failed', details: errProd.message }, 500);
  }
  if (!productos || productos.length !== productoIds.length) {
    return jsonResponse({ error: 'productos_invalidos', expected: productoIds.length, found: productos?.length ?? 0 }, 400);
  }
  const productosById = new Map<string, any>(productos.map((p) => [p.id, p]));

  let variantesById = new Map<string, any>();
  if (varianteIds.length > 0) {
    const { data: variantes, error: errVar } = await supabase
      .from('producto_variantes')
      .select('id, producto_id, color, talla, stock, reservado, precio_venta_override')
      .in('id', varianteIds);
    if (errVar) {
      return jsonResponse({ error: 'variantes_query_failed', details: errVar.message }, 500);
    }
    variantesById = new Map<string, any>((variantes ?? []).map((v) => [v.id, v]));
  }

  // 3. Calcular subtotales + preparar items finales (server-side, NO trust client)
  type PreparedItem = {
    producto_id: string;
    variante_id: string | null;
    referencia: string;
    nombre: string;
    color: string | null;
    talla: string | null;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  };
  const itemsFinales: PreparedItem[] = [];
  let subtotalProductos = 0;

  for (const it of payload.items) {
    const prod = productosById.get(it.producto_id);
    if (!prod) {
      return jsonResponse({ error: 'producto_no_encontrado', producto_id: it.producto_id }, 400);
    }
    const variante = it.variante_id ? variantesById.get(it.variante_id) : null;
    if (it.variante_id && !variante) {
      return jsonResponse({ error: 'variante_no_encontrada', variante_id: it.variante_id }, 400);
    }

    // Precio: variante override > precio_promo > precio_venta
    const precioUnit = Number(
      variante?.precio_venta_override ?? prod.precio_promo ?? prod.precio_venta,
    );
    if (!precioUnit || precioUnit <= 0) {
      return jsonResponse({ error: 'precio_invalido', producto_id: it.producto_id }, 400);
    }
    const subtotal = precioUnit * it.cantidad;
    subtotalProductos += subtotal;

    itemsFinales.push({
      producto_id: prod.id,
      variante_id: variante?.id ?? null,
      referencia: prod.referencia,
      nombre: prod.nombre,
      color: variante?.color ?? null,
      talla: variante?.talla ?? null,
      cantidad: it.cantidad,
      precio_unitario: precioUnit,
      subtotal,
    });
  }

  // 4. Stock reserve atomico para variantes
  // UPDATE producto_variantes SET reservado = reservado + cantidad
  // WHERE id = X AND (stock - reservado) >= cantidad RETURNING id
  // Si no devuelve filas -> sin stock disponible.
  for (const it of itemsFinales) {
    if (!it.variante_id) continue;
    const { data: locked, error: errLock } = await supabase.rpc('reservar_stock_variante', {
      p_variante_id: it.variante_id,
      p_cantidad: it.cantidad,
    });
    // Fallback si RPC no existe: UPDATE manual con check
    if (errLock?.code === 'PGRST202' || errLock?.message?.includes('function reservar_stock_variante')) {
      const { data: upd, error: errUpd } = await supabase
        .from('producto_variantes')
        .update({ reservado: (variantesById.get(it.variante_id)?.reservado ?? 0) + it.cantidad })
        .eq('id', it.variante_id)
        .gte('stock', (variantesById.get(it.variante_id)?.reservado ?? 0) + it.cantidad)
        .select('id, stock, reservado');
      if (errUpd || !upd || upd.length === 0) {
        // Rollback: liberar lo ya reservado en items previos
        await rollbackReservas(supabase, itemsFinales, it.variante_id, variantesById);
        return jsonResponse({
          error: 'stock_insuficiente',
          producto: it.nombre,
          variante: [it.color, it.talla].filter(Boolean).join(' / '),
        }, 409);
      }
    } else if (errLock || !locked) {
      await rollbackReservas(supabase, itemsFinales, it.variante_id, variantesById);
      return jsonResponse({
        error: 'stock_insuficiente',
        producto: it.nombre,
        variante: [it.color, it.talla].filter(Boolean).join(' / '),
      }, 409);
    }
  }

  // 5. Upsert tienda_cliente si email
  let tiendaClienteId: string | null = null;
  if (payload.comprador.email) {
    const { data: cliente } = await supabase
      .from('tienda_clientes')
      .upsert(
        {
          tienda_id: tienda.id,
          email: payload.comprador.email,
          nombre: payload.comprador.nombre,
          telefono: payload.comprador.telefono,
          direcciones: [{
            direccion: payload.comprador.direccion,
            ciudad: payload.comprador.ciudad,
            principal: true,
          }],
        },
        { onConflict: 'tienda_id,email', ignoreDuplicates: false },
      )
      .select('id')
      .single();
    tiendaClienteId = cliente?.id ?? null;
  }

  // 6. Insert pedido (trigger autogenera codigo_publico)
  const total = subtotalProductos; // sin costo_envio por ahora (a_coordinar)
  const { data: pedido, error: errPed } = await supabase
    .from('pedidos')
    .insert({
      tienda_id: tienda.id,
      estado: 'pendiente_confirmacion',
      tienda_cliente_id: tiendaClienteId,
      comprador_nombre: payload.comprador.nombre,
      comprador_telefono: payload.comprador.telefono,
      comprador_email: payload.comprador.email ?? null,
      comprador_direccion: payload.comprador.direccion,
      comprador_ciudad: payload.comprador.ciudad,
      comprador_observ: payload.comprador.observ ?? null,
      metodo_envio: payload.metodo_envio,
      subtotal_productos: subtotalProductos,
      costo_envio: 0,
      total,
    })
    .select('id, codigo_publico')
    .single();
  if (errPed || !pedido) {
    // Liberar stock reservado
    await rollbackReservasAll(supabase, itemsFinales);
    return jsonResponse({ error: 'pedido_insert_failed', details: errPed?.message }, 500);
  }

  // 7. Insert items
  const { error: errItems } = await supabase
    .from('pedido_items')
    .insert(itemsFinales.map((it) => ({
      pedido_id: pedido.id,
      producto_id: it.producto_id,
      variante_id: it.variante_id,
      referencia: it.referencia,
      nombre: it.nombre,
      color: it.color,
      talla: it.talla,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      subtotal: it.subtotal,
    })));
  if (errItems) {
    // Rollback pedido + reservas
    await supabase.from('pedidos').delete().eq('id', pedido.id);
    await rollbackReservasAll(supabase, itemsFinales);
    return jsonResponse({ error: 'items_insert_failed', details: errItems.message }, 500);
  }

  // 8. Construir wa.me URL
  const wppDigits = (tienda.whatsapp_dueno || '').replace(/\D/g, '');
  const mensaje = buildWhatsAppMessage(
    pedido.codigo_publico,
    tienda.nombre_negocio,
    payload.comprador,
    itemsFinales,
    total,
  );
  const wa_url = wppDigits
    ? `https://wa.me/${wppDigits}?text=${encodeURIComponent(mensaje)}`
    : null;

  return jsonResponse({
    success: true,
    codigo_publico: pedido.codigo_publico,
    pedido_id: pedido.id,
    total,
    wa_url,
  });
});

// ============================================================
// Rollback helpers
// ============================================================

async function rollbackReservas(
  supabase: any,
  items: Array<{ variante_id: string | null; cantidad: number }>,
  failedVarianteId: string,
  variantesById: Map<string, any>,
) {
  // Liberar todas las reservas hechas antes del fallo
  for (const it of items) {
    if (!it.variante_id || it.variante_id === failedVarianteId) break;
    const v = variantesById.get(it.variante_id);
    if (!v) continue;
    await supabase
      .from('producto_variantes')
      .update({ reservado: Math.max(0, (v.reservado ?? 0)) })
      .eq('id', it.variante_id);
  }
}

async function rollbackReservasAll(
  supabase: any,
  items: Array<{ variante_id: string | null; cantidad: number }>,
) {
  for (const it of items) {
    if (!it.variante_id) continue;
    // Decrementar reservado por la cantidad de ESTE item (mejor: RPC atomico,
    // pero como esto es rollback solo restamos lo que sumamos)
    const { data: v } = await supabase
      .from('producto_variantes')
      .select('reservado')
      .eq('id', it.variante_id)
      .maybeSingle();
    if (v) {
      await supabase
        .from('producto_variantes')
        .update({ reservado: Math.max(0, (v.reservado ?? 0) - it.cantidad) })
        .eq('id', it.variante_id);
    }
  }
}
