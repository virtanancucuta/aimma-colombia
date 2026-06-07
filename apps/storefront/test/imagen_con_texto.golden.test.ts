// B-secciones Lote 1 · Golden de identidad visual · IMAGEN CON TEXTO.
// Guard de regresion: render del unificado (PUBLICO, sin isPreview) == snapshot. Regenerar: vitest -u.
import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import ImagenConTexto from '../src/components/blocks/imagen_con_texto/ImagenConTexto.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];
const SRC = 'https://rsmxklkxqsaptchcjszd.supabase.co/img/x.jpg';
const BOTON = { texto: 'Ver mas', url: '#productos', estilo_visual: 'primary', target: '_self', icono: 'arrow' };

const COMBOS = [
  { label: 'izq-boton-texto', props: { src: SRC, alt: 'Foto', titulo: 'Titulo del bloque', texto: 'Parrafo de ejemplo.\nSegunda linea.', boton: BOTON, posicion_imagen: 'izquierda' } },
  { label: 'der-sinboton', props: { src: SRC, alt: 'Foto', titulo: 'Titulo del bloque', texto: 'Parrafo de ejemplo.', posicion_imagen: 'derecha' } },
  { label: 'izq-sintexto-sinboton', props: { src: SRC, alt: 'Foto', titulo: 'Solo titulo', posicion_imagen: 'izquierda' } },
];

describe('ImagenConTexto unificado == snapshot', () => {
  for (const slug of TEMPLATES) for (const combo of COMBOS) {
    test(`${slug} · ${combo.label}`, async () => {
      const html = await renderNormalized(ImagenConTexto, makeSection('imagen_con_texto', combo.props), makeTienda(slug), []);
      await expect(html).toMatchFileSnapshot(fileURLToPath(new URL(`./__snapshots__/imagen_con_texto/${slug}__${combo.label}.html`, import.meta.url)));
    });
  }
});
