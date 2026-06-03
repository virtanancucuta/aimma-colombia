// AIMMA Fase A.2 · Golden de identidad visual · PRODUCTOS (piloto).
// Asierta: renderer UNIFICADO (Productos.astro) == renderer per-template VIEJO,
// byte-a-byte, normalizando SOLO (hash data-astro-cid + anotaciones dev source-*).
// Cobertura: 4 plantillas x 6 combos (empty + columnas auto/2/3/4 + sin-precio).
// + check estatico: el unificado lleva los 4 <style> per-template VERBATIM.

import { describe, test, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  renderNormalized, makeProductosSection, makeTienda,
  PRODUCTOS_FIXTURE, COMBOS,
} from './helpers/render-harness.ts';

import ProductosIC from '../src/components/blocks/productos/ProductosIndustrialClean.astro';
import ProductosFB from '../src/components/blocks/productos/ProductosFashionBold.astro';
import ProductosMA from '../src/components/blocks/productos/ProductosMinimalArtesanal.astro';
import ProductosEM from '../src/components/blocks/productos/ProductosEditorialMagazine.astro';
import Productos from '../src/components/blocks/productos/Productos.astro';

const TEMPLATES = [
  { slug: 'industrial_clean', old: ProductosIC },
  { slug: 'fashion_bold', old: ProductosFB },
  { slug: 'minimal_artesanal', old: ProductosMA },
  { slug: 'editorial_magazine', old: ProductosEM },
];

const OUT_DIR = fileURLToPath(new URL('./__golden__/productos/', import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

describe('Productos unificado == per-template (byte-identico)', () => {
  for (const t of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${t.slug} · ${combo.label}`, async () => {
        const section = makeProductosSection({ columnas: combo.columnas, mostrar_precio: combo.mostrar_precio });
        const tienda = makeTienda(t.slug);
        const rows = combo.empty ? [] : PRODUCTOS_FIXTURE;

        const oldHtml = await renderNormalized(t.old, section, tienda, rows);
        const newHtml = await renderNormalized(Productos, section, tienda, rows);

        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.OLD.html`, oldHtml, 'utf8');
        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.NEW.html`, newHtml, 'utf8');

        expect(newHtml).toBe(oldHtml);
      });
    }
  }
});

test('estilos: el unificado lleva los 4 <style> per-template VERBATIM', () => {
  // Normaliza line endings (CRLF/LF no son CSS semantico; los .astro viejos son CRLF).
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const styleInner = (src: string) => {
    const m = src.match(/<style>([\s\S]*?)<\/style>/);
    return m ? m[1] : '__NO_STYLE__';
  };
  const unified = styleInner(read('../src/components/blocks/productos/Productos.astro'));
  const originals: Record<string, string> = {
    industrial_clean: read('../src/components/blocks/productos/ProductosIndustrialClean.astro'),
    fashion_bold: read('../src/components/blocks/productos/ProductosFashionBold.astro'),
    minimal_artesanal: read('../src/components/blocks/productos/ProductosMinimalArtesanal.astro'),
    editorial_magazine: read('../src/components/blocks/productos/ProductosEditorialMagazine.astro'),
  };
  for (const [slug, src] of Object.entries(originals)) {
    const inner = styleInner(src).trim();
    expect(unified.includes(inner), `falta el <style> de ${slug} VERBATIM en Productos.astro`).toBe(true);
  }
});
