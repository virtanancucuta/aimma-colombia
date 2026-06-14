// AIMMA Fase D · D2 · Golden de identidad visual + recursion del CONTENEDOR.
// Cubre las 4 plantillas x combos de columnas (1/2/3/4). El <style> NO sale en renderToString
// (Astro lo extrae) -> el snapshot captura la ESTRUCTURA HTML (grid + columnas + hijos anidados);
// el layout visual (incl. colapso mobile, puro CSS) se valida aparte por screenshot. Los hijos
// se renderean via <BlockOne> -> byte-identicos a su version standalone. Regenerar: vitest -u.

import { describe, test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { fileURLToPath } from 'node:url';
import Contenedor from '../src/components/blocks/contenedor/Contenedor.astro';
import BlockRenderer from '~/components/BlockRenderer.astro';
import { renderNormalized, makeTienda, stubSupabase, normalize } from './helpers/render-harness.ts';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];
const TRANSP = { tipo: 'transparente', valor: '' };

const hijo = (id: string, tipo: string, columna: number, props: any) =>
  ({ id, tipo, ancho: 'contenido', fondo: TRANSP, padding: 'md', columna, props });

const TXT = (id: string, col: number) => hijo(id, 'texto', col, { contenido: 'Parrafo de prueba.', alineacion: 'left', tamanio: 'md' });
const CITA = (id: string, col: number) => hijo(id, 'cita', col, { texto: 'Una frase.', alineacion: 'center' });
const IMG = (id: string, col: number) => hijo(id, 'imagen', col, { src: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/x.jpg', alt: 'Imagen', objeto: 'cover' });
const BTN = (id: string, col: number) => hijo(id, 'botones', col, { items: [{ texto: 'WhatsApp', url: 'https://wa.me/57300', estilo_visual: 'primary', target: '_blank', icono: 'whatsapp' }] });
const ESP = (id: string, col: number) => hijo(id, 'espacio', col, { altura: 'md' });

const makeContenedor = (columnas: 1 | 2 | 3 | 4, bloques: any[], gap = 'normal', alineacion = 'start') =>
  ({ id: 'sec_cont01', tipo: 'contenedor', ancho: 'completo', fondo: TRANSP, padding: 'md',
     props: { columnas, gap, alineacion_vertical: alineacion, bloques } });

const COMBOS = [
  { label: '1col', section: makeContenedor(1, [TXT('sec_h00001', 0), CITA('sec_h00002', 0)]) },
  { label: '2col', section: makeContenedor(2, [TXT('sec_h00001', 0), IMG('sec_h00002', 1)]) },
  { label: '3col', section: makeContenedor(3, [TXT('sec_h00001', 0), CITA('sec_h00002', 1), BTN('sec_h00003', 2)]) },
  { label: '4col', section: makeContenedor(4, [TXT('sec_h00001', 0), IMG('sec_h00002', 1), CITA('sec_h00003', 2), ESP('sec_h00004', 3)]) },
];

describe('Contenedor ×4 == snapshot (estructura grid + hijos anidados)', () => {
  for (const slug of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${slug} · ${combo.label}`, async () => {
        const html = await renderNormalized(Contenedor, combo.section, makeTienda(slug), []);
        await expect(html).toMatchFileSnapshot(
          fileURLToPath(new URL(`./__snapshots__/contenedor/${slug}__${combo.label}.html`, import.meta.url))
        );
      });
    }
  }
});

// ---- Recursion: BlockRenderer([contenedor]) == lo que renderiza render-fragment.astro ----
// El nodo del contenedor debe SALIR con sus hijos anidados adentro (grid > col > <section hijo>).
const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');
async function renderViaBlockRenderer(sections: any[]): Promise<string> {
  const container = await AstroContainer.create();
  const html = await container.renderToString(BlockRenderer, {
    props: { sections },
    locals: { tienda: makeTienda('industrial_clean'), supabase: stubSupabase([]), tiendaSlug: 'aimma-test' } as any,
    request: REQUEST,
  });
  return normalize(html);
}

test('recursion: BlockRenderer([contenedor]) saca el contenedor CON sus hijos anidados (= render-fragment)', async () => {
  const cont = makeContenedor(2, [TXT('sec_h00001', 0), CITA('sec_h00002', 1)]);
  const html = await renderViaBlockRenderer([cont]);
  const iCont = html.indexOf('data-section-id="sec_cont01"');
  const iGrid = html.indexOf('ic-contenedor-grid');
  const iH1 = html.indexOf('data-section-id="sec_h00001"');
  const iH2 = html.indexOf('data-section-id="sec_h00002"');
  // contenedor presente, grid presente, ambos hijos presentes
  expect(iCont, 'falta el contenedor').toBeGreaterThanOrEqual(0);
  expect(iGrid, 'falta el grid del contenedor').toBeGreaterThan(iCont);
  expect(iH1, 'falta el hijo 1').toBeGreaterThan(iGrid);   // hijos DESPUES del grid (anidados)
  expect(iH2, 'falta el hijo 2').toBeGreaterThan(iGrid);
  // el contenedor envuelve a los hijos: su </section> de cierre va DESPUES del ultimo hijo
  expect(html.lastIndexOf('</section>')).toBeGreaterThan(Math.max(iH1, iH2));
  // los hijos son <section> propios (cada uno su data-section-tipo)
  expect(html).toContain('data-section-tipo="contenedor"');
  expect(html).toContain('data-section-tipo="texto"');
  expect(html).toContain('data-section-tipo="cita"');
});

test('recursion: columnas=1 apila todos los hijos en una columna', async () => {
  const cont = makeContenedor(1, [TXT('sec_h00001', 0), CITA('sec_h00002', 0), IMG('sec_h00003', 0)]);
  const html = await renderViaBlockRenderer([cont]);
  expect(html).toContain('ic-contenedor-grid--1');
  for (const id of ['sec_h00001', 'sec_h00002', 'sec_h00003']) {
    expect(html).toContain(`data-section-id="${id}"`);
  }
});
