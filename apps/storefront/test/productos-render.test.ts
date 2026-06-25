import { describe, test, expect } from 'vitest';
import { renderNormalized, makeProductosSection } from './helpers/render-harness.ts';
import Productos from '../src/components/blocks/productos/Productos.astro';

const ROW = [{
  id: 'ph', nombre: 'Con Galeria', slug: 'con-galeria', referencia: 'RG',
  precio_venta: 100000, precio_promo: null,
  foto_principal_url: 'https://h/main.jpg', fotos_galeria: ['https://h/hover.jpg'],
  estado: 'activo', producto_variantes: [{ stock: 5, reservado: 0 }],
}];
const ic = (extra: any = {}): any => ({ id: 'tienda-uuid', plantilla: { slug: 'industrial_clean' }, ...extra });

describe('Productos · tamano -> columnas (IC)', () => {
  test('mediano (default) -> lg:grid-cols-4', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true }), ic(), ROW);
    expect(html).toContain('lg:grid-cols-4');
  });
  test('grande -> lg:grid-cols-3', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ tamano: 'grande', mostrar_precio: true }), ic(), ROW);
    expect(html).toContain('lg:grid-cols-3');
  });
  test('pequeno -> lg:grid-cols-5', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ tamano: 'pequeno', mostrar_precio: true }), ic(), ROW);
    expect(html).toContain('lg:grid-cols-5');
  });
  test('grilla IC ensanchada con lg:-mx-12 (alinea al header)', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true }), ic(), ROW);
    expect(html).toContain('lg:-mx-12');
  });
  test('hover on + flag OFF -> SI 2a imagen (override se mantiene)', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true, hover: 'on' }), ic({ hover_segunda_foto: false }), ROW);
    expect(html).toContain('https://h/hover.jpg');
  });
  test('hover off + flag ON -> sin 2a imagen', async () => {
    const html = await renderNormalized(Productos, makeProductosSection({ mostrar_precio: true, hover: 'off' }), ic(), ROW);
    expect(html).not.toContain('https://h/hover.jpg');
  });
});
