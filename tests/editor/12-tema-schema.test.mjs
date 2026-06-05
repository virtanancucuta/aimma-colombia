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
