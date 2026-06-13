// M5.A · Menu del arbol (IC). CANARY: tienda sin nav / solo-Inicio -> menu fallback = categorias
// top-level flat, BYTE-IDENTICO al de hoy (golden capturado en el codigo PRE-M5.A). Delta nav-presente
// + unit-tests de buildMenu se agregan abajo tras implementar. Render via Container + normalize (cid).
import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { stubSupabase, normalize } from './helpers/render-harness.ts';
import { buildMenu } from '../src/lib/menu.ts';
import Header from '../src/components/Header.astro';

const REQUEST = new Request('https://aimma-test.tienda.aimma.com.co/');
const CATS = [
  { id: 'c1', nombre: 'ACEITES CARRO', slug: 'aceites-carro', orden: 0 },
  { id: 'c2', nombre: 'CALZADO DAMA', slug: 'calzado-dama', orden: 1 },
  { id: 'c3', nombre: 'ROPA DAMA', slug: 'ropa-dama', orden: 2 },
];

async function renderHeaderHtml(personalizaciones: any, cats = CATS, slug = 'industrial_clean') {
  const container = await AstroContainer.create();
  const tienda: any = { id: 'tienda-test', nombre_negocio: 'Tienda Test', logo_url: null, plantilla: { slug }, personalizaciones };
  const html = await container.renderToString(Header, { props: {}, locals: { tienda, supabase: stubSupabase(cats) } as any, request: REQUEST });
  return normalize(html);
}

describe('M5.A menu del arbol (IC) · CANARY fallback byte-identico', () => {
  test('IC sin nav -> fallback (categorias flat) golden', async () => {
    const html = await renderHeaderHtml({ schema_version: 3, pages: {} });
    await expect(html).toMatchFileSnapshot(fileURLToPath(new URL('./__snapshots__/menu/ic-fallback-sinnav.html', import.meta.url)));
  });
  test('IC nav solo-Inicio -> mismo fallback', async () => {
    const navHome = [{ id: 'nav_home0', tipo: 'home', label: 'Inicio', parentId: null, orden: 0, mostrar_en_menu: true }];
    const html = await renderHeaderHtml({ schema_version: 3, nav: navHome, pages: {} });
    await expect(html).toMatchFileSnapshot(fileURLToPath(new URL('./__snapshots__/menu/ic-fallback-solohome.html', import.meta.url)));
  });
  // M5.B: canary fallback byte-identico de las otras 3 plantillas (golden capturado PRE-M5.B).
  for (const slug of ['fashion_bold', 'minimal_artesanal', 'editorial_magazine']) {
    test(`${slug} sin nav -> fallback byte-identico`, async () => {
      const html = await renderHeaderHtml({ schema_version: 3, pages: {} }, CATS, slug);
      await expect(html).toMatchFileSnapshot(fileURLToPath(new URL(`./__snapshots__/menu/${slug}-fallback-sinnav.html`, import.meta.url)));
    });
  }
});

// Arbol como aimma-test: aceites + calzado>tacon + ropa>blusa + Contactanos (blanco).
const NAV_TREE = [
  { id: 'nav_home0', tipo: 'home', label: 'Inicio', parentId: null, orden: 0, mostrar_en_menu: true },
  { id: 'nav_aceites', tipo: 'coleccion', label: 'ACEITES CARRO', slug: 'aceites-carro', parentId: null, orden: 0, mostrar_en_menu: true },
  { id: 'nav_calzado', tipo: 'coleccion', label: 'CALZADO DAMA', slug: 'calzado-dama', parentId: null, orden: 1, mostrar_en_menu: true },
  { id: 'nav_tacon0', tipo: 'coleccion', label: 'TACON DAMA', slug: 'tacon-dama', parentId: 'nav_calzado', orden: 1, mostrar_en_menu: true },
  { id: 'nav_ropa00', tipo: 'coleccion', label: 'ROPA DAMA', slug: 'ropa-dama', parentId: null, orden: 2, mostrar_en_menu: true },
  { id: 'nav_blusa0', tipo: 'coleccion', label: 'BLUSA DAMA', slug: 'blusa-dama', parentId: 'nav_ropa00', orden: 1, mostrar_en_menu: true },
  { id: 'nav_cont00', tipo: 'blanco', label: 'Contactanos', slug: 'contactanos', parentId: null, orden: 3, mostrar_en_menu: true },
];

