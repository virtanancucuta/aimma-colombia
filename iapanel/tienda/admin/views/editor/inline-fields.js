/* AIMMA Tienda IA · Editor PRO-MAX · C.2 Paso 2 · inline-fields.js
 * MIRROR JS de packages/database/src/inline-fields.ts (el admin vanilla no importa @aimma/database).
 * Mantener EN SYNC (test 18 lo verifica). Registro UNICO de campos texto-simple editables inline +
 * isSimpleTextField (validacion G3 del inline-commit) + setByPath (anti prototype-pollution) + cleanInlineText.
 * Marker: editor-c2p2-inline-fields.
 */
(function (window) {
  'use strict';

  var SIMPLE_TEXT_FIELDS = {
    // subtitulo: textarea en inspector pero se renderiza en UNA linea -> inline single-line fiel al display.
    banner: ['titulo', 'subtitulo', 'boton.texto'],
    botones: ['items.*.texto'],
    formulario: ['titulo', 'boton_texto', 'campos.*.label'],
    // B-secciones Lote 1
    imagen_con_texto: ['titulo', 'boton.texto'],
    caracteristicas: ['titulo', 'items.*.titulo'],
    cita: ['texto', 'autor'],
  };

  var SEG_RE = /^[a-z_][a-z0-9_]*$/i;
  var FORBIDDEN = { __proto__: true, constructor: true, prototype: true };
  function forbidden(s) { return s === '__proto__' || s === 'constructor' || s === 'prototype'; }

  function isSimpleTextField(tipo, path) {
    if (typeof tipo !== 'string' || typeof path !== 'string') return false;
    var patterns = SIMPLE_TEXT_FIELDS[tipo];
    if (!patterns || !Object.prototype.hasOwnProperty.call(SIMPLE_TEXT_FIELDS, tipo)) return false;
    var segs = path.split('.');
    for (var i = 0; i < segs.length; i++) {
      if (forbidden(segs[i]) || !(SEG_RE.test(segs[i]) || /^\d+$/.test(segs[i]))) return false;
    }
    return patterns.some(function (pat) {
      var ps = pat.split('.');
      if (ps.length !== segs.length) return false;
      return ps.every(function (p, k) { return p === '*' ? /^\d+$/.test(segs[k]) : p === segs[k]; });
    });
  }

  // Set inmutable por ruta. Guarda __proto__/constructor/prototype + SOLO setea campos que YA EXISTEN.
  // Devuelve un nuevo objeto props o null (ruta invalida / campo inexistente).
  function setByPath(obj, path, value) {
    if (!obj || typeof obj !== 'object') return null;
    var segs = path.split('.');
    for (var i = 0; i < segs.length; i++) {
      if (forbidden(segs[i]) || !(SEG_RE.test(segs[i]) || /^\d+$/.test(segs[i]))) return null;
    }
    var root = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
    var cur = root;
    for (var k = 0; k < segs.length - 1; k++) {
      var key = /^\d+$/.test(segs[k]) ? Number(segs[k]) : segs[k];
      var child = cur[key];
      if (child === undefined || child === null || typeof child !== 'object') return null;
      var clone = Array.isArray(child) ? child.slice() : Object.assign({}, child);
      cur[key] = clone;
      cur = clone;
    }
    var last = segs[segs.length - 1];
    var lk = /^\d+$/.test(last) ? Number(last) : last;
    if (!(lk in cur)) return null;
    cur[lk] = value;
    return root;
  }

  function cleanInlineText(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/ /g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorInlineFields = {
    SIMPLE_TEXT_FIELDS: SIMPLE_TEXT_FIELDS,
    isSimpleTextField: isSimpleTextField,
    setByPath: setByPath,
    cleanInlineText: cleanInlineText,
  };
})(window);
