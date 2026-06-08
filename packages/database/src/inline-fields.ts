// AIMMA · packages/database · inline-fields
// Registro UNICO de campos de TEXTO SIMPLE editables inline (C.2 Paso 2). Fuente compartida:
// storefront (InlineEdit + validacion) y mirror admin (validacion G3 del inline-commit).
// SOLO texto simple de una linea. Rich-text/textarea/atributos NO van aca (siguen por inspector).
// Patron de ruta: dot-path en props; '*' = indice de array. Ej: 'items.*.texto', 'campos.*.label'.

export const SIMPLE_TEXT_FIELDS: Record<string, readonly string[]> = {
  // subtitulo es textarea en el inspector pero se RENDERIZA en una sola linea (sin white-space:pre-line)
  // -> inline single-line es fiel al display; el inspector sigue para multilinea si hace falta.
  banner: ['titulo', 'subtitulo', 'boton.texto'],
  botones: ['items.*.texto'],
  formulario: ['titulo', 'boton_texto', 'campos.*.label'],
  // B-secciones Lote 1
  imagen_con_texto: ['titulo', 'boton.texto'],
  caracteristicas: ['titulo', 'items.*.titulo'],
  cita: ['texto', 'autor'],
  // B-secciones Lote 2 (testimonios: autor/cargo single-line; faq/logos: solo titulo de seccion)
  testimonios: ['titulo', 'items.*.autor', 'items.*.cargo'],
  faq: ['titulo'],
  logos: ['titulo'],
  // B-secciones Lote 3 (categorias_destacadas: solo titulo; producto_destacado: titulo + cta_texto
  // single-line. Los picks (categoria_id/producto_id) y el texto plano van por inspector.)
  categorias_destacadas: ['titulo'],
  producto_destacado: ['titulo', 'cta_texto'],
};

const SEG_RE = /^[a-z_][a-z0-9_]*$/i;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

// ¿la ruta concreta (ej 'items.2.texto') matchea un patron del tipo (ej 'items.*.texto')?
// '*' acepta SOLO indices numericos. Rechaza segmentos peligrosos (defensa en profundidad).
export function isSimpleTextField(tipo: string, path: string): boolean {
  if (typeof tipo !== 'string' || typeof path !== 'string') return false;
  const patterns = SIMPLE_TEXT_FIELDS[tipo as keyof typeof SIMPLE_TEXT_FIELDS];
  if (!patterns) return false;
  const segs = path.split('.');
  if (segs.some((s) => FORBIDDEN.has(s) || !(SEG_RE.test(s) || /^\d+$/.test(s)))) return false;
  return patterns.some((pat) => {
    const ps = pat.split('.');
    if (ps.length !== segs.length) return false;
    return ps.every((p, i) => (p === '*' ? /^\d+$/.test(segs[i]) : p === segs[i]));
  });
}

// Set inmutable por ruta. Guarda contra prototype pollution + SOLO setea campos que YA EXISTEN
// (el inline-edit edita lo que ya se renderizo; no crea estructura). Devuelve nuevo props o null.
export function setByPath<T extends Record<string, any>>(obj: T, path: string, value: string): T | null {
  if (!obj || typeof obj !== 'object') return null;
  const segs = path.split('.');
  if (segs.some((s) => FORBIDDEN.has(s) || !(SEG_RE.test(s) || /^\d+$/.test(s)))) return null;
  const root: any = Array.isArray(obj) ? obj.slice() : { ...obj };
  let cur: any = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const k: any = /^\d+$/.test(segs[i]) ? Number(segs[i]) : segs[i];
    const child = cur[k];
    if (child === undefined || child === null || typeof child !== 'object') return null;
    const clone: any = Array.isArray(child) ? child.slice() : { ...child };
    cur[k] = clone;
    cur = clone;
  }
  const last = segs[segs.length - 1];
  const lk: any = /^\d+$/.test(last) ? Number(last) : last;
  if (!(lk in cur)) return null; // el campo debe EXISTIR
  cur[lk] = value;
  return root;
}

export function getByPath(obj: any, path: string): unknown {
  if (typeof path !== 'string') return undefined;
  let cur = obj;
  for (const s of path.split('.')) {
    if (FORBIDDEN.has(s) || cur == null || typeof cur !== 'object') return undefined;
    cur = cur[/^\d+$/.test(s) ? Number(s) : s];
  }
  return cur;
}

// Limpia el textContent del contenteditable -> texto plano de UNA linea. El navegador mete
// nbsp/saltos/tabs al tipear o pegar; aca normalizamos para que el valor guardado no arrastre basura.
export function cleanInlineText(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/ /g, ' ')     // nbsp -> espacio
    .replace(/[\r\n\t]+/g, ' ')  // saltos/tabs -> espacio (una linea)
    .replace(/\s+/g, ' ')        // colapsar espacios
    .trim();
}
