# AIMMA Tienda IA · Fase 7.2 · WhatsApp Checkout E2E

**Fecha:** 2026-05-31
**Autor:** Claude + Jorge
**Status:** SPEC para aprobacion Jorge

---

## 1. Objetivo

Convertir el "compra por WhatsApp" actual (link wa.me con mensaje prellenado, sin persistencia) en un flow checkout completo:

1. Cliente llena carrito en storefront
2. Va a `/checkout` → llena datos (nombre, telefono, email opcional, direccion, ciudad)
3. Cliente recibe codigo OTP por email para confirmar (opcional segun config tienda)
4. Pedido se guarda en BD (`pedidos` + `pedido_items`)
5. Cliente es redirigido a wa.me con mensaje + `codigo_publico` del pedido
6. Duenio recibe email de notificacion + ve pedido en panel admin

## 2. Estado actual (lo que ya tenemos)

**BD existente y suficiente:**
- `pedidos`: id, tienda_id, codigo_publico (UNIQUE), comprador_nombre/telefono/direccion/ciudad/email/observ, subtotal_productos, costo_envio, total, estado, metodo_envio, tienda_cliente_id, notif_email_enviado_at, pendiente_at, confirmado_at, cancelado_at
- `pedido_items`: id, pedido_id, producto_id, variante_id, referencia, nombre, color, talla, cantidad, precio_unitario, subtotal
- `tienda_clientes`: id, tienda_id, email, nombre, telefono, direcciones jsonb, ultimo_login_at
- `tienda_clientes_otp`: id, tienda_id, email, codigo_hash, expira_at, usado, intentos

**Storefront actual:**
- `/carrito.astro` muestra items en localStorage + boton wa.me que arma mensaje
- `/p/[slug].astro` tiene boton "Comprar por WhatsApp" directo (sin carrito)

**Falta:**
- Pagina `/checkout.astro` (formulario + integracion EF)
- EF `tienda-crear-pedido` (Deno) que valida + inserta + dispara OTP + email
- EF `tienda-confirmar-otp` (Deno) que verifica codigo + marca pedido confirmado
- Pagina `/confirmar-pedido.astro` (input codigo OTP)
- Panel admin: vista `pedidos.js` ya existe placeholder, actualizar para mostrar tabla real
- Email notificacion al duenio (reusar infra emails AIMMA o nodemailer en EF)

## 3. Arquitectura

### 3.1 Flow E2E

```
[Cliente storefront]
  carrito (localStorage)
     |
     v
  /checkout (form)
     |
     v
  POST /functions/v1/tienda-crear-pedido
     |
     +--> insert pedidos (estado='pendiente_otp' si requires_otp, else 'pendiente')
     +--> insert pedido_items
     +--> insert tienda_clientes (upsert por email)
     +--> insert tienda_clientes_otp si requires_otp
     +--> send email OTP a cliente (si requires_otp)
     +--> send email notif a duenio (siempre)
     +--> return { codigo_publico, requires_otp, redirect_url }
     |
     v
  Si requires_otp:
    /confirmar-pedido?codigo=PED12345
    cliente ingresa codigo de 6 digitos
       |
       v
    POST /functions/v1/tienda-confirmar-otp
       +--> verify codigo_hash + expira
       +--> update pedido estado='pendiente'
       +--> return { wa_url }
       |
       v
    redirect wa.me con mensaje prellenado
  Else (sin OTP):
    redirect wa.me directo con mensaje + codigo_publico
```

### 3.2 Decision: OTP opcional por tienda

Agregar columna `tiendas.requires_otp_checkout boolean default false`. Razon:
- Tiendas pequenas con confianza alta (Maraldo) no quieren friccion
- Tiendas con muchas ventas y problemas de fake orders pueden activarlo

Default `false` para no romper experiencia actual.

### 3.3 Codigo publico del pedido

`codigo_publico` ya es UNIQUE en BD. Formato: `PED-YYYYMMDD-XXXX` (8 chars random alfanum). Trigger BD existente debe ser auditado.

Si no existe trigger, agregar:

```sql
CREATE OR REPLACE FUNCTION public.gen_codigo_publico_pedido()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo_publico IS NULL OR NEW.codigo_publico = '' THEN
    NEW.codigo_publico := 'PED-' || to_char(NEW.created_at, 'YYYYMMDD') || '-' ||
      upper(substr(md5(random()::text || NEW.id::text), 1, 4));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_codigo_publico_pedido
BEFORE INSERT ON pedidos
FOR EACH ROW EXECUTE FUNCTION public.gen_codigo_publico_pedido();
```

### 3.4 EF `tienda-crear-pedido`

