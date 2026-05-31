// AIMMA Storefront · robots.txt dinamico · 2026-05-31
// Permite crawl si tienda publicada. Apunta al sitemap del subdomain.

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals, request }) => {
  const host = request.headers.get('host') || 'tienda.aimma.com.co';
  const proto = 'https';
  const base = `${proto}://${host}`;

  const allow = locals.tienda ? 'Allow: /' : 'Disallow: /';

  const body = `User-agent: *
${allow}

Sitemap: ${base}/sitemap.xml
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
};
