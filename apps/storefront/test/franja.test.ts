// AIMMA Fase F · F-2 · Franja.astro (render estatico, primer slide). Verifica la estructura PUBLICA:
// banda full-bleed (.franja), 1-3 celdas lado a lado, gap, overlay 3x3 (scrim+texto SOLO con texto),
// link envuelve la celda. Estructura COMPARTIDA x4 (plantilla-agnostica). El CSS full-bleed (width:100vw)
// vive en <style> (lo valida el build + el OK visual x4); aca assertimos el HTML.
import { describe, test, expect } from 'vitest';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Franja from '../src/components/blocks/franja/Franja.astro';

const IMG = (over?: any, link?: string) => ({ url: 'https://cdn.x/a.jpg', alt: 'foto', ...(over ? { overlay: over } : {}), ...(link ? { link } : {}) });
const OV = { texto: 'Hola', posicion: 'abajo-derecha', color_texto: '#ffffff', color_fondo: 'rgba(0,0,0,0.5)', borde: 'fino' };
const render = (props: any, slug = 'industrial_clean') => renderNormalized(Franja, makeSection('franja', props), makeTienda(slug), []);

describe('Franja.astro · F-2 render estatico', () => {
  test('1 imagen sin overlay/link: 1 celda div, sin overlay, banda + gap', async () => {
    const html = await render({ slides: [{ imagenes: [IMG()] }], gap: 'min' });
    expect(html).toContain('class="franja franja--gap-min"');
    expect(html).toContain('franja__slide');
    expect((html.match(/franja__cell/g) || []).length).toBe(1);
    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn.x/a.jpg"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('franja__ov');     // sin overlay
  });

  test('3 imagenes: 3 celdas lado a lado', async () => {
    const html = await render({ slides: [{ imagenes: [IMG(), IMG(), IMG()] }], gap: 'none' });
    expect((html.match(/franja__cell/g) || []).length).toBe(3);
    expect(html).toContain('franja--gap-none');
  });

  test('overlay con texto: recuadro posicionado (3x3) + scrim/color por var + texto', async () => {
    const html = await render({ slides: [{ imagenes: [IMG(OV)] }] });
    expect(html).toContain('franja__ov--abajo-derecha');
    expect(html).toContain('franja__ov-txt--b-fino');
    expect(html).toContain('--ov-text:#ffffff');
    expect(html).toContain('--ov-bg:rgba(0,0,0,0.5)');
    expect(html).toContain('Hola');
  });

  test('overlay SIN texto: imagen limpia, sin scrim/recuadro', async () => {
    const html = await render({ slides: [{ imagenes: [IMG({ color_texto: '#fff', color_fondo: '#000' })] }] });
    expect(html).not.toContain('franja__ov');     // sin texto = sin overlay
  });

  test('link: la celda es un <a> que envuelve la imagen', async () => {
    const html = await render({ slides: [{ imagenes: [IMG(undefined, 'https://x.com')] }] });
    expect(html).toMatch(/<a[^>]*class="franja__cell"[^>]*href="https:\/\/x\.com"/);
  });

  test('F-2 estatico: con 3 slides solo renderea el PRIMERO (slider llega en F-3)', async () => {
    const html = await render({ slides: [{ imagenes: [IMG()] }, { imagenes: [IMG(), IMG()] }, { imagenes: [IMG()] }] });
    expect((html.match(/franja__cell/g) || []).length).toBe(1); // solo el primer slide (1 imagen)
  });

  test('plantilla-agnostico: fashion_bold produce la misma estructura', async () => {
    const a = await render({ slides: [{ imagenes: [IMG(OV)] }] }, 'industrial_clean');
    const b = await render({ slides: [{ imagenes: [IMG(OV)] }] }, 'fashion_bold');
    expect(b).toBe(a);
  });
});
