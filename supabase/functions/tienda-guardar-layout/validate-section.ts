// AIMMA Fase C · validateAndSanitizeSection · FUENTE UNICA usada por el save (EF) Y el endpoint render-section.
// Zod parse (SectionSchema) + sanitize del contenido rich-text (texto) con la policy compartida.
// El sanitize es la MISMA expresion que la EF producia (byte-inalterado, test 15).
import sanitizeHtml from 'sanitize-html';
import { SectionSchema, buildEmbedFromUrl, type Section } from './editor-schema.ts';
import { RICHTEXT_POLICY, toSanitizeHtml, normalizeVoidEls } from './richtext-policy.ts';

const RICHTEXT_OPTS = toSanitizeHtml(RICHTEXT_POLICY);

export function validateAndSanitizeSection(raw: unknown): Section {
  const s = SectionSchema.parse(raw);
  if (s.tipo === 'texto' && s.props && typeof s.props.contenido === 'string') {
    s.props.contenido = normalizeVoidEls(sanitizeHtml(s.props.contenido, RICHTEXT_OPTS));
  } else if (s.tipo === 'video' && s.props && typeof s.props.url === 'string' && s.props.url.trim()) {
    // FASE D (2a): la EF es la AUTORIDAD — construye el iframe canonico desde la url de proveedor
    // (YouTube/Vimeo) ya validada por el schema. Legacy/avanzado (solo `html`) no entra aca -> conserva
    // su iframe tal cual. buildEmbedFromUrl no puede devolver null aca (el schema ya lo valido), pero
    // si lo hiciera no tocamos html (defensivo).
    const built = buildEmbedFromUrl(s.props.url.trim());
    if (built) s.props.html = built;
  } else if (s.tipo === 'contenedor' && s.props && Array.isArray(s.props.bloques)) {
    // FASE D (D3): sanitiza RECURSIVO el rich-text de los hijos `texto`, con la MISMA policy que el
    // texto top-level (capa 2 de la disciplina de 3 capas: admin browser + EF al guardar + storefront
    // al render). Profundidad 2 por schema (los hijos son hoja, sin contenedor anidado) -> una pasada.
    // FASE D (2a): un hijo `video` con url tambien construye su iframe canonico (misma autoridad EF).
    for (const b of s.props.bloques) {
      if (b && b.tipo === 'texto' && b.props && typeof b.props.contenido === 'string') {
        b.props.contenido = normalizeVoidEls(sanitizeHtml(b.props.contenido, RICHTEXT_OPTS));
      } else if (b && b.tipo === 'video' && b.props && typeof b.props.url === 'string' && b.props.url.trim()) {
        const built = buildEmbedFromUrl(b.props.url.trim());
        if (built) b.props.html = built;
      }
    }
  }
  return s;
}
