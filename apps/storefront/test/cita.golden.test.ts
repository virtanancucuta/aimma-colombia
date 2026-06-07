// B-secciones Lote 1 · Golden · CITA. Render PUBLICO == snapshot. Regenerar: vitest -u.
import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Cita from '../src/components/blocks/cita/Cita.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];
const COMBOS = [
  { label: 'center-autor', props: { texto: 'Una frase que inspira a todos los clientes.', autor: 'Jorge V.', alineacion: 'center' } },
  { label: 'left-sinautor', props: { texto: 'Solo la frase, sin autor.', alineacion: 'left' } },
  { label: 'right-autor', props: { texto: 'Otra cita destacada de la marca.', autor: 'Cliente feliz', alineacion: 'right' } },
];

describe('Cita unificado == snapshot', () => {
  for (const slug of TEMPLATES) for (const combo of COMBOS) {
    test(`${slug} · ${combo.label}`, async () => {
      const html = await renderNormalized(Cita, makeSection('cita', combo.props), makeTienda(slug), []);
      await expect(html).toMatchFileSnapshot(fileURLToPath(new URL(`./__snapshots__/cita/${slug}__${combo.label}.html`, import.meta.url)));
    });
  }
});
