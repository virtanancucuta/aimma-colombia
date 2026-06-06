// AIMMA Fase C · validateAndSanitizeSection · FUENTE UNICA usada por el save (EF) Y el endpoint render-section.
// Zod parse (SectionSchema) + sanitize del contenido rich-text (texto) con la policy compartida.
// El sanitize es la MISMA expresion que la EF producia (byte-inalterado, test 15).
import sanitizeHtml from 'sanitize-html';
import { SectionSchema, type Section } from './editor-schema';
import { RICHTEXT_POLICY, toSanitizeHtml, normalizeVoidEls } from './richtext-policy';

const RICHTEXT_OPTS = toSanitizeHtml(RICHTEXT_POLICY);

export function validateAndSanitizeSection(raw: unknown): Section {
  const s = SectionSchema.parse(raw);
  if (s.tipo === 'texto' && s.props && typeof s.props.contenido === 'string') {
    s.props.contenido = normalizeVoidEls(sanitizeHtml(s.props.contenido, RICHTEXT_OPTS));
  }
  return s;
}
