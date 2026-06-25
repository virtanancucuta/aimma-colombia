// Galería PDP: markup del lightbox + miniaturas + trigger. (El CSS object-fit:var no aparece en
// renderToString — se valida por grep de fuente + gate navegador.)
import { describe, test, expect } from 'vitest';
import { renderComponentNormalized, makeTienda } from './helpers/render-harness.ts';
import ProductGallery from '../src/components/ProductGallery.astro';

const pdp = (galeria: string[]) => ({ galeria, producto: { nombre: 'Zapato Alfa' } });
const ic = makeTienda('industrial_clean');

describe('ProductGallery', () => {
  test('con >=2 fotos: overlay role=dialog oculto + trigger zoom + 1 miniatura por foto', async () => {
    const html = await renderComponentNormalized(ProductGallery, { pdp: pdp(['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg']) }, ic);
    expect(html).toContain('data-pgal-lb');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/data-pgal-lb[^>]*hidden/); // oculto por defecto
    expect(html).toContain('data-pgal-open');          // trigger de zoom
    expect((html.match(/data-pgal-thumb/g) || []).length).toBe(3);
    expect(html).toContain('aria-current="true"');     // primera miniatura activa
  });
  test('con 1 foto: sin miniaturas, pero con principal y lightbox', async () => {
    const html = await renderComponentNormalized(ProductGallery, { pdp: pdp(['https://x/a.jpg']) }, ic);
    expect(html).not.toContain('data-pgal-thumb');
    expect(html).toContain('data-pdp-main-img');
    expect(html).toContain('data-pgal-lb');
  });
  test('con 0 fotos: placeholder', async () => {
    const html = await renderComponentNormalized(ProductGallery, { pdp: pdp([]) }, ic);
    expect(html).toContain('pgal__placeholder');
  });
});
