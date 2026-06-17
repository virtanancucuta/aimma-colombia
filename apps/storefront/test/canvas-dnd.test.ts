// @vitest-environment jsdom
// AIMMA Fase D · A1 · canvas-dnd.ts — logica del DnD de hijos EN EL CANVAS (deps inyectadas).
// Verifica lo CRITICO sin navegador real: (a) inyeccion idempotente del grip por hijo; (b) una
// instancia Sortable por columna con group por parentId (cross-column SOLO dentro del contenedor);
// (c) NO-ORPHANS: re-armar destruye las instancias previas (no se acumulan tras el patch replace);
// (d) computo de toCol/toIndex en onEnd = "indice ENTRE HERMANOS de la columna destino", ROBUSTO al
// boton "+ agregar bloque" (que NO es [data-section-id]).
import { describe, it, expect, beforeEach } from 'vitest';
import { setupCanvasDnD, destroyCanvasDnD, liveCanvasDnDCount } from '../src/lib/canvas-dnd';

// ── DOM real de un contenedor (igual estructura que Contenedor.astro + _SectionShell) ─────────────
// section[data-section-tipo=contenedor] > div.grid > div.{prefix}-contenedor-col*
//   cada col: <section data-section-id> (hijo, via BlockOne->SectionShell) ... + <button data-ed-add-child>
function buildContenedor(opts: { prefix?: string; parentId?: string; cols: string[][] }) {
  const prefix = opts.prefix || 'ic';
  const parentId = opts.parentId || 'sec_cont01';
  const sec = document.createElement('section');
  sec.setAttribute('data-section-id', parentId);
  sec.setAttribute('data-section-tipo', 'contenedor');
  const grid = document.createElement('div');
  grid.className = `${prefix}-contenedor-grid ${prefix}-contenedor-grid--${opts.cols.length}`;
  sec.appendChild(grid);
  for (const colChildren of opts.cols) {
    const col = document.createElement('div');
    col.className = `${prefix}-contenedor-col`;
    for (const childId of colChildren) {
      const child = document.createElement('section');           // _SectionShell del hijo
      child.setAttribute('data-section-id', childId);
      child.setAttribute('data-section-tipo', 'texto');
      child.className = 'block-section';
      const inner = document.createElement('div');
      inner.className = 'block-inner';
      child.appendChild(inner);
      col.appendChild(child);
    }
    // El "+ agregar bloque" va SIEMPRE al final de la columna (preview-only). NO es [data-section-id]
    // -> siblingIndex debe ignorarlo. Su presencia es justamente lo que rompe un indexOf ingenuo.
    const add = document.createElement('button');
    add.setAttribute('data-ed-add-child', '');
    add.setAttribute('data-parent', parentId);
    add.setAttribute('data-col', '0');
    col.appendChild(add);
    grid.appendChild(col);
  }
  document.body.appendChild(sec);
  return { sec, grid };
}

// Mock de SortableJS: registra (el, opts) y cuenta destroy(). NO mueve el DOM (en el test movemos el
// nodo a mano antes de invocar onEnd, replicando lo que hace la lib real al soltar).
let liveSortables: MockSortable[] = [];
let destroyCount = 0;
class MockSortable {
  el: Element;
  opts: any;
  destroyed = false;
  constructor(el: Element, opts: any) {
    this.el = el;
    this.opts = opts;
    liveSortables.push(this);
  }
  destroy() {
    this.destroyed = true;
    destroyCount++;
  }
}
const getSortable = () => MockSortable as any;

function makeDeps(moves: any[]) {
  return {
    doc: document,
    getSortable,
    postMove: (msg: any) => { moves.push(msg); },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  destroyCanvasDnD();    // limpia el estado-modulo de un test previo
  liveSortables = [];
  destroyCount = 0;
});

