// AIMMA Fase F3 · Golden de identidad visual · PRODUCT DETAIL (PDP) x4.
// Doble proposito:
//  - sin-ficha  = GUARD de byte-identidad: un producto sin guia ni ficha debe
//                 renderizar EXACTAMENTE como antes de F3 (bloques nuevos NO aparecen).
//                 El baseline se capturo de los shells PRE-F3; si F3 lo altera, falla.
//  - con-ficha  = DELTA caracterizado: el mismo producto con guia_tallas_url + ficha_editorial
//                 muestra el colapsable de guia + sub-bloques material/ajuste/diseno/beneficios.
// El <style> scoped NO entra en renderToString (Vite lo extrae) -> la identidad CSS
// (additive-only) se valida por inspeccion de source aparte, no aca.
// Regenerar (cambios intencionales): vitest -u.

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderComponentNormalized, makeTienda } from './helpers/render-harness.ts';

import ProductDetailIC from '../src/components/templates/industrial_clean/ProductDetailIC.astro';
import ProductDetailFB from '../src/components/templates/fashion_bold/ProductDetailFB.astro';
import ProductDetailMA from '../src/components/templates/minimal_artesanal/ProductDetailMA.astro';
import ProductDetailEM from '../src/components/templates/editorial_magazine/ProductDetailEM.astro';

const TEMPLATES: Array<[string, any]> = [
  ['industrial_clean', ProductDetailIC],
  ['fashion_bold', ProductDetailFB],
  ['minimal_artesanal', ProductDetailMA],
  ['editorial_magazine', ProductDetailEM],
];

const precioCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Variantes (color+talla) para ejercer el VariantSelector completo. Estable.
const VARIANTES = [
  { id: 'v1', color: 'Negro', talla: 'M', sku: 'KAY-CAM-001-NEG-M', disponible: 5, foto_color_url: null, precio: 89000 },
  { id: 'v2', color: 'Negro', talla: 'L', sku: 'KAY-CAM-001-NEG-L', disponible: 3, foto_color_url: null, precio: 89000 },
  { id: 'v3', color: 'Azul', talla: 'M', sku: 'KAY-CAM-001-AZU-M', disponible: 0, foto_color_url: null, precio: 89000 },
];

const BASE_PRODUCTO = {
  id: 'prod-f3-01',
  nombre: 'Camiseta Deportiva Pro',
  slug: 'camiseta-deportiva-pro',
  referencia: 'KAY-CAM-001',
  descripcion: 'Camiseta de alto rendimiento para entrenamiento.\nTela transpirable.',
  foto_principal_url: 'https://rsmxklkxqsaptchcjszd.supabase.co/img/cam.jpg',
  fotos_galeria: ['https://rsmxklkxqsaptchcjszd.supabase.co/img/cam2.jpg'],
  precio_venta: 89000,
  precio_promo: null,
  variante_tipo_1: 'Color',
  variante_tipo_2: 'Talla',
};

const PRODUCTO_SIN_FICHA = { ...BASE_PRODUCTO, guia_tallas_url: null, ficha_editorial: null };

const PRODUCTO_CON_FICHA = {
  ...BASE_PRODUCTO,
  guia_tallas_url: 'https://rsmxklkxqsaptchcjszd.supabase.co/storage/v1/object/public/tienda-productos/t/editor/guia.jpg',
  ficha_editorial: {
    material: '100% poliester reciclado.',
    ajuste: 'Entallado, true to size.',
    diseno: ['Costuras planas', 'Cuello redondo reforzado'],
    beneficios: ['Secado rapido', 'Proteccion UV', 'Antibacterial'],
  },
};

function makePdp(producto: any): any {
  const galeria = [producto.foto_principal_url, ...(producto.fotos_galeria || [])].filter(Boolean);
  const stockTotal = VARIANTES.reduce((a, v) => a + v.disponible, 0);
  return {
    producto,
    galeria,
    variantes: VARIANTES,
    tieneVariantes: true,
    stockTotal,
    sinStock: false,
    precioBase: producto.precio_venta,
    precioAnterior: null,
    precioBaseFmt: precioCOP.format(producto.precio_venta),
    precioAnteriorFmt: null,
    variante_tipo_1: producto.variante_tipo_1,
    variante_tipo_2: producto.variante_tipo_2,
    relacionados: [],
    wppDigits: '573001234567',
    tiendaNombre: 'KAYBU',
    productUrl: 'https://aimma-test.tienda.aimma.com.co/p/camiseta-deportiva-pro',
  };
}

describe('ProductDetail PDP x4 — golden', () => {
  for (const [slug, Comp] of TEMPLATES) {
    test(`${slug} · sin-ficha`, async () => {
      const html = await renderComponentNormalized(Comp, { pdp: makePdp(PRODUCTO_SIN_FICHA) }, makeTienda(slug));
      await expect(html).toMatchFileSnapshot(
        fileURLToPath(new URL(`./__snapshots__/product-detail/${slug}__sin-ficha.html`, import.meta.url))
      );
    });

    test(`${slug} · con-ficha`, async () => {
      const html = await renderComponentNormalized(Comp, { pdp: makePdp(PRODUCTO_CON_FICHA) }, makeTienda(slug));
      await expect(html).toMatchFileSnapshot(
        fileURLToPath(new URL(`./__snapshots__/product-detail/${slug}__con-ficha.html`, import.meta.url))
      );
    });
  }
});
