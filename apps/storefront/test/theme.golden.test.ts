// AIMMA B-tema global · Golden de theme override en Layout.astro.
// Verifica que el <html style> tenga los --ta-* correctos y que el <link> de fuente
// apunte a la URL correcta, segun si hay theme o no.
// CERO-REGRESION: caso (a) SIN theme debe dar exactamente los mismos valores
// que template.fonts y paleta — el path actual no cambia.
// Regenerar snapshots: vitest -u

import { describe, test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getTemplateStyle } from '../src/lib/template-styles.ts';
import { FONT_PAIRINGS } from '@aimma/database';

import Layout from '../src/layouts/Layout.astro';

const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');

function normalize(html: string): string {
  return html
    .replace(/ data-astro-source-file="[^"]*"/g, '')
    .replace(/ data-astro-source-loc="[^"]*"/g, '')
    .replace(/data-astro-cid-[A-Za-z0-9]+/g, 'data-astro-cid-CID');
}

// Stub supabase minimo (Header/Footer pueden hacer queries de categorias etc.)
function stubSupabase(): any {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    neq: () => chain,
    in: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  return { from: () => chain };
}

function makeTiendaLayout(opts: {
  plantillaSlug: string;
  paleta?: { color_primary?: string; color_accent?: string; color_text_base?: string; color_bg_base?: string } | null;
  personalizaciones?: any;
  nombre_negocio?: string;
}): any {
  return {
    id: 'tienda-uuid',
    nombre_negocio: opts.nombre_negocio ?? 'Tienda Test',
    slug: 'aimma-test',
    logo_url: null,
    paleta: opts.paleta ?? {
      color_primary: '#111111',
      color_accent: '#ff0000',
      color_text_base: '#222222',
      color_bg_base: '#fafafa',
    },
    plantilla: { slug: opts.plantillaSlug },
    personalizaciones: opts.personalizaciones ?? null,
    telefono_contacto: null,
    email_contacto: null,
    direccion: null,
    ciudad_negocio: null,
    whatsapp: null,
    instagram_url: null,
    facebook_url: null,
  };
}

async function renderLayout(tienda: any, isPreview: boolean = false): Promise<string> {
  const container = await AstroContainer.create();
  const html = await container.renderToString(Layout, {
    props: { isPreview, title: 'Test' },
    slots: { default: '<div id="slot-content">contenido</div>' },
    locals: { tienda, supabase: stubSupabase() },
    request: REQUEST,
  });
  return normalize(html);
}

// Extrae el atributo style del <html> tag y decodifica HTML entities
function extractHtmlStyle(html: string): string {
  const m = html.match(/<html[^>]*\sstyle="([^"]*)"/);
  if (!m) return '';
  // Astro HTML-encodes el style attribute: &#34; -> " etc.
  return m[1]
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Extrae el href del <link rel="stylesheet"> de fuentes (Google Fonts)
function extractFontLinkHref(html: string): string {
  // Busca el link de stylesheet que apunte a fonts.googleapis.com
  const m = html.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com[^"]*)"/);
  return m ? m[1] : '';
}

