// AIMMA Fase F · F-2 · Franja.astro (render estatico, primer slide). Verifica la estructura PUBLICA:
// banda full-bleed (.franja), 1-3 celdas lado a lado, gap, overlay 3x3 (scrim+texto SOLO con texto),
// link envuelve la celda. Estructura COMPARTIDA x4 (plantilla-agnostica). El CSS full-bleed (width:100vw)
// vive en <style> (lo valida el build + el OK visual x4); aca assertimos el HTML.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Franja from '../src/components/blocks/franja/Franja.astro';

const FRANJA_SRC = readFileSync(fileURLToPath(new URL('../src/components/blocks/franja/Franja.astro', import.meta.url)), 'utf8');

const IMG = (over?: any, link?: string) => ({ url: 'https://cdn.x/a.jpg', alt: 'foto', ...(over ? { overlay: over } : {}), ...(link ? { link } : {}) });
const OV = { texto: 'Hola', posicion: 'abajo-derecha', color_texto: '#ffffff', color_fondo: 'rgba(0,0,0,0.5)', borde: 'fino' };
// strip del <script> (F-3 lo embarca; su contenido referencia las clases .franja__* y contaminaria
// los conteos por regex). Las aserciones van sobre el HTML puro; el JS se verifica en vivo.
const render = async (props: any, slug = 'industrial_clean') =>
  (await renderNormalized(Franja, makeSection('franja', props), makeTienda(slug), [])).replace(/<script[\s\S]*?<\/script>/gi, '');

