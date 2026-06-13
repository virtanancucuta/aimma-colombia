import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';
// Importar el port de storefront para el test de paridad de contraste
import { getContrastText as sfGetContrastText } from '../../apps/storefront/src/lib/contrast.ts';
import { FONT_PAIRING_IDS } from '../../packages/database/src/font-pairings.ts';

// ============================================================
// Helpers para cargar el panel con deps minimas
// ============================================================
function bootWithPanel() {
  const win = bootWindow([
    'editor-controls.js',
    'section-defs.js',
    'editor-state.js',
    'font-pairings.js',
    'editor-theme-panel.js',
  ]);
  return win;
}

// ============================================================
// TEST 1: Paridad de contraste port == storefront
// ============================================================
test('contraste: port en editor-theme-panel == getContrastText del storefront', () => {
  const win = bootWithPanel();
  const portFn = win.TiendaIA.editorThemePanel._getContrastText;
  assert.equal(typeof portFn, 'function', '_getContrastText debe estar exportado');

  const casos = [
    { hex: '#ffffff', expected: '#0a0a0a' },  // blanco -> texto oscuro
    { hex: '#000000', expected: '#ffffff' },  // negro -> texto blanco
    { hex: '#1B4965', expected: '#ffffff' },  // azul oscuro -> blanco
    { hex: '#FFD400', expected: '#0a0a0a' },  // amarillo vivo -> oscuro
    { hex: '#0a0a0a', expected: '#ffffff' },  // casi negro -> blanco
    { hex: '#f4f5f6', expected: '#0a0a0a' },  // gris muy claro -> oscuro
  ];

  for (const { hex, expected } of casos) {
    const portResult = portFn(hex);
    const sfResult = sfGetContrastText(hex);
    assert.equal(portResult, sfResult,
      `Port devolvio '${portResult}' pero storefront devolvio '${sfResult}' para hex='${hex}'`);
    assert.equal(portResult, expected,
      `Para hex='${hex}' se esperaba '${expected}' pero se obtuvo '${portResult}'`);
  }
});

// ============================================================
// TEST 2: buildColorsVars produce las 7 claves correctas con on-* esperados
// ============================================================
test('buildColorsVars: produce las 7 claves CSS correctas con on-* WCAG', () => {
  const win = bootWithPanel();
  const buildFn = win.TiendaIA.editorThemePanel._buildColorsVars;
  assert.equal(typeof buildFn, 'function', '_buildColorsVars debe estar exportado');

  // Caso: primary oscuro (#1B4965) -> on-primary blanco
  //       accent claro (#FFD400)   -> on-accent oscuro
  //       bg_base blanco (#ffffff) -> on-bg oscuro
  const resolved = {
    primary: '#1B4965',
    accent: '#FFD400',
    text_base: '#0f0f10',
    bg_base: '#ffffff',
  };
  const vars = buildFn(resolved);

  // Verificar que las 7 claves existen
  const expectedKeys = [
    '--ta-color-primary',
    '--ta-color-accent',
    '--ta-color-text-base',
    '--ta-color-bg-base',
    '--ta-color-on-primary',
    '--ta-color-on-accent',
    '--ta-color-on-bg',
  ];
  for (const k of expectedKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(vars, k), `falta la clave '${k}'`);
  }

  // Verificar los 4 colores base se pasan tal cual
  assert.equal(vars['--ta-color-primary'], '#1B4965');
  assert.equal(vars['--ta-color-accent'], '#FFD400');
  assert.equal(vars['--ta-color-text-base'], '#0f0f10');
  assert.equal(vars['--ta-color-bg-base'], '#ffffff');

  // Verificar on-* correctos (via storefront como fuente de verdad)
  assert.equal(vars['--ta-color-on-primary'], sfGetContrastText('#1B4965'),
    'on-primary debe coincidir con storefront');
  assert.equal(vars['--ta-color-on-accent'], sfGetContrastText('#FFD400'),
    'on-accent debe coincidir con storefront');
  assert.equal(vars['--ta-color-on-bg'], sfGetContrastText('#ffffff'),
    'on-bg debe coincidir con storefront');

  // Valores esperados concretos
  assert.equal(vars['--ta-color-on-primary'], '#ffffff');  // azul oscuro -> blanco
  assert.equal(vars['--ta-color-on-accent'], '#0a0a0a');   // amarillo -> oscuro
  assert.equal(vars['--ta-color-on-bg'], '#0a0a0a');       // fondo blanco -> oscuro
});

