// AIMMA Fase A.2 · Golden de identidad visual · FORMULARIO.
// Guard permanente: render del unificado == snapshot committeado (ver productos.golden.test.ts).
// El fix de .form-message fue parent-scope (.X-form-inner .form-message) -> NO cambia el
// HTML, por eso el snapshot de render es el guard adecuado (igual que el resto).
// Cobertura: 4 plantillas x 4 combos (todos los tipos de campo, requerido on/off, titulo
// on/off, boton vacio -> fallback 'Enviar' de fashion_bold). tiendaSlug en locals (en prod
// lo setea el middleware siempre). Regenerar: vitest -u.

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';

import Formulario from '../src/components/blocks/formulario/Formulario.astro';

const TEMPLATES = ['industrial_clean', 'fashion_bold', 'minimal_artesanal', 'editorial_magazine'];

const CAMPOS_FULL = [
  { tipo_campo: 'text', label: 'Nombre', requerido: true, placeholder: 'Tu nombre' },
  { tipo_campo: 'email', label: 'Email', requerido: true, placeholder: 'tu@email.com' },
  { tipo_campo: 'tel', label: 'Telefono', requerido: false, placeholder: '' },
  { tipo_campo: 'textarea', label: 'Mensaje', requerido: true, placeholder: 'Escribe...' },
  { tipo_campo: 'select', label: 'Asunto', requerido: true, placeholder: 'Elige', opciones: ['Ventas', 'Soporte'] },
  { tipo_campo: 'checkbox', label: 'Acepto terminos', requerido: true },
];

const COMBOS = [
  { label: 'full-req', titulo: 'Contacto', campos: CAMPOS_FULL, boton_texto: 'Contactar' },
  { label: 'full-opt', titulo: undefined, campos: CAMPOS_FULL.map((c) => ({ ...c, requerido: false })), boton_texto: 'Enviar' },
  { label: 'boton-vacio', titulo: 'Escribinos', campos: [{ tipo_campo: 'text', label: 'Nombre', requerido: true, placeholder: '' }], boton_texto: '' },
  { label: 'solo-check-opt', titulo: undefined, campos: [{ tipo_campo: 'checkbox', label: 'Suscribirme', requerido: false }], boton_texto: 'Ok' },
];

describe('Formulario unificado == snapshot', () => {
  for (const slug of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${slug} · ${combo.label}`, async () => {
        const section = makeSection('formulario', {
          titulo: combo.titulo,
          campos: combo.campos,
          boton_texto: combo.boton_texto,
        });
        const tienda = makeTienda(slug);

        const html = await renderNormalized(Formulario, section, tienda, [], { tiendaSlug: 'aimma-test' });

        await expect(html).toMatchFileSnapshot(
          fileURLToPath(new URL(`./__snapshots__/formulario/${slug}__${combo.label}.html`, import.meta.url))
        );
      });
    }
  }
});
