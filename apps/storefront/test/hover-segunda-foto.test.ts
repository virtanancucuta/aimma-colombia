// AIMMA Storefront · Fase A · Productos: segunda foto al hover (toggle por tienda).
// Render via Container API (harness). El toggle hover_segunda_foto se lee de Astro.locals.tienda
// en Productos.astro (espeja como Header lee mostrar_buscador_header). Cero JS: la 2a imagen es
// CSS-only (opacity-0 -> group-hover/focus-within), decorativa (alt=""), lazy, sin transitionName.

import { describe, test, expect } from 'vitest';
import { renderNormalized, makeProductosSection } from './helpers/render-harness.ts';
import Productos from '../src/components/blocks/productos/Productos.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

const HOVER_ROW = [{
  id: 'ph', nombre: 'Con Galeria', slug: 'con-galeria', referencia: 'RG',
  precio_venta: 100000, precio_promo: null,
  foto_principal_url: 'https://h/main.jpg', fotos_galeria: ['https://h/hover.jpg'],
  estado: 'activo', producto_variantes: [{ stock: 5, reservado: 0 }],
}];

function tienda(slug: string, hoverOn: boolean): any {
  const t: any = { id: 'tienda-uuid', plantilla: { slug } };
  if (!hoverOn) t.hover_segunda_foto = false; // ausente -> ON (default), igual que el buscador
  return t;
}

const section = () => makeProductosSection({ columnas: 'auto', mostrar_precio: true });

// Extrae el <img> cuyo markup contiene `frag` (un img es un tag sin '>' interno).
function imgTag(html: string, frag: string): string | null {
  const m = html.match(new RegExp(`<img[^>]*${frag.replace(/\./g, '\\.')}[^>]*>`));
  return m ? m[0] : null;
}

describe('Productos · segunda foto al hover', () => {
  for (const slug of TEMPLATES) {
    test(`${slug}: toggle ON + foto_hover -> renderiza la segunda imagen`, async () => {
      const html = await renderNormalized(Productos, section(), tienda(slug, true), HOVER_ROW);
      expect(html).toContain('https://h/hover.jpg');
    });

    test(`${slug}: toggle OFF -> NO renderiza la segunda imagen`, async () => {
      const html = await renderNormalized(Productos, section(), tienda(slug, false), HOVER_ROW);
      expect(html).toContain('https://h/main.jpg'); // la principal sigue
      expect(html).not.toContain('https://h/hover.jpg');
    });
  }

  test('la segunda imagen es decorativa, lazy y CSS-only', async () => {
    const html = await renderNormalized(Productos, section(), tienda('industrial_clean', true), HOVER_ROW);
    const tag = imgTag(html, 'hover.jpg');
    expect(tag).toBeTruthy();
    // Decorativa: alt vacio. Astro serializa alt="" como el atributo booleano `alt` (HTML lo
    // interpreta como alt="" -> decorativa). Exigimos alt presente y NUNCA con texto.
    expect(tag).toMatch(/\salt(=""|(?=[\s>]))/);
    expect(tag).not.toMatch(/alt="[^"]+"/);                 // jamas el nombre del producto
    expect(tag).toContain('loading="lazy"');               // no inflar el payload inicial
    expect(tag).not.toContain('loading="eager"');
    expect(tag).toContain('opacity-0');                    // CSS-only fade
    expect(tag).toContain('group-hover:opacity-100');
    expect(tag).toContain('motion-reduce:transition-none'); // respeta prefers-reduced-motion
  });

  test('IC: la segunda imagen usa object-cover full-bleed (sin p-4) como la primaria', async () => {
    const html = await renderNormalized(Productos, section(), tienda('industrial_clean', true), HOVER_ROW);
    const tag = imgTag(html, 'hover.jpg');
    expect(tag).toContain('object-cover');
    expect(tag).not.toContain('object-contain');
    expect(tag).not.toContain('p-4');
  });

  test('producto SIN galeria -> sin segunda imagen aunque el toggle este ON', async () => {
    const noGal = [{ ...HOVER_ROW[0], fotos_galeria: [] }];
    const html = await renderNormalized(Productos, section(), tienda('industrial_clean', true), noGal);
    expect(html).toContain('https://h/main.jpg');
    expect(html).not.toContain('https://h/hover.jpg');
  });
});
