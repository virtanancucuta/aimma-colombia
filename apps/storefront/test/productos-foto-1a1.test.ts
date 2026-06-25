// Fase 1b · foto estandar 1:1 en las 4 plantillas (patron B: aspect-square en wrapper Y en img,
// absolute inset-0 — NUNCA h-full en la img). IC ya lo tenia; FB/MA/EM se sumaron 2026-06-25.
import { describe, test, expect } from 'vitest';
import { renderNormalized, makeProductosSection } from './helpers/render-harness.ts';
import Productos from '../src/components/blocks/productos/Productos.astro';

const ROW = [{
  id: 'p1', nombre: 'Zapato Alfa', slug: 'zapato-alfa', referencia: 'REF001',
  precio_venta: 120000, precio_promo: null, foto_principal_url: 'https://x/a.jpg',
  fotos_galeria: ['https://x/b.jpg'], estado: 'activo', producto_variantes: [{ stock: 5, reservado: 0 }],
}];
const tienda = (slug: string): any => ({ id: 'tienda-uuid', plantilla: { slug } });

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

describe('Productos · foto estandar 1:1 en las 4 plantillas', () => {
  for (const slug of TEMPLATES) {
    test(`${slug}: wrapper e img usan aspect-square, sin h-full en la img, sin aspect-[3/4]/[4/5]`, async () => {
      // hover on para ejercer tambien la 2a foto
      const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true, hover: 'on' }), tienda(slug), ROW);
      // wrapper cuadrado
      expect(html).toContain('relative aspect-square overflow-hidden');
      // img principal y de hover: patron B (absolute inset-0 + aspect-square + object-cover)
      const imgs = html.match(/<img[^>]*>/g) || [];
      const cardImgs = imgs.filter((t) => /a\.jpg|b\.jpg/.test(t));
      expect(cardImgs.length).toBeGreaterThanOrEqual(2); // principal + hover
      for (const t of cardImgs) {
        expect(t).toContain('aspect-square');
        expect(t).toContain('object-cover');
        expect(t).not.toContain('h-full');           // el patron fragil que mordio a IC
      }
      // ningun aspect vertical viejo en el bloque
      expect(html).not.toContain('aspect-[3/4]');
      expect(html).not.toContain('aspect-[4/5]');
    });
  }
});