describe('buildMenu (funcion PURA)', () => {
  test('FALLBACK: sin nav / vacio / solo-Inicio -> categorias top-level flat', () => {
    const flat = CATS.map((c) => ({ label: c.nombre, href: '/c/' + c.slug, children: [] }));
    expect(buildMenu(undefined, CATS)).toEqual(flat);
    expect(buildMenu([], CATS)).toEqual(flat);
    expect(buildMenu([{ id: 'nav_home0', tipo: 'home', label: 'Inicio', parentId: null, orden: 0 }], CATS)).toEqual(flat);
  });
  test('nav-derived: salta Inicio + top-level por orden + hrefs por tipo + hijos (2 niveles)', () => {
    const m = buildMenu(NAV_TREE, CATS);
    expect(m.map((i) => i.label)).toEqual(['ACEITES CARRO', 'CALZADO DAMA', 'ROPA DAMA', 'Contactanos']);
    expect(m.map((i) => i.href)).toEqual(['/c/aceites-carro', '/c/calzado-dama', '/c/ropa-dama', '/pagina/contactanos']);
    expect(m[0].children).toEqual([]);                                            // aceites sin hijos
    expect(m[1].children).toEqual([{ label: 'TACON DAMA', href: '/c/tacon-dama' }]); // calzado>tacon
    expect(m[2].children).toEqual([{ label: 'BLUSA DAMA', href: '/c/blusa-dama' }]); // ropa>blusa
    expect(m[3].children).toEqual([]);                                            // contactanos (blanco) sin hijos
  });
  test('mostrar_en_menu=false excluye (top-level y subnivel)', () => {
    const nav = [
      { id: 'nav_a000', tipo: 'coleccion', label: 'A', slug: 'a', parentId: null, orden: 0, mostrar_en_menu: false },
      { id: 'nav_b000', tipo: 'coleccion', label: 'B', slug: 'b', parentId: null, orden: 1, mostrar_en_menu: true },
      { id: 'nav_c000', tipo: 'coleccion', label: 'C', slug: 'c', parentId: 'nav_b000', orden: 1, mostrar_en_menu: false },
    ];
    const m = buildMenu(nav, []);
    expect(m.map((i) => i.label)).toEqual(['B']); // A oculta
    expect(m[0].children).toEqual([]);            // C oculta
  });
});

describe('M5.A DELTA: IC con nav sembrado -> top-level + dropdowns + pagina en blanco', () => {
  test('mismos links/orden + dropdowns (tacon/blusa) + Contactanos alcanzable', async () => {
    const html = await renderHeaderHtml({ schema_version: 3, nav: NAV_TREE, pages: {} });
    // top-level (mismos /c/ que hoy) + la pagina en blanco entra al menu
    for (const h of ['/c/aceites-carro', '/c/calzado-dama', '/c/ropa-dama', '/pagina/contactanos']) expect(html).toContain(`href="${h}"`);
    // subcategorias en dropdown
    expect(html).toContain('href="/c/tacon-dama"');
    expect(html).toContain('href="/c/blusa-dama"');
    expect(html).toContain('ic-nav-dropdown');
    expect(html).toContain('Contactanos');
  });
});

// M5.B DELTA: dropdown del arbol en las otras 3 plantillas. Limite por-plantilla: IC 6 / FB 5 / MA 3 / EM 4.
// CALZADO(orden1)+ROPA(orden2) entran en las 4 -> sus dropdowns (tacon/blusa) aparecen siempre.
// Contactanos es el 4to top-level (orden3) -> MA (slice 3) lo corta; IC/FB/EM (>=4) lo muestran.
const TPL_M5B = [
  { slug: 'fashion_bold', drop: 'fb-nav-dropdown', limit: 5 },
  { slug: 'minimal_artesanal', drop: 'ma-nav-dropdown', limit: 3 },
  { slug: 'editorial_magazine', drop: 'em-nav-dropdown', limit: 4 },
];
describe('M5.B DELTA: dropdown del arbol en FB/MA/EM', () => {
  for (const t of TPL_M5B) {
    test(`${t.slug}: dropdowns (tacon/blusa) + clase ${t.drop}`, async () => {
      const html = await renderHeaderHtml({ schema_version: 3, nav: NAV_TREE, pages: {} }, CATS, t.slug);
      expect(html).toContain('href="/c/tacon-dama"');     // subcategoria de CALZADO
      expect(html).toContain('href="/c/blusa-dama"');     // subcategoria de ROPA
      expect(html).toContain(t.drop);                     // estructura de dropdown de la plantilla
      if (t.limit >= 4) expect(html).toContain('href="/pagina/contactanos"'); // pagina en blanco (4to)
    });
  }
});

