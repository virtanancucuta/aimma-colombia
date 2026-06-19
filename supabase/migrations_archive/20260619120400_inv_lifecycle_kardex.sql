-- 20260619120400_inv_lifecycle_kardex — el ciclo de vida del pedido registra movimientos de kardex
-- en vez de tocar stock a mano. reservado se sigue manejando aqui; el stock lo mueve el kardex.
create or replace function public.pedido_stock_lifecycle()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_item record;
begin
  if TG_OP = 'UPDATE' and OLD.estado = NEW.estado then return NEW; end if;

  -- pendiente_confirmacion/confirmado -> cerrado: VENTA (kardex salida + liberar reserva)
  if TG_OP = 'UPDATE' and NEW.estado = 'cerrado' and OLD.estado in ('pendiente_confirmacion','confirmado') then
    for v_item in select producto_id, variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      perform public.kardex_registrar(v_item.producto_id, v_item.variante_id, 'venta', -v_item.cantidad, null, now(), NEW.id, null);
      update public.producto_variantes set reservado = greatest(0, reservado - v_item.cantidad) where id = v_item.variante_id;
    end loop;
    NEW.cerrado_at := coalesce(NEW.cerrado_at, now());
    return NEW;
  end if;

  -- -> cancelado: liberar reservas (sin kardex, sin tocar stock)
  if TG_OP = 'UPDATE' and NEW.estado = 'cancelado' and OLD.estado in ('pendiente_confirmacion','confirmado') then
    for v_item in select variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      update public.producto_variantes set reservado = greatest(0, reservado - v_item.cantidad) where id = v_item.variante_id;
    end loop;
    NEW.cancelado_at := coalesce(NEW.cancelado_at, now());
    return NEW;
  end if;

  -- cerrado -> devuelto: reintegrar (kardex devolucion)
  if TG_OP = 'UPDATE' and NEW.estado = 'devuelto' and OLD.estado = 'cerrado' then
    for v_item in select producto_id, variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      perform public.kardex_registrar(v_item.producto_id, v_item.variante_id, 'devolucion', v_item.cantidad, null, now(), NEW.id, null);
    end loop;
    NEW.devuelto_at := coalesce(NEW.devuelto_at, now());
    return NEW;
  end if;

  return NEW;
end; $$;
