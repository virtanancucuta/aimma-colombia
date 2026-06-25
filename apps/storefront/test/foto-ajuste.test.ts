// Ajuste de foto por tienda: las imgs de producto consumen --ta-foto-fit/--ta-foto-pad
// (la VALUE de la var la inyecta Layout.astro; aqui se prueba que las cards la USAN).
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

describe('Foto ajuste · cards usan var(--ta-foto-fit)', () => {
  for (const slug of TEMPLATES) {
    test(`${slug}: imgs de producto usan object-fit:var(--ta-foto-fit) + padding var`, async () => {
      const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true, hover: 'on' }), tienda(slug), ROW);
      const imgs = (html.match(/<img[^>]*>/g) || []).filter((t) => /a\.jpg|b\.jpg/.test(t));
      expect(imgs.length).toBeGreaterThanOrEqual(2);
      for (const t of imgs) {
        expect(t).toContain('object-fit:var(--ta-foto-fit,cover)');
        expect(t).toContain('padding:var(--ta-foto-pad,0px)');
        expect(t).toContain('aspect-square'); // patron B intacto
      }
    });
  }
});
