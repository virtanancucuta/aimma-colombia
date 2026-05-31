// AIMMA Storefront · lib/tenant.ts · 2026-05-31
// Resolucion del tenant a partir del hostname. Cache KV (300s TTL) + fallback
// a Supabase. Pattern recomendado para 10k+ tenants en Cloudflare Workers.

/// <reference types="@cloudflare/workers-types" />

import type { Tienda, Plantilla, Paleta } from '@aimma/database';
import { getSupabase } from './supabase';

export type TenantResolved = Tienda & {
  plantilla?: Plantilla | null;
  paleta?: Paleta | null;
};

const SUBDOMAIN_BASE = 'tienda.aimma.com.co';
// TTL corto para que cambios de paleta/plantilla/datos en panel admin se vean
// en el storefront en ~1 min. Tradeoff: mas hits a Supabase. Aceptable.
// TODO: invalidacion explicita via webhook Supabase para 0s lag.
const TENANT_CACHE_TTL_SECONDS = 60;

export function extractSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  // host puede venir con puerto: "aimma-test.tienda.aimma.com.co:443"
  const hostNoPort = host.split(':')[0].toLowerCase();
  if (!hostNoPort.endsWith(`.${SUBDOMAIN_BASE}`)) return null;
  const slug = hostNoPort.slice(0, -1 * (SUBDOMAIN_BASE.length + 1));
  if (!slug || slug.includes('.')) return null; // multi-level rechazado
  // Validar slug DNS-safe (mismo regex que BD CHECK constraint)
  if (!/^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/.test(slug)) return null;
  return slug;
}

async function fetchTenantFromSupabase(slug: string): Promise<TenantResolved | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('tiendas')
    .select(`
      *,
      plantilla:plantillas(*),
      paleta:paletas(*)
    `)
    .eq('slug', slug)
    .eq('estado', 'publicada')
    .maybeSingle();

  if (error) {
    console.error('[tenant] fetchTenantFromSupabase error:', error.message);
    return null;
  }
  if (!data) return null;
  // Cast porque el join puede devolver array, lo normalizamos a objeto.
  const tienda = data as unknown as TenantResolved;
  return tienda;
}

export async function resolveTenant(
  slug: string,
  kv?: KVNamespace,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<TenantResolved | null> {
  // Path 1: KV cache hit
  if (kv) {
    try {
      const cached = await kv.get<TenantResolved>(`tienda:${slug}`, 'json');
      if (cached) return cached;
    } catch (e) {
      console.error('[tenant] KV read failed (fallback to Supabase):', e);
    }
  }

  // Path 2: Supabase fetch + cache write background
  const tenant = await fetchTenantFromSupabase(slug);
  if (!tenant) return null;

  if (kv && waitUntil) {
    waitUntil(
      kv.put(`tienda:${slug}`, JSON.stringify(tenant), {
        expirationTtl: TENANT_CACHE_TTL_SECONDS,
      }).catch((e: unknown) => console.error('[tenant] KV write failed:', e))
    );
  }

  return tenant;
}
