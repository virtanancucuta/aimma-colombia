// AIMMA Fase C Task 3 — paridad render==pagina BYTE-LEVEL.
// El endpoint render-fragment renderiza <BlockRenderer sections={[section]}/>; la pagina renderiza
// <BlockRenderer sections={todas}/>. El nodo [data-section-id] de la seccion debe ser BYTE-IDENTICO
// en ambos (BlockRenderer renderiza cada seccion independiente -> posicion-independiente, chequeo §0).
// Cubre OBLIGATORIO una seccion estatica (texto) Y una de productos (path que carga catalogo).
import { test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import BlockRenderer from '~/components/BlockRenderer.astro';
import { stubSupabase, normalize, makeTienda, PRODUCTOS_FIXTURE } from './helpers/render-harness';

const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');

async function renderSections(sections: any[], rows: any[] = []): Promise<string> {
  const container = await AstroContainer.create();
  const html = await container.renderToString(BlockRenderer, {
    props: { sections },
    locals: { tienda: makeTienda('industrial_clean'), supabase: stubSupabase(rows), tiendaSlug: 'aimma-test' },
    request: REQUEST,
  });
  return normalize(html);
}

// Extrae el <section data-section-id="X">...</section> (mismo nodo que el admin extraera con DOMParser).
// Los blocks NO anidan <section> -> el non-greedy hasta el primer </section> captura el nodo entero.
function extractNode(html: string, sectionId: string): string | null {
  const re = new RegExp('<section[^>]*data-section-id="' + sectionId + '"[\\s\\S]*?</section>');
  const m = html.match(re);
  return m ? m[0] : null;
}

const O1 = { id: 'sec_o1aaaa', tipo: 'espacio', padding: 'md', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, props: { altura: 'md' } };
const O2 = { id: 'sec_o2bbbb', tipo: 'espacio', padding: 'lg', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' }, props: { altura: 'lg' } };

async function assertParity(target: any, rows: any[] = []) {
  const alone = extractNode(await renderSections([target], rows), target.id);
  const inPage = extractNode(await renderSections([O1, target, O2], rows), target.id);
  expect(alone, 'el nodo no se encontro en el render solo').toBeTruthy();
  expect(inPage, 'el nodo no se encontro en el render multi-seccion').toBeTruthy();
  expect(alone).toBe(inPage); // BYTE-IDENTICO
}

test('paridad: seccion estatica (texto) — nodo solo == nodo en pagina', async () => {
  const texto = {
    id: 'sec_txt001', tipo: 'texto', padding: 'md', ancho: 'contenido',
    fondo: { tipo: 'transparente', valor: '' },
    props: { contenido: '<b>hola</b> parrafo de prueba', alineacion: 'left', tamanio: 'md' },
  };
  await assertParity(texto);
});

test('paridad: seccion productos (fetch catalogo) — nodo solo == nodo en pagina', async () => {
  const productos = {
    id: 'sec_prd001', tipo: 'productos', padding: 'md', ancho: 'completo',
    fondo: { tipo: 'transparente', valor: '' },
    props: { categoria_id: null, limite: 24, orden: 'recientes', columnas: 'auto', mostrar_precio: true },
  };
  await assertParity(productos, PRODUCTOS_FIXTURE);
});
