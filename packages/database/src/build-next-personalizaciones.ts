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
  navFromClient: any,
  now: string,
): any {
  const next: any = structuredClone(current || { schema_version: 3, pages: {} });
  next.schema_version = 3;
  if (mode === 'draft') {
    // Borrador: escribe SOLO theme_draft/nav_draft; NO toca lo publicado (preservado via structuredClone).
    if (themeFromClient !== undefined) next.theme_draft = themeFromClient;
    if (navFromClient !== undefined) next.nav_draft = navFromClient;
  } else {
    // Publicar: promueve theme + limpia su borrador.
    if (themeFromClient !== undefined) next.theme = themeFromClient;
    delete next.theme_draft;
    // nav (Administrador de Paginas): GUARDADO -> solo se promueve/limpia si el cliente envia nav.
    // Asi publicar una pagina sin tocar el menu NO descarta el nav_draft pendiente (asimetria
    // intencional vs theme, que el editor envia siempre).
    if (navFromClient !== undefined) { next.nav = navFromClient; delete next.nav_draft; }
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
