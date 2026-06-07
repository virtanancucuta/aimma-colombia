// C.2 Paso 2 — InlineEdit (lifecycle contenteditable, is:inline preview-gated).
// El comportamiento runtime se verifica en chromium-real (Fase C); aca el contrato presente en SSR.
import { test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import InlineEdit from '~/components/InlineEdit.astro';

async function render(): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(InlineEdit, { request: new Request('https://aimma-test.tienda.aimma.com.co/?preview=t') });
}

test('InlineEdit: contrato del lifecycle inline presente', async () => {
  const html = await render();
  expect(html).toContain('inline-enable');      // dormido hasta habilitar
  expect(html).toContain('inline-edit-start');
  expect(html).toContain('inline-commit');
  expect(html).toContain('inline-cancel');
  expect(html).toContain('contenteditable');
  expect(html).toContain('aimma.com.co');        // origin validado en ambos sentidos
  expect(html).toContain('text/plain');          // paste solo texto plano
});

test('InlineEdit: registro SIMPLE_TEXT_FIELDS inyectado (solo el set de texto-simple)', async () => {
  const html = await render();
  expect(html).toContain('items.*.texto');   // botones
  expect(html).toContain('campos.*.label');  // formulario
  expect(html).toContain('boton.texto');     // banner
  expect(html).not.toContain('contenido');   // rich-text NO va en el registro
});
