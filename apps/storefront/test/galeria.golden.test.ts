// AIMMA Fase A.2 · Golden de identidad visual · GALERIA (lote).
// Galeria unificado == per-template viejo, byte-a-byte (hash + source-* normalizados).
// Cobertura: 4 plantillas x 4 combos de gap (tight/normal/loose/default), con 5
// imagenes (ejercita el "Pieza NN" de editorial_magazine + el grid de cada plantilla).

import { describe, test, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';

import GaleriaIC from '../src/components/blocks/galeria/GaleriaIndustrialClean.astro';
import GaleriaFB from '../src/components/blocks/galeria/GaleriaFashionBold.astro';
import GaleriaMA from '../src/components/blocks/galeria/GaleriaMinimalArtesanal.astro';
import GaleriaEM from '../src/components/blocks/galeria/GaleriaEditorialMagazine.astro';
import Galeria from '../src/components/blocks/galeria/Galeria.astro';

const TEMPLATES = [
  { slug: 'industrial_clean', old: GaleriaIC },
  { slug: 'fashion_bold', old: GaleriaFB },
  { slug: 'minimal_artesanal', old: GaleriaMA },
  { slug: 'editorial_magazine', old: GaleriaEM },
];

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

const OUT_DIR = fileURLToPath(new URL('./__golden__/galeria/', import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

describe('Galeria unificado == per-template (byte-identico)', () => {
  for (const t of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${t.slug} · ${combo.label}`, async () => {
        const section = makeSection('galeria', {
          imagenes: IMAGENES,
          layout: 'grid',
          gap: combo.gap,
        });
        const tienda = makeTienda(t.slug);

        const oldHtml = await renderNormalized(t.old, section, tienda, []);
        const newHtml = await renderNormalized(Galeria, section, tienda, []);

        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.OLD.html`, oldHtml, 'utf8');
        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.NEW.html`, newHtml, 'utf8');

        expect(newHtml).toBe(oldHtml);
      });
    }
  }
});

test('estilos: Galeria unificado lleva los 4 <style> per-template VERBATIM', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const styleInner = (src: string) => {
    const m = src.match(/<style>([\s\S]*?)<\/style>/);
    return m ? m[1] : '__NO_STYLE__';
  };
  const unified = styleInner(read('../src/components/blocks/galeria/Galeria.astro'));
  const originals: Record<string, string> = {
    industrial_clean: read('../src/components/blocks/galeria/GaleriaIndustrialClean.astro'),
    fashion_bold: read('../src/components/blocks/galeria/GaleriaFashionBold.astro'),
    minimal_artesanal: read('../src/components/blocks/galeria/GaleriaMinimalArtesanal.astro'),
    editorial_magazine: read('../src/components/blocks/galeria/GaleriaEditorialMagazine.astro'),
  };
  for (const [slug, src] of Object.entries(originals)) {
    const inner = styleInner(src).trim();
    expect(unified.includes(inner), `falta el <style> de ${slug} VERBATIM en Galeria.astro`).toBe(true);
  }
});
