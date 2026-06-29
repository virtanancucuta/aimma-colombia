-- AIMMA · Modelo de Variantes Genericas · Sub-fase A: modelo (aditivo puro).
-- Agrega el 3er eje de variante: nombre (productos), valor (producto_variantes) y snapshot (pedido_items).
-- color/talla quedan INTACTOS (son atributo_1/atributo_2 semanticos). Todo nullable, sin default, sin backfill:
-- las 56 variantes y los productos actuales quedan con atributo_3 / variante_tipo_3 = NULL (sin 3er eje, correcto).
-- NO renombra nada, NO toca datos. Reversible: DROP COLUMN limpio. Ninguna RPC/vista lo nota (siguen leyendo color/talla).

alter table public.productos          add column if not exists variante_tipo_3 text;
alter table public.producto_variantes add column if not exists atributo_3      text;
alter table public.pedido_items       add column if not exists atributo_3      text;

comment on column public.productos.variante_tipo_3 is
  'Nombre del 3er eje de variante del producto (ej. "Material"). Espeja variante_tipo_1/2. NULL = el producto no usa 3er eje.';
comment on column public.producto_variantes.atributo_3 is
  'Valor del 3er eje de esta variante (3er slot generico; semantica: color=atributo_1, talla=atributo_2, atributo_3=3er eje). NULL = sin 3er eje.';
comment on column public.pedido_items.atributo_3 is
  'Snapshot del valor del 3er eje al momento de la venta (espeja el snapshot color/talla). NULL = sin 3er eje.';
