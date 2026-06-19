-- 20260619120200_inv_kardex_registrar — costeo promedio (por referencia) + sync de stock.

-- Trigger: cada movimiento ajusta el stock de su variante (UNICA fuente de mutacion).
create or replace function public.inv_mov_sync_stock()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.producto_variantes
    set stock = greatest(0, stock + NEW.cantidad)
    where id = NEW.variante_id;
  return NEW;
end; $$;

drop trigger if exists trg_inv_mov_sync_stock on public.inventario_movimientos;
create trigger trg_inv_mov_sync_stock
  after insert on public.inventario_movimientos
  for each row execute function public.inv_mov_sync_stock();

-- Funcion unica de escritura de movimientos: calcula costeo promedio ponderado por REFERENCIA e inserta.
create or replace function public.kardex_registrar(
  p_producto_id uuid,
  p_variante_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_costo_unitario numeric default null,
  p_fecha timestamptz default now(),
  p_pedido_id uuid default null,
  p_nota text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tienda uuid; v_prom_ant numeric; v_cant_total integer;
  v_costo_unit numeric; v_costo_saldo numeric; v_nuevo_prom numeric; v_mov_id uuid;
begin
  select tienda_id, costo into v_tienda, v_prom_ant from public.productos where id = p_producto_id;
  if v_tienda is null then raise exception 'producto inexistente'; end if;

  -- saldo de cantidad de la REFERENCIA antes del movimiento
  select coalesce(sum(stock),0) into v_cant_total from public.producto_variantes where producto_id = p_producto_id;

  if p_cantidad > 0 and p_costo_unitario is not null then
    -- ENTRADA con costo: recalcular promedio ponderado de la referencia
    if v_prom_ant is null or (v_cant_total + p_cantidad) = 0 then
      v_nuevo_prom := p_costo_unitario;
    else
      v_nuevo_prom := (v_cant_total * v_prom_ant + p_cantidad * p_costo_unitario) / (v_cant_total + p_cantidad);
    end if;
    update public.productos set costo = v_nuevo_prom where id = p_producto_id;
    v_costo_unit := p_costo_unitario;
    v_costo_saldo := v_nuevo_prom;
  else
    -- SALIDA, devolucion o ajuste sin costo: el promedio no cambia; valor al promedio vigente
    v_costo_unit := coalesce(p_costo_unitario, v_prom_ant);
    v_costo_saldo := v_prom_ant;
  end if;

  insert into public.inventario_movimientos
    (tienda_id, producto_id, variante_id, tipo, cantidad, costo_unitario, costo_saldo, fecha, pedido_id, nota, creado_por)
  values
    (v_tienda, p_producto_id, p_variante_id, p_tipo, p_cantidad, v_costo_unit, v_costo_saldo, p_fecha, p_pedido_id, p_nota, auth.uid())
  returning id into v_mov_id;

  return v_mov_id;
end; $$;
grant execute on function public.kardex_registrar(uuid,uuid,text,integer,numeric,timestamptz,uuid,text) to authenticated;
