// AIMMA Storefront · lib/catalogo.ts · 2026-05-31
// Helpers para queries de catalogo (productos, categorias, variantes).
// Las queries respetan RLS publico de Supabase (tienda.estado=publicada).
//
// Fase 7: columna `slug` agregada en BD (trigger auto-genera desde nombre).
// URLs SEO long-tail: /p/zapatos-deportivos-air-max-90 en vez de UUID/referencia.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@aimma/database';

type SB = SupabaseClient<Database>;

// ============================================================
// Productos
// ============================================================

export type ProductoListItem = {
  id: string;
  nombre: string;
  precio: number;
  precio_anterior: number | null;
  foto_principal: string | null;
  stock_disponible: number | null;
  slug: string;
  referencia: string | null;
};

function normalizarProducto(p: any): ProductoListItem {
  const stockSumarReservado = Array.isArray(p.producto_variantes)
    ? p.producto_variantes.reduce(
        (acc: number, v: any) => acc + Math.max(0, (v.stock || 0) - (v.reservado || 0)),
        0
      )
    : null;
  return {
    id: p.id,
    nombre: p.nombre,
    precio: Number(p.precio_promo ?? p.precio_venta ?? 0),
    precio_anterior: p.precio_promo && p.precio_promo < (p.precio_venta || 0)
      ? Number(p.precio_venta)
      : null,
    foto_principal: p.foto_principal_url ?? null,
    stock_disponible: stockSumarReservado,
    slug: p.slug || p.id,
    referencia: p.referencia ?? null,
  };
}

export async function getProductosPorTienda(
  supabase: SB,
  tiendaId: string,
  opts: { limit?: number; categoriaId?: string } = {}
): Promise<ProductoListItem[]> {
  const { limit = 24, categoriaId } = opts;

  let q = supabase
    .from('productos')
    .select(
      `id, nombre, slug, referencia, precio_venta, precio_promo, foto_principal_url, estado,
       producto_variantes(stock, reservado)`
    )
    .eq('tienda_id', tiendaId)
    .eq('estado', 'activo')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (categoriaId) q = q.eq('categoria_id', categoriaId);

  const { data, error } = await q;
  if (error) {
    console.error('[catalogo] getProductosPorTienda error:', error.message);
    return [];
  }
  return (data || []).map(normalizarProducto);
}

export async function getProductoPorSlug(
  supabase: SB,
  tiendaId: string,
  slug: string
) {
  // Prioridad: slug nuevo SEO (kebab-case). Fallback SOLO si el input es UUID
  // (URLs antiguas pre-migracion). NO se cae a `referencia` para evitar
  // colisiones cuando un producto inactivo tiene slug que coincide con
  // referencia de otro producto activo.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

  // 1. Intento por slug SEO (caso 99%+ post-migracion)
  const { data, error } = await supabase
    .from('productos')
    .select(`*, producto_variantes(*)`)
    .eq('tienda_id', tiendaId)
    .eq('estado', 'activo')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('[catalogo] getProductoPorSlug slug error:', error.message);
    return null;
  }
  if (data) return data;

  // 2. Fallback compat estricto: solo si el input parece UUID
  if (!isUuid) return null;

  const res = await supabase
    .from('productos')
    .select(`*, producto_variantes(*)`)
    .eq('tienda_id', tiendaId)
    .eq('estado', 'activo')
    .eq('id', slug)
    .maybeSingle();

  if (res.error) {
    console.error('[catalogo] getProductoPorSlug uuid fallback error:', res.error.message);
    return null;
  }
  return res.data;
}

// ============================================================
// Categorias
// ============================================================

export async function getCategoriaPorSlug(
  supabase: SB,
  tiendaId: string,
  slug: string
) {
  const { data, error } = await supabase
    .from('categorias')
    .select('*')
    .eq('tienda_id', tiendaId)
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('[catalogo] getCategoriaPorSlug error:', error.message);
    return null;
  }
  return data;
}

// ============================================================
// Paginas legales
// ============================================================

export async function getPaginaLegal(
  supabase: SB,
  tiendaId: string,
  tipo: 'garantias' | 'datos' | 'contacto'
) {
  const { data, error } = await supabase
    .from('paginas_legales')
    .select('titulo, contenido_html, secciones, ultima_actualiz')
    .eq('tienda_id', tiendaId)
    .eq('tipo', tipo)
    .maybeSingle();
  if (error) {
    console.error('[catalogo] getPaginaLegal error:', error.message);
    return null;
  }
  return data;
}
