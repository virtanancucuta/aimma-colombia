// B-secciones Lote 2 · Golden · LOGOS. Render PUBLICO == snapshot. Regenerar: vitest -u.
import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Logos from '../src/components/blocks/logos/Logos.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];
const LOGO = 'https://rsmxklkxqsaptchcjszd.supabase.co/img/logo.png';
const COMBOS = [
  { label: 'grilla-link', props: { titulo: 'Marcas que confian', layout: 'grilla', items: [{ logo: LOGO, alt: 'Marca 1', link: 'https://m1.co' }, { logo: LOGO, alt: 'Marca 2', link: '/interno' }, { logo: LOGO, alt: 'Marca 3' }] } },
  { label: 'tira-sin-link', props: { layout: 'tira', items: [{ logo: LOGO, alt: 'Marca 1' }, { logo: LOGO, alt: 'Marca 2' }, { logo: LOGO, alt: 'Marca 3' }, { logo: LOGO, alt: 'Marca 4' }] } },
];

describe('Logos unificado == snapshot', () => {
  for (const slug of TEMPLATES) for (const combo of COMBOS) {
    test(`${slug} · ${combo.label}`, async () => {
      const html = await renderNormalized(Logos, makeSection('logos', combo.props), makeTienda(slug), []);
      await expect(html).toMatchFileSnapshot(fileURLToPath(new URL(`./__snapshots__/logos/${slug}__${combo.label}.html`, import.meta.url)));
    });
  }
});
