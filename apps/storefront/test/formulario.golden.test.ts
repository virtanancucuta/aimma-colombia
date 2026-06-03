// AIMMA Fase A.2 · Golden de identidad visual · FORMULARIO (aparte, ultimo).
// El fix de inertness de .form-message es PARENT-SCOPE (.X-form-inner .form-message),
// que NO cambia el HTML -> el render sigue siendo BYTE-0 (igual que los otros tipos).
// El delta vive SOLO en el <style>: las 3 reglas form-message pasan a parent-scoped.
//   - Render golden: byte-0 HTML (hash + source-* normalizados).
//   - Style check: cada <style> per-template == original con .form-message -> .X-form-inner .form-message.
// Cobertura: 4 plantillas x 4 combos (todos los tipos de campo, requerido on/off,
// titulo on/off, boton vacio -> reproduce fallback 'Enviar' de fashion_bold).
// tiendaSlug se inyecta en locals (en prod lo setea el middleware siempre).

import { describe, test, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';

import FormIC from '../src/components/blocks/formulario/FormularioIndustrialClean.astro';
import FormFB from '../src/components/blocks/formulario/FormularioFashionBold.astro';
import FormMA from '../src/components/blocks/formulario/FormularioMinimalArtesanal.astro';
import FormEM from '../src/components/blocks/formulario/FormularioEditorialMagazine.astro';
import Formulario from '../src/components/blocks/formulario/Formulario.astro';

const TEMPLATES = [
  { slug: 'industrial_clean', old: FormIC, prefix: 'ic' },
  { slug: 'fashion_bold', old: FormFB, prefix: 'fb' },
  { slug: 'minimal_artesanal', old: FormMA, prefix: 'ma' },
  { slug: 'editorial_magazine', old: FormEM, prefix: 'em' },
];

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

const OUT_DIR = fileURLToPath(new URL('./__golden__/formulario/', import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

describe('Formulario unificado == per-template (HTML byte-0; delta solo en <style>)', () => {
  for (const t of TEMPLATES) {
    for (const combo of COMBOS) {
      test(`${t.slug} · ${combo.label}`, async () => {
        const section = makeSection('formulario', {
          titulo: combo.titulo,
          campos: combo.campos,
          boton_texto: combo.boton_texto,
        });
        const tienda = makeTienda(t.slug);
        const extra = { tiendaSlug: 'aimma-test' };

        const oldHtml = await renderNormalized(t.old, section, tienda, [], extra);
        const newHtml = await renderNormalized(Formulario, section, tienda, [], extra);

        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.OLD.html`, oldHtml, 'utf8');
        writeFileSync(`${OUT_DIR}${t.slug}__${combo.label}.NEW.html`, newHtml, 'utf8');

        expect(newHtml).toBe(oldHtml);
      });
    }
  }
});

test('estilos: Formulario unificado lleva cada <style> con form-message PARENT-SCOPED', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const styleInner = (src: string) => {
    const m = src.match(/<style>([\s\S]*?)<\/style>/);
    return m ? m[1] : '__NO_STYLE__';
  };
  const unified = styleInner(read('../src/components/blocks/formulario/Formulario.astro'));
  const paths: Record<string, string> = {
    ic: '../src/components/blocks/formulario/FormularioIndustrialClean.astro',
    fb: '../src/components/blocks/formulario/FormularioFashionBold.astro',
    ma: '../src/components/blocks/formulario/FormularioMinimalArtesanal.astro',
    em: '../src/components/blocks/formulario/FormularioEditorialMagazine.astro',
  };
  for (const [prefix, path] of Object.entries(paths)) {
    const orig = styleInner(read(path)).trim();
    // delta exacto: .form-message{,--success,--error} -> .X-form-inner .form-message...
    const expected = orig.replace(/\.form-message/g, `.${prefix}-form-inner .form-message`);
    expect(unified.includes(expected), `falta el <style> de ${prefix} (form-message parent-scoped) en Formulario.astro`).toBe(true);
  }
});
