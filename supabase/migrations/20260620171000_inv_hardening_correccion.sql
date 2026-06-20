-- ============================================================================
-- HARDENING INVENTARIO — Fase A (correccion + performance barata)
-- Probado en branch hardening-inv con verificacion empirica por punto.
-- Idempotente sobre prod (CREATE OR REPLACE / IF NOT EXISTS / ALTER) — los
-- objetos ya existen en prod; esta migracion los endurece.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- #2 quitar el clamp: el sync de stock NO enmascara negativos; la validacion
-- vive en kardex_registrar (rechazar-y-validar). Los CHECK quedan como red.
-- ----------------------------------------------------------------------------
create or replace function public.inv_mov_sync_stock()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  update public.producto_variantes
    set stock = stock + NEW.cantidad
    where id = NEW.variante_id;
  return NEW;
end; $function$;

-- ----------------------------------------------------------------------------
-- kardex_registrar v2:
--   #2 RECHAZAR-Y-VALIDAR con SELECT ... FOR UPDATE de la variante (rechazo
--      determinista bajo concurrencia, no solo en el camino feliz).
--   #3 SELECT ... FOR UPDATE de la fila de productos para el promedio ponderado.
--   Orden de locks consistente: variante (V) -> productos (P) en todos los caminos
--      (kardex directo y lifecycle), evita deadlocks.
-- ----------------------------------------------------------------------------
create or replace function public.kardex_registrar(
  p_producto_id uuid, p_variante_id uuid, p_tipo text, p_cantidad integer,
  p_costo_unitario numeric default null::numeric, p_fecha timestamp with time zone default now(),
  p_pedido_id uuid default null::uuid, p_nota text default null::text)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_tienda uuid; v_prom_ant numeric; v_cant_total integer;
  v_costo_unit numeric; v_costo_saldo numeric; v_nuevo_prom numeric; v_mov_id uuid;
  v_stock integer; v_reservado integer;
begin
  -- #2: lock de la variante PRIMERO (orden V->P) + validar antes de insertar.
  if p_variante_id is not null then
    select stock, reservado into v_stock, v_reservado
      from public.producto_variantes where id = p_variante_id for update;
    if not found then raise exception 'variante inexistente: %', p_variante_id; end if;
    if p_cantidad < 0 then
      if v_stock + p_cantidad < 0 then
        raise exception 'Stock insuficiente en la variante (stock %, movimiento %).', v_stock, p_cantidad;
      end if;
      if v_stock + p_cantidad < v_reservado then
        raise exception 'No se puede dejar el stock (%) por debajo de lo reservado (%).', v_stock + p_cantidad, v_reservado;
      end if;
    end if;
  end if;

  -- #3: lock de productos para el read-modify-write del promedio.
  select tienda_id, costo into v_tienda, v_prom_ant
    from public.productos where id = p_producto_id for update;
  if v_tienda is null then raise exception 'producto inexistente'; end if;

  select coalesce(sum(stock),0) into v_cant_total
    from public.producto_variantes where producto_id = p_producto_id;

  if p_cantidad > 0 and p_costo_unitario is not null then
    if v_prom_ant is null or (v_cant_total + p_cantidad) = 0 then
      v_nuevo_prom := p_costo_unitario;
    else
      v_nuevo_prom := (v_cant_total * v_prom_ant + p_cantidad * p_costo_unitario) / (v_cant_total + p_cantidad);
    end if;
    update public.productos set costo = v_nuevo_prom where id = p_producto_id;
    v_costo_unit := p_costo_unitario;
    v_costo_saldo := v_nuevo_prom;
  else
    v_costo_unit := coalesce(p_costo_unitario, v_prom_ant);
    v_costo_saldo := v_prom_ant;
  end if;

  insert into public.inventario_movimientos
    (tienda_id, producto_id, variante_id, tipo, cantidad, costo_unitario, costo_saldo, fecha, pedido_id, nota, creado_por)
  values
    (v_tienda, p_producto_id, p_variante_id, p_tipo, p_cantidad, v_costo_unit, v_costo_saldo, p_fecha, p_pedido_id, p_nota, auth.uid())
  returning id into v_mov_id;

  return v_mov_id;
