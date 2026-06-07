/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { Tienda, Plantilla, Paleta } from '@aimma/database';
import type { Runtime } from '@astrojs/cloudflare';

// Bindings que se esperan en el Worker. Configurados en wrangler.toml +
// dashboard Cloudflare (los IDs reales). Comentados los que se agregan en
// Fase 5.x cuando se cree el namespace.
interface Env {
  TENANT_CACHE?: KVNamespace;
  HTML_CACHE?: KVNamespace;
  PUBLIC_SUBDOMAIN_BASE: string;
  INVALIDATE_SECRET?: string;
  // Gate de Cloudflare Image Resizing (/cdn-cgi/image/). "true" solo si la feature
  // esta habilitada en la zona; default ausente/"false" -> OptimizedImage sirve URL cruda.
  CF_IMAGE_RESIZING?: string;
}

declare global {
  namespace App {
    interface Locals extends Runtime<Env> {
      // Set por middleware desde el hostname.
      tienda: Tienda & {
        plantilla?: Plantilla | null;
        paleta?: Paleta | null;
      };
      tiendaSlug: string;
      // C.2 Paso 2: modo preview del editor. Los renderers emiten data-field SOLO si true
      // (publico = false -> sin marcadores). Lo setean index.astro (segun token) y render-fragment (=true).
      isPreview?: boolean;
      // Supabase client (creado en middleware o on-demand).
      supabase: import('@supabase/supabase-js').SupabaseClient;
    }
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly PUBLIC_SITE_BASE?: string;
  readonly PUBLIC_SUBDOMAIN_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