// ============================================================
// TEST 3: Drift de fuentes — IDS.length === 6 y cada id en FONT_PAIRING_IDS
// ============================================================
test('drift fuentes: fontPairings.IDS.length === 6 y coincide con FONT_PAIRING_IDS del DB', () => {
  const win = bootWindow(['editor-controls.js', 'font-pairings.js']);
  const fp = win.TiendaIA.fontPairings;

  assert.ok(fp, 'window.TiendaIA.fontPairings debe existir');
  assert.ok(Array.isArray(fp.IDS), 'fontPairings.IDS debe ser array');
  assert.equal(fp.IDS.length, 6, 'deben haber exactamente 6 pairings');
  assert.equal(fp.IDS.length, FONT_PAIRING_IDS.length, 'browser y DB deben tener el mismo count');

  // Cada ID del browser debe estar en el allowlist del DB
  for (const id of fp.IDS) {
    assert.ok(FONT_PAIRING_IDS.includes(id),
      `el ID '${id}' del browser no esta en FONT_PAIRING_IDS del DB`);
  }

  // Cada ID del DB debe estar en el browser
  for (const id of FONT_PAIRING_IDS) {
    assert.ok(fp.IDS.includes(id),
      `el ID '${id}' del DB no esta en fontPairings.IDS del browser`);
  }
});

// ============================================================
// TEST 4: render monta el panel en el DOM correctamente
// ============================================================
test('render: monta el panel #editor-theme-panel en el shellEl', () => {
  const win = bootWithPanel();
  const T = win.TiendaIA;

  // Mock minimal de editorState (para que render no explote)
  T.editorState.init(null, 'tienda-test');

  const shellEl = win.document.createElement('div');
  shellEl.className = 'ed-shell';
  win.document.body.appendChild(shellEl);

  T.editorThemePanel.render(shellEl);

  const panel = shellEl.querySelector('#editor-theme-panel');
  assert.ok(panel, 'debe montar el panel con id editor-theme-panel');
  assert.ok(panel.classList.contains('ed-theme-panel'), 'debe tener clase ed-theme-panel');
  // Empieza cerrado (sin la clase --open)
  assert.ok(!panel.classList.contains('ed-theme-panel--open'), 'debe empezar cerrado');
  // Tiene cabecera y cuerpo
  assert.ok(panel.querySelector('.ed-theme-panel__head'), 'debe tener __head');
  assert.ok(panel.querySelector('.ed-theme-panel__body'), 'debe tener __body');
});

// ============================================================
// TEST M5.C: setThemeNavTextSize guarda el preset (sm/md/lg) y descarta valores invalidos
// ============================================================
test('M5.C: setThemeNavTextSize guarda sm/md/lg en el theme; invalido borra la clave', () => {
  const win = bootWithPanel();
  const T = win.TiendaIA;
  T.editorState.init(null, 'tienda-test');
  assert.equal(typeof T.editorState.setThemeNavTextSize, 'function', 'debe exportar setThemeNavTextSize');

  for (const v of ['sm', 'md', 'lg']) {
    T.editorState.setThemeNavTextSize(v);
    assert.equal(T.editorState.theme.nav_text_size, v, `debe guardar '${v}'`);
  }
  // valor fuera del enum -> borra la clave (no contamina el theme)
  T.editorState.setThemeNavTextSize('xl');
  assert.ok(!('nav_text_size' in T.editorState.theme), 'valor invalido => clave borrada');
});

// ============================================================
// TEST 5: close() quita la clase --open
// ============================================================
test('close: quita la clase ed-theme-panel--open', () => {
  const win = bootWithPanel();
  const T = win.TiendaIA;

  T.editorState.init(null, 'tienda-test');
  const shellEl = win.document.createElement('div');
  win.document.body.appendChild(shellEl);
  T.editorThemePanel.render(shellEl);

  const panel = shellEl.querySelector('#editor-theme-panel');
  // Forzar la clase manualmente (simular open sin async)
  panel.classList.add('ed-theme-panel--open');
  assert.ok(panel.classList.contains('ed-theme-panel--open'), 'precondicion: panel abierto');

  T.editorThemePanel.close();
  assert.ok(!panel.classList.contains('ed-theme-panel--open'), 'close() debe quitar --open');
});
