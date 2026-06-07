// C.2 Paso 2 — marcadores data-field: presentes en PREVIEW, ausentes en PUBLICO + paridad de marcador
// (refinamiento A: el nodo marcado es byte-identico solo-vs-en-pagina -> render-fragment self-marca igual
// que el render inicial, ambos isPreview=true).
import { test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import BlockRenderer from '~/components/BlockRenderer.astro';
import { stubSupabase, makeTienda, normalize } from './helpers/render-harness';

const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');

async function render(sections: any[], isPreview: boolean): Promise<string> {
  const container = await AstroContainer.create();
  const html = await container.renderToString(BlockRenderer, {
    props: { sections },
    locals: { tienda: makeTienda('industrial_clean'), supabase: stubSupabase([]), tiendaSlug: 'aimma-test', isPreview } as any,
    request: REQUEST,
  });
  return normalize(html);
}
function extractNode(html: string, sectionId: string): string | null {
  const re = new RegExp('<section[^>]*data-section-id="' + sectionId + '"[\\s\\S]*?</section>');
  const m = html.match(re);
  return m ? m[0] : null;
}

const BANNER = { id: 'sec_bn0001', tipo: 'banner', padding: 'md', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, props: { titulo: 'Hola mundo', alineacion: 'left' } };
const ESP = { id: 'sec_esp001', tipo: 'espacio', padding: 'md', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, props: { altura: 'md' } };

test('data-field presente en PREVIEW, ausente en PUBLICO', async () => {
  const prev = await render([BANNER], true);
  const pub = await render([BANNER], false);
  expect(prev).toContain('data-field="titulo"');
  expect(pub).not.toContain('data-field');
});

test('paridad PREVIEW: el nodo marcado es byte-identico solo vs en-pagina (== render-fragment)', async () => {
  const alone = extractNode(await render([BANNER], true), BANNER.id);
  const inPage = extractNode(await render([ESP, BANNER, ESP], true), BANNER.id);
  expect(alone, 'no se encontro el nodo banner').toBeTruthy();
  expect(alone).toContain('data-field="titulo"');
  expect(alone).toBe(inPage); // byte-identico incl. marcador -> index-preview == render-fragment
});
