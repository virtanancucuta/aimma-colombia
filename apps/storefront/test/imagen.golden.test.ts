// AIMMA Fase A.2 · Golden de identidad visual · IMAGEN (lote).
// Imagen unificado == per-template viejo, byte-a-byte (hash + source-* normalizados).
// Cobertura: 4 plantillas x 5 combos (link on/off, objeto cover/contain, aspect_ratio
// on/off, alt presente/vacio -> figcaption de editorial_magazine on/off).

import { describe, test, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';

import ImagenIC from '../src/components/blocks/imagen/ImagenIndustrialClean.astro';
import ImagenFB from '../src/components/blocks/imagen/ImagenFashionBold.astro';
import ImagenMA from '../src/components/blocks/imagen/ImagenMinimalArtesanal.astro';
import ImagenEM from '../src/components/blocks/imagen/ImagenEditorialMagazine.astro';
import Imagen from '../src/components/blocks/imagen/Imagen.astro';

const TEMPLATES = [
  { slug: 'industrial_clean', old: ImagenIC },
  { slug: 'fashion_bold', old: ImagenFB },
  { slug: 'minimal_artesanal', old: ImagenMA },
  { slug: 'editorial_magazine', old: ImagenEM },
];

const SRC = 'https://rsmxklkxqsaptchcjszd.supabase.co/img/hero.jpg';

const COMBOS = [
  { label: 'cover-noratio-nolink', objeto: 'cover', aspect_ratio: null, link_url: null, alt: 'Foto de producto' },
  { label: 'contain-ratio-nolink', objeto: 'contain', aspect_ratio: '16/9', link_url: null, alt: 'Foto de producto' },
  { label: 'cover-ratio-link', objeto: 'cover', aspect_ratio: '4/3', link_url: 'https://example.com/x', alt: 'Foto de producto' },
  { label: 'contain-noratio-link', objeto: 'contain', aspect_ratio: null, link_url: 'https://example.com/y', alt: 'Foto de producto' },
  { label: 'altvacio', objeto: 'cover', aspect_ratio: null, link_url: null, alt: '' },
];

const OUT_DIR = fileURLToPath(new URL('./__golden__/imagen/', import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

describe('Imagen unificado == per-template (byte-identico)', () => {
  for (const t of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${t.slug} · ${combo.label}`, async () => {
        const section = makeSection('imagen', {
          src: SRC,
          alt: combo.alt,
          objeto: combo.objeto,
          aspect_ratio: combo.aspect_ratio,
          link_url: combo.link_url,
        });
        const tienda = makeTienda(t.slug);

        const oldHtml = await renderNormalized(t.old, section, tienda, []);
        const newHtml = await renderNormalized(Imagen, section, tienda, []);

        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.OLD.html`, oldHtml, 'utf8');
        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.NEW.html`, newHtml, 'utf8');

        expect(newHtml).toBe(oldHtml);
      });
    }
  }
});

test('estilos: Imagen unificado lleva los 4 <style> per-template VERBATIM', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const styleInner = (src: string) => {
    const m = src.match(/<style>([\s\S]*?)<\/style>/);
    return m ? m[1] : '__NO_STYLE__';
  };
  const unified = styleInner(read('../src/components/blocks/imagen/Imagen.astro'));
  const originals: Record<string, string> = {
    industrial_clean: read('../src/components/blocks/imagen/ImagenIndustrialClean.astro'),
    fashion_bold: read('../src/components/blocks/imagen/ImagenFashionBold.astro'),
    minimal_artesanal: read('../src/components/blocks/imagen/ImagenMinimalArtesanal.astro'),
    editorial_magazine: read('../src/components/blocks/imagen/ImagenEditorialMagazine.astro'),
  };
  for (const [slug, src] of Object.entries(originals)) {
    const inner = styleInner(src).trim();
    expect(unified.includes(inner), `falta el <style> de ${slug} VERBATIM en Imagen.astro`).toBe(true);
  }
});
