// AIMMA F2 · Golden del chrome SSR de los shells de checkout ×4 (hasWhatsApp=true).
import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderComponentNormalized, makeTienda } from './helpers/render-harness.ts';
import CheckoutIC from '../src/components/templates/industrial_clean/CheckoutIC.astro';
import CheckoutFB from '../src/components/templates/fashion_bold/CheckoutFB.astro';
import CheckoutMA from '../src/components/templates/minimal_artesanal/CheckoutMA.astro';
import CheckoutEM from '../src/components/templates/editorial_magazine/CheckoutEM.astro';

const SHELLS: Record<string, any> = {
  industrial_clean: CheckoutIC, fashion_bold: CheckoutFB, minimal_artesanal: CheckoutMA, editorial_magazine: CheckoutEM,
};
const PROPS = { hasWhatsApp: true, efUrl: 'https://ef.test/functions/v1/tienda-crear-pedido', anonKey: 'anon-test-key', tiendaSlug: 'aimma-test', tiendaNombre: 'Tienda Test' };

describe('checkout shells x4 == snapshot', () => {
  for (const slug of Object.keys(SHELLS)) {
    test(`${slug} · conwa`, async () => {
      const html = await renderComponentNormalized(SHELLS[slug], PROPS, makeTienda(slug));
      await expect(html).toMatchFileSnapshot(
        fileURLToPath(new URL(`./__snapshots__/checkout/${slug}__conwa.html`, import.meta.url))
      );
    });
  }
});
