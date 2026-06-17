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
    // Cobertura REAL del control. ANTES era container.textContent.includes(label), que daba FALSO VERDE
    // cuando el label era SUBSTRING del titulo de seccion: p.ej. 'Producto' ⊂ 'Producto destacado',
    // 'Categoria' ⊂ 'Categorias destacadas' -> el test pasaba aunque el dispatch NO renderizara el control.
    // Ahora exigimos que exista un <label class="ed-ctrl__label"> con el texto EXACTO del campo (todo
    // control del toolkit emite ese label via fieldWrapper/switchCtrl). El titulo de seccion NO es .ed-ctrl__label.
    const labels = [...container.querySelectorAll('.ed-ctrl__label')].map((e) => (e.textContent || '').trim());
    const rendered = (label) => labels.includes(label);

    for (const campo of DEFS[tipo].campos) {
      if (campo.__info) continue;
      if (campo.control === 'list') {
        // cada sub-campo NO-condicional del item debe renderizar su control con label (>=1 item por defaults)
        for (const sf of (campo.item || [])) {
          if (sf.when) continue; // condicional (ej. formulario.opciones solo si tipo_campo=select)
          assert.ok(
            rendered(sf.label),
            `[${tipo}] sub-campo "${campo.key}[].${sf.key}" (label "${sf.label}") NO renderiza control en el inspector`
          );
        }
      } else if (campo.control === 'toggle-object') {
        // el toggle siempre renderiza su label; los subfields son condicionales al estado on -> no se exigen
        assert.ok(rendered(campo.label), `[${tipo}] toggle "${campo.key}" (label "${campo.label}") NO renderiza`);
      } else if (campo.control === 'child-blocks') {
        // FASE D: control anidado (no emite .ed-ctrl__label propio). Cobertura REAL = el sub-editor de
        // bloques renderiza ("Agregar bloque") Y el generador de campos del hijo corre (el hijo texto
        // por defecto del contenedor renderiza su control "Contenido").
        assert.ok((container.textContent || '').includes('Agregar bloque'),
          `[${tipo}] child-blocks "${campo.key}" NO renderiza el sub-editor (falta "Agregar bloque")`);
        assert.ok(rendered('Contenido'),
          `[${tipo}] child-blocks "${campo.key}": el generador de campos del hijo NO corre (falta label "Contenido")`);
      } else if (campo.control === 'franja-slides') {
        // FASE F: control anidado bespoke (slide->imagen->overlay; no emite .ed-ctrl__label propio).
        // Cobertura REAL = el sub-editor renderiza ("Agregar imagen") + el generador de la imagen corre
        // (el image-picker emite su label "Imagen") + el overlay corre (label "Texto sobre la imagen").
        assert.ok((container.textContent || '').includes('Agregar imagen'),
          `[${tipo}] franja-slides "${campo.key}" NO renderiza el sub-editor (falta "Agregar imagen")`);
        assert.ok(rendered('Imagen'),
          `[${tipo}] franja-slides "${campo.key}": el generador de la imagen NO corre (falta label "Imagen")`);
        assert.ok(rendered('Texto sobre la imagen'),
          `[${tipo}] franja-slides "${campo.key}": el overlay no corre (falta label "Texto sobre la imagen")`);
      } else {
        assert.ok(rendered(campo.label), `[${tipo}] campo "${campo.key}" (label "${campo.label}") NO renderiza control`);
      }
    }
  });
}
