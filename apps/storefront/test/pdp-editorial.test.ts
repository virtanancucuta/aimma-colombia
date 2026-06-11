// AIMMA Fase F3 · unit · normalizeEditorial (lectura del contenido editorial en el PDP).
// Contrato: el admin escribe { material, ajuste, diseno:[], beneficios:[] } (o NULL si vacio);
// el storefront lo normaliza para render. Cubre: URL segura, trim, filtrado de vinietas,
// hasFicha, y robustez ante datos rotos (no debe romper el render).

import { describe, test, expect } from 'vitest';
import { normalizeEditorial } from '../src/lib/pdp-editorial.ts';

describe('normalizeEditorial', () => {
  test('producto sin guia ni ficha -> todo vacio, hasFicha false', () => {
    const ed = normalizeEditorial({ guia_tallas_url: null, ficha_editorial: null });
    expect(ed).toEqual({ guiaUrl: '', material: '', ajuste: '', diseno: [], beneficios: [], hasFicha: false });
  });

  test('ficha completa -> normalizada, hasFicha true', () => {
    const ed = normalizeEditorial({
      guia_tallas_url: 'https://x.supabase.co/g.jpg',
      ficha_editorial: { material: '  Algodon  ', ajuste: 'Regular', diseno: ['A', '  B  '], beneficios: ['X'] },
    });
    expect(ed.guiaUrl).toBe('https://x.supabase.co/g.jpg');
    expect(ed.material).toBe('Algodon');
    expect(ed.diseno).toEqual(['A', 'B']);
    expect(ed.beneficios).toEqual(['X']);
    expect(ed.hasFicha).toBe(true);
  });

  test('solo un campo de ficha -> hasFicha true', () => {
    expect(normalizeEditorial({ ficha_editorial: { material: 'Cuero' } }).hasFicha).toBe(true);
    expect(normalizeEditorial({ ficha_editorial: { diseno: ['solo diseno'] } }).hasFicha).toBe(true);
  });

  test('listas con vacios/espacios/no-strings -> filtradas', () => {
    const ed = normalizeEditorial({ ficha_editorial: { diseno: ['ok', '', '   ', 5, null, 'bien'] } });
    expect(ed.diseno).toEqual(['ok', 'bien']);
    expect(ed.hasFicha).toBe(true);
  });

  test('URL no-http (javascript:, data:, ftp:) o invalida -> guiaUrl vacio', () => {
    expect(normalizeEditorial({ guia_tallas_url: 'javascript:alert(1)' }).guiaUrl).toBe('');
    expect(normalizeEditorial({ guia_tallas_url: 'data:image/png;base64,AAAA' }).guiaUrl).toBe('');
    expect(normalizeEditorial({ guia_tallas_url: 'ftp://x/y.jpg' }).guiaUrl).toBe('');
    expect(normalizeEditorial({ guia_tallas_url: 'no-es-url' }).guiaUrl).toBe('');
    expect(normalizeEditorial({ guia_tallas_url: 'http://x/y.jpg' }).guiaUrl).toBe('http://x/y.jpg');
  });

  test('datos rotos (ficha no-objeto, campos no-string) -> no rompe', () => {
    expect(normalizeEditorial({ ficha_editorial: 'string' }).hasFicha).toBe(false);
    expect(normalizeEditorial({ ficha_editorial: [] }).hasFicha).toBe(false);
    expect(normalizeEditorial({ ficha_editorial: { material: 123, diseno: 'no-array' } })).toEqual(
      { guiaUrl: '', material: '', ajuste: '', diseno: [], beneficios: [], hasFicha: false }
    );
    expect(normalizeEditorial(null as any).hasFicha).toBe(false);
  });
});
