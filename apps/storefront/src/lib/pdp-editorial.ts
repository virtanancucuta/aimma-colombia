// AIMMA Storefront · F3 · Normaliza el contenido editorial por-producto (guia de
// tallas + ficha) para el PDP x4. Logica PURA y compartida: URL segura (http/https),
// trim de prosa, filtrado de vinietas vacias, flag hasFicha. La presentacion (markup
// + estilo per-plantilla) vive en cada shell ProductDetail*. Texto plano del dueno;
// el escape lo hace Astro al render (sin sanitize-html: no se renderiza HTML).

export interface EditorialPDP {
  guiaUrl: string;
  material: string;
  ajuste: string;
  diseno: string[];
  beneficios: string[];
  hasFicha: boolean;
}

function safeHttpUrl(u: unknown): string {
  if (typeof u !== 'string') return '';
  try {
    const x = new URL(u);
    return /^https?:$/.test(x.protocol) ? u : '';
  } catch {
    return '';
  }
}

function cleanLines(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && !!x.trim())
    .map((x) => x.trim());
}

export function normalizeEditorial(producto: any): EditorialPDP {
  const f = producto && producto.ficha_editorial && typeof producto.ficha_editorial === 'object'
    ? producto.ficha_editorial
    : null;
  const material = f && typeof f.material === 'string' ? f.material.trim() : '';
  const ajuste = f && typeof f.ajuste === 'string' ? f.ajuste.trim() : '';
  const diseno = f ? cleanLines(f.diseno) : [];
  const beneficios = f ? cleanLines(f.beneficios) : [];
  return {
    guiaUrl: safeHttpUrl(producto && producto.guia_tallas_url),
    material,
    ajuste,
    diseno,
    beneficios,
    hasFicha: !!(material || ajuste || diseno.length || beneficios.length),
  };
}
