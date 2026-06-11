// AIMMA F2 · Golden del chrome SSR de los shells de carrito ×4. Los <script> bundled no aparecen
// en el render del Container (igual que <style>); este golden guarda markup + hooks + upsell.
import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderComponentNormalized, makeTienda, UPSELL_FIXTURE } from './helpers/render-harness.ts';
import CartIC from '../src/components/templates/industrial_clean/CartIC.astro';
import CartFB from '../src/components/templates/fashion_bold/CartFB.astro';
import CartMA from '../src/components/templates/minimal_artesanal/CartMA.astro';
import CartEM from '../src/components/templates/editorial_magazine/CartEM.astro';

const SHELLS: Record<string, any> = {
  industrial_clean: CartIC, fashion_bold: CartFB, minimal_artesanal: CartMA, editorial_magazine: CartEM,
};

describe('carrito shells x4 == snapshot', () => {
  for (const slug of Object.keys(SHELLS)) {
    test(`${slug} · base`, async () => {
      const html = await renderComponentNormalized(SHELLS[slug], { hasWhatsApp: true, upsell: UPSELL_FIXTURE }, makeTienda(slug));
      await expect(html).toMatchFileSnapshot(
        fileURLToPath(new URL(`./__snapshots__/carrito/${slug}__base.html`, import.meta.url))
      );
    });
  }
});