// ── (a) grip por hijo, idempotente ────────────────────────────────────────────────────────────
describe('canvas-dnd · inyeccion del grip', () => {
  it('inyecta exactamente un grip por hijo (handle del drag), idempotente', () => {
    buildContenedor({ cols: [['sec_aaaaa', 'sec_bbbbb'], ['sec_ccccc']] });
    const moves: any[] = [];
    setupCanvasDnD(makeDeps(moves));
    expect(document.querySelectorAll('[data-ed-grip]').length).toBe(3); // 1 por hijo
    // re-armar (p.ej. tras un patch) NO duplica grips
    setupCanvasDnD(makeDeps(moves));
    expect(document.querySelectorAll('[data-ed-grip]').length).toBe(3);
    // el grip es hijo directo de la <section data-section-id> (no del .block-inner)
    const firstChild = document.querySelector('[data-section-id="sec_aaaaa"]')!;
    expect(firstChild.querySelector(':scope > [data-ed-grip]')).not.toBeNull();
  });

  it('inyecta el CSS del chrome en runtime, UNA sola vez (idempotente, no via bundle)', () => {
    buildContenedor({ cols: [['sec_aaaaa'], ['sec_bbbbb']] });
    setupCanvasDnD(makeDeps([]));
    setupCanvasDnD(makeDeps([]));
    setupCanvasDnD(makeDeps([]));
    const styles = document.querySelectorAll('style#ed-canvas-dnd-css');
    expect(styles.length).toBe(1);                           // un solo <style>, no N
    expect(styles[0].textContent).toContain('[data-ed-grip]');
    expect(styles[0].textContent).toContain('.ed-canvas-col-over');
  });

  it('el grip NO lleva data-section-id ni data-ed-add-child (no dispara select/add)', () => {
    buildContenedor({ cols: [['sec_aaaaa']] });
    setupCanvasDnD(makeDeps([]));
    const grip = document.querySelector('[data-ed-grip]')!;
    expect(grip.hasAttribute('data-section-id')).toBe(false);
    expect(grip.hasAttribute('data-ed-add-child')).toBe(false);
    expect(grip.tagName).toBe('BUTTON');
  });
});

// ── (b) una instancia por columna, group por parentId ─────────────────────────────────────────
describe('canvas-dnd · instancias Sortable', () => {
  it('una instancia por columna; group=cont-<parentId>; handle/draggable correctos', () => {
    buildContenedor({ parentId: 'sec_cont01', cols: [['sec_aaaaa'], ['sec_bbbbb']] });
    setupCanvasDnD(makeDeps([]));
    expect(liveCanvasDnDCount()).toBe(2);
    for (const s of liveSortables) {
      expect(s.opts.group).toBe('cont-sec_cont01');     // cross-column SOLO dentro del mismo contenedor
      expect(s.opts.handle).toBe('[data-ed-grip]');     // unico disparador del drag
      expect(s.opts.draggable).toBe('[data-section-id]'); // el boton "+" NO es arrastrable
      expect(s.opts.forceFallback).toBe(true);          // auto-scroll fiable + clon estilizable
    }
  });

  it('dos contenedores distintos -> groups distintos (no se cruzan hijos)', () => {
    buildContenedor({ parentId: 'sec_cont01', cols: [['sec_aaaaa']] });
    buildContenedor({ parentId: 'sec_cont02', cols: [['sec_bbbbb']] });
    setupCanvasDnD(makeDeps([]));
    const groups = liveSortables.map(s => s.opts.group).sort();
    expect(groups).toEqual(['cont-sec_cont01', 'cont-sec_cont02']);
  });

  it('parentId que NO pasa el regex -> no se crea Sortable (grip inyectado, sin DnD)', () => {
    buildContenedor({ parentId: 'BAD', cols: [['sec_aaaaa']] }); // 'BAD' no matchea ^sec_[a-z0-9]{4,}$
    setupCanvasDnD(makeDeps([]));
    expect(liveCanvasDnDCount()).toBe(0);
    expect(document.querySelectorAll('[data-ed-grip]').length).toBe(1); // el grip si se inyecta
  });
});

// ── (c) NO-ORPHANS: re-armar destruye lo previo ───────────────────────────────────────────────
describe('canvas-dnd · sin orphans tras re-armar', () => {
  it('re-setup destruye las instancias previas (no se acumulan)', () => {
    buildContenedor({ cols: [['sec_aaaaa'], ['sec_bbbbb']] });
    setupCanvasDnD(makeDeps([]));
    expect(liveCanvasDnDCount()).toBe(2);
    // simular el re-render del patch replace: re-armar
    setupCanvasDnD(makeDeps([]));
    expect(destroyCount).toBe(2);            // las 2 viejas fueron destruidas
    expect(liveCanvasDnDCount()).toBe(2);    // y NO quedaron 4 (sin orphans)
  });

  it('destroyCanvasDnD destruye todo y deja 0 vivas', () => {
    buildContenedor({ cols: [['sec_aaaaa'], ['sec_bbbbb']] });
    setupCanvasDnD(makeDeps([]));
    destroyCanvasDnD();
    expect(destroyCount).toBe(2);
    expect(liveCanvasDnDCount()).toBe(0);
  });
});

