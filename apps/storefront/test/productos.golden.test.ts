// AIMMA Fase A.2 · Golden de identidad visual · PRODUCTOS.
// Guard PERMANENTE de regresion: render del renderer UNIFICADO == snapshot committeado.
// Los snapshots (test/__snapshots__/productos/*.html) se capturaron del output del
// unificado, que era byte-identico al per-template viejo (suite 113/113 verde) y al
// LIVE. Normalizado: hash data-astro-cid + anotaciones dev data-astro-source-* fuera.
// Cobertura: 4 plantillas x 6 combos. Regenerar (cambios intencionales): vitest -u.

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  renderNormalized, makeProductosSection, makeTienda,
  PRODUCTOS_FIXTURE, PRODUCTOS_HOVER_FIXTURE, COMBOS,
} from './helpers/render-harness.ts';

import Productos from '../src/components/blocks/productos/Productos.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

describe('Productos unificado == snapshot', () => {
  for (const slug of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${slug} · ${combo.label}`, async () => {
        const section = makeProductosSection({ columnas: combo.columnas, mostrar_precio: combo.mostrar_precio });
        const tienda = makeTienda(slug);
        const rows = combo.empty ? [] : PRODUCTOS_FIXTURE;

        const html = await renderNormalized(Productos, section, tienda, rows);

        await expect(html).toMatchFileSnapshot(
          fileURLToPath(new URL(`./__snapshots__/productos/${slug}__${combo.label}.html`, import.meta.url))
        );
      });
    }
  }
});

// Fase A: golden del swap al hover. h01 (con galeria) -> 2a imagen overlay; h02 (sin) -> sin overlay.
// hover-on: toggle por defecto (ON). hover-off: tienda con hover_segunda_foto=false -> ninguna card
// renderiza la 2a imagen (markup sin overlay, identico al sin-galeria).
describe('Productos · segunda foto al hover == snapshot', () => {
  for (const slug of TEMPLATES) {
    for (const variante of [
      { label: 'hover-on', hoverOff: false },
      { label: 'hover-off', hoverOff: true },
    ]) {
      test(`${slug} · ${variante.label}`, async () => {
        const section = makeProductosSection({ columnas: 'auto', mostrar_precio: true });
        const tienda = makeTienda(slug, variante.hoverOff ? { hoverSegundaFoto: false } : {});
        const html = await renderNormalized(Productos, section, tienda, PRODUCTOS_HOVER_FIXTURE);
        await expect(html).toMatchFileSnapshot(
          fileURLToPath(new URL(`./__snapshots__/productos/${slug}__${variante.label}.html`, import.meta.url))
        );
      });
    }
  }
});
