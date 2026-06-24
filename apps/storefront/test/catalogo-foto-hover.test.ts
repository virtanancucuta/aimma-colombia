// AIMMA Storefront · Fase A · getProductosPorTienda expone foto_hover.
// foto_hover = primer elemento de fotos_galeria distinto de foto_principal; si no hay, null.
// Guard Array.isArray: fotos_galeria puede llegar undefined (p. ej. getProductoPorId no lo
// selecciona) -> debe degradar a null sin reventar.

import { describe, test, expect } from 'vitest';
import { getProductosPorTienda } from '../src/lib/catalogo.ts';
import { stubSupabase } from './helpers/render-harness.ts';

function row(extra: Record<string, any>) {
  return {
    id: 'p1', nombre: 'Producto', slug: 'producto', referencia: 'REF1',
    precio_venta: 100000, precio_promo: null, foto_principal_url: 'https://h/a.jpg',
    estado: 'activo', producto_variantes: [{ stock: 5, reservado: 0 }],
    ...extra,
  };
}

async function hoverDe(extra: Record<string, any>) {
  const res = await getProductosPorTienda(stubSupabase([row(extra)]) as any, 'tienda-id');
  return res[0].foto_hover;
}

describe('getProductosPorTienda · foto_hover', () => {
  test('= primer elemento de fotos_galeria distinto de la principal', async () => {
    expect(await hoverDe({ fotos_galeria: ['https://h/a.jpg', 'https://h/b.jpg'] }))
      .toBe('https://h/b.jpg');
  });

  test('salta la principal si aparece primera en la galeria', async () => {
    expect(await hoverDe({ foto_principal_url: 'https://h/a.jpg', fotos_galeria: ['https://h/a.jpg', 'https://h/c.jpg'] }))
      .toBe('https://h/c.jpg');
  });

  test('= el primer elemento si ninguno es la principal', async () => {
    expect(await hoverDe({ foto_principal_url: 'https://h/a.jpg', fotos_galeria: ['https://h/b.jpg', 'https://h/c.jpg'] }))
      .toBe('https://h/b.jpg');
  });

  test('= null si la galeria solo repite la principal', async () => {
    expect(await hoverDe({ fotos_galeria: ['https://h/a.jpg'] })).toBeNull();
  });

  test('= null si la galeria esta vacia', async () => {
    expect(await hoverDe({ fotos_galeria: [] })).toBeNull();
  });

  test('= null y NO revienta si fotos_galeria llega undefined (guard Array.isArray)', async () => {
    expect(await hoverDe({})).toBeNull();
  });
});
