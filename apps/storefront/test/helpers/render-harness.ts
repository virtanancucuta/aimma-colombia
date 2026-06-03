// AIMMA Fase A.2 · Harness de identidad visual (golden) de renderers de contenido.
// Renderiza componentes .astro via Container API y normaliza el HTML para
// comparar VIEJO (per-template) vs NUEVO (unificado) byte-a-byte.
//
// NORMALIZACION (justificada empiricamente, ver spike):
//  1. data-astro-cid-XXXX  -> data-astro-cid-CID   (hash de scope, difiere por archivo .astro)
//  2. data-astro-source-file="..."  -> ELIMINADO   (anotacion SOLO-dev; rutas absolutas C:/...; prod nunca la emite)
//  3. data-astro-source-loc="..."   -> ELIMINADO   (anotacion SOLO-dev: linea:col del archivo fuente)
// Nada mas se toca. El <style> NO aparece en renderToString (Astro lo extrae via Vite),
// por eso la identidad del CSS se valida en un check estatico de source aparte.

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

// ---- Stub de Supabase: reproduce la cadena de getProductosPorTienda ----
// from('productos').select(...).eq(...).eq(...).order(...).limit(...)  [.eq(...)]  -> await => {data,error}
export function stubSupabase(rows: any[]): any {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return { from: () => chain };
}

// ---- Productos fixture (filas crudas de BD; getProductosPorTienda las normaliza) ----
// Variedad: con/sin foto, en/sin descuento, stock alto/bajo/cero. ProductCard es
// compartido viejo/nuevo => su salida es identica; la variedad solo asegura
// representatividad del golden.
export const PRODUCTOS_FIXTURE = [
  { id: 'p01', nombre: 'Zapato Alfa', slug: 'zapato-alfa', referencia: 'REF001', precio_venta: 120000, precio_promo: null, foto_principal_url: null, estado: 'activo', producto_variantes: [{ stock: 10, reservado: 2 }] },
  { id: 'p02', nombre: 'Bota Beta', slug: 'bota-beta', referencia: null, precio_venta: 200000, precio_promo: 150000, foto_principal_url: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/b.jpg', estado: 'activo', producto_variantes: [{ stock: 3, reservado: 0 }] },
  { id: 'p03', nombre: 'Sandalia Gamma', slug: 'sandalia-gamma', referencia: 'REF003', precio_venta: 80000, precio_promo: null, foto_principal_url: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/c.jpg', estado: 'activo', producto_variantes: [{ stock: 0, reservado: 0 }] },
  { id: 'p04', nombre: 'Tenis Delta', slug: 'tenis-delta', referencia: 'REF004', precio_venta: 300000, precio_promo: 299000, foto_principal_url: null, estado: 'activo', producto_variantes: [{ stock: 50, reservado: 5 }] },
  { id: 'p05', nombre: 'Mocasin Epsilon', slug: 'mocasin-epsilon', referencia: null, precio_venta: 175000, precio_promo: null, foto_principal_url: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/e.jpg', estado: 'activo', producto_variantes: [{ stock: 7, reservado: 0 }] },
  { id: 'p06', nombre: 'Bota Zeta', slug: 'bota-zeta', referencia: 'REF006', precio_venta: 220000, precio_promo: 198000, foto_principal_url: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/f.jpg', estado: 'activo', producto_variantes: [{ stock: 2, reservado: 1 }] },
];

// ---- Section fixture builder ----
export function makeProductosSection(props: {
  columnas: 'auto' | 2 | 3 | 4;
  mostrar_precio: boolean;
}): any {
  return {
    id: 'sec_pilot01',
    tipo: 'productos',
    padding: 'md',
    ancho: 'completo',
    fondo: { tipo: 'color', valor: '#ffffff' },
    props: {
      categoria_id: null,
      limite: 24,
      orden: 'recientes',
      columnas: props.columnas,
      mostrar_precio: props.mostrar_precio,
    },
  };
}

export function makeTienda(plantillaSlug: string): any {
  return { id: 'tienda-uuid', plantilla: { slug: plantillaSlug } };
}

// Section builder generico (tipo + props arbitrarias) para tipos sin fetch.
export function makeSection(tipo: string, props: any): any {
  return {
    id: 'sec_pilot01',
    tipo,
    padding: 'md',
    ancho: 'completo',
    fondo: { tipo: 'color', valor: '#ffffff' },
    props,
  };
}

// ---- Normalizacion ----
export function normalize(html: string): string {
  return html
    // 2 + 3: eliminar anotaciones dev (con el espacio previo) — prod nunca las emite
    .replace(/ data-astro-source-file="[^"]*"/g, '')
    .replace(/ data-astro-source-loc="[^"]*"/g, '')
    // 1: normalizar el hash de scope (atributo booleano sin '=')
    .replace(/data-astro-cid-[A-Za-z0-9]+/g, 'data-astro-cid-CID');
}

// ---- Render via Container API ----
const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');

export async function renderNormalized(
  Component: AstroComponentFactory,
  section: any,
  tienda: any,
  rows: any[]
): Promise<string> {
  const container = await AstroContainer.create();
  // locals: any -> el harness inyecta solo lo que el renderer consume (tienda + supabase);
  // App.Locals real exige tiendaSlug/runtime que el renderer de productos no usa.
  const locals: any = { tienda, supabase: stubSupabase(rows) };
  const html = await container.renderToString(Component, {
    props: { section },
    locals,
    request: REQUEST,
  });
  return normalize(html);
}

// ---- Matriz de combos del piloto (superficie de params del renderer) ----
export const COMBOS: Array<{ label: string; columnas: 'auto' | 2 | 3 | 4; mostrar_precio: boolean; empty: boolean }> = [
  { label: 'empty', columnas: 'auto', mostrar_precio: true, empty: true },
  { label: 'auto-precio', columnas: 'auto', mostrar_precio: true, empty: false },
  { label: 'col2-precio', columnas: 2, mostrar_precio: true, empty: false },
  { label: 'col3-precio', columnas: 3, mostrar_precio: true, empty: false },
  { label: 'col4-precio', columnas: 4, mostrar_precio: true, empty: false },
  { label: 'auto-sinprecio', columnas: 'auto', mostrar_precio: false, empty: false },
];
