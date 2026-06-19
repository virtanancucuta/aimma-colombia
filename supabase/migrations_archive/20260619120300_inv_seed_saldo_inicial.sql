-- 20260619120300_inv_seed_saldo_inicial — saldo de arranque para el stock que ya existe.
-- El trigger de sync sumaria el stock otra vez -> se siembra con el trigger DESHABILITADO.
alter table public.inventario_movimientos disable trigger trg_inv_mov_sync_stock;

insert into public.inventario_movimientos
  (tienda_id, producto_id, variante_id, tipo, cantidad, costo_unitario, costo_saldo, fecha)
select p.tienda_id, p.id, v.id, 'saldo_inicial', v.stock, p.costo, p.costo, p.created_at
from public.producto_variantes v
join public.productos p on p.id = v.producto_id
where v.stock > 0
  and not exists (
    select 1 from public.inventario_movimientos m where m.variante_id = v.id
  );

alter table public.inventario_movimientos enable trigger trg_inv_mov_sync_stock;
