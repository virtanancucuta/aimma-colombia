import { getViteConfig } from 'astro/config';

// Harness Fase A.2 — golden de identidad visual de renderers de contenido.
// getViteConfig carga astro.config.mjs => compila .astro + alias ~/ + tailwind.
// `as any`: la key `test` (vitest) no esta en el tipo Vite UserConfig de astro; runtime OK.
export default getViteConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
  },
} as any);
