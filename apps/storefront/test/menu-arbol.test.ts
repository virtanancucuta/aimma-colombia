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
