// AIMMA Fase A.2 · Golden de identidad visual · TEXTO.
// Guard permanente: render del unificado == snapshot committeado (ver productos.golden.test.ts).
// Cobertura: 4 plantillas x 8 combos (tamanios sm/md/lg/xl x alineaciones; cubre el
// dropcap de editorial_magazine en md/sm + left). Regenerar: vitest -u.

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';

import Texto from '../src/components/blocks/texto/Texto.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

const CONTENIDO = 'Lorem ipsum dolor sit amet, consectetur adipiscing.\nSegunda linea editorial de prueba.';

const COMBOS = [
  { label: 'sm-left', tamanio: 'sm', alineacion: 'left' },
  { label: 'md-left', tamanio: 'md', alineacion: 'left' },
  { label: 'lg-left', tamanio: 'lg', alineacion: 'left' },
  { label: 'xl-left', tamanio: 'xl', alineacion: 'left' },
  { label: 'md-center', tamanio: 'md', alineacion: 'center' },
  { label: 'md-right', tamanio: 'md', alineacion: 'right' },
  { label: 'lg-center', tamanio: 'lg', alineacion: 'center' },
  { label: 'xl-right', tamanio: 'xl', alineacion: 'right' },
];

describe('Texto unificado == snapshot', () => {
  for (const slug of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${slug} · ${combo.label}`, async () => {
        const section = makeSection('texto', {
          contenido: CONTENIDO,
          alineacion: combo.alineacion,
          tamanio: combo.tamanio,
        });
        const tienda = makeTienda(slug);

        const html = await renderNormalized(Texto, section, tienda, []);

        await expect(html).toMatchFileSnapshot(
          fileURLToPath(new URL(`./__snapshots__/texto/${slug}__${combo.label}.html`, import.meta.url))
        );
      });
    }
  }
});

const CONTENIDO_HTML =
  '<b>Negrita</b> y <a href="https://aimma.com.co">enlace</a>.<ul><li>Punto uno</li><li>Punto dos</li></ul>';

describe('Texto rich-text (set:html) == snapshot', () => {
  for (const slug of TEMPLATES) {
    test(`${slug} · html-md-left`, async () => {
      const section = makeSection('texto', {
        contenido: CONTENIDO_HTML,
        alineacion: 'left',
        tamanio: 'md',
      });
      const tienda = makeTienda(slug);
      const html = await renderNormalized(Texto, section, tienda, []);
      await expect(html).toMatchFileSnapshot(
        fileURLToPath(new URL(`./__snapshots__/texto/${slug}__html-md-left.html`, import.meta.url))
      );
    });
  }
});
