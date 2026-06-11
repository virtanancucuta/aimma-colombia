// AIMMA Fase F4 · Golden · ResenasPDP (seccion de reseñas del PDP, compartida x4).
// Cubre: render por plantilla con reseñas (promedio + lista + form) y sin reseñas
// ("Se el primero" + form). Guard de seguridad: el comentario con <script> se ESCAPA
// al render (auto-escape de Astro, sin sanitizer). La config del form (efUrl/anonKey
// dependen del env del Worker) se normaliza a un placeholder estable.
// Regenerar cambios intencionales: vitest -u.

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { normalize, makeTienda, stubSupabase } from './helpers/render-harness.ts';
import ResenasPDP from '../src/components/ResenasPDP.astro';

const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');

function norm(html: string): string {
  return normalize(html).replace(
    /(<script type="application\/json" data-resena-cfg[^>]*>)[^<]*(<\/script>)/,
    '$1CFG$2'
  );
}

async function render(slug: string, pdp: any): Promise<string> {
  const container = await AstroContainer.create();
  const html = await container.renderToString(ResenasPDP, {
    props: { pdp },
    locals: { tienda: makeTienda(slug), tiendaSlug: 'aimma-test', supabase: stubSupabase([]) } as any,
    request: REQUEST,
  });
  return norm(html);
}

const PRODUCTO = { id: 'prod-f4-01', nombre: 'Blusa Dama', slug: 'blusa-dama' };

const RESENAS = [
  { id: 'r1', nombre_cliente: 'Ana Perez', calificacion: 5, comentario: 'Excelente, muy comoda y de buena tela.', created_at: '2026-06-10T12:00:00Z' },
  { id: 'r2', nombre_cliente: 'Luis G', calificacion: 4, comentario: 'Buena calidad. <script>alert(1)</script>', created_at: '2026-06-08T09:30:00Z' },
  { id: 'r3', nombre_cliente: 'Sin Comentario', calificacion: 3, comentario: null, created_at: '2026-06-05T18:00:00Z' },
];

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

describe('ResenasPDP x4 — golden', () => {
  for (const slug of TEMPLATES) {
    test(`${slug} · con-resenas`, async () => {
      const html = await render(slug, { producto: PRODUCTO, resenas: RESENAS, mostrarResenas: true });
      await expect(html).toMatchFileSnapshot(
        fileURLToPath(new URL(`./__snapshots__/resenas-pdp/${slug}__con.html`, import.meta.url))
      );
    });
    test(`${slug} · sin-resenas`, async () => {
      const html = await render(slug, { producto: PRODUCTO, resenas: [], mostrarResenas: true });
      await expect(html).toMatchFileSnapshot(
        fileURLToPath(new URL(`./__snapshots__/resenas-pdp/${slug}__sin.html`, import.meta.url))
      );
    });
  }

  test('XSS: comentario con <script> se escapa al render (no crudo)', async () => {
    const html = await render('industrial_clean', { producto: PRODUCTO, resenas: RESENAS, mostrarResenas: true });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  test('promedio correcto (5+4+3)/3 = 4.0', async () => {
    const html = await render('industrial_clean', { producto: PRODUCTO, resenas: RESENAS, mostrarResenas: true });
    expect(html).toContain('>4.0<');
    expect(html).toContain('(3 reseñas)');
  });

  test('reseña sin comentario no rompe (no renderiza parrafo de texto vacio)', async () => {
    const html = await render('industrial_clean', { producto: PRODUCTO, resenas: [{ id: 'x', nombre_cliente: 'Solo Estrellas', calificacion: 5, comentario: null, created_at: '2026-06-01T00:00:00Z' }], mostrarResenas: true });
    expect(html).toContain('Solo Estrellas');
    expect(html).not.toContain('rpdp__texto');
  });
});
