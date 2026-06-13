import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavSchema, NavNodeSchema, PersonalizacionesSchema } from '../../packages/database/src/editor-schema.ts';
import { buildNextPersonalizaciones } from '../../packages/database/src/build-next-personalizaciones.ts';

// ============================================================
// M1 · Administrador de Paginas: schema del arbol de navegacion (nav) + preservacion en buildNext.
// Valida una siembra realista (home + colecciones anidadas 2 niveles) + enforce 2 niveles +
// requisitos por tipo + retrocompat (sin nav) + que un save de pagina NO pisa el nav sembrado.
// ============================================================

const UUID = '11111111-1111-1111-1111-111111111111';
const navHome = { id: 'nav_home0', tipo: 'home', label: 'Inicio', parentId: null, orden: 0, mostrar_en_menu: true };
const navCol = (id, label, slug, orden, parentId = null) => ({
  id, tipo: 'coleccion', label, slug, categoria_id: UUID, orden, parentId, mostrar_en_menu: true,
});

test('nav valida: home + coleccion top-level + subcoleccion (2 niveles)', () => {
  const nav = [
    navHome,
    navCol('nav_ropa00', 'Ropa Dama', 'ropa-dama', 1),
    navCol('nav_blusa0', 'Blusa Dama', 'blusa-dama', 1, 'nav_ropa00'),
  ];
  const r = NavSchema.safeParse(nav);
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test('nav RECHAZA 3 niveles (el padre de un nodo tiene padre)', () => {
  const nav = [
    navHome,
    navCol('nav_ropa00', 'Ropa', 'ropa-dama', 1),
    navCol('nav_blusa0', 'Blusa', 'blusa-dama', 1, 'nav_ropa00'),
    navCol('nav_nieto0', 'Nieto', 'nieto-x', 1, 'nav_blusa0'), // 3er nivel
  ];
  assert.equal(NavSchema.safeParse(nav).success, false);
});

test('nav RECHAZA parentId inexistente', () => {
  const r = NavSchema.safeParse([navHome, navCol('nav_x0001', 'X', 'x-cat', 1, 'nav_nope00')]);
  assert.equal(r.success, false);
});

test('coleccion REQUIERE categoria_id + slug; blanco REQUIERE slug', () => {
  assert.equal(NavNodeSchema.safeParse({ id: 'nav_c00001', tipo: 'coleccion', label: 'C', orden: 1, parentId: null, mostrar_en_menu: true }).success, false);
  assert.equal(NavNodeSchema.safeParse({ id: 'nav_b00001', tipo: 'blanco', label: 'B', orden: 1, parentId: null, mostrar_en_menu: true }).success, false);
  assert.ok(NavNodeSchema.safeParse({ id: 'nav_b00002', tipo: 'blanco', label: 'B', slug: 'mi-pagina', orden: 1, parentId: null, mostrar_en_menu: true }).success);
});

test('PersonalizacionesSchema: nav/nav_draft opcionales + retrocompat sin nav', () => {
  const base = { schema_version: 3, pages: { home: { version: 2, updated_at: '2026-06-12T00:00:00.000Z', sections: [] } } };
  assert.ok(PersonalizacionesSchema.safeParse(base).success);            // sin nav -> ok
  assert.ok(PersonalizacionesSchema.safeParse({ ...base, nav: [navHome], nav_draft: [navHome] }).success);
});

test('buildNext preserva nav/nav_draft al guardar una pagina (el seed no se pisa)', () => {
  const nav = [navHome];
  const navd = [{ ...navHome, label: 'Inicio (draft)' }];
  const page = { version: 2, updated_at: '2026-06-01T10:00:00.000Z', sections: [] };
  const current = { schema_version: 3, nav, nav_draft: navd, pages: { home: page } };
  const next = buildNextPersonalizaciones(current, 'coleccion', 'publish', page, undefined, '2026-06-12T20:00:00.000Z');
  assert.equal(JSON.stringify(next.nav), JSON.stringify(nav));
  assert.equal(JSON.stringify(next.nav_draft), JSON.stringify(navd));
});
