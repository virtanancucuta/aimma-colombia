/* AIMMA Tienda IA · Editor PRO-MAX · B-controles #4 rich-text · richtext-policy.js v1
 * Mirror BROWSER de la politica canonica (packages/database/src/richtext-policy.ts).
 * Valor-synceado por tests/editor/10-richtext-policy-sync.test.mjs (no byte: distinta sintaxis).
 * Lo usa el control richText para normalizar el contenteditable con DOMPurify (CDN) -> WYSIWYG honesto.
 */
(function(window) {
  'use strict';
  var POLICY = {
    tags: ['b', 'strong', 'i', 'em', 'a', 'ul', 'ol', 'li', 'p', 'br'],
    attrs: { a: ['href'] },
    schemes: ['https', 'mailto', 'tel'],
    allowProtocolRelative: false,
  };
  function toDOMPurify(policy) {
    policy = policy || POLICY;
    var attrs = [];
    Object.keys(policy.attrs).forEach(function(k) {
      policy.attrs[k].forEach(function(a) { if (attrs.indexOf(a) === -1) attrs.push(a); });
    });
    return {
      ALLOWED_TAGS: policy.tags.slice(),
      ALLOWED_ATTR: attrs,
      ALLOWED_URI_REGEXP: new RegExp('^(' + policy.schemes.join(':|') + ':)', 'i'),
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math'],
      FORBID_ATTR: ['style', 'class', 'id', 'target'],
      ALLOW_DATA_ATTR: false,
    };
  }
  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.richtextPolicy = { POLICY: POLICY, toDOMPurify: toDOMPurify };
})(window);
