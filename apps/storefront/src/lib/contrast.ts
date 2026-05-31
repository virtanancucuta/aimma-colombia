// AIMMA Storefront · contrast.ts · 2026-05-31
// WCAG 2.x relative luminance + auto-contrast text picker.
//
// Por que: las paletas del storefront tienen accents claros (Noir #FFD400,
// Electric #00E5FF, Verde Neon #FFFF00, Lavender #D3C5E5) sobre los cuales
// `text-white` da ratio <2:1 → falla WCAG AA (4.5:1 minimo para texto normal).
//
// Estrategia: calcular ratio contra blanco y contra negro, elegir el ganador.
// Esto es mas correcto que el atajo "L > 0.5 → negro", porque colores con
// luminancia media (ej. Graphite #6C757D L=0.17) pueden tener mejor contraste
// con blanco que con negro pese a la intuicion.
//
// Referencias:
// - https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
// - https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

const TEXT_LIGHT = '#ffffff';
const TEXT_DARK = '#0a0a0a';

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse "#rgb", "#rrggbb" o "rrggbb" a {r,g,b} en 0-255.
 * Devuelve null si el input no es un hex valido.
 */
function hexToRgb(hex: string): RGB | null {
  if (typeof hex !== 'string') return null;
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Linearizacion sRGB segun WCAG 2.1.
 * c es un canal en [0, 255]; devuelve componente lineal en [0, 1].
 */
function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Luminancia relativa W3C: L = 0.2126*R + 0.7152*G + 0.0722*B
 * con R/G/B linearizados desde sRGB. Resultado en [0, 1].
 */
function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Contrast ratio WCAG: (L1 + 0.05) / (L2 + 0.05), con L1 >= L2.
 * Rango [1, 21]. AA texto normal exige >= 4.5; AA texto grande >= 3.
 */
function contrastRatio(L1: number, L2: number): number {
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Dado un color de fondo en hex, elige el color de texto (blanco u oscuro)
 * que maximiza el contrast ratio WCAG. Default a blanco si el input es invalido
 * (preserva el comportamiento previo del storefront).
 */
export function getContrastText(hex: string): typeof TEXT_LIGHT | typeof TEXT_DARK {
  const rgb = hexToRgb(hex);
  if (!rgb) return TEXT_LIGHT;
  const L = relativeLuminance(rgb);
  const cWhite = contrastRatio(L, 1.0); // blanco puro L = 1
  const cDark = contrastRatio(L, relativeLuminance(hexToRgb(TEXT_DARK)!)); // ~0
  return cDark >= cWhite ? TEXT_DARK : TEXT_LIGHT;
}

// Re-exports utiles para testing o consumers avanzados.
export { hexToRgb, relativeLuminance, contrastRatio };
