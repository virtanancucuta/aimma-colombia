// AIMMA Editor PRO-MAX · Fase D · A1 · DnD de hijos EN EL CANVAS (preview).
// Logica PURA con dependencias inyectadas (doc / getSortable / postMove) -> testeable en jsdom sin
// Astro ni globals. EditorCanvasDnD.astro la cablea al document real del iframe + window.Sortable +
// parent.postMessage. SOLO corre en preview (el componente es preview-gated) -> render publico intacto.
//
// Modelo: cada columna `.{prefix}-contenedor-col` es un Sortable (group por parentId -> cross-column
// SOLO dentro del mismo contenedor). El handle es un grip INYECTADO en runtime dentro de cada hijo
// `<section data-section-id>` (NO toca el SSR -> byte-identidad publica intacta). onEnd reusa
// moveChildToColumn via postMessage; toIndex = "indice ENTRE HERMANOS de la columna destino" (misma
// semantica que el inspector / moveChildToColumn), calculado robusto al boton "+ agregar bloque".

export interface CanvasDnDDeps {
  doc: Document;
  getSortable: () => any;
  postMove: (msg: { type: 'move-child'; parentId: string; childId: string; toCol: number; toIndex: number }) => void;
}

const COL_SEL = '.ic-contenedor-col,.fb-contenedor-col,.ma-contenedor-col,.em-contenedor-col';
const ID_RE = /^sec_[a-z0-9]{4,}$/;
const GRIP_GLYPH = '⠿'; // ⠿

// Instancias Sortable vivas -> se destruyen antes de re-armar (sin orphans tras el patch replace).
let instances: any[] = [];

export function destroyCanvasDnD(): void {
  for (const s of instances) { try { s.destroy(); } catch (_e) { /* noop */ } }
  instances = [];
}

// Cuantas instancias vivas hay (para el test de no-orphans).
export function liveCanvasDnDCount(): number {
  return instances.length;
}

function injectGrip(doc: Document, child: Element): void {
  if (child.querySelector(':scope > [data-ed-grip]')) return; // idempotente
  const grip = doc.createElement('button');
  grip.setAttribute('type', 'button');
  grip.setAttribute('data-ed-grip', ''); // el bridge ignora [data-ed-grip] -> no dispara select/inline
  grip.setAttribute('aria-label', 'Arrastrar para mover de columna');
  grip.textContent = GRIP_GLYPH;
  child.insertBefore(grip, child.firstChild);
}

// Indice del hijo ENTRE LOS HERMANOS (otros [data-section-id]) de su columna -> misma semantica que
// moveChildToColumn (que inserta tal que `toIndex` hermanos lo preceden). Robusto al boton "+".
function siblingIndex(colEl: Element, item: Element): number {
  const sibs = Array.from(colEl.querySelectorAll(':scope > [data-section-id]'));
  return sibs.indexOf(item);
}

// Indice de la columna destino entre las columnas del grid.
function columnIndex(colEl: Element): number {
  const grid = colEl.parentElement;
  if (!grid) return -1;
  const colsArr = Array.from(grid.children).filter((c) => (c as Element).matches(COL_SEL));
  return colsArr.indexOf(colEl);
}

export function setupCanvasDnD(deps: CanvasDnDDeps): void {
  const { doc, getSortable, postMove } = deps;
  destroyCanvasDnD(); // mata las instancias previas (tras patch/reload) -> sin orphans
  const Sortable = getSortable();
  const cols = Array.from(doc.querySelectorAll(COL_SEL));
  for (const col of cols) {
    // inyectar grip en cada hijo de la columna (idempotente).
    const children = Array.from(col.querySelectorAll(':scope > [data-section-id]'));
    for (const child of children) injectGrip(doc, child);

    if (!Sortable) continue; // jsdom/tests sin Sortable: los grips quedan, sin DnD vivo.
    const parentSec = col.closest('[data-section-tipo="contenedor"]');
    const parentId = parentSec ? parentSec.getAttribute('data-section-id') : null;
    if (!parentId || !ID_RE.test(parentId)) continue;

    const s = new Sortable(col, {
      group: 'cont-' + parentId,         // cross-column SOLO dentro del mismo contenedor
      draggable: '[data-section-id]',    // el boton "+ agregar bloque" NO es arrastrable
      handle: '[data-ed-grip]',          // unico disparador del drag (no choca con clic/inline/↑↓)
      animation: 160,
      forceFallback: true,               // clon por pointer -> auto-scroll fiable + clon estilizable
      fallbackClass: 'ed-canvas-drag',
      chosenClass: 'ed-canvas-chosen',
      ghostClass: 'ed-canvas-ghost',
      scroll: doc.scrollingElement || true, // auto-scroll del DOCUMENTO del iframe (no el del admin)
      scrollSensitivity: 60,
      scrollSpeed: 12,
      bubbleScroll: true,
      onMove: function (evt: any) {
        const prev = doc.querySelectorAll('.ed-canvas-col-over');
        for (let i = 0; i < prev.length; i++) prev[i].classList.remove('ed-canvas-col-over');
        if (evt.to) evt.to.classList.add('ed-canvas-col-over');
        return true;
      },
      onEnd: function (evt: any) {
        const over = doc.querySelectorAll('.ed-canvas-col-over');
        for (let i = 0; i < over.length; i++) over[i].classList.remove('ed-canvas-col-over');
        const item: Element | null = evt.item || null;
        const toColEl: Element | null = evt.to || null;
        if (!item || !toColEl) return;
        const childId = item.getAttribute('data-section-id');
        const pSec = item.closest('[data-section-tipo="contenedor"]');
        const pId = pSec ? pSec.getAttribute('data-section-id') : null;
        if (!childId || !ID_RE.test(childId) || !pId || !ID_RE.test(pId)) return;
        const toCol = columnIndex(toColEl);
        const toIndex = siblingIndex(toColEl, item);
        if (toCol < 0 || toIndex < 0) return;
        postMove({ type: 'move-child', parentId: pId, childId: childId, toCol: toCol, toIndex: toIndex });
      },
    });
    instances.push(s);
  }
}
