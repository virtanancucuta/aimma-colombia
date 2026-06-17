// AIMMA Fase C.2 Paso 1 — PreviewChrome (chrome de seleccion, SOLO preview).
// El chrome es comportamiento runtime (postMessage->overlay) en un is:inline -> NO es importable
// como modulo; el test SSR verifica el CONTRATO de seguridad presente en el script renderizado.
// El gating real (ausente en publico) lo prueba el byte-compare publico en el deploy (A4.2);
// el comportamiento runtime (dibujar/limpiar/limite/escape) lo prueba Playwright chromium-real (C1).
import { test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import PreviewChrome from '~/components/PreviewChrome.astro';

async function render(): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(PreviewChrome, {
    request: new Request('https://aimma-test.tienda.aimma.com.co/?preview=tok'),
  });
}

test('PreviewChrome: contrato del bridge de seleccion presente', async () => {
  const html = await render();
  // receptor set-selection (admin->iframe) + emision section-action (iframe->admin)
  expect(html).toContain('set-selection');
  expect(html).toContain('section-action');
  // overlay marker + pointer-events (outline pasa clicks/scroll a la seccion)
  expect(html).toContain('data-ed-chrome');
  expect(html).toContain('pointer-events');
  // origin validado (ambos sentidos usan ADMIN_ORIGIN)
  expect(html).toContain('aimma.com.co');
  // label via textContent (nunca innerHTML para el label -> no inyecta markup)
  expect(html).toContain('textContent');
  // sectionId validado por regex
  expect(html).toMatch(/sec_\[a-z0-9\]/);
});

test('PreviewChrome: las 4 acciones estructurales presentes', async () => {
  const html = await render();
  for (const a of ["'up'", "'down'", "'duplicate'", "'remove'"]) {
    expect(html).toContain(a);
  }
});

// Condicion #2: secciones full-bleed (franja width:100vw) desbordan su wrapper content-width;
// el chrome debe anclarse al hijo [data-fullbleed] (la banda real) y no al wrapper. Contrato a
// nivel source (el dibujo runtime left:0/width:viewport lo prueba Playwright). Cierra que el rect
// para posicionar el recuadro consulte data-fullbleed.
test('PreviewChrome: ancla el recuadro al hijo [data-fullbleed] si existe (condicion #2)', async () => {
  const html = await render();
  expect(html).toContain('data-fullbleed');
  // el rect que posiciona el recuadro sale de (fb || el), no solo del wrapper.
  expect(html).toMatch(/\(fb\s*\|\|\s*el\)\.getBoundingClientRect\(\)/);
});