```ts
// supabase/functions/tienda-crear-pedido/index.ts
import { serve } from 'std/server';
import { z } from 'zod';

const Schema = z.object({
  tienda_id: z.string().uuid(),
  comprador: z.object({
    nombre: z.string().min(2).max(100),
    telefono: z.string().regex(/^[\d\s+\-()]{7,20}$/),
    email: z.string().email().optional().or(z.literal('')),
    direccion: z.string().min(5).max(200),
    ciudad: z.string().min(2).max(100),
    observ: z.string().max(500).optional(),
  }),
  items: z.array(z.object({
    producto_id: z.string().uuid(),
    variante_id: z.string().uuid().nullable(),
    referencia: z.string(),
    nombre: z.string(),
    color: z.string().nullable(),
    talla: z.string().nullable(),
    cantidad: z.number().int().min(1).max(100),
    precio_unitario: z.number().positive(),
  })).min(1).max(50),
  metodo_envio: z.enum(['envio', 'recoge']).default('envio'),
});

serve(async (req) => {
  const body = Schema.parse(await req.json());

  // 1. Validar tienda publicada + obtener config
  const tienda = await supabase.from('tiendas')
    .select('id, slug, nombre_negocio, whatsapp_dueno, email_contacto, requires_otp_checkout, estado')
    .eq('id', body.tienda_id).eq('estado', 'publicada').single();
  if (!tienda) return new Response('Tienda no publicada', { status: 404 });

  // 2. Recalcular subtotales server-side (no confiar en client)
  const subtotal = body.items.reduce((acc, it) => acc + it.precio_unitario * it.cantidad, 0);
  const costo_envio = 0;  // Fase 7.3 cuando agreguemos envios
  const total = subtotal + costo_envio;

  // 3. Verificar stock disponible
  for (const it of body.items) {
    if (it.variante_id) {
      const v = await supabase.from('producto_variantes')
        .select('stock, reservado').eq('id', it.variante_id).single();
      if (!v || (v.stock - v.reservado) < it.cantidad) {
        return Response.json({ error: `Sin stock para ${it.nombre}` }, { status: 409 });
      }
    }
  }

  // 4. Upsert tienda_cliente si email
  let tienda_cliente_id: string | null = null;
  if (body.comprador.email) {
    const { data } = await supabase.from('tienda_clientes').upsert({
      tienda_id: body.tienda_id,
      email: body.comprador.email,
      nombre: body.comprador.nombre,
      telefono: body.comprador.telefono,
      direcciones: [{
        direccion: body.comprador.direccion,
        ciudad: body.comprador.ciudad,
        principal: true,
      }],
    }, { onConflict: 'tienda_id,email' }).select('id').single();
    tienda_cliente_id = data?.id ?? null;
  }

  // 5. Insertar pedido
  const requires_otp = tienda.requires_otp_checkout && !!body.comprador.email;
  const estado_inicial = requires_otp ? 'pendiente_otp' : 'pendiente';

  const { data: pedido } = await supabase.from('pedidos').insert({
    tienda_id: body.tienda_id,
    estado: estado_inicial,
    tienda_cliente_id,
    comprador_nombre: body.comprador.nombre,
    comprador_telefono: body.comprador.telefono,
    comprador_email: body.comprador.email || null,
    comprador_direccion: body.comprador.direccion,
    comprador_ciudad: body.comprador.ciudad,
    comprador_observ: body.comprador.observ || null,
    metodo_envio: body.metodo_envio,
    subtotal_productos: subtotal,
    costo_envio,
    total,
  }).select('id, codigo_publico').single();

  // 6. Insertar items
  await supabase.from('pedido_items').insert(
    body.items.map(it => ({
      pedido_id: pedido!.id,
      producto_id: it.producto_id,
      variante_id: it.variante_id,
      referencia: it.referencia,
      nombre: it.nombre,
      color: it.color,
      talla: it.talla,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      subtotal: it.precio_unitario * it.cantidad,
    }))
  );

  // 7. Si requires_otp: generar + email
  if (requires_otp) {
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const codigo_hash = await sha256(codigo + body.tienda_id);
    await supabase.from('tienda_clientes_otp').insert({
      tienda_id: body.tienda_id,
      email: body.comprador.email,
      codigo_hash,
      expira_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      usado: false,
      intentos: 0,
    });
    await sendEmailOTP(body.comprador.email!, codigo, tienda);
  }

  // 8. Email duenio (siempre)
  await sendEmailNotifPedido(tienda, pedido!, body.items, total);

  // 9. Construir wa.me URL
  const wppDigits = (tienda.whatsapp_dueno || '').replace(/\D/g, '');
  const msg = buildWhatsAppMessage(pedido!.codigo_publico, body.comprador, body.items, total);
  const wa_url = wppDigits ? `https://wa.me/${wppDigits}?text=${encodeURIComponent(msg)}` : null;

  return Response.json({
    success: true,
    codigo_publico: pedido!.codigo_publico,
    requires_otp,
    wa_url: requires_otp ? null : wa_url,  // solo entregamos wa_url despues de OTP confirm
    redirect: requires_otp ? `/confirmar-pedido?codigo=${pedido!.codigo_publico}` : wa_url,
  });
});
```

### 3.5 EF `tienda-confirmar-otp`

Recibe `codigo_publico` + `codigo_otp`, verifica hash, marca pedido `estado='pendiente'`, devuelve `wa_url`.

### 3.6 Pagina `/checkout.astro`

Form en Astro SSR:
- Si carrito vacio → redirect a `/`
- Si tienda no tiene whatsapp_dueno → mostrar mensaje "no acepta pedidos online"
- Form fields: nombre, telefono (formato CO), email opcional, direccion, ciudad, observaciones, metodo envio
- POST a EF via fetch desde script inline
- Loading state + error handling

### 3.7 Pagina `/confirmar-pedido.astro`

Form simple con input codigo 6 digitos. POST a `tienda-confirmar-otp`. Si OK → redirect wa_url.

### 3.8 Panel admin `pedidos.js`

Reemplazar placeholder con tabla:
- Columnas: Codigo / Fecha / Cliente / Total / Estado / Acciones
- Filtros: estado (todos/pendiente/confirmado/cancelado), fecha
- Click en fila → modal con detalle items + boton "marcar confirmado/cancelado"

## 4. Plan de implementacion

### Fase 7.2.A — BD complemento (30 min)
- [ ] Migration: `tiendas.requires_otp_checkout boolean default false`
- [ ] Migration: trigger `gen_codigo_publico_pedido` si no existe
- [ ] Verificar RLS en `pedidos`, `pedido_items`, `tienda_clientes`

### Fase 7.2.B — EF crear pedido (2h)
- [ ] `supabase/functions/tienda-crear-pedido/index.ts`
- [ ] Zod schema + validacion
- [ ] Stock check
- [ ] Upsert tienda_clientes
- [ ] OTP flow opcional
- [ ] Email duenio (reusar Resend o SendGrid si configurado)
- [ ] Deploy verify_jwt=false (es publico, anon key)

### Fase 7.2.C — EF confirmar OTP (1h)
- [ ] `supabase/functions/tienda-confirmar-otp/index.ts`
- [ ] Verificar hash + expira + intentos < 5
- [ ] Update pedido estado
- [ ] Devolver wa_url

### Fase 7.2.D — Pages storefront (2h)
- [ ] `/checkout.astro` form completo
- [ ] `/confirmar-pedido.astro` OTP input
- [ ] Actualizar `/carrito.astro` para botar al checkout en vez de wa.me directo (preservar fallback)

### Fase 7.2.E — Panel admin pedidos (2h)
- [ ] `views/pedidos.js` tabla con filtros
- [ ] Modal detalle pedido
- [ ] Boton cambiar estado

### Fase 7.2.F — Email templates (1h)
- [ ] Email OTP cliente
- [ ] Email notif duenio (con link al panel)

### Fase 7.2.G — Test E2E + audit (2h)
- [ ] Test en aimma-test: pedido completo SIN OTP
- [ ] Test en aimma-test: pedido completo CON OTP
- [ ] Test stock insuficiente → error
- [ ] Test panel admin muestra pedidos
- [ ] Code reviewer agent

**Total Fase 7.2 (WhatsApp checkout):** ~10h estimadas

## 5. Riesgos

| Riesgo | Mitigacion |
|---|---|
| Spam de pedidos fake (sin OTP) | rate limit por IP + captcha invisible cloudflare turnstile |
| Email service no configurado | fallback: solo notificacion duenio via panel + push notif futura |
| Stock race condition | usar RPC `reservar_stock_v2` (RPC existente del proyecto) |
| Telefono invalido para wa.me | validar formato + mostrar preview link antes de enviar |

## 6. Decisiones pendientes (Jorge)

1. **Email service:** Resend ($0 hasta 3K/mes) vs reusar config Brevo de AIMMA?
2. **OTP por defecto:** off (eligiblo por tienda) o on para todos?
3. **Stock reservation:** reservar al crear pedido o solo cuando duenio confirma?
4. **Costo envio:** Fase 7.3 separada o agregar al checkout ya?

## 7. Siguientes pasos

1. Jorge revisa este spec
2. Si OK → Fase 7.2.A + 7.2.B esta semana
3. Pages + panel siguiente semana
4. Maraldo como primer cliente real con checkout
