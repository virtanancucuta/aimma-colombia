// B-secciones Lote 1 · Golden · CARACTERISTICAS. Render PUBLICO == snapshot. Regenerar: vitest -u.
import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Caracteristicas from '../src/components/blocks/caracteristicas/Caracteristicas.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];
const ITEMS = [
  { icono: 'envio', titulo: 'Envio gratis', texto: 'A todo el pais.' },
  { icono: 'garantia', titulo: 'Garantia', texto: 'Productos con garantia.' },
  { icono: 'pago', titulo: 'Pago seguro' },
  { icono: 'devoluciones', titulo: 'Devoluciones', texto: '30 dias.' },
];
const COMBOS = [
  { label: 'col3-titulo', props: { titulo: 'Por que elegirnos', columnas: 3, items: ITEMS.slice(0, 3) } },
  { label: 'col2-sintitulo', props: { columnas: 2, items: ITEMS.slice(0, 2) } },
  { label: 'col4', props: { titulo: 'Beneficios', columnas: 4, items: ITEMS } },
];

describe('Caracteristicas unificado == snapshot', () => {
  for (const slug of TEMPLATES) for (const combo of COMBOS) {
    test(`${slug} · ${combo.label}`, async () => {
      const html = await renderNormalized(Caracteristicas, makeSection('caracteristicas', combo.props), makeTienda(slug), []);
      await expect(html).toMatchFileSnapshot(fileURLToPath(new URL(`./__snapshots__/caracteristicas/${slug}__${combo.label}.html`, import.meta.url)));
    });
  }
});
