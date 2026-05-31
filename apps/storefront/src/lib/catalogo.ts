// AIMMA Storefront · lib/catalogo.ts · 2026-05-31
// Helpers para queries de catalogo (productos, categorias, variantes).
// Las queries respetan RLS publico de Supabase (tienda.estado=publicada).
//
// NOTA TODO Fase 5.x: agregar columna `slug` en `productos` para URLs SEO-safe.
// Por ahora usamos `referencia` cuando es URL-safe, fallback a `id`.

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

const URL_SAFE_REF = /^[A-Za-z0-9._-]{1,64}$/;

function urlSlug(producto: { id: string; referencia: string | null }): string {
  if (producto.referencia && URL_SAFE_REF.test(producto.referencia)) {
    return producto.referencia;
  }
  return producto.id;
}

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
    slug: urlSlug({ id: p.id, referencia: p.referencia }),
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
      `id, nombre, referencia, precio_venta, precio_promo, foto_principal_url, estado,
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
  // slug puede ser referencia o id. Probamos ambos en 1 query.
  const tryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  let q = supabase
    .from('productos')
    .select(
      `*, producto_variantes(*)`
    )
    .eq('tienda_id', tiendaId)
    .eq('estado', 'activo');

  q = tryId ? q.eq('id', slug) : q.eq('referencia', slug);

  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error('[catalogo] getProductoPorSlug error:', error.message);
    return null;
  }
  return data;
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
