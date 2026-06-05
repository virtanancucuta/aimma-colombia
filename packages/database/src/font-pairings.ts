// AIMMA B-tema global · allowlist CURADO de pares de fuentes. Fuente de verdad para storefront + admin.
// El ID es el unico valor que cruza limites (postMessage / Zod enum); url/family se DERIVAN aca -> sin URL libre.
// CERO-REGRESION: los 4 default-por-plantilla = COPIA EXACTA de template-styles.ts. moderno/geometrico = nuevos.
export const FONT_PAIRINGS = {
  industrial: { display: '"IBM Plex Sans", system-ui, sans-serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap', label: 'Industrial', cat: 'Sans' },
  moderno:    { display: '"Inter", system-ui, sans-serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', label: 'Moderno limpio', cat: 'Sans' },
  geometrico: { display: '"Poppins", system-ui, sans-serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap', label: 'Geométrico amigable', cat: 'Sans' },
  impacto:    { display: '"Anton", system-ui, sans-serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;900&display=swap', label: 'Impacto', cat: 'Display' },
  editorial:  { display: '"Fraunces", "Cormorant Garamond", "Playfair Display", Georgia, serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300;9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap', label: 'Editorial cálido', cat: 'Serif' },
  elegante:   { display: '"Cormorant Garamond", "Playfair Display", "Times New Roman", Georgia, serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&family=Inter:wght@400;500;600&display=swap', label: 'Elegante clásico', cat: 'Serif' },
} as const;

export type FontPairingId = keyof typeof FONT_PAIRINGS;
export const FONT_PAIRING_IDS = Object.keys(FONT_PAIRINGS) as FontPairingId[];

export const DEFAULT_PAIRING_BY_TEMPLATE: Record<string, FontPairingId> = {
  fashion_bold: 'impacto', industrial_clean: 'industrial',
  minimal_artesanal: 'editorial', editorial_magazine: 'elegante',
};
export function pairingForTemplate(slug: string | null | undefined): FontPairingId {
  return (slug && DEFAULT_PAIRING_BY_TEMPLATE[slug]) || 'industrial';
}