end; $function$;

-- ----------------------------------------------------------------------------
-- pedido_stock_lifecycle v2: FIX DEL ORDEN DEL CIERRE.
-- Bajar `reservado` ANTES del kardex de venta (que baja stock via trigger), para
-- no violar CHECK(reservado<=stock) al vender la ultima unidad reservada
-- (stock=1, reservado=1). Resto identico.
-- ----------------------------------------------------------------------------
create or replace function public.pedido_stock_lifecycle()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_item record;
begin
  if TG_OP = 'UPDATE' and OLD.estado = NEW.estado then return NEW; end if;

  if TG_OP = 'UPDATE' and NEW.estado = 'cerrado' and OLD.estado in ('pendiente_confirmacion','confirmado') then
    for v_item in select producto_id, variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      -- reservado PRIMERO, kardex (baja stock) DESPUES
      update public.producto_variantes set reservado = greatest(0, reservado - v_item.cantidad) where id = v_item.variante_id;
      perform public.kardex_registrar(v_item.producto_id, v_item.variante_id, 'venta', -v_item.cantidad, null, now(), NEW.id, null);
    end loop;
    NEW.cerrado_at := coalesce(NEW.cerrado_at, now());
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and NEW.estado = 'cancelado' and OLD.estado in ('pendiente_confirmacion','confirmado') then
    for v_item in select variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      update public.producto_variantes set reservado = greatest(0, reservado - v_item.cantidad) where id = v_item.variante_id;
    end loop;
    NEW.cancelado_at := coalesce(NEW.cancelado_at, now());
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and NEW.estado = 'devuelto' and OLD.estado = 'cerrado' then
    for v_item in select producto_id, variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      perform public.kardex_registrar(v_item.producto_id, v_item.variante_id, 'devolucion', v_item.cantidad, null, now(), NEW.id, null);
    end loop;
    NEW.devuelto_at := coalesce(NEW.devuelto_at, now());
    return NEW;
  end if;

  return NEW;
end; $function$;

-- ----------------------------------------------------------------------------
-- Idempotencia del cierre/devolucion: bloquea doble venta/devolucion por
-- (pedido, variante). Un retry/doble-cierre dispara unique_violation y aborta.
-- ----------------------------------------------------------------------------
create unique index if not exists uq_inv_mov_idempotencia
  on public.inventario_movimientos (pedido_id, variante_id, tipo)
  where tipo in ('venta','devolucion');

-- ----------------------------------------------------------------------------
-- #7 orden contable = created_at (la `fecha` editable es etiqueta). Indice del
--    kardex-view alineado.
-- ----------------------------------------------------------------------------
create index if not exists ix_inv_mov_variante_created
  on public.inventario_movimientos (variante_id, created_at);

-- ----------------------------------------------------------------------------
-- #5 indice parcial para la consulta de velocidad de ventas (3 vistas).
-- ----------------------------------------------------------------------------
create index if not exists ix_inv_mov_venta_velocidad
  on public.inventario_movimientos (tienda_id, fecha) where tipo = 'venta';

-- ----------------------------------------------------------------------------
-- #4 (lo barato): marcar STABLE los predicados de RLS (eran VOLATILE; no
--    escriben; mismo resultado dentro de un statement -> el planner los cachea).
-- ----------------------------------------------------------------------------
alter function public.tienda_ia_es_dueno(uuid) stable;
alter function public.is_admin_or_cofounder() stable;

-- ----------------------------------------------------------------------------
-- M6 del hardening: REVOKE EXPLICITO de anon, authenticated (no solo PUBLIC),
-- robusto a cualquier dump/replay futuro. Funciones internas (triggers + engine
-- llamado por lifecycle/RPCs como definer): nadie las ejecuta directo.
-- ----------------------------------------------------------------------------
revoke all on function public.kardex_registrar(uuid,uuid,text,integer,numeric,timestamp with time zone,uuid,text) from public, anon, authenticated;
revoke all on function public.inv_mov_sync_stock() from public, anon, authenticated;
revoke all on function public.pedido_stock_lifecycle() from public, anon, authenticated;
