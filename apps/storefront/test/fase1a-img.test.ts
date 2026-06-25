// AIMMA Fase 1a · primitivo de imagen en el bloque productos (SOLO industrial_clean).
// forma = aspect del marco (en wrapper Y en la img, patron B verificado en navegador) ·
// ajuste = object-fit (rellenar=cover full-bleed / contener=contain p-2) · hover = override del
// flag de tienda. NUNCA h-full en la img (fue la causa del overflow de ayer; aspect en la img es el fix).

import { describe, test, expect } from 'vitest';
import { renderNormalized, makeProductosSection } from './helpers/render-harness.ts';
import Productos from '../src/components/blocks/productos/Productos.astro';

const HOVER_ROW = [{
  id: 'ph', nombre: 'Con Galeria', slug: 'con-galeria', referencia: 'RG',
  precio_venta: 100000, precio_promo: null,
  foto_principal_url: 'https://h/main.jpg', fotos_galeria: ['https://h/hover.jpg'],
  estado: 'activo', producto_variantes: [{ stock: 5, reservado: 0 }],
}];

const tiendaIC = (extra: any = {}): any => ({ id: 'tienda-uuid', plantilla: { slug: 'industrial_clean' }, ...extra });
const section = (o: any = {}) => makeProductosSection({ columnas: 'auto', mostrar_precio: true, ...o });
function imgTag(html: string, frag: string): string | null {
  const m = html.match(new RegExp(`<img[^>]*${frag.replace(/\./g, '\\.')}[^>]*>`));
  return m ? m[0] : null;
}

const FORMAS: Array<[string, string]> = [['3/4', 'aspect-[3/4]'], ['4/5', 'aspect-[4/5]'], ['1/1', 'aspect-square'], ['4/3', 'aspect-[4/3]']];

describe('Fase 1a · primitivo de imagen IC', () => {
  for (const [forma, cls] of FORMAS) {
    test(`forma ${forma} -> img usa ${cls} (aspect EN LA IMG, NO h-full) + absolute inset-0`, async () => {
      const t = imgTag(await renderNormalized(Productos, section({ forma }), tiendaIC(), HOVER_ROW), 'main.jpg');
      expect(t).toContain(cls);
      expect(t).not.toContain('h-full');      // el bug de overflow de ayer
      expect(t).toContain('absolute inset-0');
      expect(t).toContain('w-full');
    });

    test(`forma ${forma} -> el wrapper tambien usa ${cls}`, async () => {
      const html = await renderNormalized(Productos, section({ forma }), tiendaIC(), HOVER_ROW);
      expect(html).toContain(`relative ${cls} overflow-hidden`);
    });
  }

  test('ajuste rellenar (default) -> object-cover full-bleed, sin padding', async () => {
    const t = imgTag(await renderNormalized(Productos, section({}), tiendaIC(), HOVER_ROW), 'main.jpg');
    expect(t).toContain('object-cover');
    expect(t).not.toContain('object-contain');
    expect(t).not.toContain('p-4');
    expect(t).not.toContain('p-2');
  });

  test('ajuste contener -> object-contain p-2 (margen minimo, fondo neutro)', async () => {
    const t = imgTag(await renderNormalized(Productos, section({ ajuste: 'contener' }), tiendaIC(), HOVER_ROW), 'main.jpg');
    expect(t).toContain('object-contain');
    expect(t).toContain('p-2');
    expect(t).not.toContain('object-cover');
  });

  test('hover heredar + flag tienda OFF -> sin 2a imagen', async () => {
    const html = await renderNormalized(Productos, section({ hover: 'heredar' }), tiendaIC({ hover_segunda_foto: false }), HOVER_ROW);
    expect(html).not.toContain('https://h/hover.jpg');
  });
  test('hover on + flag tienda OFF -> SI 2a imagen (override)', async () => {
    const html = await renderNormalized(Productos, section({ hover: 'on' }), tiendaIC({ hover_segunda_foto: false }), HOVER_ROW);
    expect(html).toContain('https://h/hover.jpg');
  });
  test('hover off + flag tienda ON -> sin 2a imagen (override)', async () => {
    const html = await renderNormalized(Productos, section({ hover: 'off' }), tiendaIC(), HOVER_ROW);
    expect(html).not.toContain('https://h/hover.jpg');
  });

  test('el overlay de hover usa el MISMO aspect+fit que la principal', async () => {
    const html = await renderNormalized(Productos, section({ forma: '1/1' }), tiendaIC(), HOVER_ROW);
    const hover = imgTag(html, 'hover.jpg');
    expect(hover).toContain('aspect-square');
    expect(hover).toContain('object-cover');
    expect(hover).not.toContain('h-full');
  });
});
