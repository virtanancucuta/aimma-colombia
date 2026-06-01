// AIMMA Storefront · lib/template-styles.ts · 2026-05-31
// Configs por plantilla. Cada plantilla del catalogo BD tiene un design system
// completo definido por research UI-UX (sesion 2026-05-31). Este archivo es la
// fuente de verdad para fonts, container max-widths, y handler de slug → variant.
//
// 3 plantillas activas: fashion_bold, industrial_clean, minimal_artesanal.
// Plantillas extra futuras deben agregarse aqui + sus variants en components/templates/.

export type TemplateSlug = 'fashion_bold' | 'industrial_clean' | 'minimal_artesanal' | 'editorial_magazine';

export interface FontConfig {
  /** Google Fonts URL incluyendo weights y display=swap */
  googleFontsUrl: string;
  /** CSS font-family stack para display (titulos, hero) */
  displayFamily: string;
  /** CSS font-family stack para body (parrafos, UI) */
  bodyFamily: string;
}

export interface TemplateStyle {
  slug: TemplateSlug;
  fonts: FontConfig;
  /** Tailwind class para el contenedor principal main */
  mainContainerClass: string;
  /** Tailwind class para el body (background, defaults) */
  bodyClass: string;
}

// ============================================================
// Configs por plantilla
// ============================================================

const FASHION_BOLD: TemplateStyle = {
  slug: 'fashion_bold',
  fonts: {
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;900&display=swap',
    displayFamily: '"Anton", system-ui, sans-serif',
    bodyFamily: '"Inter", system-ui, -apple-system, sans-serif',
  },
  // Fashion Bold = full-bleed friendly. Sin max-width en main (los componentes
  // manejan su propio padding interno). Edge-to-edge.
  mainContainerClass: 'flex-1 w-full',
  bodyClass: 'font-body bg-[var(--ta-color-bg-base)] text-[var(--ta-color-text-base)]',
};

const INDUSTRIAL_CLEAN: TemplateStyle = {
  slug: 'industrial_clean',
  fonts: {
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
    displayFamily: '"IBM Plex Sans", system-ui, sans-serif',
    bodyFamily: '"Inter", system-ui, -apple-system, sans-serif',
  },
  // Industrial Clean = grid estricto, max-w-7xl con paddings ordenados.
  mainContainerClass: 'flex-1 mx-auto w-full max-w-7xl px-6 lg:px-8 py-12 lg:py-16',
  bodyClass: 'font-body bg-[var(--ta-color-bg-base)] text-[var(--ta-color-text-base)]',
};

const MINIMAL_ARTESANAL: TemplateStyle = {
  slug: 'minimal_artesanal',
  fonts: {
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300;9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap',
    displayFamily: '"Fraunces", "Cormorant Garamond", "Playfair Display", Georgia, serif',
    bodyFamily: '"Inter", system-ui, -apple-system, sans-serif',
  },
  // Minimal Artesanal = generous whitespace, container amplio.
  mainContainerClass: 'flex-1 mx-auto w-full max-w-screen-2xl px-8 lg:px-16',
  bodyClass: 'font-body bg-[var(--ta-color-bg-base)] text-[var(--ta-color-text-base)]',
};

const EDITORIAL_MAGAZINE: TemplateStyle = {
  slug: 'editorial_magazine',
  fonts: {
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,300;1,9..144,400&family=Inter:wght@400;500;600&display=swap',
    displayFamily: '"Fraunces", "Cormorant Garamond", "Playfair Display", Georgia, serif',
    bodyFamily: '"Inter", system-ui, -apple-system, sans-serif',
  },
  // Editorial Magazine = baseline editorial generoso, max-w refined.
  mainContainerClass: 'flex-1 mx-auto w-full max-w-[1440px] px-6 md:px-10 lg:px-20',
  bodyClass: 'font-body bg-[var(--ta-color-bg-base)] text-[var(--ta-color-text-base)]',
};

const TEMPLATE_STYLES: Record<TemplateSlug, TemplateStyle> = {
  fashion_bold: FASHION_BOLD,
  industrial_clean: INDUSTRIAL_CLEAN,
  minimal_artesanal: MINIMAL_ARTESANAL,
  editorial_magazine: EDITORIAL_MAGAZINE,
};

// ============================================================
// API publica
// ============================================================

/**
 * Resuelve la config de la plantilla desde el slug.
 * Fallback a `industrial_clean` si el slug no existe o es null/undefined
 * (es la opcion mas neutral / segura para tiendas sin plantilla).
 */
export function getTemplateStyle(slug: string | null | undefined): TemplateStyle {
  if (slug && slug in TEMPLATE_STYLES) {
    return TEMPLATE_STYLES[slug as TemplateSlug];
  }
  return INDUSTRIAL_CLEAN;
}

export { TEMPLATE_STYLES };