describe('Layout theme override — CERO-REGRESION y overrides', () => {

  // (a) SIN theme: debe usar paleta exacta + template.fonts exacto
  test('(a) SIN theme: colores = paleta, fuentes = template.fonts (cero regresion industrial_clean)', async () => {
    const plantillaSlug = 'industrial_clean';
    const template = getTemplateStyle(plantillaSlug);
    const paleta = {
      color_primary: '#111111',
      color_accent: '#ff0000',
      color_text_base: '#222222',
      color_bg_base: '#fafafa',
    };
    const tienda = makeTiendaLayout({ plantillaSlug, paleta, personalizaciones: null });

    const html = await renderLayout(tienda, false);
    const styleAttr = extractHtmlStyle(html);
    const fontHref = extractFontLinkHref(html);

    // Colores: exactamente la paleta
    expect(styleAttr).toContain(`--ta-color-primary:${paleta.color_primary}`);
    expect(styleAttr).toContain(`--ta-color-accent:${paleta.color_accent}`);
    expect(styleAttr).toContain(`--ta-color-text-base:${paleta.color_text_base}`);
    expect(styleAttr).toContain(`--ta-color-bg-base:${paleta.color_bg_base}`);

    // Fuentes: exactamente template.fonts
    expect(styleAttr).toContain(`--ta-font-display:${template.fonts.displayFamily}`);
    expect(styleAttr).toContain(`--ta-font-body:${template.fonts.bodyFamily}`);

    // Link: exactamente template.fonts.googleFontsUrl
    expect(fontHref).toBe(template.fonts.googleFontsUrl);
  });

  // (b) theme.colors override: primary toma el del theme, resto sigue de paleta
  test('(b) theme.colors override: primary del theme, resto de paleta', async () => {
    const plantillaSlug = 'industrial_clean';
    const template = getTemplateStyle(plantillaSlug);
    const paleta = {
      color_primary: '#111111',
      color_accent: '#ff0000',
      color_text_base: '#222222',
      color_bg_base: '#fafafa',
    };
    const personalizaciones = {
      schema_version: 3,
      theme: {
        colors: { primary: '#0055ff' },
      },
      pages: {},
    };
    const tienda = makeTiendaLayout({ plantillaSlug, paleta, personalizaciones });

    const html = await renderLayout(tienda, false);
    const styleAttr = extractHtmlStyle(html);
    const fontHref = extractFontLinkHref(html);

    // primary viene del theme
    expect(styleAttr).toContain('--ta-color-primary:#0055ff');
    // accent, text_base, bg_base siguen de paleta
    expect(styleAttr).toContain(`--ta-color-accent:${paleta.color_accent}`);
    expect(styleAttr).toContain(`--ta-color-text-base:${paleta.color_text_base}`);
    expect(styleAttr).toContain(`--ta-color-bg-base:${paleta.color_bg_base}`);

    // fuentes sin override -> template.fonts exacto
    expect(styleAttr).toContain(`--ta-font-display:${template.fonts.displayFamily}`);
    expect(fontHref).toBe(template.fonts.googleFontsUrl);
  });

  // (c) theme.font_pairing override (impacto): display = Anton, link = URL impacto
  test('(c) font_pairing override (impacto): display/body/link del pairing', async () => {
    const plantillaSlug = 'industrial_clean';
    const paleta = {
      color_primary: '#111111',
      color_accent: '#ff0000',
      color_text_base: '#222222',
      color_bg_base: '#fafafa',
    };
    const personalizaciones = {
      schema_version: 3,
      theme: {
        font_pairing: 'impacto',
      },
      pages: {},
    };
    const tienda = makeTiendaLayout({ plantillaSlug, paleta, personalizaciones });

    const html = await renderLayout(tienda, false);
    const styleAttr = extractHtmlStyle(html);
    const fontHref = extractFontLinkHref(html);

    const pairing = FONT_PAIRINGS['impacto'];

    expect(styleAttr).toContain(`--ta-font-display:${pairing.display}`);
    expect(styleAttr).toContain(`--ta-font-body:${pairing.body}`);
    expect(fontHref).toBe(pairing.url);
  });

  // (d) isPreview=true con theme_draft: usa theme_draft en vez de theme
  test('(d) isPreview=true: usa theme_draft (no theme)', async () => {
    const plantillaSlug = 'fashion_bold';
    const paleta = {
      color_primary: '#111111',
      color_accent: '#ff0000',
      color_text_base: '#222222',
      color_bg_base: '#fafafa',
    };
    const personalizaciones = {
      schema_version: 3,
      // theme tiene un color, theme_draft tiene otro
      theme: {
        colors: { primary: '#aabbcc' },
      },
      theme_draft: {
        colors: { primary: '#deadbe' },
        font_pairing: 'editorial',
      },
      pages: {},
    };
    const tienda = makeTiendaLayout({ plantillaSlug, paleta, personalizaciones });

    const html = await renderLayout(tienda, true);
    const styleAttr = extractHtmlStyle(html);
    const fontHref = extractFontLinkHref(html);

    const pairing = FONT_PAIRINGS['editorial'];

    // Debe usar theme_draft (no theme): primary = #deadbe (no #aabbcc)
    expect(styleAttr).toContain('--ta-color-primary:#deadbe');
    expect(styleAttr).not.toContain('#aabbcc');

    // font_pairing del draft
    expect(styleAttr).toContain(`--ta-font-display:${pairing.display}`);
    expect(fontHref).toBe(pairing.url);
  });

});
