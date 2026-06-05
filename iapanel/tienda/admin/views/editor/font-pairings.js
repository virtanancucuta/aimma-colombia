/* AIMMA B-tema global · mirror BROWSER del allowlist de pairings (packages/database/src/font-pairings.ts).
 * Lo usa el panel de Tema (T4b) para los previews "Aa" + el ID a postear. Value-synceable. */
(function(window) {
  'use strict';
  var FONT_PAIRINGS = {
    industrial: { display: '"IBM Plex Sans", system-ui, sans-serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap', label: 'Industrial', cat: 'Sans' },
    moderno:    { display: '"Inter", system-ui, sans-serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', label: 'Moderno limpio', cat: 'Sans' },
    geometrico: { display: '"Poppins", system-ui, sans-serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap', label: 'Geométrico amigable', cat: 'Sans' },
    impacto:    { display: '"Anton", system-ui, sans-serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;900&display=swap', label: 'Impacto', cat: 'Display' },
    editorial:  { display: '"Fraunces", "Cormorant Garamond", "Playfair Display", Georgia, serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300;9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap', label: 'Editorial cálido', cat: 'Serif' },
    elegante:   { display: '"Cormorant Garamond", "Playfair Display", "Times New Roman", Georgia, serif', body: '"Inter", system-ui, -apple-system, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&family=Inter:wght@400;500;600&display=swap', label: 'Elegante clásico', cat: 'Serif' },
  };
  var DEFAULT_BY_TEMPLATE = { fashion_bold: 'impacto', industrial_clean: 'industrial', minimal_artesanal: 'editorial', editorial_magazine: 'elegante' };
  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.fontPairings = {
    PAIRINGS: FONT_PAIRINGS,
    IDS: Object.keys(FONT_PAIRINGS),
    defaultForTemplate: function(slug) { return DEFAULT_BY_TEMPLATE[slug] || 'industrial'; },
  };
})(window);
