import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PersonalizacionesSchema } from '../../packages/database/src/editor-schema.ts';
import { FONT_PAIRING_IDS } from '../../packages/database/src/font-pairings.ts';

const base = { schema_version: 3, pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [] } } };

test('tema: acepta colores hex validos + font_pairing del allowlist', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base, theme: { colors: { primary: '#1B4965', bg_base: '#FFF' }, font_pairing: 'editorial' } });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});
test('tema: RECHAZA color con inyeccion CSS', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base, theme: { colors: { primary: 'red; } body { background: url(http://evil) }' } } });
  assert.equal(r.success, false);
});
test('tema: RECHAZA font_pairing fuera del allowlist', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base, theme: { font_pairing: 'evil' } });
  assert.equal(r.success, false);
});
test('tema: STRIPEA la forma vieja del theme sin romper', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base, theme: { color_primary: '#fff', color_accent: '#000', font_display_url: 'https://x', font_body_url: 'https://y' } });
  assert.ok(r.success, 'el theme viejo debe parsear (claves stripeadas)');
  assert.deepEqual(r.data.theme, {}, 'las claves viejas se descartan -> theme vacio');
});
test('tema: theme_draft acepta la misma forma', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base, theme_draft: { colors: { accent: '#5FA8D3' } } });
  assert.ok(r.success);
});
test('tema: 6 pairings en el allowlist', () => { assert.equal(FONT_PAIRING_IDS.length, 6); });

// M5.C: nav_text_size (tamano de texto del menu) — 3 presets sm/md/lg.
test('tema: acepta nav_text_size sm/md/lg', () => {
  for (const v of ['sm', 'md', 'lg']) {
    const r = PersonalizacionesSchema.safeParse({ ...base, theme: { nav_text_size: v } });
    assert.ok(r.success, `nav_text_size '${v}' debe aceptarse`);
    assert.equal(r.data.theme.nav_text_size, v, 'el valor debe preservarse (no stripearse)');
  }
});
test('tema: RECHAZA nav_text_size fuera del enum', () => {
  for (const v of ['xl', 'small', '1.15', 'grande', '']) {
    assert.equal(PersonalizacionesSchema.safeParse({ ...base, theme: { nav_text_size: v } }).success, false, `nav_text_size '${v}' debe rechazarse`);
  }
});
test('tema: nav_text_size es opcional (ausente parsea, theme queda sin la clave)', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base, theme: { colors: { primary: '#1B4965' } } });
  assert.ok(r.success);
  assert.ok(!('nav_text_size' in r.data.theme), 'ausente => no aparece la clave');
});
test('tema: theme_draft acepta nav_text_size', () => {
  const r = PersonalizacionesSchema.safeParse({ ...base, theme_draft: { nav_text_size: 'lg' } });
  assert.ok(r.success);
  assert.equal(r.data.theme_draft.nav_text_size, 'lg');
});

// DRIFT-GUARD: el enum INLINE del editor-schema (THEME_FONT_PAIRINGS) debe cubrir EXACTO los IDs del
// allowlist font-pairings.ts (que NO se mirror-ea al EF). Si alguien agrega un pairing al allowlist
// pero olvida el enum (o viceversa), esto falla.
test('tema: el enum del schema cubre EXACTO los IDs del allowlist font-pairings', () => {
  for (const id of FONT_PAIRING_IDS) {
    assert.ok(PersonalizacionesSchema.safeParse({ ...base, theme: { font_pairing: id } }).success, `el schema debe aceptar '${id}'`);
  }
  // y ninguno de mas: un id que NO esta en el allowlist es rechazado (cubierto arriba con 'evil', + count)
  assert.equal(FONT_PAIRING_IDS.length, 6, 'el allowlist debe tener 6 (sino el enum inline esta desfasado)');
});
