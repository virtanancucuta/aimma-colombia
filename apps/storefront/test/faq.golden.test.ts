// B-secciones Lote 2 · Golden · FAQ (acordeon nativo). Render PUBLICO == snapshot. Regenerar: vitest -u.
import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Faq from '../src/components/blocks/faq/Faq.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];
const ITEMS = [
  { pregunta: 'Como hago un pedido?', respuesta: 'Elegi tus productos y finaliza la compra por WhatsApp.' },
  { pregunta: 'Hacen envios?', respuesta: 'Si, enviamos a todo el pais.' },
];
const COMBOS = [
  { label: 'con-titulo', props: { titulo: 'Preguntas frecuentes', items: ITEMS } },
  { label: 'sin-titulo', props: { items: [{ pregunta: 'Una pregunta?', respuesta: 'Una respuesta.' }] } },
];

describe('Faq unificado == snapshot', () => {
  for (const slug of TEMPLATES) for (const combo of COMBOS) {
    test(`${slug} · ${combo.label}`, async () => {
      const html = await renderNormalized(Faq, makeSection('faq', combo.props), makeTienda(slug), []);
      await expect(html).toMatchFileSnapshot(fileURLToPath(new URL(`./__snapshots__/faq/${slug}__${combo.label}.html`, import.meta.url)));
    });
  }
});
