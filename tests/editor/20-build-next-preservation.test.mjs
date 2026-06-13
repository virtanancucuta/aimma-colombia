import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNextPersonalizaciones } from '../../packages/database/src/build-next-personalizaciones.ts';

// ============================================================
// L2 · INVARIANTE CENTRAL multi-pagina: escribir/publicar UNA pagina NO pisa las OTRAS keys de pages.
// Ejerce el CODIGO REAL del write path del EF parametrizado: el EF (tienda-guardar-layout/index.ts)
// importa un mirror byte-identico de buildNextPersonalizaciones (sync-guard en test 04). No es una
// reimplementacion. Regression guard permanente del invariante para L3 (switcher) / L4 / L5.
// La capa HTTP/auth del EF se verifica aparte (OPTIONS 204, POST anon->401, byte-compare deploy).
// ============================================================

const NOW = '2026-06-12T20:00:00.000Z';
const OLD = '2026-06-01T10:00:00.000Z';

// Pagina valida minima con marcador unico (para distinguir contenido byte-a-byte).
const page = (marca, updated_at) => ({
  version: 2,
  updated_at,
  sections: [{
    id: 'sec_' + marca,
    ancho: 'completo',
    fondo: { tipo: 'transparente', valor: '' },
    padding: 'md',
    tipo: 'texto',
    props: { contenido: marca, alineacion: 'left', tamanio: 'md' },
  }],
});

test('caso 1: publish coleccion preserva home BYTE-IDENTICO (contenido + updated_at sin cambiar)', () => {
  const H = page('home', OLD);
  const current = { schema_version: 3, pages: { home: H } };
  const C = page('coleccion-nueva', OLD); // updated_at entrante DEBE ser reemplazado por `now`
  const next = buildNextPersonalizaciones(current, 'coleccion', 'publish', C, undefined, undefined, NOW);

  // home intacto byte-a-byte (incluido updated_at)
  assert.equal(JSON.stringify(next.pages.home), JSON.stringify(H));
  assert.equal(next.pages.home.updated_at, OLD);
  // coleccion escrita; el servidor sella updated_at = now
  assert.equal(next.pages.coleccion.updated_at, NOW);
  assert.deepEqual(next.pages.coleccion.sections, C.sections);
  // solo home + coleccion, sin drafts colaterales
  assert.deepEqual(Object.keys(next.pages).sort(), ['coleccion', 'home']);
});

test('caso 2: publish coleccion preserva home Y una key arbitraria (otra)', () => {
  const H = page('home', OLD);
  const X = page('otra', OLD);
  const current = { schema_version: 3, pages: { home: H, otra: X } };
  const C = page('coleccion', OLD);
  const next = buildNextPersonalizaciones(current, 'coleccion', 'publish', C, undefined, undefined, NOW);

  assert.equal(JSON.stringify(next.pages.home), JSON.stringify(H));
  assert.equal(JSON.stringify(next.pages.otra), JSON.stringify(X));
  assert.equal(next.pages.coleccion.updated_at, NOW);
  assert.deepEqual(Object.keys(next.pages).sort(), ['coleccion', 'home', 'otra']);
});

test('caso 3 (inverso): publish home preserva TODAS las no-target (coleccion + otra)', () => {
  const H = page('home-viejo', OLD);
  const C = page('coleccion', OLD);
  const X = page('otra', OLD);
  const current = { schema_version: 3, pages: { home: H, coleccion: C, otra: X } };
  const H2 = page('home-nuevo', OLD);
  const next = buildNextPersonalizaciones(current, 'home', 'publish', H2, undefined, undefined, NOW);

  // target home actualizado + sellado
  assert.deepEqual(next.pages.home.sections, H2.sections);
  assert.equal(next.pages.home.updated_at, NOW);
  // TODAS las no-target preservadas byte-a-byte (no solo home cuando el target es otra cosa)
  assert.equal(JSON.stringify(next.pages.coleccion), JSON.stringify(C));
  assert.equal(JSON.stringify(next.pages.otra), JSON.stringify(X));
  assert.deepEqual(Object.keys(next.pages).sort(), ['coleccion', 'home', 'otra']);
});

test('draft escribe <pageId>_draft, preserva las publicadas y el theme publicado', () => {
  const H = page('home', OLD);
  const C = page('coleccion', OLD);
  const current = { schema_version: 3, theme: { font_pairing: 'industrial' }, pages: { home: H, coleccion: C } };
  const Cdraft = page('coleccion-draft', OLD);
  const next = buildNextPersonalizaciones(current, 'coleccion', 'draft', Cdraft, undefined, undefined, NOW);

  assert.equal(next.pages.coleccion_draft.updated_at, NOW);
  assert.deepEqual(next.pages.coleccion_draft.sections, Cdraft.sections);
  // publicadas intactas
  assert.equal(JSON.stringify(next.pages.coleccion), JSON.stringify(C));
  assert.equal(JSON.stringify(next.pages.home), JSON.stringify(H));
  // theme publicado preservado (draft sin theme entrante no lo toca)
  assert.deepEqual(next.theme, { font_pairing: 'industrial' });
  assert.deepEqual(Object.keys(next.pages).sort(), ['coleccion', 'coleccion_draft', 'home']);
});