// M5.C: tamano de texto del menu. La regla de escala vive en el <style> de cada plantilla; renderToString
// (Container API) NO inlinea el <style> -> NO se puede asertar la regla aca (se verifica en el browser
// test contra el CSS compilado + grep del bundle). Lo que SI toca el HTML es el marker ma-nav-menu de MA
// (su <nav> mezcla menu + carrito -> el marker excluye carrito/Contacto del escalado). IC/FB/EM no cambian
// HTML (el carrito ya esta fuera del <nav aria-label="Categorias">). Canario: goldens fallback IC/FB/EM
// byte-identicos; MA suma SOLO el marker en la ul del menu.
describe('M5.C: marker {prefix}-nav-menu (escala SOLO el menu; selector prefijado evita colision entre plantillas)', () => {
  // El bundle compilado incluye las 4 plantillas (Header.astro las importa todas) -> el selector NO puede
  // ser generico (nav[aria-label="Categorias"] colisionaria IC=13 vs FB=12). Cada plantilla usa su marker.
  const MARKER: Record<string, string> = {
    industrial_clean: 'ic-nav-menu', fashion_bold: 'fb-nav-menu', minimal_artesanal: 'ma-nav-menu', editorial_magazine: 'em-nav-menu',
  };
  for (const slug of Object.keys(MARKER)) {
    test(`${slug}: el nav del menu lleva el marker ${MARKER[slug]}`, async () => {
      const html = await renderHeaderHtml({ schema_version: 3, nav: NAV_TREE, pages: {} }, CATS, slug);
      expect(html).toContain(MARKER[slug]);
    });
  }
  test('MA: el marker va en la ul del menu (izq), NO en la ul del carrito/Contacto', async () => {
    const html = await renderHeaderHtml({ schema_version: 3, nav: NAV_TREE, pages: {} }, CATS, 'minimal_artesanal');
    expect(html).toContain('class="ma-nav-menu hidden lg:flex items-center gap-10"'); // ul del menu (izq)
    expect(html).toContain('class="hidden lg:flex items-center gap-10"');             // ul carrito SIN marker
    expect(html).toContain('href="/carrito"');                                         // carrito intacto
  });
});

// MOBILE.A: hamburguesa + drawer (checkbox-hack + <details>) en IC. Canario desktop ya cubierto por
// los goldens fallback (cambio solo aditivo; nav desktop byte-identico verificado aparte).
describe('MOBILE.A: hamburguesa + drawer mobile (IC)', () => {
  test('IC: checkbox-hack + hamburguesa lg:hidden + drawer con TODO el arbol + <details> hijos', async () => {
    const html = await renderHeaderHtml({ schema_version: 3, nav: NAV_TREE, pages: {} });
    expect(html).toContain('id="ic-menu-cb"');                  // checkbox-hack (no-JS)
    expect(html).toContain('ic-menu-btn lg:hidden');            // hamburguesa, oculta en desktop
    expect(html).toContain('ic-menu-panel');                    // drawer
    expect(html).toContain('<details');                         // accordion para padres
    expect(html).toContain('Ver CALZADO DAMA');                 // link del padre DENTRO del accordion (decision 2)
    expect(html).toContain('Ver ROPA DAMA');
    expect(html).toContain('href="/c/tacon-dama"');             // subcategoria en el drawer
    expect(html).toContain('href="/c/blusa-dama"');
    expect(html).toContain('href="/pagina/contactanos"');       // pagina en blanco alcanzable en mobile
  });
  test('mobile NO aplica limite por-plantilla: el drawer trae items aunque el desktop corte', async () => {
    // 8 top-level (mas que el cap 6 de IC desktop) -> el drawer debe traer el 7mo/8vo igual.
    const many = [{ id: 'nav_home0', tipo: 'home', label: 'Inicio', parentId: null, orden: 0, mostrar_en_menu: true }];
    for (let i = 1; i <= 8; i++) many.push({ id: 'nav_c' + i + '000', tipo: 'coleccion', label: 'CAT' + i, slug: 'cat-' + i, categoria_id: '00000000-0000-4000-8000-00000000000' + i, parentId: null, orden: i, mostrar_en_menu: true });
    const html = await renderHeaderHtml({ schema_version: 3, nav: many, pages: {} });
    const panel = html.slice(html.indexOf('ic-menu-panel'));
    expect(panel).toContain('href="/c/cat-7"'); // el 7mo, fuera del cap 6 del desktop, SI en el drawer
    expect(panel).toContain('href="/c/cat-8"');
  });
});

