// AIMMA Storefront · Buscador del header (Fase B Paso B) · toggle ON/OFF.
// Verifica que el header dibuja el SearchBar (data-hsearch) SOLO si mostrar_buscador_header !== false,
// en las 4 plantillas. Default (campo ausente) -> ON. Render via Container API con locals stubeados
// (sin tocar el cache KV live). El golden es host-less; este test cubre la condicion de gating.

import { describe, test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { stubSupabase } from './helpers/render-harness.ts';
import Header from '../src/components/Header.astro';

const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');
const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

async function renderHeader(plantillaSlug: string, flag: boolean | undefined) {
  const container = await AstroContainer.create();
  const tienda: any = {
    id: 'tienda-test', nombre_negocio: 'Tienda Test', logo_url: null,
    plantilla: { slug: plantillaSlug },
  };
  if (flag !== undefined) tienda.mostrar_buscador_header = flag;
  return container.renderToString(Header, {
    props: {},
    locals: { tienda, supabase: stubSupabase([]) } as any,
    request: REQUEST,
  });
}

describe('Header buscador toggle (mostrar_buscador_header)', () => {
  for (const slug of TEMPLATES) {
    test(`${slug}: ON (true) -> SearchBar presente`, async () => {
      const html = await renderHeader(slug, true);
      expect(html).toContain('data-hsearch');
      expect(html).toContain('action="/buscar"');
    });
    test(`${slug}: OFF (false) -> sin buscador en el header`, async () => {
      const html = await renderHeader(slug, false);
      expect(html).not.toContain('data-hsearch');
      expect(html).not.toContain('action="/buscar"');
    });
  }
  test('default (campo ausente) -> ON (muestra buscador)', async () => {
    const html = await renderHeader('industrial_clean', undefined);
    expect(html).toContain('data-hsearch');
  });
});
