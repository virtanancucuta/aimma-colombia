// AIMMA Fase A.2 · Golden de identidad visual · TEXTO (lote).
// Texto unificado == per-template viejo, byte-a-byte (hash + source-* normalizados).
// Cobertura: 4 plantillas x 8 combos (tamanios sm/md/lg/xl x alineaciones), que
// cubren esDisplay (font), align, y el dropcap de editorial_magazine (md/sm + left).

import { describe, test, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';

import TextoIC from '../src/components/blocks/texto/TextoIndustrialClean.astro';
import TextoFB from '../src/components/blocks/texto/TextoFashionBold.astro';
import TextoMA from '../src/components/blocks/texto/TextoMinimalArtesanal.astro';
import TextoEM from '../src/components/blocks/texto/TextoEditorialMagazine.astro';
import Texto from '../src/components/blocks/texto/Texto.astro';

const TEMPLATES = [
  { slug: 'industrial_clean', old: TextoIC },
  { slug: 'fashion_bold', old: TextoFB },
  { slug: 'minimal_artesanal', old: TextoMA },
  { slug: 'editorial_magazine', old: TextoEM },
];

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

const OUT_DIR = fileURLToPath(new URL('./__golden__/texto/', import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

describe('Texto unificado == per-template (byte-identico)', () => {
  for (const t of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${t.slug} · ${combo.label}`, async () => {
        const section = makeSection('texto', {
          contenido: CONTENIDO,
          alineacion: combo.alineacion,
          tamanio: combo.tamanio,
        });
        const tienda = makeTienda(t.slug);

        const oldHtml = await renderNormalized(t.old, section, tienda, []);
        const newHtml = await renderNormalized(Texto, section, tienda, []);

        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.OLD.html`, oldHtml, 'utf8');
        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.NEW.html`, newHtml, 'utf8');

        expect(newHtml).toBe(oldHtml);
      });
    }
  }
});

test('estilos: Texto unificado lleva los 4 <style> per-template VERBATIM', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const styleInner = (src: string) => {
    const m = src.match(/<style>([\s\S]*?)<\/style>/);
    return m ? m[1] : '__NO_STYLE__';
  };
  const unified = styleInner(read('../src/components/blocks/texto/Texto.astro'));
  const originals: Record<string, string> = {
    industrial_clean: read('../src/components/blocks/texto/TextoIndustrialClean.astro'),
    fashion_bold: read('../src/components/blocks/texto/TextoFashionBold.astro'),
    minimal_artesanal: read('../src/components/blocks/texto/TextoMinimalArtesanal.astro'),
    editorial_magazine: read('../src/components/blocks/texto/TextoEditorialMagazine.astro'),
  };
  for (const [slug, src] of Object.entries(originals)) {
    const inner = styleInner(src).trim();
    expect(unified.includes(inner), `falta el <style> de ${slug} VERBATIM en Texto.astro`).toBe(true);
  }
});
