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
  foto_hover: string | null;
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
  // foto_hover (Fase A): primer elemento de fotos_galeria distinto de la principal; si no hay, null.
  // Guard Array.isArray: fotos_galeria puede llegar undefined (getProductoPorId no la selecciona)
  // -> degrada a null sin reventar. NO asumir que siempre es string[].
  const galeria: string[] = Array.isArray(p.fotos_galeria) ? p.fotos_galeria : [];
  const fotoHover =
    galeria.find((u) => typeof u === 'string' && u && u !== p.foto_principal_url) ?? null;
  return {
    id: p.id,
    nombre: p.nombre,
    precio: Number(p.precio_promo ?? p.precio_venta ?? 0),
    precio_anterior: p.precio_promo && p.precio_promo < (p.precio_venta || 0)
      ? Number(p.precio_venta)
      : null,
    foto_principal: p.foto_principal_url ?? null,
    foto_hover: fotoHover,
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

  // Fix B (rollup): /c/[slug] muestra los productos de la categoria + TODAS sus subcategorias
  // (productos.categoria_id es FK simple -> sin esto /c/ropa-dama omite los productos de las
  // subcategorias como BLUSA DAMA). Resolvemos el subarbol con la RPC recursiva
  // categoria_descendientes y filtramos por IN. Fallback a la categoria sola si la RPC falla.
  let categoriaIds: string[] | null = null;
  if (categoriaId) {
    const { data: subcats, error: subErr } = await supabase
      .rpc('categoria_descendientes', { p_categoria_id: categoriaId });
    if (subErr) console.error('[catalogo] categoria_descendientes error:', subErr.message);
    const ids = ((subcats as any[]) || []).map((r) => r.id);
    categoriaIds = ids.length ? ids : [categoriaId];
  }

  let q = supabase
    .from('productos')
    .select(
      `id, nombre, slug, referencia, precio_venta, precio_promo, foto_principal_url, fotos_galeria, estado,
       producto_variantes(stock, reservado)`
    )
    .eq('tienda_id', tiendaId)
    .eq('estado', 'activo')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (categoriaIds) q = q.in('categoria_id', categoriaIds);

  const { data, error } = await q;
  if (error) {
    console.error('[catalogo] getProductosPorTienda error:', error.message);
    return [];
  }
  return (data || []).map(normalizarProducto);
}

// Buscador de catalogo (Fase B, Paso A). Llama la RPC buscar_productos (full-text tenant-scoped,
// SECURITY INVOKER -> RLS aplica publicada+activo; el param aplica el tenant). Mapea a ProductoListItem
// para reusar ProductGrid/ProductCard. q vacio -> [] (la pagina muestra el prompt, no llama la RPC).
export async function buscarProductos(
  supabase: SB,
  tiendaId: string,
  q: string,
  limit = 24
): Promise<ProductoListItem[]> {
  const term = (q || '').trim();
  if (!term) return [];
  // .rpc no tipado en los types generados (igual que validate_preview_token); el return es explicito.
  const { data, error } = await supabase.rpc('buscar_productos', {
    p_tienda_id: tiendaId,
    p_q: term,
    p_limit: limit,
  });
  if (error) {
    console.error('[catalogo] buscarProductos error:', error.message);
    return [];
  }
  return ((data as any[]) || []).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    precio: Number(r.precio_promo ?? r.precio_venta ?? 0),
    precio_anterior: r.precio_promo && r.precio_promo < (r.precio_venta || 0) ? Number(r.precio_venta) : null,
    foto_principal: r.foto_principal_url ?? null,
    foto_hover: null, // el buscador (RPC) no trae galeria -> sin hover; degrada limpio.
    stock_disponible: r.stock_disponible != null ? Number(r.stock_disponible) : null,
    slug: r.slug || r.id,
    referencia: r.referencia ?? null,
  }));
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

// B-secciones Lote 3: resuelve UN producto por id, TENANT-SCOPED (.eq('tienda_id')). Devuelve null
// si no existe / borrado / placeholder all-zeros / de otra tienda -> el renderer degrada graciosamente.
export async function getProductoPorId(
  supabase: SB,
  tiendaId: string,
  id: string
): Promise<ProductoListItem | null> {
  const { data, error } = await supabase
    .from('productos')
    .select(
      `id, nombre, slug, referencia, precio_venta, precio_promo, foto_principal_url, estado,
       producto_variantes(stock, reservado)`
    )
    .eq('tienda_id', tiendaId)               // TENANT-SCOPED: nunca resuelve producto de otra tienda
    .eq('estado', 'activo')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[catalogo] getProductoPorId error:', error.message);
    return null;
  }
  return data ? normalizarProducto(data) : null;
}

// ============================================================
// Categorias
// ============================================================

// B-secciones Lote 3: resuelve categorias por lista de ids, TENANT-SCOPED, PRESERVANDO el orden de
// `ids` y DESCARTANDO las que no existen (borradas / otra tienda / placeholder all-zeros).
export async function getCategoriasPorIds(
  supabase: SB,
  tiendaId: string,
  ids: string[]
): Promise<{ id: string; nombre: string; slug: string }[]> {
  if (!ids.length) return [];
  // NOTA: la imagen de la seccion categorias_destacadas es per-item (item.imagen), NO la categoria.foto_url.
  // La columna foto_url sigue existiendo en la tabla (para futuras imagenes de categoria en /c/), solo no se
  // selecciona aca. Este helper solo resuelve nombre/slug en vivo (tenant-scoped).
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, slug')
    .eq('tienda_id', tiendaId)               // TENANT-SCOPED: nunca resuelve categoria de otra tienda
    .in('id', ids);
  if (error) {
    console.error('[catalogo] getCategoriasPorIds error:', error.message);
    return [];
  }
  const byId = new Map((data || []).map((c: any) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as { id: string; nombre: string; slug: string }[];
}

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
