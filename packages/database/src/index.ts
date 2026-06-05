// AIMMA · packages/database · 2026-05-31
// Re-export tipos del schema Supabase. Generados via MCP Supabase
// generate_typescript_types (project_id: rsmxklkxqsaptchcjszd).
// Para regenerar: ver scripts.regen en package.json.

export type { Database, Json } from './types';

// Helpers de tipos comunes para uso ergonomico en las apps:
import type { Database } from './types';

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];

// Tipos especificos del storefront (los que se leen mas seguido).
export type Tienda = Tables<'tiendas'>;
export type Categoria = Tables<'categorias'>;
export type Producto = Tables<'productos'>;
export type ProductoVariante = Tables<'producto_variantes'>;
export type Plantilla = Tables<'plantillas'>;
export type Paleta = Tables<'paletas'>;
export type PaginaLegal = Tables<'paginas_legales'>;

export * from './editor-schema';
export * from './richtext-policy';
export * from './font-pairings';
