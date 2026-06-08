// AIMMA B-secciones Lote 3 · Golden de identidad visual · PRODUCTO_DESTACADO.
// Renderer UNIFICADO (4 plantillas) que REFERENCIA un producto -> el harness stubea
// getProductoPorId via stubSupabase(rows).maybeSingle. Cobertura: 4 plantillas x 2 combos
// (publico, 0 data-field). Mas el empty-guard: publico sin producto -> nada; preview -> hint.
// Regenerar (cambios intencionales): vitest -u.

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  renderNormalized, makeProductoDestacadoSection, makeTienda, PRODUCTO_DESTACADO_FIXTURE,
} from './helpers/render-harness.ts';

import ProductoDestacado from '../src/components/blocks/producto_destacado/ProductoDestacado.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];
const COMBOS = [
  { label: 'completo', titulo: 'Lo mas vendido', texto: 'El favorito de la temporada.\nEnvio a todo el pais.', cta_texto: 'Comprar ahora' },
  { label: 'minimo' },
];

describe('ProductoDestacado unificado == snapshot (publico)', () => {
  for (const slug of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${slug} · ${combo.label}`, async () => {
        const section = makeProductoDestacadoSection({ producto_id: 'pd01', titulo: combo.titulo, texto: combo.texto, cta_texto: combo.cta_texto });
        const html = await renderNormalized(ProductoDestacado, section, makeTienda(slug), PRODUCTO_DESTACADO_FIXTURE);
        expect(html).not.toContain('data-field'); // publico limpio
        await expect(html).toMatchFileSnapshot(
          fileURLToPath(new URL(`./__snapshots__/producto_destacado/${slug}__${combo.label}.html`, import.meta.url))
        );
      });
    }
  }
});

describe('ProductoDestacado empty-guard (publico vs preview)', () => {
  const sentinelSection = () => makeProductoDestacadoSection({ producto_id: '00000000-0000-0000-0000-000000000000' });

  test('publico + producto no resuelto -> no renderiza nada (sin marco / sin data-section-id)', async () => {
    const html = await renderNormalized(ProductoDestacado, sentinelSection(), makeTienda('industrial_clean'), []);
    expect(html.trim()).toBe('');
    expect(html).not.toContain('data-section-id');
  });

  test('preview + producto no resuelto -> SI renderiza SectionShell (seleccionable) + hint', async () => {
    const html = await renderNormalized(ProductoDestacado, sentinelSection(), makeTienda('industrial_clean'), [], { isPreview: true });
    expect(html).toContain('data-section-id');
    expect(html).toContain('Eleg'); // hint "Elegí un producto para destacar."
  });
});
