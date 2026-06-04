// AIMMA Fase A.2 · Golden de identidad visual · IMAGEN.
// Guard permanente: render del unificado == snapshot committeado (ver productos.golden.test.ts).
// Cobertura: 4 plantillas x 5 combos (link on/off, objeto cover/contain, aspect_ratio
// on/off, alt presente/vacio -> figcaption de editorial_magazine on/off). Regenerar: vitest -u.

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';

import Imagen from '../src/components/blocks/imagen/Imagen.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

const SRC = 'https://rsmxklkxqsaptchcjszd.supabase.co/img/hero.jpg';

const COMBOS = [
  { label: 'cover-noratio-nolink', objeto: 'cover', aspect_ratio: null, link_url: null, alt: 'Foto de producto' },
  { label: 'contain-ratio-nolink', objeto: 'contain', aspect_ratio: '16/9', link_url: null, alt: 'Foto de producto' },
  { label: 'cover-ratio-link', objeto: 'cover', aspect_ratio: '4/3', link_url: 'https://example.com/x', alt: 'Foto de producto' },
  { label: 'contain-noratio-link', objeto: 'contain', aspect_ratio: null, link_url: 'https://example.com/y', alt: 'Foto de producto' },
  { label: 'altvacio', objeto: 'cover', aspect_ratio: null, link_url: null, alt: '' },
];

describe('Imagen unificado == snapshot', () => {
  for (const slug of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${slug} · ${combo.label}`, async () => {
        const section = makeSection('imagen', {
          src: SRC,
          alt: combo.alt,
          objeto: combo.objeto,
          aspect_ratio: combo.aspect_ratio,
          link_url: combo.link_url,
        });
        const tienda = makeTienda(slug);

        const html = await renderNormalized(Imagen, section, tienda, []);

        await expect(html).toMatchFileSnapshot(
          fileURLToPath(new URL(`./__snapshots__/imagen/${slug}__${combo.label}.html`, import.meta.url))
        );
      });
    }
  }
});
