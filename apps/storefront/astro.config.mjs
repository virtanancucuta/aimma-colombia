// AIMMA Storefront · astro.config.mjs · v2 · 2026-05-31
// Multi-tenant SSR sobre Cloudflare Workers (no Pages — Pages deprecated).
// Findings research: usar workerd runtime + noop image service + delegate
// optimization a Cloudflare Image Resizing via /cdn-cgi/image/ URL pattern.

import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Base URL: cada tienda vive en https://<slug>.tienda.aimma.com.co
// Detectamos por hostname en middleware. PUBLIC_SITE_BASE es fallback para
// sitemap.xml + canonical cuando no hay request (build time).
const SITE = process.env.PUBLIC_SITE_BASE || 'https://tienda.aimma.com.co';

export default defineConfig({
  site: SITE,
  output: 'server', // SSR completo. ISR-like via Cache-Control + Cloudflare SWR.
  adapter: cloudflare({
    // mode: 'directory' = Cloudflare Workers Static Assets pattern.
    mode: 'directory',
    // platformProxy: bindings de Cloudflare disponibles en dev local (KV, R2, etc).
    platformProxy: { enabled: true },
    // imageService: 'cloudflare' permite que <Image /> use Cloudflare Image
    // Resizing via /cdn-cgi/image/ rewrites cuando esta detras del proxy
    // de la zona aimma.com.co (Pro+ tier).
    imageService: 'cloudflare',
  }),
  integrations: [
    // NO @astrojs/sitemap: no soporta multi-tenant SSR.
    // Sitemap dinamico en src/pages/sitemap.xml.ts genera por hostname.
  ],
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      noExternal: ['@supabase/supabase-js', '@aimma/database'],
    },
  },
  image: {
    domains: ['rsmxklkxqsaptchcjszd.supabase.co'],
    // service: noop = no Sharp en runtime. Cloudflare hace el resizing.
    // En dev local sin proxy CF, las imagenes se sirven originales.
    service: { entrypoint: 'astro/assets/services/noop' },
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'viewport',
  },
});