// ── (d) onEnd computa toCol/toIndex = indice ENTRE HERMANOS (robusto al "+") ───────────────────
describe('canvas-dnd · onEnd computa el destino', () => {
  // helper: relocar el nodo a una columna/posicion (replica lo que hace la lib real al soltar) y
  // disparar el onEnd registrado en alguna instancia (es el MISMO closure en todas).
  function fireDrop(child: Element, toColEl: Element, before: Element | null, moves: any[]) {
    toColEl.insertBefore(child, before);     // el DOM ya refleja el post-drop (como Sortable)
    const onEnd = liveSortables[0].opts.onEnd;
    onEnd({ item: child, to: toColEl, from: child.parentElement });
    return moves[moves.length - 1];
  }

  it('mover a otra columna AL FRENTE -> toCol=1, toIndex=0', () => {
    buildContenedor({ parentId: 'sec_cont01', cols: [['sec_aaaaa', 'sec_bbbbb'], ['sec_ccccc']] });
    const moves: any[] = [];
    setupCanvasDnD(makeDeps(moves));
    const cols = document.querySelectorAll('.ic-contenedor-col');
    const childA = document.querySelector('[data-section-id="sec_aaaaa"]')!;
    const childC = document.querySelector('[data-section-id="sec_ccccc"]')!;
    const msg = fireDrop(childA, cols[1], childC, moves);  // antes de C en col1
    expect(msg).toEqual({ type: 'move-child', parentId: 'sec_cont01', childId: 'sec_aaaaa', toCol: 1, toIndex: 0 });
  });

  it('mover a otra columna DESPUES del existente -> toIndex=1 (ignora el boton "+")', () => {
    buildContenedor({ parentId: 'sec_cont01', cols: [['sec_aaaaa', 'sec_bbbbb'], ['sec_ccccc']] });
    const moves: any[] = [];
    setupCanvasDnD(makeDeps(moves));
    const cols = document.querySelectorAll('.ic-contenedor-col');
    const childA = document.querySelector('[data-section-id="sec_aaaaa"]')!;
    const addBtn = cols[1].querySelector(':scope > [data-ed-add-child]');  // el "+" queda DESPUES
    const msg = fireDrop(childA, cols[1], addBtn, moves);    // A -> col1 entre C y el "+"
    // col1 ahora: [C, A, +]  -> A es el hermano #1 (el "+" no cuenta)
    expect(msg.toCol).toBe(1);
    expect(msg.toIndex).toBe(1);
    expect(msg.childId).toBe('sec_aaaaa');
  });

  it('reordenar DENTRO de la misma columna -> toCol=0, toIndex segun hermanos', () => {
    buildContenedor({ parentId: 'sec_cont01', cols: [['sec_aaaaa', 'sec_bbbbb', 'sec_ddddd']] });
    const moves: any[] = [];
    setupCanvasDnD(makeDeps(moves));
    const col0 = document.querySelector('.ic-contenedor-col')!;
    const childA = document.querySelector('[data-section-id="sec_aaaaa"]')!;
    const childD = document.querySelector('[data-section-id="sec_ddddd"]')!;
    const msg = fireDrop(childA, col0, childD, moves);  // A entre B y D -> [B, A, D]
    expect(msg.toCol).toBe(0);
    expect(msg.toIndex).toBe(1);
  });

  it('onEnd con childId que NO pasa el regex -> no postea move-child', () => {
    buildContenedor({ parentId: 'sec_cont01', cols: [['sec_aaaaa'], ['sec_bbbbb']] });
    const moves: any[] = [];
    setupCanvasDnD(makeDeps(moves));
    const cols = document.querySelectorAll('.ic-contenedor-col');
    const bad = document.createElement('section');
    bad.setAttribute('data-section-id', 'BAD');         // no matchea el regex
    bad.setAttribute('data-section-tipo', 'texto');
    const onEnd = liveSortables[0].opts.onEnd;
    cols[1].insertBefore(bad, null);
    onEnd({ item: bad, to: cols[1], from: cols[0] });
    expect(moves.length).toBe(0);
  });
});
