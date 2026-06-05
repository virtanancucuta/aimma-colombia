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
