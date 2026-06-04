// AIMMA · OptimizedImage · gate CF_IMAGE_RESIZING (img-fix 2026-06-03).
// Cubre el flag que el golden NO ejercitaba: el harness golden no setea header `host`,
// asi que cfActive era siempre false (URL cruda) — por eso el wrapper roto (/cdn-cgi/
// que da 404 en la zona) se shippeo sin que los tests lo atraparan. Aca SI seteamos host
// para probar las dos ramas: default/flag-off => URL cruda; flag-on => wrapper.

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, test, expect } from 'vitest';
import OptimizedImage from '../src/components/OptimizedImage.astro';

const SRC = 'https://cdn.example.com/x.jpg';
const HOST_CF = 'aimma-test.tienda.aimma.com.co';

async function renderImg(opts: { host?: string; flag?: string; src?: string }) {
  const container = await AstroContainer.create();
  const headers: Record<string, string> = {};
  if (opts.host) headers.host = opts.host;
  const request = new Request('https://placeholder/', { headers });
  const locals: any = opts.flag !== undefined ? { runtime: { env: { CF_IMAGE_RESIZING: opts.flag } } } : {};
  return container.renderToString(OptimizedImage, {
    props: { src: opts.src ?? SRC, alt: 'x', width: 400, height: 400 },
    request,
    locals,
  });
}

describe('OptimizedImage · gate CF_IMAGE_RESIZING', () => {
  test('default (flag ausente) + host aimma -> URL CRUDA, sin /cdn-cgi/', async () => {
    const html = await renderImg({ host: HOST_CF });
    expect(html).toContain(`src="${SRC}"`);
    expect(html).not.toContain('/cdn-cgi/image/');
  });

  test('flag "false" + host aimma -> URL CRUDA', async () => {
    const html = await renderImg({ host: HOST_CF, flag: 'false' });
    expect(html).not.toContain('/cdn-cgi/image/');
    expect(html).toContain(`src="${SRC}"`);
  });

  test('flag "true" + host aimma -> wrapper /cdn-cgi/image/ (cuando la feature este habilitada)', async () => {
    const html = await renderImg({ host: HOST_CF, flag: 'true' });
    expect(html).toContain(`/cdn-cgi/image/width=400,format=auto,quality=85/${SRC}`);
  });

  test('flag "true" pero host NO aimma.com.co -> URL CRUDA (host gate)', async () => {
    const html = await renderImg({ host: 'evil.example.com', flag: 'true' });
    expect(html).not.toContain('/cdn-cgi/image/');
  });
});
