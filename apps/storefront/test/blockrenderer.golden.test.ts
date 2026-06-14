// AIMMA Fase D · D2 · GUARD DURO del refactor a <BlockOne>.
// Los goldens por-tipo renderan el bloque DIRECTO (renderNormalized(Texto,...)) -> NO pasan por
// BlockRenderer. render-fragment-parity / preview-markers comparan alone-vs-in-page (verdes pase lo
// que pase). Ninguno prueba que el OUTPUT de BlockRenderer sea byte-identico tras extraer el despacho
// a <BlockOne>. Este snapshot SÍ: se genera ANTES de tocar BlockRenderer (codigo PRE-refactor) y debe
// matchear byte-a-byte despues. El despacho resuelve POR PLANTILLA (BLOCKS[tipo][plantilla]) -> ×4.
// Si UN snapshot cambia, la extraccion no fue byte-identica -> se corrige. Cero tolerancia.
// Regenerar (solo si cambia el contrato a proposito): vitest -u test/blockrenderer.golden.test.ts

import { describe, test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { fileURLToPath } from 'node:url';
import BlockRenderer from '~/components/BlockRenderer.astro';
import { stubSupabase, makeTienda, normalize, PRODUCTOS_FIXTURE } from './helpers/render-harness';

const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');
const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

// Pagina multi-tipo: cubre las 3 familias del despacho.
//  - BLOCKS[tipo][plantilla] (per-template, resuelve distinto por plantilla): banner, botones
//  - UNIFIED (1 renderer resuelve plantilla adentro): texto, imagen, cita, productos (fetch)
//  - agnostico (sin variante): espacio
const PAGE = [
  { id: 'sec_bn0001', tipo: 'banner', padding: 'lg', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' },
    props: { titulo: 'Bienvenido a la tienda', subtitulo: 'Una frase corta.', alineacion: 'left',
      boton: { texto: 'Ver productos', url: '#productos', estilo_visual: 'primary', target: '_self', icono: 'arrow' } } },
  { id: 'sec_tx0001', tipo: 'texto', padding: 'md', ancho: 'contenido', fondo: { tipo: 'transparente', valor: '' },
    props: { contenido: '<b>Hola</b> parrafo de prueba editorial.', alineacion: 'left', tamanio: 'md' } },
  { id: 'sec_im0001', tipo: 'imagen', padding: 'md', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' },
    props: { src: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/banner.jpg', alt: 'Imagen', objeto: 'cover' } },
  { id: 'sec_bt0001', tipo: 'botones', padding: 'md', ancho: 'contenido', fondo: { tipo: 'transparente', valor: '' },
    props: { items: [
      { texto: 'WhatsApp', url: 'https://wa.me/57300', estilo_visual: 'primary', target: '_blank', icono: 'whatsapp' },
      { texto: 'Ubicacion', url: 'https://maps.google.com', estilo_visual: 'secondary', target: '_blank', icono: 'location' },
    ] } },
  { id: 'sec_ct0001', tipo: 'cita', padding: 'xl', ancho: 'contenido', fondo: { tipo: 'transparente', valor: '' },
    props: { texto: 'Una frase que inspira.', autor: 'Cliente', alineacion: 'center' } },
  { id: 'sec_pr0001', tipo: 'productos', padding: 'md', ancho: 'completo', fondo: { tipo: 'transparente', valor: '' },
    props: { categoria_id: null, limite: 24, orden: 'recientes', columnas: 'auto', mostrar_precio: true } },
  { id: 'sec_sp0001', tipo: 'espacio', padding: 'sm', ancho: 'contenido', fondo: { tipo: 'transparente', valor: '' },
    props: { altura: 'md' } },
];

async function renderPage(slug: string): Promise<string> {
  const container = await AstroContainer.create();
  const html = await container.renderToString(BlockRenderer, {
    props: { sections: PAGE },
    locals: { tienda: makeTienda(slug), supabase: stubSupabase(PRODUCTOS_FIXTURE), tiendaSlug: 'aimma-test' } as any,
    request: REQUEST,
  });
  return normalize(html);
}

describe('BlockRenderer output byte-identico (guard del refactor a <BlockOne>) ×4', () => {
  for (const slug of TEMPLATES) {
    test(`pagina multi-tipo · ${slug}`, async () => {
      const html = await renderPage(slug);
      await expect(html).toMatchFileSnapshot(
        fileURLToPath(new URL(`./__snapshots__/blockrenderer/${slug}.html`, import.meta.url))
      );
    });
  }
});
