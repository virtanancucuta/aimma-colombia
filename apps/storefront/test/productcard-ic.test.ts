import { describe, test, expect } from 'vitest';
import { renderNormalized, makeProductosSection } from './helpers/render-harness.ts';
import Productos from '../src/components/blocks/productos/Productos.astro';

const ic = (): any => ({ id: 'tienda-uuid', plantilla: { slug: 'industrial_clean' } });
const rows = (stock: number) => [{
  id: 'p1', nombre: 'Zapato Alfa', slug: 'zapato-alfa', referencia: 'REF001',
  precio_venta: 120000, precio_promo: null, foto_principal_url: 'https://x/a.jpg',
  fotos_galeria: [], estado: 'activo', producto_variantes: [{ stock, reservado: 0 }],
}];
const render = (stock: number) => renderNormalized(Productos, makeProductosSection({ mostrar_precio: true }), ic(), rows(stock));

describe('ProductCardIC · card limpia', () => {
  test('foto usa aspect-square en wrapper y en img, sin h-full', async () => {
    const html = await render(10);
    expect(html).toContain('relative aspect-square overflow-hidden');
    expect(html).toContain('w-full aspect-square object-cover');
    expect(html).not.toContain('h-full w-full object-cover');
  });
  test('sin SKU (no aparece "SKU ")', async () => {
    const html = await render(10);
    expect(html).not.toContain('SKU ');
  });
  test('sin CTA "Ver producto"', async () => {
    const html = await render(10);
    expect(html).not.toContain('Ver producto');
  });
  test('stock normal (10) -> sin badge Agotado ni Ultimas', async () => {
    const html = await render(10);
    expect(html).not.toContain('Agotado');
    expect(html).not.toContain('Últimas');
  });
  test('stock 0 -> badge Agotado', async () => {
    const html = await render(0);
    expect(html).toContain('Agotado');
  });
  test('stock bajo (3) -> badge Últimas 3', async () => {
    const html = await render(3);
    expect(html).toContain('Últimas 3');
  });
  test('precio sigue visible', async () => {
    const html = await render(10);
    expect(html).toContain('120.000');
  });
});
