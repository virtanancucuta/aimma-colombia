// packages/database/src/build-next-personalizaciones.ts
// AIMMA Editor PRO-MAX · Editor multi-pagina L2 · NUCLEO de preservacion del write path.
// Construye el objeto `personalizaciones` a persistir a partir del actual (DB) + la pagina/tema
// entrantes. INVARIANTE CENTRAL multi-pagina: escribir/publicar UNA pagina (pageId) NO pisa las
// OTRAS keys de pages (structuredClone copia todo; solo se sobreescribe la clave target + su draft).
// Pura (structuredClone + spread, sin imports) -> corre identico en Deno (EF) y Node (tests/Vite).
// El EF tienda-guardar-layout IMPORTA un mirror byte-identico de este archivo (sync-test 04),
// asi tests/editor/20 ejerce el CODIGO REAL del write path, no una reimplementacion.

export function buildNextPersonalizaciones(
  current: any,
  pageId: string,
  mode: 'draft' | 'publish',
  pageFromClient: any,
  themeFromClient: any,
  now: string,
): any {
  const next: any = structuredClone(current || { schema_version: 3, pages: {} });
  next.schema_version = 3;
  if (mode === 'draft') {
    // Borrador: escribe SOLO theme_draft; NO toca el theme publicado (preservado via structuredClone).
    if (themeFromClient !== undefined) next.theme_draft = themeFromClient;
  } else {
    // Publicar: promueve el theme + limpia el borrador.
    if (themeFromClient !== undefined) next.theme = themeFromClient;
    delete next.theme_draft;
  }
  const draftKey = pageId + '_draft';
  if (mode === 'draft') {
    next.pages[draftKey] = { ...pageFromClient, updated_at: now };
  } else {
    next.pages[pageId] = { ...pageFromClient, updated_at: now };
    delete next.pages[draftKey];
  }
  return next;
}
