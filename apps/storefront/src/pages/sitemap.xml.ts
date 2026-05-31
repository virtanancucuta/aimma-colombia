// AIMMA Storefront · sitemap.xml dinamico · 2026-05-31
// Genera sitemap.xml por tenant (subdomain). Cache edge 1h.

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals, request }) => {
  const { tienda, supabase } = locals;
  if (!tienda) {
    return new Response('Not Found', { status: 404 });
  }

  const host = request.headers.get('host') || 'tienda.aimma.com.co';
  const proto = 'https';
  const base = `${proto}://${host}`;

  // Rutas estaticas (siempre presentes en cada tienda)
  const staticUrls = [
    `${base}/`,
    `${base}/legales/garantias`,
    `${base}/legales/datos`,
    `${base}/legales/contacto`,
  ];

  // Categorias
  const { data: categorias } = await supabase
    .from('categorias')
    .select('slug, created_at')
    .eq('tienda_id', tienda.id);

  // Productos (limitamos a 1000 por sitemap; para mas, paginar)
  const { data: productos } = await supabase
    .from('productos')
    .select('id, referencia, updated_at')
    .eq('tienda_id', tienda.id)
    .eq('estado', 'activo')
    .order('updated_at', { ascending: false })
    .limit(1000);

  function urlSafe(s: string | null): boolean {
    return !!s && /^[A-Za-z0-9._-]{1,64}$/.test(s);
  }

  const catUrls = (categorias || []).map((c) => `${base}/c/${c.slug}`);
  const prodUrls = (productos || []).map((p) => {
    const slug = urlSafe(p.referencia) ? p.referencia : p.id;
    return `${base}/p/${slug}`;
  });

  const allUrls = [...staticUrls, ...catUrls, ...prodUrls];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    allUrls
      .map(
        (loc) =>
          `  <url><loc>${escapeXml(loc)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`
      )
      .join('\n') +
    '\n</urlset>';

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}
