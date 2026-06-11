import { describe, it, expect, beforeEach } from 'vitest';
import * as cart from '../src/lib/cart';

// Shims: el módulo es cliente (localStorage/window/location). La suite corre en node (sin jsdom),
// así que inyectamos los globals mínimos en globalThis. cart.ts solo los toca dentro de funciones.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const listeners: Record<string, Function[]> = {};

const base = { producto_id: 'p1', variante_id: 'v1', slug: 'prod-1', sku: 'SKU1', nombre: 'Prod 1', color: 'Rojo', talla: 'M', foto: 'http://x/f.jpg', cantidad: 1, precio: 1000 };

describe('lib/cart', () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemStorage();
    (globalThis as any).location = { hostname: 'aimma-test.tienda.aimma.com.co' };
    (globalThis as any).CustomEvent = class { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o && o.detail; } };
    for (const k in listeners) delete listeners[k];
    (globalThis as any).window = {
      addEventListener: (t: string, cb: Function) => { (listeners[t] || (listeners[t] = [])).push(cb); },
      dispatchEvent: (e: any) => { (listeners[e.type] || []).forEach((cb) => cb(e)); return true; },
    };
  });

  it('writeItem agrega y readCart devuelve el item', () => {
    cart.writeItem({ ...base });
    expect(cart.readCart()).toHaveLength(1);
    expect(cart.count()).toBe(1);
  });

  it('writeItem mergea por producto_id+variante_id (suma cantidad)', () => {
    cart.writeItem({ ...base, cantidad: 1 });
    cart.writeItem({ ...base, cantidad: 2 });
    expect(cart.readCart()).toHaveLength(1);
    expect(cart.count()).toBe(3);
  });

  it('variante distinta = línea distinta', () => {
    cart.writeItem({ ...base, variante_id: 'v1' });
    cart.writeItem({ ...base, variante_id: 'v2' });
    expect(cart.readCart()).toHaveLength(2);
  });

  it('removeAt quita por índice', () => {
    cart.writeItem({ ...base, variante_id: 'v1' });
    cart.writeItem({ ...base, variante_id: 'v2' });
    cart.removeAt(0);
    expect(cart.readCart()).toHaveLength(1);
    expect(cart.readCart()[0].variante_id).toBe('v2');
  });

  it('setQty clampa a >=1', () => {
    cart.writeItem({ ...base });
    cart.setQty(0, 5); expect(cart.readCart()[0].cantidad).toBe(5);
    cart.setQty(0, 0); expect(cart.readCart()[0].cantidad).toBe(1);
  });

  it('total = suma precio*cantidad', () => {
    cart.writeItem({ ...base, precio: 1000, cantidad: 2 });
    cart.writeItem({ ...base, variante_id: 'v2', precio: 500, cantidad: 1 });
    expect(cart.total()).toBe(2500);
  });

  it('varianteLabel deriva del color/talla (no se guarda string)', () => {
    expect(cart.varianteLabel('Rojo', 'M')).toBe('Rojo / M');
    expect(cart.varianteLabel('Rojo', null)).toBe('Rojo');
    expect(cart.varianteLabel(null, null)).toBe('');
  });

  it('readCart tolera JSON corrupto', () => {
    localStorage.setItem('aimma_cart_' + location.hostname, '{no-array');
    expect(cart.readCart()).toEqual([]);
  });

  it('writeItem dispara aimma:cart-changed', () => {
    let fired = 0;
    window.addEventListener('aimma:cart-changed', () => fired++);
    cart.writeItem({ ...base });
    expect(fired).toBe(1);
  });
});
