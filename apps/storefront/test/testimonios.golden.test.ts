// B-secciones Lote 2 · Golden · TESTIMONIOS. Render PUBLICO == snapshot. Regenerar: vitest -u.
import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Testimonios from '../src/components/blocks/testimonios/Testimonios.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];
const FOTO = 'https://rsmxklkxqsaptchcjszd.supabase.co/img/avatar.jpg';
const ITEMS = [
  { texto: 'Excelente atencion y productos de calidad.', autor: 'Maria Lopez', cargo: 'Cliente', foto: FOTO, rating: 5 },
  { texto: 'Envio rapido, todo tal cual la descripcion.', autor: 'Carlos Ruiz', cargo: 'Cliente', rating: 4 },
  { texto: 'Muy buena experiencia de compra.', autor: 'Ana Gomez' },
];
const COMBOS = [
  { label: 'col3-rating-foto', props: { titulo: 'Lo que dicen nuestros clientes', columnas: 3, items: ITEMS } },
  { label: 'col2-sin-rating', props: { columnas: 2, items: [{ texto: 'Resena sin estrellas.', autor: 'Pedro' }, { texto: 'Otra resena con cargo.', autor: 'Lucia', cargo: 'Compradora' }] } },
  { label: 'col1-min', props: { columnas: 1, items: [{ texto: 'Una sola resena minimal.', autor: 'Solo Autor' }] } },
];

describe('Testimonios unificado == snapshot', () => {
  for (const slug of TEMPLATES) for (const combo of COMBOS) {
    test(`${slug} · ${combo.label}`, async () => {
      const html = await renderNormalized(Testimonios, makeSection('testimonios', combo.props), makeTienda(slug), []);
      await expect(html).toMatchFileSnapshot(fileURLToPath(new URL(`./__snapshots__/testimonios/${slug}__${combo.label}.html`, import.meta.url)));
    });
  }
});
