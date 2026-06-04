// AIMMA Storefront · test de la rama contenido_html de legales/[tipo].astro.
// CONTEXTO: esta rama (pagina legal con contenido_html y SIN secciones) NUNCA se ejercia en CI
// -> el bug latente de DOMPurify (que crashea en el Worker) quedo sin atrapar. Tras migrar a
// sanitize-html, este test EJERCITA la rama: confirma que renderea sin crashear + sanitiza.
// NOTA: el Container API corre en Node (donde DOMPurify TAMBIEN funcionaba); la garantia del
// runtime real del Worker la da el re-spike de workerd. Este test asegura que la rama queda
// cubierta en CI y que sanitize-html neutraliza correctamente.

import { describe, test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Legales from '../src/pages/legales/[tipo].astro';

// Stub supabase universal: 'paginas_legales' devuelve la pagina; el resto (Header/Footer cargan
// categorias/productos) devuelve vacio. Soporta toda la cadena (select/eq/is/order/limit/.../then).
function stubLegales(pagina: any): any {
  return {
    from: (table: string) => {
      const rows = table === 'paginas_legales' ? pagina : [];
      const chain: any = {
        select: () => chain, eq: () => chain, is: () => chain, neq: () => chain,
        in: () => chain, not: () => chain, order: () => chain, limit: () => chain, range: () => chain,
        maybeSingle: async () => ({ data: table === 'paginas_legales' ? pagina : null, error: null }),
        single: async () => ({ data: table === 'paginas_legales' ? pagina : null, error: null }),
        then: (resolve: any) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
  };
}

const mockTienda: any = {
  id: 'tienda-uuid',
  nombre_negocio: 'Tienda Test',
  slug: 'aimma-test',
  logo_url: null,
  paleta: null,
  plantilla: { slug: 'industrial_clean' },
  telefono_contacto: null,
  email_contacto: null,
  direccion: null,
  ciudad_negocio: null,
  whatsapp: null,
  instagram_url: null,
  facebook_url: null,
};

describe('legales: rama contenido_html + sin secciones (la que crasheaba con DOMPurify)', () => {
  test('renderea + sanitiza el HTML legal con sanitize-html (no crashea, neutraliza la basura)', async () => {
    const container = await AstroContainer.create();
    const pagina = {
      titulo: 'Garantias',
      contenido_html:
        '<h2>Politica de garantias</h2><p>Texto <b>importante</b> con <a href="https://aimma.com.co">enlace</a>.</p>' +
        '<script>alert(1)</script><img src=x onerror=alert(2)><iframe src="https://evil"></iframe>',
      secciones: null,
      ultima_actualiz: '2026-01-01T00:00:00.000Z',
    };
    const html = await container.renderToString(Legales, {
      params: { tipo: 'garantias' },
      locals: { tienda: mockTienda, supabase: stubLegales(pagina) },
      request: new Request('https://aimma-test.tienda.aimma.com.co/legales/garantias'),
    });

    // La rama se ejercio sin crashear + el HTML legal seguro renderea:
    expect(html).toContain('Politica de garantias');
    expect(html).toContain('<b>importante</b>');
    expect(html).toContain('href="https://aimma.com.co"');
    // y la basura del contenido_html queda neutralizada (sanitize-html). NOTA: el PAGE tiene
    // <script> legitimos del Layout (ClientRouter + JSON-LD), por eso asertamos el PAYLOAD
    // especifico (alert(1)/alert(2)) y los vectores unicos del contenido malicioso:
    expect(html).not.toContain('alert(1)');   // <script> del contenido eliminado
    expect(html).not.toContain('alert(2)');   // onerror del <img> eliminado
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<iframe');
  });
});
