// AIMMA Storefront · lib/supabase.ts · 2026-05-31
// Cliente Supabase para SSR multi-tenant. Anon key + lectura publica via RLS.
// El storefront NO tiene auth de usuario (es publico). Si en futuro hay
// carrito persistente con login, usar @supabase/ssr para manejo de cookies.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@aimma/database';

let _client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (_client) return _client;

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      '[storefront] Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY. ' +
      'Verifica .env.local en dev o las env vars del Worker en prod.'
    );
  }

  _client = createClient<Database>(url, key, {
    auth: { persistSession: false }, // SSR: no necesitamos session persistence
    global: {
      headers: {
        'x-application-name': 'aimma-storefront',
      },
    },
  });

  return _client;
}
