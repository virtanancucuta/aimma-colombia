// AIMMA B-secciones Lote 3 · Golden de identidad visual · CATEGORIAS_DESTACADAS.
// Renderer UNIFICADO (4 plantillas) que REFERENCIA datos vivos -> el harness stubea
// getCategoriasPorIds via stubSupabase(rows). Cobertura: 4 plantillas x 3 combos (publico,
// 0 data-field). Mas el empty-guard: publico sin datos -> nada; preview -> SectionShell + hint.
// Regenerar (cambios intencionales): vitest -u.

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  renderNormalized, makeCategoriasDestacadasSection, makeTienda, CATEGORIAS_FIXTURE,
} from './helpers/render-harness.ts';

import CategoriasDestacadas from '../src/components/blocks/categorias_destacadas/CategoriasDestacadas.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];
const COMBOS = [
  { label: 'titulo-col3', titulo: 'Explora por categoria', columnas: 3 as const, ids: ['cat01', 'cat02', 'cat03'] },
  { label: 'sintitulo-col2', columnas: 2 as const, ids: ['cat01', 'cat02'] },
  { label: 'col4', titulo: 'Categorias', columnas: 4 as const, ids: ['cat01', 'cat02', 'cat03', 'cat04'] },
];

describe('CategoriasDestacadas unificado == snapshot (publico)', () => {
  for (const slug of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${slug} · ${combo.label}`, async () => {
        const section = makeCategoriasDestacadasSection({ columnas: combo.columnas, titulo: combo.titulo, ids: combo.ids });
        const html = await renderNormalized(CategoriasDestacadas, section, makeTienda(slug), CATEGORIAS_FIXTURE);
        expect(html).not.toContain('data-field'); // publico limpio (data-field SOLO en preview)
        await expect(html).toMatchFileSnapshot(
          fileURLToPath(new URL(`./__snapshots__/categorias_destacadas/${slug}__${combo.label}.html`, import.meta.url))
        );
      });
    }
  }
});

describe('CategoriasDestacadas empty-guard (publico vs preview)', () => {
  const sentinelSection = () => makeCategoriasDestacadasSection({ columnas: 3, ids: ['00000000-0000-0000-0000-000000000000'] });

  test('publico + 0 referencias resueltas -> no renderiza nada (sin marco / sin data-section-id)', async () => {
    const html = await renderNormalized(CategoriasDestacadas, sentinelSection(), makeTienda('industrial_clean'), []);
    expect(html.trim()).toBe('');
    expect(html).not.toContain('data-section-id');
  });

  test('preview + 0 referencias -> SI renderiza SectionShell (seleccionable) + hint', async () => {
    const html = await renderNormalized(CategoriasDestacadas, sentinelSection(), makeTienda('industrial_clean'), [], { isPreview: true });
    expect(html).toContain('data-section-id');
    expect(html).toContain('Agreg'); // hint "Agregá categorías para destacarlas."
  });
});
