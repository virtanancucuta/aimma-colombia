// apps/storefront/src/lib/menu.ts
// M5 · Administrador de Paginas · menu del storefront derivado del ARBOL nav.
// FALLBACK ROBUSTO (alto blast radius): sin nav / nav vacio / solo-Inicio -> categorias top-level
// flat == comportamiento byte-identico previo. Con arbol util -> top-level (parentId null, no Inicio,
// mostrar_en_menu) + hijos directos (dropdown), 2 niveles, ordenado por `orden`. Salta Inicio (el logo
// ya lleva a /). FUNCION PURA (sin imports) -> unit-testable y corre identico en SSR.

export interface MenuLink {
  label: string;
  href: string;
}
export interface MenuItem extends MenuLink {
  children: MenuLink[];
}

interface NavNode {
  id: string;
  tipo: string;            // 'home' | 'coleccion' | 'blanco'
  label: string;
  parentId?: string | null;
  orden?: number;
  mostrar_en_menu?: boolean;
  slug?: string;
}
interface Categoria {
  nombre: string;
  slug: string;
  orden?: number;
}

function navHref(n: { tipo: string; slug?: string }): string {
  if (n.tipo === 'coleccion') return '/c/' + (n.slug || '');
  if (n.tipo === 'blanco') return '/pagina/' + (n.slug || '');
  return '/';
}

export function buildMenu(
  nav: NavNode[] | null | undefined,
  categorias: Categoria[] | null | undefined,
): MenuItem[] {
  const cats = Array.isArray(categorias) ? categorias : [];
  const nodes = Array.isArray(nav) ? nav : [];
  const usable = nodes.filter((n) => n && n.tipo !== 'home');

  // FALLBACK: sin arbol util (sin nav / vacio / solo-Inicio) -> categorias top-level flat (como hoy).
  if (!usable.length) {
    return cats.map((c) => ({ label: c.nombre, href: '/c/' + c.slug, children: [] }));
  }

  const byOrden = (a: NavNode, b: NavNode) => (a.orden || 0) - (b.orden || 0);
  const visible = (n: NavNode) => n.mostrar_en_menu !== false; // default true
  const top = nodes
    .filter((n) => (n.parentId || null) === null && n.tipo !== 'home' && visible(n))
    .sort(byOrden);

  return top.map((n) => ({
    label: n.label,
    href: navHref(n),
    children: nodes
      .filter((c) => c.parentId === n.id && visible(c))
      .sort(byOrden)
      .map((c) => ({ label: c.label, href: navHref(c) })),
  }));
}
