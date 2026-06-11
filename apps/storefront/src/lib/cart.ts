// AIMMA Storefront · lib/cart.ts · F2 · fuente única del carrito (cliente).
// SOLO importar dentro de <script> bundled (usa localStorage/window). NUNCA en frontmatter Astro (SSR).
// Esquema canónico: color/talla son la verdad estructural; el string "variante" se DERIVA al render.

export interface CartItem {
  producto_id: string;
  variante_id: string | null;
  slug: string;
  sku: string | null;
  nombre: string;
  color: string | null;
  talla: string | null;
  foto: string | null;
  cantidad: number;
  precio: number;
}

const CHANGED_EVENT = 'aimma:cart-changed';
const ADD_EVENT = 'aimma:cart-add'; // compat: el badge hace pulse al agregar

export function cartKey(): string {
  return 'aimma_cart_' + location.hostname;
}

export function readCart(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(cartKey()) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function persist(items: CartItem[]): void {
  localStorage.setItem(cartKey(), JSON.stringify(items));
}

function sameLine(a: CartItem, b: { producto_id: string; variante_id: string | null }): boolean {
  return a.producto_id === b.producto_id && (a.variante_id || null) === (b.variante_id || null);
}

export function writeItem(item: CartItem): void {
  const items = readCart();
  const ex = items.find((c) => sameLine(c, item));
  if (ex) ex.cantidad = (ex.cantidad || 0) + item.cantidad;
  else items.push(item);
  persist(items);
  emit(true);
}

export function removeAt(index: number): void {
  const items = readCart();
  if (index < 0 || index >= items.length) return;
  items.splice(index, 1);
  persist(items);
  emit(false);
}

export function setQty(index: number, n: number): void {
  const items = readCart();
  if (index < 0 || index >= items.length) return;
  items[index].cantidad = Math.max(1, Math.floor(Number(n)) || 1);
  persist(items);
  emit(false);
}

export function clearCart(): void {
  try { localStorage.removeItem(cartKey()); } catch (_) {}
  emit(false);
}

export function count(): number {
  return readCart().reduce((a, it) => a + (it.cantidad || 0), 0);
}

export function total(): number {
  return readCart().reduce((a, it) => a + (it.precio || 0) * (it.cantidad || 0), 0);
}

export function varianteLabel(color: string | null, talla: string | null): string {
  return [color, talla].filter(Boolean).join(' / ');
}

export function fmtCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n || 0);
}

function emit(isAdd: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { count: count() } }));
    if (isAdd) window.dispatchEvent(new CustomEvent(ADD_EVENT, { detail: { count: count() } }));
  } catch (_) {}
}