// MOBILE.B: hamburguesa + drawer en las otras 3 plantillas (mismo patron checkbox-hack + <details>).
const TPL_MOBILE_B = [
  { slug: 'fashion_bold', cb: 'fb-menu-cb', btn: 'fb-menu-btn md:hidden', panel: 'fb-menu-panel' },
  { slug: 'minimal_artesanal', cb: 'ma-menu-cb', btn: 'ma-menu-btn', panel: 'ma-menu-panel' }, // hamburguesa en div lg:hidden
  { slug: 'editorial_magazine', cb: 'em-menu-cb', btn: 'em-menu-btn lg:hidden', panel: 'em-menu-panel' },
];
describe('MOBILE.B: hamburguesa + drawer en FB/MA/EM', () => {
  for (const t of TPL_MOBILE_B) {
    test(`${t.slug}: checkbox + hamburguesa + drawer (arbol completo) + <details>`, async () => {
      const html = await renderHeaderHtml({ schema_version: 3, nav: NAV_TREE, pages: {} }, CATS, t.slug);
      expect(html).toContain(`id="${t.cb}"`);                 // checkbox-hack (no-JS)
      expect(html).toContain(t.btn);                          // hamburguesa
      expect(html).toContain(t.panel);                        // drawer
      expect(html).toContain('<details');                     // accordion para padres
      expect(html).toContain('Ver CALZADO DAMA');             // link del padre adentro (decision 2)
      expect(html).toContain('href="/c/tacon-dama"');         // subcategoria en el drawer
      expect(html).toContain('href="/pagina/contactanos"');   // pagina en blanco en el drawer (incl. MA, sin limite mobile)
    });
  }
});

// MA-mobile-search: la plantilla MA era la unica sin buscador en mobile (su SearchBar estaba en la barra
// desktop-only hidden lg:flex). Fix: 2da instancia del SearchBar en el bar mobile (lg:hidden) con cbId
// unico (hsearch-cb-m) + noScript -> sin colision del checkbox-hack. Respeta el toggle mostrarBuscador.
describe('MA-mobile-search: buscador en el header mobile de MA (respeta el toggle)', () => {
  test('ON (default): MA mobile tiene SearchBar con id unico, sin colisionar el desktop', async () => {
    const html = await renderHeaderHtml({ schema_version: 3, nav: NAV_TREE, pages: {} }, CATS, 'minimal_artesanal');
    expect(html).toContain('id="hsearch-cb-m"');                              // checkbox mobile (id unico)
    expect(html).toContain('id="hsearch-cb"');                               // checkbox desktop (sigue)
    expect((html.match(/id="hsearch-cb"/g) || []).length).toBe(1);           // 1 sola vez -> sin duplicado
    expect((html.match(/id="hsearch-cb-m"/g) || []).length).toBe(1);
    expect(html).toContain('hsearch--ma');                                   // estilo MA
  });
  test('OFF (toggle Configuracion mostrar_buscador_header=false): MA NO renderiza buscador', async () => {
    const container = await AstroContainer.create();
    const tienda: any = { id: 'tienda-test', nombre_negocio: 'Tienda Test', logo_url: null, plantilla: { slug: 'minimal_artesanal' }, mostrar_buscador_header: false, personalizaciones: { schema_version: 3, nav: NAV_TREE, pages: {} } };
    const html = normalize(await container.renderToString(Header, { props: {}, locals: { tienda, supabase: stubSupabase(CATS) } as any, request: REQUEST }));
    expect(html).not.toContain('hsearch');                                   // sin buscador (ni desktop ni mobile)
  });
});
