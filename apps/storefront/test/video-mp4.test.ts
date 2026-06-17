// FASE D (2b) · Video.astro · rama <video> para MP4 subido a R2. Render PUBLICO: el <video> nativo con
// controls + preload metadata + playsinline, dentro de un contenedor con aspect-ratio (sin layout shift).
// Precedencia: mp4_url gana a url/html. Sin mp4_url, el comportamiento de url/html queda intacto.
import { describe, test, expect } from 'vitest';
import { renderNormalized, makeSection, makeTienda } from './helpers/render-harness.ts';
import Video from '../src/components/blocks/video/Video.astro';

const UU = '123e4567-e89b-12d3-a456-426614174000';
const MP4 = `https://videos.aimma.com.co/${UU}/${UU}.mp4`;

describe('Video.astro · MP4 (mp4_url)', () => {
  test('renderiza <video> nativo con atributos de perf/a11y y el src de R2', async () => {
    const html = await renderNormalized(Video, makeSection('video', { mp4_url: MP4, aspect_ratio: '16/9' }), makeTienda('industrial_clean'), []);
    expect(html).toContain('<video');
    expect(html).toContain(`src="${MP4}"`);
    expect(html).toContain('controls');
    expect(html).toContain('preload="metadata"'); // no baja el video entero en la carga
    expect(html).toContain('playsinline');         // mobile inline
    expect(html).not.toContain('autoplay');        // sin autoplay (lo inicia el usuario)
    expect(html).toContain('aspect-ratio:16/9');   // contenedor reserva espacio (sin CLS)
    expect(html).toContain('video-mp4');
    expect(html).not.toContain('<iframe');          // no es embed
    expect(html).not.toContain('video-facade');     // no es fachada
  });

  test('respeta el aspect_ratio elegido', async () => {
    const html = await renderNormalized(Video, makeSection('video', { mp4_url: MP4, aspect_ratio: '4/3' }), makeTienda('fashion_bold'), []);
    expect(html).toContain('aspect-ratio:4/3');
  });

  test('precedencia: mp4_url gana aunque haya url (renderiza <video>, no fachada)', async () => {
    const html = await renderNormalized(Video, makeSection('video', { mp4_url: MP4, url: 'https://youtu.be/dQw4w9WgXcQ', aspect_ratio: '16/9' }), makeTienda('industrial_clean'), []);
    expect(html).toContain('<video');
    expect(html).not.toContain('video-facade');
    expect(html).not.toContain('youtube');
  });

  test('sin mp4_url: url de YouTube sigue rindiendo la fachada (comportamiento 2a intacto)', async () => {
    const html = await renderNormalized(Video, makeSection('video', { url: 'https://youtu.be/dQw4w9WgXcQ', aspect_ratio: '16/9' }), makeTienda('industrial_clean'), []);
    expect(html).toContain('video-facade');
    expect(html).not.toContain('<video');
  });
});
