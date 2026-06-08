import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWindow } from './harness.mjs';

// Guard semantico (adicion 2026-06-08, raiz del bug "FAQ respuesta no editable"):
// el inspector mapea cada campo de section-defs a un control. Si un control declarado en defs
// NO esta cubierto por el dispatch del inspector (ej. textarea PLANO dentro de un list-item antes
// del fix), el campo se DROPEA en silencio y queda no-editable. drift-03 no lo atrapa (el campo SI
// estaba en defs y en Zod). Este test RENDERIZA el inspector de CADA tipo y exige que el label de
// cada campo (top-level + sub-campos de items de un list) aparezca en el DOM -> cobertura total.

function bootInspector() {
  const win = bootWindow(['editor-controls.js', 'section-defs.js', 'editor-state.js', 'editor-inspector.js']);
  win.TiendaIA.editorState.init(
    { pages: { home: { version: 2, updated_at: '2026-01-01T00:00:00.000Z', sections: [] } } },
    'tienda-test'
  );
  return win;
}

const win0 = bootInspector();
const DEFS = win0.TiendaIA.editorSectionDefs.defs;
const TIPOS = Object.keys(DEFS);

for (const tipo of TIPOS) {
  test(`inspector cobertura de campos — ${tipo}`, () => {
    const win = bootInspector();
    const T = win.TiendaIA;
    const id = T.editorState.addSection(tipo);
    assert.ok(id, `addSection('${tipo}') no creo seccion`);
    const container = win.document.createElement('div');
    T.editorInspector.render(container, {});
    T.editorState.select(id);
    T.editorInspector.rebuild();
    const text = container.textContent || '';

    for (const campo of DEFS[tipo].campos) {
      if (campo.__info) continue;
      if (campo.control === 'list') {
        // cada sub-campo NO-condicional del item debe renderizar su label (>=1 item por los defaults)
        for (const sf of (campo.item || [])) {
          if (sf.when) continue; // condicional (ej. formulario.opciones solo si tipo_campo=select)
          assert.ok(
            text.includes(sf.label),
            `[${tipo}] sub-campo "${campo.key}[].${sf.key}" (label "${sf.label}") NO se renderiza en el inspector`
          );
        }
      } else if (campo.control === 'toggle-object') {
        // el toggle siempre renderiza su label; los subfields son condicionales al estado on -> no se exigen
        assert.ok(text.includes(campo.label), `[${tipo}] toggle "${campo.key}" (label "${campo.label}") NO se renderiza`);
      } else {
        assert.ok(text.includes(campo.label), `[${tipo}] campo "${campo.key}" (label "${campo.label}") NO se renderiza`);
      }
    }
  });
}
