// AIMMA Fase A.2 · Golden de identidad visual · GALERIA.
// Guard permanente: render del unificado == snapshot committeado (ver productos.golden.test.ts).
// Cobertura: 4 plantillas x 4 combos de gap (tight/normal/loose/default), con 5 imagenes
// (ejercita el "Pieza NN" de editorial_magazine + el grid de cada plantilla). Regenerar: vitest -u.

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';

import Galeria from '../src/components/blocks/galeria/Galeria.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

const IMAGENES = [
  { src: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/g1.jpg', alt: 'Imagen uno' },
  { src: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/g2.jpg', alt: 'Imagen dos' },
  { src: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/g3.jpg', alt: 'Imagen tres' },
  { src: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/g4.jpg', alt: 'Imagen cuatro' },
  { src: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/g5.jpg', alt: 'Imagen cinco' },
];

const COMBOS = [
  { label: 'gap-tight', gap: 'tight' },
  { label: 'gap-normal', gap: 'normal' },
  { label: 'gap-loose', gap: 'loose' },
  { label: 'gap-default', gap: undefined },
];

describe('Galeria unificado == snapshot', () => {
  for (const slug of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${slug} · ${combo.label}`, async () => {
        const section = makeSection('galeria', {
          imagenes: IMAGENES,
          layout: 'grid',
          gap: combo.gap,
        });
        const tienda = makeTienda(slug);

        const html = await renderNormalized(Galeria, section, tienda, []);

        await expect(html).toMatchFileSnapshot(
          fileURLToPath(new URL(`./__snapshots__/galeria/${slug}__${combo.label}.html`, import.meta.url))
        );
      });
    }
  }
});
