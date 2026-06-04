// AIMMA Editor PRO-MAX · B-controles #4 rich-text · Politica canonica lib-agnostica.
// UNA fuente de verdad para la allowlist. UN solo adaptador: toSanitizeHtml, usado por la EF
// (autoritativa) Y el storefront (defensa en profundidad). DOMPurify NO corre en el runtime del
// Worker (ni en Deno) -> ambas capas usan sanitize-html. El admin client-side usa DOMPurify-CDN en
// el navegador (donde SI funciona) como best-effort UX, con su propio mirror browser (no este archivo).
// Mirror byte-identico en supabase/functions/tienda-guardar-layout/richtext-policy.ts (sync-test 10).
// NO importa ninguna lib (datos + funciones puras) -> Deno-compatible + bundleable por Vite.

export const RICHTEXT_POLICY = {
  tags: ['b', 'strong', 'i', 'em', 'a', 'ul', 'ol', 'li', 'p', 'br'],
  attrs: { a: ['href'] } as Record<string, string[]>,
  schemes: ['https', 'mailto', 'tel'],
  allowProtocolRelative: false,
};

// Adaptador sanitize-html (EF). disallowedTagsMode 'discard' elimina tag + (script/style) su texto.
// Dejamos selfClosing en su default (auto-cierra <br> como `<br />`); NO lo forzamos a [] porque eso
// emitiria `<br></br>` y DOMPurify lo re-parsea como dos saltos. normalizeVoidEls() abajo pasa
// `<br />` a la forma HTML5 `<br>`, punto fijo de la DOMPurify del storefront (idempotencia, test 11).
export function toSanitizeHtml(policy = RICHTEXT_POLICY) {
  return {
    allowedTags: [...policy.tags],
    allowedAttributes: Object.fromEntries(
      Object.entries(policy.attrs).map(([k, v]) => [k, [...v]]),
    ),
    allowedSchemes: [...policy.schemes],
    allowProtocolRelative: policy.allowProtocolRelative,
    disallowedTagsMode: 'discard' as const,
  };
}

// sanitize-html serializa void elements como `<br />` (XML); DOMPurify como `<br>` (HTML5).
// Normaliza la salida sanitizada a la forma HTML5 para que el HTML que la EF almacena sea punto
// fijo de la DOMPurify del storefront (idempotencia). Alineacion de FORMATO, NO de seguridad:
// opera sobre HTML ya sanitizado, no toca tags/attrs/schemes. <br> es el unico void del allowlist.
export function normalizeVoidEls(html: string): string {
  return html.replace(/<br\s*\/>/gi, '<br>');
}