test('publish limpia SOLO el draft de la pagina target, no los drafts de otras', () => {
  const H = page('home', OLD);
  const Cdraft = page('coleccion-draft', OLD);
  const Hdraft = page('home-draft', OLD);
  const current = { schema_version: 3, pages: { home: H, coleccion_draft: Cdraft, home_draft: Hdraft } };
  const C = page('coleccion-pub', OLD);
  const next = buildNextPersonalizaciones(current, 'coleccion', 'publish', C, undefined, undefined, NOW);

  // draft de la target eliminado al publicar
  assert.equal(next.pages.coleccion_draft, undefined);
  // draft de OTRA pagina preservado
  assert.equal(JSON.stringify(next.pages.home_draft), JSON.stringify(Hdraft));
  assert.equal(JSON.stringify(next.pages.home), JSON.stringify(H));
  assert.equal(next.pages.coleccion.updated_at, NOW);
});

test('no muta el objeto current de entrada (structuredClone aisla)', () => {
  const H = page('home', OLD);
  const current = { schema_version: 3, pages: { home: H } };
  const snapshot = JSON.stringify(current);
  buildNextPersonalizaciones(current, 'coleccion', 'publish', page('c', OLD), undefined, undefined, NOW);
  assert.equal(JSON.stringify(current), snapshot); // entrada sin mutar
});

// ============================================================
// M4 · deletePages: borrar paginas EN BLANCO (key pagina:<slug>) + su _draft. GUARDRAIL #1: SOLO
// pagina:<slug>; NUNCA home/coleccion/theme/nav. Ejerce el CODIGO REAL (mirror EF byte-identico, test 04).
// ============================================================

test('M4 deletePages: borra pagina:<slug> + su _draft; preserva las demas paginas', () => {
  const current = { schema_version: 3, pages: {
    home: page('home', OLD),
    'pagina:contacto': page('contacto', OLD),
    'pagina:contacto_draft': page('contacto-d', OLD),
    'pagina:otra': page('otra', OLD),
  } };
  const next = buildNextPersonalizaciones(current, 'home', 'draft', page('home2', OLD), undefined, undefined, NOW, ['pagina:contacto']);
  assert.equal(next.pages['pagina:contacto'], undefined);          // borrada
  assert.equal(next.pages['pagina:contacto_draft'], undefined);    // su draft tambien
  assert.ok(next.pages['pagina:otra']);                            // otra pagina preservada
  assert.ok(next.pages.home_draft);                                // el draft de home (target) intacto
  assert.ok(next.pages.home);                                      // home publicada intacta
});

test('M4 deletePages GUARDRAIL: ignora home/coleccion/theme/nav y claves que no son pagina:<slug>', () => {
  const current = { schema_version: 3,
    theme: { font_pairing: 'industrial' },
    nav: [{ id: 'nav_home0', tipo: 'home', label: 'Inicio', parentId: null, orden: 0, mostrar_en_menu: true }],
    pages: { home: page('home', OLD), coleccion: page('col', OLD), 'pagina:ok': page('ok', OLD) },
  };
  const next = buildNextPersonalizaciones(current, 'home', 'draft', page('home', OLD), undefined, undefined, NOW,
    ['home', 'coleccion', 'theme', 'nav', 'pagina:OK', '../secret', 'pagina:ok']); // mezcla de ataques + 1 valida
  assert.ok(next.pages.home);                          // home NO se borra (no matchea pagina:<slug>)
  assert.ok(next.pages.coleccion);                     // coleccion NO se borra
  assert.deepEqual(next.theme, { font_pairing: 'industrial' }); // theme intacto
  assert.ok(Array.isArray(next.nav) && next.nav.length === 1);  // nav intacto
  assert.equal(next.pages['pagina:ok'], undefined);    // la unica clave valida SI se borra
});

test('M4 deletePages NO descarta el nav_draft pendiente (delete-only no toca el arbol)', () => {
  const navd = [{ id: 'nav_home0', tipo: 'home', label: 'Inicio', parentId: null, orden: 0, mostrar_en_menu: true }];
  const current = { schema_version: 3, nav_draft: navd, pages: { home: page('home', OLD), 'pagina:xy': page('xy', OLD) } };
  const next = buildNextPersonalizaciones(current, 'home', 'draft', page('home', OLD), undefined, navd, NOW, ['pagina:xy']);
  assert.equal(next.pages['pagina:xy'], undefined);
  assert.equal(JSON.stringify(next.nav_draft), JSON.stringify(navd)); // nav_draft preservado/escrito
});
