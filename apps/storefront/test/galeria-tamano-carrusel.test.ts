import { describe, test, expect } from 'vitest';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Galeria from '../src/components/blocks/galeria/Galeria.astro';

const imgs = [
  { src: 'https://x/1.jpg', alt: 'a' }, { src: 'https://x/2.jpg', alt: 'b' }, { src: 'https://x/3.jpg', alt: 'c' },
];
const sec = (props: any) => makeSection('galeria', { imagenes: imgs, layout: 'grid', gap: 'normal', ...props });
const render = (slug: string, props: any) => renderNormalized(Galeria, sec(props), makeTienda(slug), []);

describe('Galeria · tamano + carrusel', () => {
  test('grilla IC: mediano(default)=lg:grid-cols-4, grande=lg:grid-cols-3, pequeno=lg:grid-cols-5', async () => {
    expect(await render('industrial_clean', {})).toContain('lg:grid-cols-4');
    expect(await render('industrial_clean', { tamano: 'grande' })).toContain('lg:grid-cols-3');
    expect(await render('industrial_clean', { tamano: 'pequeno' })).toContain('lg:grid-cols-5');
  });
  test('grilla NO es carrusel', async () => {
    const html = await render('industrial_clean', {});
    expect(html).not.toContain('data-gal-carrusel');
  });
  test('carrusel: contenedor scroll-snap + items snap-start + flechas', async () => {
    const html = await render('industrial_clean', { layout: 'carrusel' });
    expect(html).toContain('data-gal-carrusel');
    expect(html).toContain('snap-x');
    expect(html).toContain('snap-start');
    expect(html).toContain('data-gal-prev');
    expect(html).toContain('data-gal-next');
  });
  test('carrusel grande: slide basis 48% en desktop', async () => {
    const html = await render('industrial_clean', { layout: 'carrusel', tamano: 'grande' });
    expect(html).toContain('md:basis-[48%]');
  });
  test('mosaico (legacy) renderiza como grilla (sin carrusel)', async () => {
    const html = await render('industrial_clean', { layout: 'mosaico' });
    expect(html).not.toContain('data-gal-carrusel');
    expect(html).toContain('lg:grid-cols-4');
  });

  test('carrusel en PREVIEW: inerte (overflow-hidden, sin flechas, sin script)', async () => {
    const html = await renderNormalized(Galeria, sec({ layout: 'carrusel' }), makeTienda('industrial_clean'), [], { isPreview: true });
    expect(html).toContain('data-gal-carrusel');           // sigue siendo carrusel visualmente
    expect(html).toContain('overflow-hidden');             // inerte
    expect(html).not.toContain('overflow-x-auto');         // no captura scroll
    expect(html).not.toContain('data-gal-next');           // sin flechas en preview
    expect(html).not.toContain('initGalCarrusel');         // sin script en preview
  });
  test('carrusel PUBLICADO: scroll real + flechas + script', async () => {
    const html = await renderNormalized(Galeria, sec({ layout: 'carrusel' }), makeTienda('industrial_clean'), []);
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('data-gal-next');
    expect(html).toContain('initGalCarrusel');
  });

});
