// AIMMA Storefront · Fase A · ProductGrid (dispatcher) threadea hoverSegundaFoto.
// La 2a ruta que instancia cards (la 1a es Productos.astro): ProductGrid -> ProductGrid{X} ->
// ProductCard{X}, usada por index/c/buscar/upsell. ProductGrid lee hover_segunda_foto de
// Astro.locals.tienda (espeja Header) y lo threadea. Productos ya vienen normalizados (con foto_hover).

import { describe, test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { stubSupabase } from './helpers/render-harness.ts';
import ProductGrid from '../src/components/ProductGrid.astro';

const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');
const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

const PRODUCTS = [{
  id: 'g1', nombre: 'G1', slug: 'g1', precio: 100000, precio_anterior: null,
  foto_principal: 'https://h/main.jpg', foto_hover: 'https://h/hover.jpg',
  stock_disponible: 5, referencia: 'G1',
}];

async function render(slug: string, hoverOn: boolean) {
  const container = await AstroContainer.create();
  const tienda: any = { id: 'tienda-uuid', plantilla: { slug } };
  if (!hoverOn) tienda.hover_segunda_foto = false;
  return container.renderToString(ProductGrid, {
    props: { productos: PRODUCTS },
    locals: { tienda, supabase: stubSupabase([]) } as any,
    request: REQUEST,
  });
}

describe('ProductGrid · segunda foto al hover', () => {
  for (const slug of TEMPLATES) {
    test(`${slug}: toggle ON -> la 2a imagen llega hasta la card`, async () => {
      expect(await render(slug, true)).toContain('https://h/hover.jpg');
    });
  }

  test('industrial_clean: toggle OFF -> sin 2a imagen', async () => {
    const html = await render('industrial_clean', false);
    expect(html).toContain('https://h/main.jpg');
    expect(html).not.toContain('https://h/hover.jpg');
  });
});
