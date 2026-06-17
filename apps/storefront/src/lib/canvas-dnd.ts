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
const STYLE_ID = 'ed-canvas-dnd-css';

// CSS del chrome del DnD (grip/ghost/clon/columna-destino). Se INYECTA en runtime (no via <style
// is:global> de Astro), porque Astro empaqueta el CSS de un componente importado AUNQUE su render sea
// condicional ({isPreview && ...}) -> filtraria al bundle PUBLICO. El script de EditorCanvasDnD solo
// corre en preview, asi que inyectarlo aca mantiene el render publico byte-identico. Lenguaje azul del chrome.
const DND_CSS = `
[data-ed-grip]{position:absolute;top:6px;right:6px;z-index:30;display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:8px;background:color-mix(in oklab,#2563eb 88%,transparent);color:#fff;font-size:18px;line-height:1;cursor:grab;opacity:0;transition:opacity 140ms ease-out,background-color 140ms ease-out;box-shadow:0 2px 8px rgba(0,0,0,.28)}
[data-section-id]:hover>[data-ed-grip],[data-ed-grip]:focus-visible{opacity:1}
[data-ed-grip]:hover{background:#2563eb}
[data-ed-grip]:active{cursor:grabbing}
.ed-canvas-ghost{position:relative}
.ed-canvas-ghost>*{visibility:hidden}
.ed-canvas-ghost::after{content:'';position:absolute;inset:0;border:2px dashed #2563eb;border-radius:6px;background:color-mix(in oklab,#2563eb 9%,transparent);pointer-events:none}
.ed-canvas-drag{opacity:1!important;outline:2px solid #2563eb;box-shadow:0 12px 32px rgba(37,99,235,.32);border-radius:6px;cursor:grabbing}
.ed-canvas-chosen{opacity:.6}
.ed-canvas-col-over{outline:2px solid #14b8a6;outline-offset:-2px;background:color-mix(in oklab,#14b8a6 7%,transparent)}
`;

// Inyecta el CSS del chrome UNA sola vez (idempotente por id). doc = documento del iframe (preview).
function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = DND_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

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
  injectStyles(doc); // CSS del chrome en runtime (no en el bundle publico)
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
