// AIMMA Storefront · middleware.ts · 2026-05-31
// Resuelve tenant a partir del hostname y lo expone en Astro.locals.
// 404 si el subdomain no corresponde a ninguna tienda publicada.

import { defineMiddleware } from 'astro:middleware';
import { extractSlugFromHost, resolveTenant } from './lib/tenant';
import { getSupabase } from './lib/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals, url } = context;

  // Permitir endpoints internos que no requieren tienda (health, etc).
  // /robots.txt y /sitemap.xml SI requieren tienda — los manejamos despues.
  // NOTA: Astro excluye carpetas con prefijo `_` del build — por eso `internal/`
  // sin underscore. El endpoint `/internal/invalidate-kv` vive en
  // src/pages/internal/invalidate-kv.ts y es solo accesible con bearer secret.
  if (url.pathname.startsWith('/_health') || url.pathname.startsWith('/internal/')) {
    return next();
  }

  const host = request.headers.get('host');
  const slug = extractSlugFromHost(host);

  if (!slug) {
    // Root del wildcard (tienda.aimma.com.co sin subdomain) o host invalido.
    // Renderear landing publica de AIMMA o redirect a aimma.com.co.
    return new Response(
      renderLandingHTML(),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // Cloudflare runtime: KV + waitUntil para cache async.
  const runtime = locals.runtime;
  const tenant = await resolveTenant(
    slug,
    runtime?.env.TENANT_CACHE,
    runtime?.ctx?.waitUntil?.bind(runtime.ctx)
  );

  if (!tenant) {
    return new Response(
      renderNotFoundHTML(slug),
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  locals.tienda = tenant;
  locals.tiendaSlug = slug;
  locals.supabase = getSupabase();

  return next();
});

// ============================================================
// HTML responses para casos sin tenant (fuera del flow Layout)
// ============================================================

function renderLandingHTML(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AIMMA Tienda IA — Plataforma SaaS para crear tu tienda online</title>
  <meta name="description" content="Crea tu tienda online en minutos con AIMMA. Multi-tenant, SEO optimizado, integracion WhatsApp. Para PyMEs colombianas." />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 80px auto; padding: 0 24px; color: #1a1a1a; }
    h1 { font-size: 2rem; }
    .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #1a1a1a; color: white; text-decoration: none; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>AIMMA Tienda IA</h1>
  <p>Esta direccion sirve el storefront publico de las tiendas creadas en AIMMA.</p>
  <p>Si llegaste aca por error, visita <a href="https://aimma.com.co">aimma.com.co</a> para crear tu propia tienda.</p>
  <a class="cta" href="https://aimma.com.co">Crear mi tienda</a>
</body>
</html>`;
}

function renderNotFoundHTML(slug: string): string {
  const safe = slug.replace(/[<>&"]/g, ''); // basic escape
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tienda no encontrada — AIMMA</title>
  <meta name="robots" content="noindex" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 24px; text-align: center; color: #1a1a1a; }
    h1 { font-size: 2rem; }
    .muted { color: #6b7280; }
  </style>
</head>
<body>
  <h1>Tienda no encontrada</h1>
  <p class="muted">La tienda <strong>${safe}</strong> no esta disponible publicamente.</p>
  <p>Puede haber sido despublicada por su propietario o no existe.</p>
  <p><a href="https://aimma.com.co">Ir a AIMMA</a></p>
</body>
</html>`;
}