describe('Franja.astro · F-2 render estatico', () => {
  test('1 imagen sin overlay/link: 1 celda div, sin overlay, banda + gap', async () => {
    const html = await render({ slides: [{ imagenes: [IMG()] }], gap: 'min' });
    expect(html).toContain('class="franja franja--gap-min franja--h-medio"');  // default altura=medio
    expect(html).toContain('franja__slide');
    expect((html.match(/franja__cell/g) || []).length).toBe(1);
    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn.x/a.jpg"');
    // FASE F (fix): imagenes EAGER (sin loading="lazy"). Una banda full-bleed suele ser hero -> lazy
    // perjudica el LCP, y en el canvas del editor las lazy off-screen no cargan tras el patch.
    expect(html).not.toContain('loading="lazy"');
    expect(html).not.toContain('franja__ov');     // sin overlay
  });

  // GUARD (bug #1): con 1 imagen chica, la banda colapsaba al ancho de la imagen porque el slide solo
  // tenia ancho en el caso slider (.franja--slider .franja__slide { flex:0 0 100% }). El harness es node
  // (sin layout -> no hay ancho computado), asi que el guard es a nivel SOURCE: la regla BASE .franja__slide
  // DEBE tener width:100%. El ancho computado real (1 imagen llena el viewport) se verifica en vivo (Playwright).
  test('GUARD #1: .franja__slide base es width:100% (sin esto, 1 imagen chica colapsa la banda)', () => {
    const base = FRANJA_SRC.match(/\.franja__slide\s*\{[^}]*\}/);
    expect(base, 'no se encontro la regla base .franja__slide').toBeTruthy();
    expect(base![0]).toMatch(/width:\s*100%/);
  });

  // ── C-3a: altura (presets) + foco (object-position) ──
  test('C-3a altura: clase franja--h-<modo> por preset; default medio', async () => {
    expect(await render({ slides: [{ imagenes: [IMG()] }] })).toContain('franja--h-medio');               // default
    expect(await render({ slides: [{ imagenes: [IMG()] }], altura: 'corto' })).toContain('franja--h-corto');
    expect(await render({ slides: [{ imagenes: [IMG()] }], altura: 'alto' })).toContain('franja--h-alto');
  });

  test('C-3a foco: object-position por imagen via var --foco (default centro 50% 50%)', async () => {
    expect(await render({ slides: [{ imagenes: [IMG()] }] })).toContain('--foco:50% 50%');                 // default centro
    const dr = await render({ slides: [{ imagenes: [{ url: 'https://cdn.x/a.jpg', foco: 'abajo-derecha' }] }] });
    expect(dr).toContain('--foco:100% 100%');
    const ai = await render({ slides: [{ imagenes: [{ url: 'https://cdn.x/a.jpg', foco: 'arriba-izquierda' }] }] });
    expect(ai).toContain('--foco:0% 0%');
  });

  test('C-3a GUARD source: clamp por preset (var --franja-h) + object-position via var(--foco)', () => {
    expect(FRANJA_SRC).toMatch(/\.franja--h-corto\s*\{[^}]*clamp\(160px/);
    expect(FRANJA_SRC).toMatch(/\.franja--h-medio\s*\{[^}]*clamp\(220px/);
    expect(FRANJA_SRC).toMatch(/\.franja--h-alto\s*\{[^}]*clamp\(340px/);
    expect(FRANJA_SRC).toMatch(/object-position:\s*var\(--foco/);
  });

  // ── C-3b: adaptarse (B1+) ──
  test('C-3b adaptarse HERO (1 slide/1 imagen) -> franja--h-natural (ratio real)', async () => {
    expect(await render({ slides: [{ imagenes: [IMG()] }], altura: 'adaptarse' })).toContain('franja--h-natural');
  });

  test('C-3b adaptarse NO-hero -> fallback franja--h-medio (sin salto de alto)', async () => {
    // multi-imagen en 1 slide
    expect(await render({ slides: [{ imagenes: [IMG(), IMG()] }], altura: 'adaptarse' })).toContain('franja--h-medio');
    // multi-slide (slider)
    const two = await render({ slides: [{ imagenes: [IMG()] }, { imagenes: [IMG()] }], altura: 'adaptarse' });
    expect(two).toContain('franja--h-medio');
    expect(two).not.toContain('franja--h-natural');
  });

  test('C-3b GUARD source: modo natural = height:auto + max-height:80vh (B1+ cap anti banda-gigante)', () => {
    expect(FRANJA_SRC).toMatch(/\.franja--h-natural\s+\.franja__slide\s*\{[^}]*height:\s*auto/);
    expect(FRANJA_SRC).toMatch(/\.franja--h-natural\s+\.franja__img\s*\{[^}]*max-height:\s*80vh/);
  });

  // ── C-4: apilar en mobile ──
  test('C-4 GUARD source: mobile-first (slide column + alto POR CELDA) y fila/alto-en-slide >=640', () => {
    // mobile-first: el slide base es columna (apila)
    expect(FRANJA_SRC).toMatch(/\.franja__slide\s*\{[^}]*flex-direction:\s*column/);
    // alto del preset POR CELDA en mobile (no aplastar 2-3 imagenes apiladas) — alerta C-3a x C-4
    expect(FRANJA_SRC).toMatch(/\.franja--h-medio\s+\.franja__cell[^{]*\{[^}]*var\(--franja-h\)/);
    // desktop: media query del breakpoint sm con fila
    expect(FRANJA_SRC).toMatch(/@media\s*\(min-width:\s*640px\)[\s\S]*flex-direction:\s*row/);
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

  // ── F-3: slider (2-3 slides) ──
  test('slider (3 slides): renderea los 3 en el track + flechas + 3 puntos + data-franja + role region', async () => {
    const html = await render({ slides: [{ imagenes: [IMG()] }, { imagenes: [IMG(), IMG()] }, { imagenes: [IMG()] }] });
    expect((html.match(/class="franja__slide"/g) || []).length).toBe(3);   // los 3 slides
    expect((html.match(/class="franja__cell"/g) || []).length).toBe(4);    // 1 + 2 + 1 imagenes
    expect(html).toContain('franja--slider');
    expect(html).toContain('data-franja');
    expect(html).toContain('franja__arrow--prev');
    expect(html).toContain('franja__arrow--next');
    expect((html.match(/class="franja__dot"/g) || []).length).toBe(3);     // 3 puntos
    expect(html).toContain('role="region"');                               // track accesible
  });

  test('slider: data-autorotar + data-intervalo reflejan los props (default intervalo 5)', async () => {
    const on = await render({ slides: [{ imagenes: [IMG()] }, { imagenes: [IMG()] }], autorotar: true, intervalo_seg: 7 });
    expect(on).toContain('data-autorotar="1"');
    expect(on).toContain('data-intervalo="7"');
    const off = await render({ slides: [{ imagenes: [IMG()] }, { imagenes: [IMG()] }], autorotar: false });
    expect(off).toContain('data-autorotar="0"');
    expect(off).toContain('data-intervalo="5"');
  });

  test('1 slide: NO es slider (sin franja--slider, sin data-franja, sin flechas/puntos)', async () => {
    const html = await render({ slides: [{ imagenes: [IMG(), IMG()] }] });
    expect(html).not.toContain('franja--slider');
    expect(html).not.toContain('data-franja');
    expect(html).not.toContain('franja__arrow');
    expect(html).not.toContain('franja__dot');
  });

  test('plantilla-agnostico: fashion_bold produce la misma estructura', async () => {
    const a = await render({ slides: [{ imagenes: [IMG(OV)] }] }, 'industrial_clean');
    const b = await render({ slides: [{ imagenes: [IMG(OV)] }] }, 'fashion_bold');
    expect(b).toBe(a);
  });
});
