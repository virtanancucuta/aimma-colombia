// AIMMA Editor PRO-MAX · B-controles #4 rich-text · Politica canonica lib-agnostica.
// UNA fuente de verdad para la allowlist. Dos adaptadores: sanitize-html (EF autoritativa)
// y DOMPurify (storefront defensa en profundidad + admin best-effort). Mirror byte-identico
// en supabase/functions/tienda-guardar-layout/richtext-policy.ts (sync-test 10).
// NO importa ninguna lib (datos + funciones puras) -> Deno-compatible + bundleable por Vite.

export const RICHTEXT_POLICY = {
  tags: ['b', 'strong', 'i', 'em', 'a', 'ul', 'ol', 'li', 'p', 'br'],
  attrs: { a: ['href'] } as Record<string, string[]>,
  schemes: ['https', 'mailto', 'tel'],
  allowProtocolRelative: false,
};

// Adaptador sanitize-html (EF). disallowedTagsMode 'discard' elimina tag + (script/style) su texto.
// selfClosing: [] -> void elements (<br>) se emiten SIN auto-cierre, igual que DOMPurify, para que
// el HTML guardado sea punto fijo de la DOMPurify del storefront (idempotencia, test 11).
export function toSanitizeHtml(policy = RICHTEXT_POLICY) {
  return {
    allowedTags: [...policy.tags],
    allowedAttributes: Object.fromEntries(
      Object.entries(policy.attrs).map(([k, v]) => [k, [...v]]),
    ),
    allowedSchemes: [...policy.schemes],
    allowProtocolRelative: policy.allowProtocolRelative,
    disallowedTagsMode: 'discard' as const,
    selfClosing: [] as string[],
  };
}

// Adaptador DOMPurify (storefront + admin). ALLOWED_ATTR es global; como href solo aplica a <a>
// y solo <a> esta en ALLOWED_TAGS, equivale al por-tag de sanitize-html. URI solo https/mailto/tel.
export function toDOMPurify(policy = RICHTEXT_POLICY) {
  const attrs = [...new Set(Object.values(policy.attrs).flat())];
  return {
    ALLOWED_TAGS: [...policy.tags],
    ALLOWED_ATTR: attrs,
    ALLOWED_URI_REGEXP: new RegExp('^(' + policy.schemes.join(':|') + ':)', 'i'),
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math'],
    FORBID_ATTR: ['style', 'class', 'id', 'target'],
    ALLOW_DATA_ATTR: false,
  };
}
