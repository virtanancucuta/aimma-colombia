--
-- PostgreSQL database dump
--

\restrict FZvzljggNWcNRBl1EX1zWY1xJdgQb31TMknhcaTgrIkjyuJleBWfgv0DMna8bUL

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public;  -- omitido: Supabase ya provee el schema public en todo proyecto/branch


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- PREAMBULO (fix de fidelidad de grants) — ESTANDAR de todo baseline por pg_dump.
-- El destino (Supabase) inyecta default privileges que dan GRANT ALL a anon/authenticated
-- a cada objeto nuevo. pg_dump NO es replay-safe sobre eso: representa los grants
-- reducidos de prod como ACL explicita/ausencia, sin un REVOKE que neutralice la herencia,
-- y un simple REVOKE FROM PUBLIC no toca el grant heredado a anon/auth (reabria el M6).
-- Neutralizamos los default privileges del rol creador ANTES de TODOS los CREATE, para que
-- cada objeto reciba EXACTAMENTE los grants explicitos del dump. Esta debe ser la ultima
-- sentencia de default-privileges previa a la creacion; los ALTER DEFAULT PRIVILEGES ... GRANT
-- de prod quedan al final del dump (post-CREATE) y re-establecen el estado real de prod.
--
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;


--
-- Name: acreditar_tokens(uuid, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acreditar_tokens(p_user_id uuid, p_cantidad integer, p_tipo text, p_referencia text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  nuevo_saldo INTEGER;
  ya_acreditado RECORD;
BEGIN
  IF p_tipo NOT IN ('asignacion_mensual', 'compra', 'regalo') THEN
    RAISE EXCEPTION 'tipo_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_cantidad <= 0 THEN RAISE EXCEPTION 'cantidad_invalida' USING ERRCODE = '22023'; END IF;

  -- Idempotencia por (tipo + referencia): no acreditar 2 veces el mismo evento
  IF p_referencia IS NOT NULL THEN
    SELECT * INTO ya_acreditado FROM token_ledger
      WHERE tipo = p_tipo AND referencia = p_referencia AND user_id = p_user_id LIMIT 1;
    IF ya_acreditado IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'already_credited', true, 'saldo', (SELECT token_balance FROM profiles WHERE id = p_user_id));
    END IF;
  END IF;

  UPDATE profiles SET token_balance = token_balance + p_cantidad WHERE id = p_user_id
    RETURNING token_balance INTO nuevo_saldo;
  IF nuevo_saldo IS NULL THEN RAISE EXCEPTION 'no_profile' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO token_ledger (user_id, delta, tipo, referencia, saldo_resultante)
    VALUES (p_user_id, p_cantidad, p_tipo, p_referencia, nuevo_saldo);
  RETURN jsonb_build_object('ok', true, 'acreditado', p_cantidad, 'saldo', nuevo_saldo);
END;
$$;


--
-- Name: auto_slug_producto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_slug_producto() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  base TEXT;
  candidato TEXT;
  i INT := 0;
BEGIN
  IF NEW.slug IS NULL OR length(NEW.slug) = 0
     OR (TG_OP = 'UPDATE' AND NEW.nombre IS DISTINCT FROM OLD.nombre AND NEW.slug = OLD.slug) THEN
    base := public.slugify_text(NEW.nombre);
    IF length(base) = 0 THEN base := 'producto'; END IF;
    candidato := base;
    WHILE EXISTS (
      SELECT 1 FROM public.productos
      WHERE tienda_id = NEW.tienda_id
        AND slug = candidato
        AND (TG_OP = 'INSERT' OR id <> NEW.id)
    ) LOOP
      i := i + 1;
      candidato := base || '-' || i::text;
    END LOOP;
    NEW.slug := candidato;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: buscar_productos(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buscar_productos(p_tienda_id uuid, p_q text, p_limit integer DEFAULT 24) RETURNS TABLE(id uuid, nombre text, slug text, referencia text, precio_venta numeric, precio_promo numeric, foto_principal_url text, stock_disponible numeric, rank real)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select p.id, p.nombre, p.slug, p.referencia,
    p.precio_venta, p.precio_promo, p.foto_principal_url,
    (select sum(greatest(0, coalesce(v.stock, 0) - coalesce(v.reservado, 0)))
       from producto_variantes v where v.producto_id = p.id) as stock_disponible,
    ts_rank(
      to_tsvector('spanish', unaccent(coalesce(p.nombre, '') || ' ' || coalesce(p.descripcion, ''))),
      websearch_to_tsquery('spanish', unaccent(p_q))
    ) as rank
  from productos p
  where p.tienda_id = p_tienda_id
    and p.estado = 'activo'
    and to_tsvector('spanish', unaccent(coalesce(p.nombre, '') || ' ' || coalesce(p.descripcion, '')))
        @@ websearch_to_tsquery('spanish', unaccent(p_q))
  order by rank desc, p.updated_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 48);
$$;


--
-- Name: categoria_descendientes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.categoria_descendientes(p_categoria_id uuid) RETURNS TABLE(id uuid)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with recursive sub as (
    select c.id, c.parent_id, 1 as depth
    from categorias c
    where c.id = p_categoria_id
    union all
    select c.id, c.parent_id, sub.depth + 1
    from categorias c
    join sub on c.parent_id = sub.id
    where sub.depth < 10
  )
  select sub.id from sub;
$$;


--
-- Name: check_email_rate_limit(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_email_rate_limit(p_correo text, p_evento text, p_max integer, p_ventana_min integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_count int;
  v_corte timestamptz := now() - (p_ventana_min || ' minutes')::interval;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.email_rate_limit
  WHERE correo = p_correo
    AND evento = p_evento
    AND created_at > v_corte;

  IF v_count >= p_max THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'max', p_max,
      'ventana_min', p_ventana_min,
      'siguiente_disponible_en_min', p_ventana_min
    );
  END IF;

  INSERT INTO public.email_rate_limit (correo, evento) VALUES (p_correo, p_evento);

  -- Cleanup ocasional: borrar registros viejos (>24h) para no llenar la tabla.
  -- Solo se ejecuta 1 de cada 100 inserts aprox (probabilistico).
  IF random() < 0.01 THEN
    DELETE FROM public.email_rate_limit WHERE created_at < now() - interval '24 hours';
  END IF;

  RETURN jsonb_build_object('allowed', true, 'count', v_count + 1, 'max', p_max);
END;
$$;


--
-- Name: check_rate_limit_form_submit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_rate_limit_form_submit(p_key text, p_max integer, p_window_minutes integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count int;
  v_window_start timestamptz;
BEGIN
  SELECT count, window_start
    INTO v_count, v_window_start
    FROM form_submit_rate_limit
    WHERE rate_key = p_key
    FOR UPDATE;

  IF NOT FOUND OR v_window_start < now() - (p_window_minutes || ' minutes')::interval THEN
    INSERT INTO form_submit_rate_limit (rate_key, count, window_start)
    VALUES (p_key, 1, now())
    ON CONFLICT (rate_key) DO UPDATE
      SET count = 1, window_start = now();
    RETURN 1;
  END IF;

  UPDATE form_submit_rate_limit
    SET count = count + 1
    WHERE rate_key = p_key;
  RETURN v_count + 1;
END;
$$;


--
-- Name: cleanup_form_submit_rate_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_form_submit_rate_limit() RETURNS integer
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  WITH d AS (
    DELETE FROM form_submit_rate_limit
      WHERE window_start < now() - interval '24 hours'
      RETURNING 1
  )
  SELECT count(*)::int FROM d;
$$;


--
-- Name: cleanup_preview_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_preview_tokens() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM preview_tokens WHERE expires_at < now() - interval '1 hour';
$$;


--
-- Name: diag_rate_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.diag_rate_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  recent_count int;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.diagnostico_gratuito
  WHERE correo = NEW.correo
    AND created_at > now() - interval '1 hour';
  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'rate_limit_exceeded: max 3 envios/hora por correo' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: gen_codigo_publico_pedido(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gen_codigo_publico_pedido() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_intentos INT := 0;
  v_codigo TEXT;
BEGIN
  IF NEW.codigo_publico IS NULL OR length(NEW.codigo_publico) = 0 THEN
    LOOP
      v_codigo := 'PED-' || to_char(COALESCE(NEW.created_at, now()), 'YYYYMMDD') || '-' ||
        upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.pedidos WHERE codigo_publico = v_codigo);
      v_intentos := v_intentos + 1;
      IF v_intentos > 5 THEN
        -- fallback con timestamp microsegundos
        v_codigo := 'PED-' || to_char(now(), 'YYYYMMDDHH24MISSUS');
        EXIT;
      END IF;
    END LOOP;
    NEW.codigo_publico := v_codigo;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (
    id, nombre_completo, correo, cedula, telefono,
    direccion, nombre_empresa, pagina_web, metodo_registro, perfil_completo,
    trial_started_at, trial_ends_at, trial_consumed
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nombre_completo',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    new.raw_user_meta_data->>'cedula',
    new.raw_user_meta_data->>'telefono',
    new.raw_user_meta_data->>'direccion',
    new.raw_user_meta_data->>'nombre_empresa',
    new.raw_user_meta_data->>'pagina_web',
    case when new.raw_app_meta_data->>'provider' = 'google' then 'google' else 'email' end,
    case when new.raw_user_meta_data->>'cedula' is not null then true else false end,
    now(),
    now() + interval '7 days',
    false
  );

  insert into public.suscripciones (user_id, plan_codigo, estado, monto)
  values (new.id, 'AIMMA_PRO', 'sin_plan', 0);

  return new;
end;
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: inv_mov_sync_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inv_mov_sync_stock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.producto_variantes
    set stock = greatest(0, stock + NEW.cantidad)
    where id = NEW.variante_id;
  return NEW;
end; $$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin'
  );
$$;


--
-- Name: is_admin_or_cofounder(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_or_cofounder() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND rol IN ('admin','cofounder')
  );
$$;


--
-- Name: kardex_registrar(uuid, uuid, text, integer, numeric, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kardex_registrar(p_producto_id uuid, p_variante_id uuid, p_tipo text, p_cantidad integer, p_costo_unitario numeric DEFAULT NULL::numeric, p_fecha timestamp with time zone DEFAULT now(), p_pedido_id uuid DEFAULT NULL::uuid, p_nota text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tienda uuid; v_prom_ant numeric; v_cant_total integer;
  v_costo_unit numeric; v_costo_saldo numeric; v_nuevo_prom numeric; v_mov_id uuid;
begin
  select tienda_id, costo into v_tienda, v_prom_ant from public.productos where id = p_producto_id;
  if v_tienda is null then raise exception 'producto inexistente'; end if;

  select coalesce(sum(stock),0) into v_cant_total from public.producto_variantes where producto_id = p_producto_id;

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
end; $$;


--
-- Name: notif_pedido_webhook(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_pedido_webhook() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_secret text;
  v_url text := 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-notif-pedido';
  v_body jsonb;
begin
  select secret into v_secret from public.notif_webhook_config where id = 1;
  v_body := jsonb_build_object(
    'type', TG_OP,
    'table', 'pedidos',
    'record', to_jsonb(NEW),
    'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
  );
  perform net.http_post(
    url := v_url,
    body := v_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
  );
  return NEW;
end;
$$;


--
-- Name: pedido_stock_lifecycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pedido_stock_lifecycle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_item record;
begin
  if TG_OP = 'UPDATE' and OLD.estado = NEW.estado then return NEW; end if;

  if TG_OP = 'UPDATE' and NEW.estado = 'cerrado' and OLD.estado in ('pendiente_confirmacion','confirmado') then
    for v_item in select producto_id, variante_id, cantidad from public.pedido_items
                  where pedido_id = NEW.id and variante_id is not null loop
      perform public.kardex_registrar(v_item.producto_id, v_item.variante_id, 'venta', -v_item.cantidad, null, now(), NEW.id, null);
      update public.producto_variantes set reservado = greatest(0, reservado - v_item.cantidad) where id = v_item.variante_id;
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
end; $$;


--
-- Name: protect_profile_privileged_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile_privileged_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  caller_role text := current_setting('request.jwt.claims', true)::jsonb->>'role';
  is_caller_admin boolean := false;
BEGIN
  -- service_role pasa siempre (EFs: verify_email_by_token, send-welcome-email, mp-webhook, etc)
  IF caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- admin/cofounder pasa siempre
  BEGIN
    SELECT public.is_admin_or_cofounder() INTO is_caller_admin;
  EXCEPTION WHEN OTHERS THEN
    is_caller_admin := false;
  END;
  IF is_caller_admin THEN
    RETURN NEW;
  END IF;

  -- Resto de usuarios: bloquear cambio de columnas privilegiadas
  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'No tienes permisos para modificar el rol' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan_actual IS DISTINCT FROM OLD.plan_actual THEN
    RAISE EXCEPTION 'No tienes permisos para modificar el plan' USING ERRCODE = '42501';
  END IF;
  IF NEW.token_balance IS DISTINCT FROM OLD.token_balance THEN
    RAISE EXCEPTION 'No tienes permisos para modificar el balance de tokens' USING ERRCODE = '42501';
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'No tienes permisos para modificar el estado de la cuenta' USING ERRCODE = '42501';
  END IF;
  IF NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.trial_consumed IS DISTINCT FROM OLD.trial_consumed THEN
    RAISE EXCEPTION 'No tienes permisos para modificar el trial' USING ERRCODE = '42501';
  END IF;
  -- NUEVO #11: correo + email_aimma_verificado + welcome_enviado_at immutables
  IF NEW.correo IS DISTINCT FROM OLD.correo THEN
    RAISE EXCEPTION 'El correo no puede modificarse desde el perfil. Contacta soporte.' USING ERRCODE = '42501';
  END IF;
  IF NEW.email_aimma_verificado IS DISTINCT FROM OLD.email_aimma_verificado THEN
    RAISE EXCEPTION 'No tienes permisos para modificar el estado de verificacion del correo' USING ERRCODE = '42501';
  END IF;
  IF NEW.welcome_enviado_at IS DISTINCT FROM OLD.welcome_enviado_at THEN
    RAISE EXCEPTION 'No tienes permisos para modificar welcome_enviado_at' USING ERRCODE = '42501';
  END IF;
  -- NUEVO #11: cuenta_cancelada_at tambien protegido (debe ir solo por EFs cancelar/reactivar-cuenta service_role)
  IF NEW.cuenta_cancelada_at IS DISTINCT FROM OLD.cuenta_cancelada_at THEN
    RAISE EXCEPTION 'cuenta_cancelada_at solo se modifica via EFs cancelar/reactivar-cuenta' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: reembolsar_tokens(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reembolsar_tokens(p_job_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  consumo RECORD;
  reembolso_existente RECORD;
  nuevo_saldo INTEGER;
BEGIN
  -- service_role o admin pueden reembolsar (se llama desde EFs)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    -- Si lo invoca un user no-admin, solo puede reembolsar sus propios jobs
    SELECT * INTO consumo FROM token_ledger
      WHERE referencia = p_job_id AND tipo = 'consumo' AND user_id = auth.uid()
      LIMIT 1;
  ELSE
    SELECT * INTO consumo FROM token_ledger WHERE referencia = p_job_id AND tipo = 'consumo' LIMIT 1;
  END IF;
  IF consumo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'razon', 'consumo_no_encontrado');
  END IF;

  -- Idempotente: si ya hay reembolso para este job_id, devolver OK sin duplicar
  SELECT * INTO reembolso_existente FROM token_ledger
    WHERE referencia = p_job_id AND tipo = 'reembolso' LIMIT 1;
  IF reembolso_existente IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_refunded', true);
  END IF;

  UPDATE profiles SET token_balance = token_balance + ABS(consumo.delta) WHERE id = consumo.user_id
    RETURNING token_balance INTO nuevo_saldo;
  INSERT INTO token_ledger (user_id, delta, tipo, referencia, saldo_resultante)
    VALUES (consumo.user_id, ABS(consumo.delta), 'reembolso', p_job_id, nuevo_saldo);
  RETURN jsonb_build_object('ok', true, 'reembolsado', ABS(consumo.delta), 'saldo', nuevo_saldo);
END;
$$;


--
-- Name: reservar_stock_variante(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reservar_stock_variante(p_variante_id uuid, p_cantidad integer) RETURNS TABLE(variante_id uuid, stock_disponible integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_disponible INT;
BEGIN
  UPDATE public.producto_variantes
  SET reservado = reservado + p_cantidad
  WHERE id = p_variante_id
    AND (stock - reservado) >= p_cantidad
  RETURNING (stock - reservado) INTO v_disponible;

  IF NOT FOUND THEN
    RETURN; -- empty rowset = sin stock
  END IF;

  variante_id := p_variante_id;
  stock_disponible := v_disponible;
  RETURN NEXT;
END;
$$;


--
-- Name: reservar_tokens(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reservar_tokens(p_user_id uuid, p_cantidad integer, p_job_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  saldo_actual INTEGER;
  nuevo_saldo INTEGER;
  caller UUID;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF caller != p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_cantidad <= 0 THEN RAISE EXCEPTION 'cantidad_invalida' USING ERRCODE = '22023'; END IF;

  SELECT token_balance INTO saldo_actual FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF saldo_actual IS NULL THEN RAISE EXCEPTION 'no_profile' USING ERRCODE = 'P0002'; END IF;
  IF saldo_actual < p_cantidad THEN
    RETURN jsonb_build_object('ok', false, 'razon', 'saldo_insuficiente', 'saldo', saldo_actual, 'requerido', p_cantidad);
  END IF;

  nuevo_saldo := saldo_actual - p_cantidad;

  -- Bypass trigger immutable (token_balance) solo en esta transaccion
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE profiles SET token_balance = nuevo_saldo WHERE id = p_user_id;
  INSERT INTO token_ledger (user_id, delta, tipo, referencia, saldo_resultante)
    VALUES (p_user_id, -p_cantidad, 'consumo', p_job_id, nuevo_saldo);
  RETURN jsonb_build_object('ok', true, 'saldo', nuevo_saldo);
END;
$$;


--
-- Name: reservar_tokens_v2(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reservar_tokens_v2(p_user_id uuid, p_cantidad integer, p_job_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  saldo_actual INTEGER;
  nuevo_saldo INTEGER;
  caller UUID;
  caller_rol TEXT;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF caller != p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_cantidad <= 0 THEN RAISE EXCEPTION 'cantidad_invalida' USING ERRCODE = '22023'; END IF;

  -- v2: cortesia para admin/cofounder. NO descuenta, NO inserta en ledger
  -- (auditoria queda en image_jobs.user_id + paginas_ia_generadas.tienda_id).
  SELECT rol INTO caller_rol FROM profiles WHERE id = p_user_id;
  IF caller_rol IN ('admin','cofounder') THEN
    RETURN jsonb_build_object('ok', true, 'cortesia', true, 'rol', caller_rol);
  END IF;

  SELECT token_balance INTO saldo_actual FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF saldo_actual IS NULL THEN RAISE EXCEPTION 'no_profile' USING ERRCODE = 'P0002'; END IF;
  IF saldo_actual < p_cantidad THEN
    RETURN jsonb_build_object('ok', false, 'razon', 'saldo_insuficiente', 'saldo', saldo_actual, 'requerido', p_cantidad);
  END IF;

  nuevo_saldo := saldo_actual - p_cantidad;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE profiles SET token_balance = nuevo_saldo WHERE id = p_user_id;
  INSERT INTO token_ledger (user_id, delta, tipo, referencia, saldo_resultante)
    VALUES (p_user_id, -p_cantidad, 'consumo', p_job_id, nuevo_saldo);
  RETURN jsonb_build_object('ok', true, 'saldo', nuevo_saldo, 'cortesia', false);
END;
$$;


--
-- Name: slugify_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slugify_text(input text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT trim(both '-' FROM
    regexp_replace(
      regexp_replace(
        lower(public.unaccent(coalesce(input, ''))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  )
$$;


--
-- Name: tienda_ia_es_dueno(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tienda_ia_es_dueno(p_tienda_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tiendas
    WHERE id = p_tienda_id AND user_id = auth.uid()
  );
$$;


--
-- Name: tienda_ia_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tienda_ia_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;


--
-- Name: tiene_acceso_pro(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tiene_acceso_pro(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  sus record;
  prof record;
  caller uuid;
  found_sus boolean := false;
  found_prof boolean := false;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF caller != p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- (0) CUENTA CANCELADA: chequeo prioritario
  SELECT cuenta_cancelada_at, trial_started_at, trial_ends_at, trial_consumed
    INTO prof FROM profiles WHERE id = p_user_id;
  found_prof := FOUND;

  IF found_prof AND prof.cuenta_cancelada_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'pro', false,
      'razon', 'cuenta_cancelada',
      'cuenta_cancelada_at', prof.cuenta_cancelada_at
    );
  END IF;

  -- (1) Suscripcion PRO
  SELECT * INTO sus FROM suscripciones WHERE user_id = p_user_id
    ORDER BY fecha_inicio DESC NULLS LAST, created_at DESC NULLS LAST LIMIT 1;
  found_sus := FOUND;

  IF found_sus THEN
    IF sus.cortesia = true THEN
      RETURN jsonb_build_object('pro', true, 'razon', 'cortesia',
        'plan_tipo', sus.plan_tipo, 'cortesia_razon', sus.cortesia_razon);
    END IF;
    IF sus.estado = 'activa' AND sus.mp_preapproval_id IS NOT NULL THEN
      RETURN jsonb_build_object('pro', true, 'razon', 'activa',
        'plan_tipo', sus.plan_tipo, 'proxima_facturacion', sus.proxima_facturacion);
    END IF;
    IF sus.estado = 'cancelada' AND sus.proxima_facturacion IS NOT NULL AND sus.proxima_facturacion > now() THEN
      RETURN jsonb_build_object('pro', true, 'razon', 'cancelada_pero_vigente',
        'plan_tipo', sus.plan_tipo, 'acceso_hasta', sus.proxima_facturacion);
    END IF;
  END IF;

  -- (2) Trial 7 dias vigente
  IF found_prof AND prof.trial_consumed = false AND prof.trial_ends_at IS NOT NULL AND prof.trial_ends_at > now() THEN
    RETURN jsonb_build_object(
      'pro', true,
      'razon', 'trial_vigente',
      'trial_ends_at', prof.trial_ends_at,
      'dias_restantes', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (prof.trial_ends_at - now())) / 86400)::int)
    );
  END IF;

  -- (3) Trial expirado SIN pago: auto-marcar trial_consumed=true
  --     Bypass trigger immutable (trial_consumed) solo en esta transaccion
  IF found_prof AND prof.trial_consumed = false AND prof.trial_ends_at IS NOT NULL AND prof.trial_ends_at <= now() THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    UPDATE profiles SET trial_consumed = true WHERE id = p_user_id;
    RETURN jsonb_build_object('pro', false, 'razon', 'trial_vencido', 'trial_ends_at', prof.trial_ends_at);
  END IF;

  -- (4) Trial ya consumido
  IF found_prof AND prof.trial_consumed = true THEN
    RETURN jsonb_build_object('pro', false, 'razon', 'trial_consumed');
  END IF;

  -- (5) Legacy sin trial seteado y sin suscripcion
  IF NOT found_sus THEN
    RETURN jsonb_build_object('pro', false, 'razon', 'no_subscription');
  END IF;

  RETURN jsonb_build_object('pro', false, 'razon', sus.estado);
END;
$$;


--
-- Name: try_consume_rate_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_consume_rate_token(p_provider text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_row record;
  v_elapsed_seconds numeric;
  v_refilled_tokens numeric;
  v_new_tokens numeric;
BEGIN
  SELECT * INTO v_row FROM public.rate_buckets
    WHERE provider = p_provider FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rate_buckets: provider % no inicializado', p_provider;
  END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - v_row.last_refill_at));
  v_refilled_tokens := LEAST(
    v_row.capacity::numeric,
    v_row.tokens + (v_elapsed_seconds * v_row.refill_per_second)
  );

  IF v_refilled_tokens >= 1 THEN
    v_new_tokens := v_refilled_tokens - 1;
    UPDATE public.rate_buckets
      SET tokens = v_new_tokens, last_refill_at = v_now, updated_at = v_now
      WHERE provider = p_provider;
    RETURN TRUE;
  ELSE
    UPDATE public.rate_buckets
      SET tokens = v_refilled_tokens, last_refill_at = v_now, updated_at = v_now
      WHERE provider = p_provider;
    RETURN FALSE;
  END IF;
END;
$$;


--
-- Name: validate_preview_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_preview_token(p_token uuid) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT tienda_id FROM preview_tokens
  WHERE token = p_token AND expires_at > now()
  LIMIT 1;
$$;


--
-- Name: verify_email_by_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_email_by_token(p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE verificacion_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'token_invalido');
  END IF;

  IF v_profile.email_aimma_verificado = true THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_verified', true,
      'user_id', v_profile.id,
      'correo', v_profile.correo,
      'nombre_completo', v_profile.nombre_completo
    );
  END IF;

  -- Declarar service_role en el claim local de esta transaccion para que el trigger
  -- profiles_protect_privileged permita el UPDATE de email_aimma_verificado.
  -- is_local=true => solo dentro de la transaccion, no contamina el pool de conexiones.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE public.profiles
  SET email_aimma_verificado = true,
      updated_at = now()
  WHERE id = v_profile.id;

  RETURN jsonb_build_object(
    'success', true,
    'already_verified', false,
    'user_id', v_profile.id,
    'correo', v_profile.correo,
    'nombre_completo', v_profile.nombre_completo
  );
END;
$$;


--
-- Name: wa_fn_actualizar_cliente(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wa_fn_actualizar_cliente(p_cliente_id uuid, p_nombre text, p_correo text, p_empresa text, p_cedula text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.wa_clientes set
    nombre  = coalesce(nullif(trim(p_nombre),''),  nombre),
    correo  = coalesce(nullif(trim(p_correo),''),  correo),
    empresa = coalesce(nullif(trim(p_empresa),''), empresa),
    cedula  = coalesce(nullif(trim(p_cedula),''),  cedula),
    tipo    = case when tipo = 'lead' then 'prospecto' else tipo end,
    updated_at = now()
  where id = p_cliente_id;
end;
$$;


--
-- Name: wa_fn_consultoria(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wa_fn_consultoria(p_cliente_id uuid, p_conversacion_id uuid, p_tipo text, p_descripcion text, p_prioridad text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid; v_folio text; v_tipo text; v_prio text; v_existe public.wa_consultorias;
begin
  v_tipo := case when p_tipo in ('consultoria','desarrollo','panel_ia','scraping','marketing')
                 then p_tipo else 'otro' end;
  v_prio := case when p_prioridad in ('alta','media','baja') then p_prioridad else 'alta' end;

  select * into v_existe from public.wa_consultorias
   where cliente_id = p_cliente_id
     and conversacion_id = p_conversacion_id
     and estado = 'nuevo'
     and created_at > now() - interval '1 hour'
   order by created_at desc limit 1;

  if v_existe.id is not null then
    update public.wa_consultorias set
      tipo_solicitud = case when v_tipo = 'otro' then tipo_solicitud else v_tipo end,
      descripcion = case
        when coalesce(trim(p_descripcion),'') = '' then descripcion
        when position(trim(p_descripcion) in coalesce(descripcion,'')) > 0 then descripcion
        else coalesce(descripcion,'') || ' | ' || trim(p_descripcion)
      end,
      prioridad = v_prio
     where id = v_existe.id
     returning id, folio into v_id, v_folio;
    return jsonb_build_object('id', v_id, 'folio', v_folio, 'nuevo', false);
  end if;

  v_folio := 'C-' || lpad(nextval('wa_consultorias_folio_seq')::text, 4, '0');
  insert into public.wa_consultorias (cliente_id, conversacion_id, tipo_solicitud, descripcion,
                                      prioridad, notificado_ceo, folio)
  values (p_cliente_id, p_conversacion_id, v_tipo, p_descripcion, v_prio, true, v_folio)
  returning id into v_id;
  insert into public.wa_escalamientos (cliente_id, conversacion_id, consultoria_id, motivo, contexto, urgencia)
  values (p_cliente_id, p_conversacion_id, v_id, 'Solicitud comercial: ' || v_tipo, p_descripcion, v_prio);
  return jsonb_build_object('id', v_id, 'folio', v_folio, 'nuevo', true);
end;
$$;


--
-- Name: wa_fn_entrante(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wa_fn_entrante(p_telefono text, p_nombre_wa text, p_tipo text, p_texto text, p_message_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cliente public.wa_clientes;
  v_conv_id uuid;
  v_tipo text;
  v_recientes int;
  v_profile_id uuid;
  v_nombre_aimma text;
  v_pro boolean;
begin
  v_tipo := case lower(coalesce(p_tipo,''))
              when 'text' then 'texto'
              when 'audio' then 'audio'
              when 'image' then 'imagen'
              when 'document' then 'documento'
              else 'sistema' end;

  insert into public.wa_clientes (telefono, nombre_whatsapp)
  values (p_telefono, p_nombre_wa)
  on conflict (telefono) do update
    set nombre_whatsapp = coalesce(wa_clientes.nombre_whatsapp, excluded.nombre_whatsapp),
        updated_at = now()
  returning * into v_cliente;

  -- Continuidad: reusar conversacion activa O escalada reciente (<6h) para no re-crearla tras un escalamiento.
  select id into v_conv_id from public.wa_conversaciones
   where cliente_id = v_cliente.id
     and estado in ('activa','escalada')
     and ultimo_mensaje_en > now() - interval '6 hours'
   order by ultimo_mensaje_en desc limit 1;
  if v_conv_id is null then
    insert into public.wa_conversaciones (cliente_id, telefono)
    values (v_cliente.id, p_telefono) returning id into v_conv_id;
  else
    update public.wa_conversaciones set ultimo_mensaje_en = now() where id = v_conv_id;
  end if;

  insert into public.wa_mensajes (conversacion_id, cliente_id, direccion, tipo, contenido, whatsapp_message_id)
  values (v_conv_id, v_cliente.id, 'entrante', v_tipo, p_texto, p_message_id)
  on conflict (whatsapp_message_id) do nothing;

  select count(*) into v_recientes from public.wa_mensajes
   where cliente_id = v_cliente.id and direccion = 'entrante'
     and created_at > now() - interval '60 seconds';

  select pr.id, pr.nombre_completo,
         (su.estado = 'activa' and (su.mp_preapproval_id is not null or coalesce(su.cortesia,false)))
    into v_profile_id, v_nombre_aimma, v_pro
  from public.profiles pr
  left join public.suscripciones su on su.user_id = pr.id
  where ( length(regexp_replace(coalesce(pr.telefono,''),'[^0-9]','','g')) >= 10
          and right(regexp_replace(coalesce(pr.telefono,''),'[^0-9]','','g'),10)
              = right(regexp_replace(coalesce(p_telefono,''),'[^0-9]','','g'),10) )
     or ( coalesce(v_cliente.correo,'') <> '' and lower(pr.correo) = lower(v_cliente.correo) )
  order by (su.estado = 'activa' and (su.mp_preapproval_id is not null or coalesce(su.cortesia,false))) desc nulls last
  limit 1;

  if v_profile_id is not null then
    update public.wa_clientes
       set profile_id = v_profile_id,
           es_cliente_pro = coalesce(v_pro, false),
           tipo = case when coalesce(v_pro, false) then 'cliente_activo' else tipo end,
           updated_at = now()
     where id = v_cliente.id;
  end if;

  return jsonb_build_object(
    'cliente_id', v_cliente.id,
    'conversacion_id', v_conv_id,
    'nombre', coalesce(v_cliente.nombre, v_cliente.nombre_whatsapp, ''),
    'tipo_cliente', v_cliente.tipo,
    'es_cliente_pro', v_cliente.es_cliente_pro,
    'correo', coalesce(v_cliente.correo, ''),
    'empresa', coalesce(v_cliente.empresa, ''),
    'rate_ok', (v_recientes <= 20),
    'es_pro_aimma', coalesce(v_pro, false),
    'nombre_aimma', coalesce(v_nombre_aimma, '')
  );
end;
$$;


--
-- Name: wa_fn_reclamo(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wa_fn_reclamo(p_cliente_id uuid, p_conversacion_id uuid, p_categoria text, p_descripcion text, p_detalle text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid; v_folio text; v_cat text; v_existe public.wa_reclamos;
begin
  v_cat := case when p_categoria in ('carga_excel','carga_pdf','formato_pos','informe_no_genera',
                                     'dato_incorrecto','acceso_login','pago') then p_categoria else 'otro' end;

  select * into v_existe from public.wa_reclamos
   where cliente_id = p_cliente_id
     and conversacion_id = p_conversacion_id
     and estado in ('abierto','en_proceso','escalado_ceo')
     and created_at > now() - interval '1 hour'
   order by created_at desc limit 1;

  if v_existe.id is not null then
    update public.wa_reclamos set
      categoria = case when v_cat = 'otro' then categoria else v_cat end,
      descripcion = coalesce(nullif(trim(p_descripcion),''), descripcion),
      detalle_problema = case
        when coalesce(trim(p_detalle),'') = '' then detalle_problema
        when coalesce(trim(detalle_problema),'') = '' then trim(p_detalle)
        when position(trim(p_detalle) in coalesce(detalle_problema,'')) > 0 then detalle_problema
        else coalesce(detalle_problema,'') || ' | ' || trim(p_detalle)
      end
     where id = v_existe.id
     returning id, folio into v_id, v_folio;
    return jsonb_build_object('id', v_id, 'folio', v_folio, 'nuevo', false);
  end if;

  v_folio := 'R-' || lpad(nextval('wa_reclamos_folio_seq')::text, 4, '0');
  insert into public.wa_reclamos (cliente_id, conversacion_id, categoria, descripcion, detalle_problema,
                                  estado, escalado_ceo, folio)
  values (p_cliente_id, p_conversacion_id, v_cat, p_descripcion, p_detalle, 'escalado_ceo', true, v_folio)
  returning id into v_id;
  insert into public.wa_escalamientos (cliente_id, conversacion_id, reclamo_id, motivo, contexto, urgencia)
  values (p_cliente_id, p_conversacion_id, v_id, 'Reclamo de servicio: ' || v_cat, p_descripcion, 'alta');
  update public.wa_conversaciones set estado = 'escalada' where id = p_conversacion_id;
  return jsonb_build_object('id', v_id, 'folio', v_folio, 'nuevo', true);
end;
$$;


--
-- Name: wa_fn_saliente(uuid, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wa_fn_saliente(p_conversacion_id uuid, p_cliente_id uuid, p_texto text, p_tokens integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.wa_mensajes (conversacion_id, cliente_id, direccion, tipo, contenido, tokens_usados)
  values (p_conversacion_id, p_cliente_id, 'saliente', 'texto', p_texto, coalesce(p_tokens,0));
  update public.wa_conversaciones set ultimo_mensaje_en = now() where id = p_conversacion_id;
end;
$$;


--
-- Name: wa_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wa_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_cuenta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_cuenta (
    id bigint NOT NULL,
    user_id uuid,
    evento text NOT NULL,
    metadata jsonb,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT audit_log_cuenta_evento_check CHECK ((evento = ANY (ARRAY['cuenta_cancelada'::text, 'cuenta_reactivada'::text, 'trial_cancelado'::text, 'suscripcion_cancelada'::text])))
);


--
-- Name: TABLE audit_log_cuenta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_log_cuenta IS 'Audit log de cambios de estado de cuenta. Solo admin lee. Inserts via service_role desde EFs.';


--
-- Name: audit_log_cuenta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_cuenta_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_cuenta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_cuenta_id_seq OWNED BY public.audit_log_cuenta.id;


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    parent_id uuid,
    nombre text NOT NULL,
    slug text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    foto_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: diagnostico_gratuito; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnostico_gratuito (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    nombre_empresa text NOT NULL,
    pagina_web text,
    ciudad_sede text NOT NULL,
    instagram text,
    nombre_contacto text NOT NULL,
    telefono text NOT NULL,
    correo text NOT NULL,
    a_que_se_dedica text NOT NULL,
    procesos_a_automatizar text NOT NULL,
    origen text DEFAULT 'website'::text,
    estado text DEFAULT 'nuevo'::text,
    notas text,
    ip_address text,
    user_agent text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    CONSTRAINT diag_lengths CHECK (((length(nombre_empresa) <= 200) AND (length(nombre_empresa) >= 1) AND (length(ciudad_sede) <= 100) AND (length(nombre_contacto) <= 200) AND (length(telefono) <= 50) AND (length(correo) <= 200) AND (length(a_que_se_dedica) <= 2000) AND (length(procesos_a_automatizar) <= 5000) AND ((pagina_web IS NULL) OR (length(pagina_web) <= 500)) AND ((instagram IS NULL) OR (length(instagram) <= 200)))),
    CONSTRAINT diagnostico_gratuito_estado_check CHECK ((estado = ANY (ARRAY['nuevo'::text, 'contactado'::text, 'en_proceso'::text, 'ganado'::text, 'perdido'::text])))
);


--
-- Name: TABLE diagnostico_gratuito; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.diagnostico_gratuito IS 'Leads capturados desde el formulario de Diagnóstico Gratuito en aimma.colombia';


--
-- Name: COLUMN diagnostico_gratuito.origen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diagnostico_gratuito.origen IS 'De dónde proviene el lead (website, ads, referido, etc.)';


--
-- Name: COLUMN diagnostico_gratuito.estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diagnostico_gratuito.estado IS 'Estado del lead en el pipeline comercial';


--
-- Name: editor_v2_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editor_v2_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    slug text,
    personalizaciones_old jsonb NOT NULL,
    migrated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_rate_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_rate_limit (
    id bigint NOT NULL,
    correo text NOT NULL,
    evento text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_rate_limit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_rate_limit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_rate_limit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_rate_limit_id_seq OWNED BY public.email_rate_limit.id;


--
-- Name: envios_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envios_config (
    tienda_id uuid NOT NULL,
    metodo_default text DEFAULT 'a_coordinar'::text NOT NULL,
    tarifa_fija numeric(12,2),
    envio_gratis_min numeric(12,2),
    tarifa_default_ciudades numeric(12,2),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT envios_config_envio_gratis_min_check CHECK (((envio_gratis_min IS NULL) OR (envio_gratis_min > (0)::numeric))),
    CONSTRAINT envios_config_metodo_default_check CHECK ((metodo_default = ANY (ARRAY['a_coordinar'::text, 'tarifa_fija'::text, 'por_ciudad'::text]))),
    CONSTRAINT envios_config_tarifa_default_ciudades_check CHECK (((tarifa_default_ciudades IS NULL) OR (tarifa_default_ciudades >= (0)::numeric))),
    CONSTRAINT envios_config_tarifa_fija_check CHECK (((tarifa_fija IS NULL) OR (tarifa_fija >= (0)::numeric)))
);


--
-- Name: envios_tarifas_ciudad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envios_tarifas_ciudad (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    ciudad text NOT NULL,
    tarifa numeric(12,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT envios_tarifas_ciudad_tarifa_check CHECK (((tarifa IS NULL) OR (tarifa >= (0)::numeric)))
);


--
-- Name: form_submission_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_submission_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    submission_id uuid,
    destino text NOT NULL,
    asunto text NOT NULL,
    cuerpo text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    error_msg text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    enviado_at timestamp with time zone,
    CONSTRAINT form_submission_notifications_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'fallido'::text])))
);


--
-- Name: form_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    section_id text NOT NULL,
    fields jsonb NOT NULL,
    ip text,
    user_agent text,
    leido_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: form_submit_rate_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_submit_rate_limit (
    rate_key text NOT NULL,
    count integer NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: image_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.image_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    estado text DEFAULT 'queued'::text NOT NULL,
    modelo text NOT NULL,
    tokens_reservados integer NOT NULL,
    instruccion text,
    accion_rapida text,
    input_url text NOT NULL,
    output_url text,
    kie_task_id text,
    error text,
    intentos integer DEFAULT 0 NOT NULL,
    encolado_at timestamp with time zone DEFAULT now(),
    procesando_desde timestamp with time zone,
    finalizado_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    source text DEFAULT 'contenido_ia'::text NOT NULL,
    return_to text,
    target_producto_id uuid,
    target_campo text,
    pipeline text,
    sujeto_tipo text,
    CONSTRAINT image_jobs_estado_check CHECK ((estado = ANY (ARRAY['queued'::text, 'processing'::text, 'done'::text, 'failed'::text, 'dead_letter'::text]))),
    CONSTRAINT image_jobs_source_check CHECK ((source = ANY (ARRAY['contenido_ia'::text, 'tienda_producto'::text])))
);


--
-- Name: TABLE image_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.image_jobs IS 'Cola de trabajos de edicion. queued -> processing -> done/failed/dead_letter.';


--
-- Name: inventario_movimientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventario_movimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    variante_id uuid NOT NULL,
    tipo text NOT NULL,
    cantidad integer NOT NULL,
    costo_unitario numeric,
    costo_saldo numeric,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    pedido_id uuid,
    nota text,
    creado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventario_movimientos_cantidad_check CHECK ((cantidad <> 0)),
    CONSTRAINT inventario_movimientos_tipo_check CHECK ((tipo = ANY (ARRAY['saldo_inicial'::text, 'entrada'::text, 'salida'::text, 'ajuste'::text, 'venta'::text, 'devolucion'::text])))
);


--
-- Name: logs_acceso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs_acceso (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    evento text NOT NULL,
    modulo text,
    ip text,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: model_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_costs (
    id bigint NOT NULL,
    modelo text NOT NULL,
    display_name text NOT NULL,
    resolucion text,
    costo_usd numeric(10,4) NOT NULL,
    costo_cop numeric(10,2) NOT NULL,
    multiplicador numeric(4,2) DEFAULT 3.0 NOT NULL,
    tokens_por_uso integer NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE model_costs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.model_costs IS 'Catalogo de modelos KIE.ai con costo, multiplicador X3, y tokens que consume cada uso. Actualizable si KIE cambia precios.';


--
-- Name: model_costs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.model_costs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: model_costs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.model_costs_id_seq OWNED BY public.model_costs.id;


--
-- Name: mp_webhook_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mp_webhook_log (
    id bigint NOT NULL,
    x_request_id text NOT NULL,
    evento_type text,
    evento_action text,
    data_id text,
    user_id uuid,
    payload jsonb NOT NULL,
    signature_valid boolean NOT NULL,
    procesado boolean DEFAULT false NOT NULL,
    procesado_at timestamp with time zone,
    error text,
    email_disparado text,
    recibido_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE mp_webhook_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mp_webhook_log IS 'Log de webhooks MP — UNIQUE(x_request_id) garantiza idempotencia (MP envía 2 webhooks por cobro).';


--
-- Name: mp_webhook_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mp_webhook_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mp_webhook_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mp_webhook_log_id_seq OWNED BY public.mp_webhook_log.id;


--
-- Name: n8n_chat_histories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n8n_chat_histories (
    id bigint NOT NULL,
    session_id text NOT NULL,
    message jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE n8n_chat_histories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.n8n_chat_histories IS 'Memoria persistente del agente AIMMA WhatsApp (langchain memoryPostgresChat). session_id incluye sufijo de version del prompt (ej. <tel>_v3_20260522).';


--
-- Name: n8n_chat_histories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n8n_chat_histories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n8n_chat_histories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n8n_chat_histories_id_seq OWNED BY public.n8n_chat_histories.id;


--
-- Name: notif_webhook_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notif_webhook_config (
    id integer DEFAULT 1 NOT NULL,
    secret text NOT NULL,
    CONSTRAINT notif_webhook_config_id_check CHECK ((id = 1))
);


--
-- Name: paginas_ia_generadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paginas_ia_generadas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    tipo text NOT NULL,
    prompt_inicial jsonb NOT NULL,
    html_generado text,
    css_generado text,
    meta_tags jsonb,
    tokens_consumidos integer DEFAULT 0 NOT NULL,
    modelo text NOT NULL,
    estado text DEFAULT 'generando'::text NOT NULL,
    publicada boolean DEFAULT false NOT NULL,
    error text,
    generada_at timestamp with time zone DEFAULT now() NOT NULL,
    finalizada_at timestamp with time zone,
    CONSTRAINT paginas_ia_generadas_estado_check CHECK ((estado = ANY (ARRAY['generando'::text, 'lista'::text, 'fallo'::text]))),
    CONSTRAINT paginas_ia_generadas_tipo_check CHECK ((tipo = ANY (ARRAY['mini_landing'::text, 'web_secciones'::text, 'web_pro'::text]))),
    CONSTRAINT paginas_ia_generadas_tokens_consumidos_check CHECK ((tokens_consumidos >= 0))
);


--
-- Name: paginas_legales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paginas_legales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    contenido_html text NOT NULL,
    ultima_actualiz timestamp with time zone DEFAULT now() NOT NULL,
    secciones jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT paginas_legales_tipo_check CHECK ((tipo = ANY (ARRAY['garantias'::text, 'tratamiento_datos'::text, 'contacto'::text])))
);


--
-- Name: COLUMN paginas_legales.secciones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.paginas_legales.secciones IS 'Array de secciones de la pagina. Cada elemento: { slug, titulo, contenido, auto? }. El contenido_html se autogenera al guardar combinando las secciones.';


--
-- Name: paletas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paletas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plantilla_id uuid NOT NULL,
    slug text NOT NULL,
    nombre text NOT NULL,
    color_primary text NOT NULL,
    color_accent text NOT NULL,
    color_text_base text NOT NULL,
    color_bg_base text NOT NULL,
    preview_url text,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pedido_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    producto_id uuid,
    variante_id uuid,
    referencia text NOT NULL,
    nombre text NOT NULL,
    color text,
    talla text,
    cantidad integer NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    CONSTRAINT pedido_items_cantidad_check CHECK ((cantidad > 0)),
    CONSTRAINT pedido_items_precio_unitario_check CHECK ((precio_unitario > (0)::numeric)),
    CONSTRAINT pedido_items_subtotal_check CHECK ((subtotal > (0)::numeric))
);


--
-- Name: pedido_notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_notificaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    tienda_id uuid NOT NULL,
    tipo text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    proveedor_id text,
    error text,
    enviado_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pedido_notificaciones_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'fallido'::text]))),
    CONSTRAINT pedido_notificaciones_tipo_check CHECK ((tipo = ANY (ARRAY['confirmacion'::text, 'rastreo'::text])))
);


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    codigo_publico text NOT NULL,
    comprador_nombre text NOT NULL,
    comprador_telefono text NOT NULL,
    comprador_email text,
    comprador_direccion text NOT NULL,
    comprador_ciudad text NOT NULL,
    comprador_observ text,
    subtotal_productos numeric(12,2) NOT NULL,
    costo_envio numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) NOT NULL,
    metodo_envio text,
    estado text DEFAULT 'pendiente_confirmacion'::text NOT NULL,
    pendiente_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmado_at timestamp with time zone,
    cancelado_at timestamp with time zone,
    cancelado_razon text,
    tienda_cliente_id uuid,
    notif_email_enviado_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    numero_guia text,
    transportadora text,
    cerrado_at timestamp with time zone,
    devuelto_at timestamp with time zone,
    devuelto_razon text,
    idempotency_key text,
    CONSTRAINT pedidos_costo_envio_check CHECK ((costo_envio >= (0)::numeric)),
    CONSTRAINT pedidos_estado_check CHECK ((estado = ANY (ARRAY['pendiente_confirmacion'::text, 'confirmado'::text, 'cerrado'::text, 'cancelado'::text, 'devuelto'::text]))),
    CONSTRAINT pedidos_metodo_envio_check CHECK ((metodo_envio = ANY (ARRAY['a_coordinar'::text, 'tarifa_fija'::text, 'por_ciudad'::text]))),
    CONSTRAINT pedidos_subtotal_productos_check CHECK ((subtotal_productos >= (0)::numeric)),
    CONSTRAINT pedidos_timestamps_check CHECK ((((estado = 'pendiente_confirmacion'::text) AND (cerrado_at IS NULL) AND (cancelado_at IS NULL) AND (devuelto_at IS NULL)) OR ((estado = 'confirmado'::text) AND (confirmado_at IS NOT NULL) AND (cancelado_at IS NULL) AND (devuelto_at IS NULL)) OR ((estado = 'cerrado'::text) AND (cerrado_at IS NOT NULL) AND (devuelto_at IS NULL)) OR ((estado = 'cancelado'::text) AND (cancelado_at IS NOT NULL)) OR ((estado = 'devuelto'::text) AND (cerrado_at IS NOT NULL) AND (devuelto_at IS NOT NULL)))),
    CONSTRAINT pedidos_total_check CHECK ((total >= (0)::numeric))
);


--
-- Name: planes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planes (
    codigo text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    precio_mensual numeric DEFAULT 0,
    modulos_acceso text[] DEFAULT ARRAY['dashboard_aimma'::text, 'comercial_ia'::text, 'marketing_ia'::text],
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tokens_mensuales integer DEFAULT 0 NOT NULL
);


--
-- Name: COLUMN planes.tokens_mensuales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.planes.tokens_mensuales IS 'Tokens que se acreditan cada mes al renovar suscripcion PRO. 10 para Mensual y Anual por defecto.';


--
-- Name: plantillas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantillas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    preview_url text,
    activa boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: preview_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preview_tokens (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL
);


--
-- Name: producto_variantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.producto_variantes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    producto_id uuid NOT NULL,
    color text,
    talla text,
    sku text NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    reservado integer DEFAULT 0 NOT NULL,
    foto_color_url text,
    precio_override numeric(12,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT producto_variantes_check CHECK ((reservado <= stock)),
    CONSTRAINT producto_variantes_precio_override_check CHECK (((precio_override IS NULL) OR (precio_override > (0)::numeric))),
    CONSTRAINT producto_variantes_reservado_check CHECK ((reservado >= 0)),
    CONSTRAINT producto_variantes_stock_check CHECK ((stock >= 0))
);


--
-- Name: productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    categoria_id uuid,
    referencia text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    costo numeric(12,2),
    precio_venta numeric(12,2) NOT NULL,
    precio_promo numeric(12,2),
    precio_mayorista numeric(12,2),
    cantidad_min_mayorista integer,
    foto_principal_url text,
    fotos_galeria jsonb DEFAULT '[]'::jsonb NOT NULL,
    estado text DEFAULT 'activo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variante_tipo_1 text,
    variante_tipo_2 text,
    slug text NOT NULL,
    guia_tallas_url text,
    ficha_editorial jsonb,
    proveedor_id uuid,
    CONSTRAINT productos_costo_check CHECK (((costo IS NULL) OR (costo >= (0)::numeric))),
    CONSTRAINT productos_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'inactivo'::text]))),
    CONSTRAINT productos_precio_mayorista_check CHECK (((precio_mayorista IS NULL) OR (precio_mayorista > (0)::numeric))),
    CONSTRAINT productos_precio_promo_check CHECK (((precio_promo IS NULL) OR (precio_promo > (0)::numeric))),
    CONSTRAINT productos_precio_venta_check CHECK ((precio_venta > (0)::numeric))
);


--
-- Name: COLUMN productos.variante_tipo_1; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.productos.variante_tipo_1 IS 'Etiqueta semantica del atributo principal de variantes (Color, Tamaño, Talla, Textura, Material, o custom). Los VALORES van en producto_variantes.color por compat. NULL si el producto no tiene variantes activadas.';


--
-- Name: COLUMN productos.variante_tipo_2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.productos.variante_tipo_2 IS 'Etiqueta semantica del atributo secundario (subvariante). NULL si no hay. Los VALORES van en producto_variantes.talla.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    nombre_completo text NOT NULL,
    cedula text,
    direccion text,
    telefono text,
    correo text NOT NULL,
    nombre_empresa text,
    pagina_web text,
    plan_actual text DEFAULT 'AIMMA_PRO'::text,
    rol text DEFAULT 'cliente'::text,
    estado text DEFAULT 'activo'::text,
    metodo_registro text DEFAULT 'email'::text,
    perfil_completo boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    email_aimma_verificado boolean DEFAULT false NOT NULL,
    verificacion_token uuid DEFAULT gen_random_uuid() NOT NULL,
    verificacion_enviado_at timestamp with time zone,
    welcome_enviado_at timestamp with time zone,
    trial_started_at timestamp with time zone,
    trial_ends_at timestamp with time zone,
    trial_consumed boolean DEFAULT false NOT NULL,
    cuenta_cancelada_at timestamp with time zone,
    cuenta_cancelacion_razon text,
    cuenta_cancelacion_categoria text,
    token_balance integer DEFAULT 0 NOT NULL,
    CONSTRAINT profiles_cancelacion_categoria_check CHECK (((cuenta_cancelacion_categoria IS NULL) OR (cuenta_cancelacion_categoria = ANY (ARRAY['precio'::text, 'no_uso'::text, 'tecnico'::text, 'cambio_solucion'::text, 'otro'::text])))),
    CONSTRAINT profiles_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'suspendido'::text, 'eliminado'::text]))),
    CONSTRAINT profiles_metodo_registro_check CHECK ((metodo_registro = ANY (ARRAY['email'::text, 'google'::text]))),
    CONSTRAINT profiles_rol_check CHECK ((rol = ANY (ARRAY['admin'::text, 'cofounder'::text, 'cliente'::text, 'staff'::text])))
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS 'Usuarios registrados en aimma.com.co/iapanel';


--
-- Name: COLUMN profiles.trial_started_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.trial_started_at IS 'Inicio del trial 7 dias gratis (set por trigger AFTER INSERT). NULL para usuarios previos a la feature.';


--
-- Name: COLUMN profiles.trial_ends_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.trial_ends_at IS 'Fin del trial = trial_started_at + interval 7 days.';


--
-- Name: COLUMN profiles.trial_consumed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.trial_consumed IS 'true cuando: (a) el trial vencio sin pago, (b) el usuario canceló su suscripcion PRO posterior. Una vez true, NUNCA se reasigna trial al usuario aunque vuelva.';


--
-- Name: COLUMN profiles.cuenta_cancelada_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.cuenta_cancelada_at IS 'Soft-delete de cuenta. NULL=activa. NOT NULL=el usuario se dio de baja en esta fecha. Se preserva para remarketing.';


--
-- Name: COLUMN profiles.cuenta_cancelacion_razon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.cuenta_cancelacion_razon IS 'Texto libre opcional ingresado por el usuario al darse de baja.';


--
-- Name: COLUMN profiles.cuenta_cancelacion_categoria; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.cuenta_cancelacion_categoria IS 'Categoria enum: precio | no_uso | tecnico | cambio_solucion | otro.';


--
-- Name: COLUMN profiles.token_balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.token_balance IS 'Saldo de tokens del modulo Contenido IA. 1 token = 250 COP. Solo modificable via funciones atomicas reservar/reembolsar/acreditar.';


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    nombre text NOT NULL,
    telefono text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_buckets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_buckets (
    provider text NOT NULL,
    tokens numeric NOT NULL,
    capacity integer NOT NULL,
    refill_per_second numeric NOT NULL,
    last_refill_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE rate_buckets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rate_buckets IS 'Token bucket por proveedor externo (KIE.ai, fal.ai, etc). Previene 429 en bursts respetando rate limit oficial.';


--
-- Name: resenas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resenas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    calificacion smallint NOT NULL,
    nombre_cliente text NOT NULL,
    comentario text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT resenas_calificacion_check CHECK (((calificacion >= 1) AND (calificacion <= 5))),
    CONSTRAINT resenas_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text])))
);


--
-- Name: reservas_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    variante_id uuid NOT NULL,
    cantidad integer NOT NULL,
    reservado_at timestamp with time zone DEFAULT now() NOT NULL,
    expira_at timestamp with time zone NOT NULL,
    CONSTRAINT reservas_stock_cantidad_check CHECK ((cantidad > 0))
);


--
-- Name: suscripciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suscripciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_codigo text NOT NULL,
    estado text DEFAULT 'activa'::text,
    fecha_inicio timestamp with time zone DEFAULT now(),
    fecha_fin timestamp with time zone,
    monto numeric DEFAULT 0,
    metodo_pago text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    plan_tipo text,
    mp_preapproval_id text,
    mp_init_point text,
    mp_payment_id text,
    mp_status text,
    proxima_facturacion timestamp with time zone,
    cortesia boolean DEFAULT false NOT NULL,
    cortesia_razon text,
    activada_en timestamp with time zone,
    cancelada_en timestamp with time zone,
    garantia_30_dias_hasta timestamp with time zone,
    welcome_pro_enviado_at timestamp with time zone,
    cancelacion_email_enviado_at timestamp with time zone,
    CONSTRAINT suscripciones_estado_check CHECK ((estado = ANY (ARRAY['sin_plan'::text, 'pendiente_pago'::text, 'activa'::text, 'pausada'::text, 'cancelada'::text, 'finalizada'::text, 'vencida'::text])))
);


--
-- Name: COLUMN suscripciones.cancelacion_email_enviado_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.suscripciones.cancelacion_email_enviado_at IS 'Dedup: email de cancelacion enviado. Setea send-pro-email cuando manda tipo=cancelacion. Si cancelar-suscripcion y mp-webhook ambos disparan, solo el primero envia.';


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    clave text NOT NULL,
    valor text NOT NULL,
    descripcion text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE system_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_config IS 'Parametros runtime del modulo Contenido IA. Modificable solo por admin/service_role.';


--
-- Name: tienda_clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tienda_clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    email text NOT NULL,
    nombre text,
    telefono text,
    direcciones jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_login_at timestamp with time zone
);


--
-- Name: tienda_clientes_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tienda_clientes_otp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id uuid NOT NULL,
    email text NOT NULL,
    codigo_hash text NOT NULL,
    expira_at timestamp with time zone NOT NULL,
    usado boolean DEFAULT false NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tienda_clientes_otp_intentos_check CHECK (((intentos >= 0) AND (intentos <= 10)))
);


--
-- Name: tienda_paginas_legales_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tienda_paginas_legales_templates (
    tipo text NOT NULL,
    titulo text NOT NULL,
    contenido_html text NOT NULL,
    actualizado_at timestamp with time zone DEFAULT now() NOT NULL,
    revisado_por_jorge boolean DEFAULT false NOT NULL,
    secciones_template jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT tienda_paginas_legales_templates_tipo_check CHECK ((tipo = ANY (ARRAY['garantias'::text, 'tratamiento_datos'::text, 'contacto'::text])))
);


--
-- Name: COLUMN tienda_paginas_legales_templates.secciones_template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tienda_paginas_legales_templates.secciones_template IS 'Plantilla base de secciones. El cliente puede editar los textos. auto:true = autogenerada desde tienda (datos de contacto).';


--
-- Name: tienda_slugs_reservados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tienda_slugs_reservados (
    slug text NOT NULL
);


--
-- Name: tiendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tiendas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    slug text NOT NULL,
    nombre_negocio text NOT NULL,
    logo_url text,
    plantilla_id uuid,
    paleta_id uuid,
    estado text DEFAULT 'borrador'::text NOT NULL,
    idioma text DEFAULT 'es'::text NOT NULL,
    whatsapp_dueno text NOT NULL,
    mostrar_agotados text DEFAULT 'ocultar'::text NOT NULL,
    nombre_legal text,
    nit text,
    direccion text,
    ciudad_negocio text,
    email_contacto text,
    telefono_contacto text,
    sync_dashboard_excel_activo boolean DEFAULT false NOT NULL,
    cortesia_razon text,
    plan_tienda text DEFAULT 'pro'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    personalizaciones jsonb DEFAULT '{}'::jsonb NOT NULL,
    horario_atencion text,
    easypanel_domain_id text,
    subdominio_publicado_at timestamp with time zone,
    editor_first_choice_at timestamp with time zone,
    editor_tour_visto_at timestamp with time zone,
    notif_email text,
    mostrar_buscador_header boolean DEFAULT true NOT NULL,
    mostrar_resenas_productos boolean DEFAULT true NOT NULL,
    CONSTRAINT tiendas_estado_check CHECK ((estado = ANY (ARRAY['publicada'::text, 'pausada'::text, 'borrador'::text]))),
    CONSTRAINT tiendas_idioma_check CHECK ((idioma = ANY (ARRAY['es'::text, 'en'::text]))),
    CONSTRAINT tiendas_mostrar_agotados_check CHECK ((mostrar_agotados = ANY (ARRAY['ocultar'::text, 'mostrar_con_consultar'::text]))),
    CONSTRAINT tiendas_plan_tienda_check CHECK ((plan_tienda = ANY (ARRAY['pro'::text, 'pro_max'::text]))),
    CONSTRAINT tiendas_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$'::text))
);


--
-- Name: COLUMN tiendas.personalizaciones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tiendas.personalizaciones IS 'Textos editables desde vista previa (Fase 3.4c). Keys: hero_title, hero_subtitle, cta_text, cta_url, footer_text. Si una key no existe, el render usa el default segun plantilla.';


--
-- Name: COLUMN tiendas.horario_atencion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tiendas.horario_atencion IS 'Horario de atencion al publico. Texto libre multilinea (max 300 chars). Aparece en pagina legal de Contacto y en footer del storefront.';


--
-- Name: COLUMN tiendas.easypanel_domain_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tiendas.easypanel_domain_id IS 'ID del dominio creado en Easypanel via tRPC domains.createDomain. NULL = subdominio no provisionado todavia.';


--
-- Name: COLUMN tiendas.subdominio_publicado_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tiendas.subdominio_publicado_at IS 'Timestamp del momento en que el subdominio <slug>.tienda.aimma.com.co fue creado en Easypanel. Sirve como idempotency marker para la EF tienda-publicar-subdominio.';


--
-- Name: COLUMN tiendas.editor_first_choice_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tiendas.editor_first_choice_at IS 'Plan 3: timestamp en que el dueno respondio el modal Starter/Desde Cero';


--
-- Name: COLUMN tiendas.editor_tour_visto_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tiendas.editor_tour_visto_at IS 'Plan 3: timestamp en que el dueno cerro el tour overlay';


--
-- Name: COLUMN tiendas.notif_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tiendas.notif_email IS 'Plan 3: email opcional para notificaciones de form submissions';


--
-- Name: token_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_ledger (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    delta integer NOT NULL,
    tipo text NOT NULL,
    referencia text,
    saldo_resultante integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT token_ledger_tipo_check CHECK ((tipo = ANY (ARRAY['asignacion_mensual'::text, 'compra'::text, 'consumo'::text, 'reembolso'::text, 'regalo'::text])))
);


--
-- Name: TABLE token_ledger; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.token_ledger IS 'Audit log de cada movimiento de tokens. Inmutable (no UPDATE/DELETE desde frontend).';


--
-- Name: token_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.token_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: token_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.token_ledger_id_seq OWNED BY public.token_ledger.id;


--
-- Name: token_pack_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_pack_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pack_codigo text NOT NULL,
    precio_cop integer NOT NULL,
    cantidad_tokens integer NOT NULL,
    estado text DEFAULT 'pendiente_pago'::text NOT NULL,
    mp_preference_id text,
    mp_payment_id text,
    mp_init_point text,
    external_reference text,
    pagado_en timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT token_pack_orders_estado_check CHECK ((estado = ANY (ARRAY['pendiente_pago'::text, 'pagado'::text, 'fallido'::text, 'cancelado'::text])))
);


--
-- Name: token_packs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_packs (
    id bigint NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    precio_cop integer NOT NULL,
    cantidad_tokens integer NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE token_packs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.token_packs IS 'Paquetes de recarga de tokens (tarifa plana 250 COP/token). Vendidos via Mercado Pago.';


--
-- Name: token_packs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.token_packs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: token_packs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.token_packs_id_seq OWNED BY public.token_packs.id;


--
-- Name: wa_clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wa_clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telefono text NOT NULL,
    nombre text,
    nombre_whatsapp text,
    cedula text,
    correo text,
    empresa text,
    sitio_web text,
    instagram text,
    tipo text DEFAULT 'lead'::text NOT NULL,
    profile_id uuid,
    es_cliente_pro boolean DEFAULT false NOT NULL,
    notas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_clientes_tipo_check CHECK ((tipo = ANY (ARRAY['lead'::text, 'cliente_activo'::text, 'prospecto'::text, 'inactivo'::text])))
);


--
-- Name: wa_consultorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wa_consultorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    conversacion_id uuid,
    tipo_solicitud text NOT NULL,
    descripcion text NOT NULL,
    presupuesto_aprox text,
    prioridad text DEFAULT 'media'::text NOT NULL,
    estado text DEFAULT 'nuevo'::text NOT NULL,
    notificado_ceo boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    folio text,
    CONSTRAINT wa_consultorias_estado_check CHECK ((estado = ANY (ARRAY['nuevo'::text, 'contactado'::text, 'negociando'::text, 'ganado'::text, 'perdido'::text]))),
    CONSTRAINT wa_consultorias_prioridad_check CHECK ((prioridad = ANY (ARRAY['alta'::text, 'media'::text, 'baja'::text]))),
    CONSTRAINT wa_consultorias_tipo_solicitud_check CHECK ((tipo_solicitud = ANY (ARRAY['consultoria'::text, 'desarrollo'::text, 'panel_ia'::text, 'scraping'::text, 'marketing'::text, 'otro'::text])))
);


--
-- Name: wa_consultorias_folio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wa_consultorias_folio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wa_conversaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wa_conversaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    telefono text NOT NULL,
    estado text DEFAULT 'activa'::text NOT NULL,
    canal text DEFAULT 'whatsapp'::text NOT NULL,
    iniciada_en timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_mensaje_en timestamp with time zone DEFAULT now() NOT NULL,
    cerrada_en timestamp with time zone,
    CONSTRAINT wa_conversaciones_estado_check CHECK ((estado = ANY (ARRAY['activa'::text, 'escalada'::text, 'cerrada'::text])))
);


--
-- Name: wa_escalamientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wa_escalamientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    conversacion_id uuid,
    reclamo_id uuid,
    consultoria_id uuid,
    motivo text NOT NULL,
    contexto text,
    urgencia text DEFAULT 'media'::text NOT NULL,
    enviado_whatsapp boolean DEFAULT false NOT NULL,
    enviado_email boolean DEFAULT false NOT NULL,
    registrado_sheet boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_escalamientos_urgencia_check CHECK ((urgencia = ANY (ARRAY['alta'::text, 'media'::text, 'baja'::text])))
);


--
-- Name: wa_mensajes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wa_mensajes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversacion_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    direccion text NOT NULL,
    tipo text NOT NULL,
    contenido text,
    audio_url text,
    whatsapp_message_id text,
    tokens_usados integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_mensajes_direccion_check CHECK ((direccion = ANY (ARRAY['entrante'::text, 'saliente'::text]))),
    CONSTRAINT wa_mensajes_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text, 'audio'::text, 'imagen'::text, 'documento'::text, 'template'::text, 'sistema'::text])))
);


--
-- Name: wa_reclamos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wa_reclamos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    conversacion_id uuid,
    categoria text DEFAULT 'otro'::text NOT NULL,
    descripcion text NOT NULL,
    detalle_problema text,
    estado text DEFAULT 'abierto'::text NOT NULL,
    escalado_ceo boolean DEFAULT false NOT NULL,
    resuelto_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    folio text,
    CONSTRAINT wa_reclamos_categoria_check CHECK ((categoria = ANY (ARRAY['carga_excel'::text, 'carga_pdf'::text, 'formato_pos'::text, 'informe_no_genera'::text, 'dato_incorrecto'::text, 'acceso_login'::text, 'pago'::text, 'otro'::text]))),
    CONSTRAINT wa_reclamos_estado_check CHECK ((estado = ANY (ARRAY['abierto'::text, 'en_proceso'::text, 'resuelto'::text, 'escalado_ceo'::text])))
);


--
-- Name: wa_reclamos_folio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wa_reclamos_folio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_cuenta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_cuenta ALTER COLUMN id SET DEFAULT nextval('public.audit_log_cuenta_id_seq'::regclass);


--
-- Name: email_rate_limit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_rate_limit ALTER COLUMN id SET DEFAULT nextval('public.email_rate_limit_id_seq'::regclass);


--
-- Name: model_costs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_costs ALTER COLUMN id SET DEFAULT nextval('public.model_costs_id_seq'::regclass);


--
-- Name: mp_webhook_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mp_webhook_log ALTER COLUMN id SET DEFAULT nextval('public.mp_webhook_log_id_seq'::regclass);


--
-- Name: n8n_chat_histories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories ALTER COLUMN id SET DEFAULT nextval('public.n8n_chat_histories_id_seq'::regclass);


--
-- Name: token_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_ledger ALTER COLUMN id SET DEFAULT nextval('public.token_ledger_id_seq'::regclass);


--
-- Name: token_packs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_packs ALTER COLUMN id SET DEFAULT nextval('public.token_packs_id_seq'::regclass);


--
-- Name: audit_log_cuenta audit_log_cuenta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_cuenta
    ADD CONSTRAINT audit_log_cuenta_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_tienda_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_tienda_id_slug_key UNIQUE (tienda_id, slug);


--
-- Name: diagnostico_gratuito diagnostico_gratuito_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostico_gratuito
    ADD CONSTRAINT diagnostico_gratuito_pkey PRIMARY KEY (id);


--
-- Name: editor_v2_backup editor_v2_backup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editor_v2_backup
    ADD CONSTRAINT editor_v2_backup_pkey PRIMARY KEY (id);


--
-- Name: email_rate_limit email_rate_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_rate_limit
    ADD CONSTRAINT email_rate_limit_pkey PRIMARY KEY (id);


--
-- Name: envios_config envios_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios_config
    ADD CONSTRAINT envios_config_pkey PRIMARY KEY (tienda_id);


--
-- Name: envios_tarifas_ciudad envios_tarifas_ciudad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios_tarifas_ciudad
    ADD CONSTRAINT envios_tarifas_ciudad_pkey PRIMARY KEY (id);


--
-- Name: envios_tarifas_ciudad envios_tarifas_ciudad_tienda_id_ciudad_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios_tarifas_ciudad
    ADD CONSTRAINT envios_tarifas_ciudad_tienda_id_ciudad_key UNIQUE (tienda_id, ciudad);


--
-- Name: form_submission_notifications form_submission_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submission_notifications
    ADD CONSTRAINT form_submission_notifications_pkey PRIMARY KEY (id);


--
-- Name: form_submissions form_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);


--
-- Name: form_submit_rate_limit form_submit_rate_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submit_rate_limit
    ADD CONSTRAINT form_submit_rate_limit_pkey PRIMARY KEY (rate_key);


--
-- Name: image_jobs image_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_jobs
    ADD CONSTRAINT image_jobs_pkey PRIMARY KEY (id);


--
-- Name: inventario_movimientos inventario_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_pkey PRIMARY KEY (id);


--
-- Name: logs_acceso logs_acceso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_acceso
    ADD CONSTRAINT logs_acceso_pkey PRIMARY KEY (id);


--
-- Name: model_costs model_costs_modelo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_costs
    ADD CONSTRAINT model_costs_modelo_key UNIQUE (modelo);


--
-- Name: model_costs model_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_costs
    ADD CONSTRAINT model_costs_pkey PRIMARY KEY (id);


--
-- Name: mp_webhook_log mp_webhook_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mp_webhook_log
    ADD CONSTRAINT mp_webhook_log_pkey PRIMARY KEY (id);


--
-- Name: mp_webhook_log mp_webhook_log_x_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mp_webhook_log
    ADD CONSTRAINT mp_webhook_log_x_request_id_key UNIQUE (x_request_id);


--
-- Name: n8n_chat_histories n8n_chat_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories
    ADD CONSTRAINT n8n_chat_histories_pkey PRIMARY KEY (id);


--
-- Name: notif_webhook_config notif_webhook_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notif_webhook_config
    ADD CONSTRAINT notif_webhook_config_pkey PRIMARY KEY (id);


--
-- Name: paginas_ia_generadas paginas_ia_generadas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paginas_ia_generadas
    ADD CONSTRAINT paginas_ia_generadas_pkey PRIMARY KEY (id);


--
-- Name: paginas_legales paginas_legales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paginas_legales
    ADD CONSTRAINT paginas_legales_pkey PRIMARY KEY (id);


--
-- Name: paginas_legales paginas_legales_tienda_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paginas_legales
    ADD CONSTRAINT paginas_legales_tienda_id_tipo_key UNIQUE (tienda_id, tipo);


--
-- Name: paletas paletas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paletas
    ADD CONSTRAINT paletas_pkey PRIMARY KEY (id);


--
-- Name: paletas paletas_plantilla_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paletas
    ADD CONSTRAINT paletas_plantilla_id_slug_key UNIQUE (plantilla_id, slug);


--
-- Name: pedido_items pedido_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT pedido_items_pkey PRIMARY KEY (id);


--
-- Name: pedido_notificaciones pedido_notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_notificaciones
    ADD CONSTRAINT pedido_notificaciones_pkey PRIMARY KEY (id);


--
-- Name: pedidos pedidos_codigo_publico_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_codigo_publico_key UNIQUE (codigo_publico);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);


--
-- Name: planes planes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes
    ADD CONSTRAINT planes_pkey PRIMARY KEY (codigo);


--
-- Name: plantillas plantillas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas
    ADD CONSTRAINT plantillas_pkey PRIMARY KEY (id);


--
-- Name: plantillas plantillas_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas
    ADD CONSTRAINT plantillas_slug_key UNIQUE (slug);


--
-- Name: preview_tokens preview_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preview_tokens
    ADD CONSTRAINT preview_tokens_pkey PRIMARY KEY (token);


--
-- Name: producto_variantes producto_variantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT producto_variantes_pkey PRIMARY KEY (id);


--
-- Name: producto_variantes producto_variantes_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT producto_variantes_sku_key UNIQUE (sku);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- Name: productos productos_tienda_id_referencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_tienda_id_referencia_key UNIQUE (tienda_id, referencia);


--
-- Name: profiles profiles_cedula_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_cedula_key UNIQUE (cedula);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: rate_buckets rate_buckets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_buckets
    ADD CONSTRAINT rate_buckets_pkey PRIMARY KEY (provider);


--
-- Name: resenas resenas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resenas
    ADD CONSTRAINT resenas_pkey PRIMARY KEY (id);


--
-- Name: reservas_stock reservas_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_stock
    ADD CONSTRAINT reservas_stock_pkey PRIMARY KEY (id);


--
-- Name: suscripciones suscripciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripciones
    ADD CONSTRAINT suscripciones_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (clave);


--
-- Name: tienda_clientes_otp tienda_clientes_otp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tienda_clientes_otp
    ADD CONSTRAINT tienda_clientes_otp_pkey PRIMARY KEY (id);


--
-- Name: tienda_clientes tienda_clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tienda_clientes
    ADD CONSTRAINT tienda_clientes_pkey PRIMARY KEY (id);


--
-- Name: tienda_clientes tienda_clientes_tienda_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tienda_clientes
    ADD CONSTRAINT tienda_clientes_tienda_id_email_key UNIQUE (tienda_id, email);


--
-- Name: tienda_paginas_legales_templates tienda_paginas_legales_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tienda_paginas_legales_templates
    ADD CONSTRAINT tienda_paginas_legales_templates_pkey PRIMARY KEY (tipo);


--
-- Name: tienda_slugs_reservados tienda_slugs_reservados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tienda_slugs_reservados
    ADD CONSTRAINT tienda_slugs_reservados_pkey PRIMARY KEY (slug);


--
-- Name: tiendas tiendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiendas
    ADD CONSTRAINT tiendas_pkey PRIMARY KEY (id);


--
-- Name: tiendas tiendas_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiendas
    ADD CONSTRAINT tiendas_slug_key UNIQUE (slug);


--
-- Name: tiendas tiendas_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiendas
    ADD CONSTRAINT tiendas_user_id_key UNIQUE (user_id);


--
-- Name: token_ledger token_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_ledger
    ADD CONSTRAINT token_ledger_pkey PRIMARY KEY (id);


--
-- Name: token_pack_orders token_pack_orders_external_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_pack_orders
    ADD CONSTRAINT token_pack_orders_external_reference_key UNIQUE (external_reference);


--
-- Name: token_pack_orders token_pack_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_pack_orders
    ADD CONSTRAINT token_pack_orders_pkey PRIMARY KEY (id);


--
-- Name: token_packs token_packs_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_packs
    ADD CONSTRAINT token_packs_codigo_key UNIQUE (codigo);


--
-- Name: token_packs token_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_packs
    ADD CONSTRAINT token_packs_pkey PRIMARY KEY (id);


--
-- Name: wa_clientes wa_clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_clientes
    ADD CONSTRAINT wa_clientes_pkey PRIMARY KEY (id);


--
-- Name: wa_clientes wa_clientes_telefono_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_clientes
    ADD CONSTRAINT wa_clientes_telefono_key UNIQUE (telefono);


--
-- Name: wa_consultorias wa_consultorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_consultorias
    ADD CONSTRAINT wa_consultorias_pkey PRIMARY KEY (id);


--
-- Name: wa_conversaciones wa_conversaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_conversaciones
    ADD CONSTRAINT wa_conversaciones_pkey PRIMARY KEY (id);


--
-- Name: wa_escalamientos wa_escalamientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_escalamientos
    ADD CONSTRAINT wa_escalamientos_pkey PRIMARY KEY (id);


--
-- Name: wa_mensajes wa_mensajes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_mensajes
    ADD CONSTRAINT wa_mensajes_pkey PRIMARY KEY (id);


--
-- Name: wa_mensajes wa_mensajes_whatsapp_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_mensajes
    ADD CONSTRAINT wa_mensajes_whatsapp_message_id_key UNIQUE (whatsapp_message_id);


--
-- Name: wa_reclamos wa_reclamos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_reclamos
    ADD CONSTRAINT wa_reclamos_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_log_cuenta_user_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_cuenta_user_evento ON public.audit_log_cuenta USING btree (user_id, evento, created_at DESC);


--
-- Name: idx_categorias_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categorias_parent ON public.categorias USING btree (parent_id);


--
-- Name: idx_categorias_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categorias_tienda ON public.categorias USING btree (tienda_id);


--
-- Name: idx_diag_correo_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diag_correo_created ON public.diagnostico_gratuito USING btree (correo, created_at DESC);


--
-- Name: idx_diagnostico_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostico_created_at ON public.diagnostico_gratuito USING btree (created_at DESC);


--
-- Name: idx_diagnostico_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostico_estado ON public.diagnostico_gratuito USING btree (estado);


--
-- Name: idx_email_rl_correo_evento_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_rl_correo_evento_ts ON public.email_rate_limit USING btree (correo, evento, created_at DESC);


--
-- Name: idx_envios_tarifas_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_tarifas_tienda ON public.envios_tarifas_ciudad USING btree (tienda_id);


--
-- Name: idx_form_submissions_tienda_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_tienda_created ON public.form_submissions USING btree (tienda_id, created_at DESC);


--
-- Name: idx_form_submissions_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_unread ON public.form_submissions USING btree (tienda_id) WHERE (leido_at IS NULL);


--
-- Name: idx_form_submit_rate_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submit_rate_window ON public.form_submit_rate_limit USING btree (window_start);


--
-- Name: idx_image_jobs_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_jobs_estado ON public.image_jobs USING btree (estado, encolado_at) WHERE (estado = ANY (ARRAY['queued'::text, 'processing'::text]));


--
-- Name: idx_image_jobs_kie; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_jobs_kie ON public.image_jobs USING btree (kie_task_id) WHERE (kie_task_id IS NOT NULL);


--
-- Name: idx_image_jobs_source_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_jobs_source_user ON public.image_jobs USING btree (user_id, source);


--
-- Name: idx_image_jobs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_jobs_user ON public.image_jobs USING btree (user_id, encolado_at DESC);


--
-- Name: idx_invmov_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invmov_pedido ON public.inventario_movimientos USING btree (pedido_id);


--
-- Name: idx_invmov_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invmov_producto ON public.inventario_movimientos USING btree (producto_id);


--
-- Name: idx_invmov_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invmov_tienda ON public.inventario_movimientos USING btree (tienda_id);


--
-- Name: idx_invmov_variante_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invmov_variante_fecha ON public.inventario_movimientos USING btree (variante_id, fecha);


--
-- Name: idx_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_user ON public.logs_acceso USING btree (user_id, created_at DESC);


--
-- Name: idx_mp_webhook_log_data_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_webhook_log_data_id ON public.mp_webhook_log USING btree (data_id);


--
-- Name: idx_mp_webhook_log_recibido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_webhook_log_recibido ON public.mp_webhook_log USING btree (recibido_at DESC);


--
-- Name: idx_mp_webhook_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_webhook_log_user ON public.mp_webhook_log USING btree (user_id);


--
-- Name: idx_n8n_chat_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_n8n_chat_session ON public.n8n_chat_histories USING btree (session_id);


--
-- Name: idx_n8n_chat_session_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_n8n_chat_session_created ON public.n8n_chat_histories USING btree (session_id, created_at DESC);


--
-- Name: idx_notif_pendientes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_pendientes ON public.form_submission_notifications USING btree (created_at) WHERE (estado = 'pendiente'::text);


--
-- Name: idx_otp_email_tienda_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_email_tienda_activo ON public.tienda_clientes_otp USING btree (email, tienda_id) WHERE (NOT usado);


--
-- Name: idx_otp_expira; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_expira ON public.tienda_clientes_otp USING btree (expira_at);


--
-- Name: idx_paginas_ia_publicada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paginas_ia_publicada ON public.paginas_ia_generadas USING btree (tienda_id) WHERE (publicada = true);


--
-- Name: idx_paginas_ia_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paginas_ia_tienda ON public.paginas_ia_generadas USING btree (tienda_id);


--
-- Name: idx_paginas_legales_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paginas_legales_tienda ON public.paginas_legales USING btree (tienda_id);


--
-- Name: idx_pedido_items_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedido_items_pedido ON public.pedido_items USING btree (pedido_id);


--
-- Name: idx_pedido_items_variante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedido_items_variante ON public.pedido_items USING btree (variante_id);


--
-- Name: idx_pedidos_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_codigo ON public.pedidos USING btree (codigo_publico);


--
-- Name: idx_pedidos_pendientes_viejos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_pendientes_viejos ON public.pedidos USING btree (tienda_id, pendiente_at) WHERE (estado = 'pendiente_confirmacion'::text);


--
-- Name: idx_pedidos_tienda_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_tienda_cliente ON public.pedidos USING btree (tienda_cliente_id);


--
-- Name: idx_pedidos_tienda_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_tienda_estado ON public.pedidos USING btree (tienda_id, estado);


--
-- Name: idx_pedidos_tienda_estado_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_tienda_estado_created ON public.pedidos USING btree (tienda_id, estado, created_at DESC);


--
-- Name: idx_preview_tokens_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preview_tokens_expires ON public.preview_tokens USING btree (expires_at);


--
-- Name: idx_preview_tokens_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preview_tokens_tienda ON public.preview_tokens USING btree (tienda_id);


--
-- Name: idx_productos_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_categoria ON public.productos USING btree (categoria_id);


--
-- Name: idx_productos_proveedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_proveedor ON public.productos USING btree (proveedor_id);


--
-- Name: idx_productos_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_tienda ON public.productos USING btree (tienda_id);


--
-- Name: idx_productos_tienda_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_tienda_estado ON public.productos USING btree (tienda_id, estado);


--
-- Name: idx_profiles_cedula; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_cedula ON public.profiles USING btree (cedula);


--
-- Name: idx_profiles_correo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_correo ON public.profiles USING btree (correo);


--
-- Name: idx_profiles_cuenta_cancelada_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_cuenta_cancelada_at ON public.profiles USING btree (cuenta_cancelada_at DESC) WHERE (cuenta_cancelada_at IS NOT NULL);


--
-- Name: idx_profiles_trial_ends_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_trial_ends_at ON public.profiles USING btree (trial_ends_at) WHERE (trial_consumed = false);


--
-- Name: idx_proveedores_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proveedores_tienda ON public.proveedores USING btree (tienda_id);


--
-- Name: idx_reservas_expira; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_expira ON public.reservas_stock USING btree (expira_at);


--
-- Name: idx_reservas_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_pedido ON public.reservas_stock USING btree (pedido_id);


--
-- Name: idx_reservas_variante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_variante ON public.reservas_stock USING btree (variante_id);


--
-- Name: idx_suscripciones_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suscripciones_user ON public.suscripciones USING btree (user_id, estado);


--
-- Name: idx_tienda_clientes_email_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tienda_clientes_email_tienda ON public.tienda_clientes USING btree (email, tienda_id);


--
-- Name: idx_tiendas_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiendas_estado ON public.tiendas USING btree (estado) WHERE (estado = 'publicada'::text);


--
-- Name: idx_tiendas_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiendas_slug ON public.tiendas USING btree (slug);


--
-- Name: idx_tiendas_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiendas_user_id ON public.tiendas USING btree (user_id);


--
-- Name: idx_token_ledger_referencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_ledger_referencia ON public.token_ledger USING btree (referencia) WHERE (referencia IS NOT NULL);


--
-- Name: idx_token_ledger_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_ledger_user ON public.token_ledger USING btree (user_id, created_at DESC);


--
-- Name: idx_token_pack_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_pack_orders_user ON public.token_pack_orders USING btree (user_id, created_at DESC);


--
-- Name: idx_variantes_disponible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variantes_disponible ON public.producto_variantes USING btree (producto_id) WHERE (stock > reservado);


--
-- Name: idx_variantes_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variantes_producto ON public.producto_variantes USING btree (producto_id);


--
-- Name: idx_variantes_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variantes_sku ON public.producto_variantes USING btree (sku);


--
-- Name: idx_wa_clientes_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_clientes_profile ON public.wa_clientes USING btree (profile_id);


--
-- Name: idx_wa_clientes_telefono; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_clientes_telefono ON public.wa_clientes USING btree (telefono);


--
-- Name: idx_wa_consult_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_consult_cliente ON public.wa_consultorias USING btree (cliente_id);


--
-- Name: idx_wa_consult_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_consult_estado ON public.wa_consultorias USING btree (estado);


--
-- Name: idx_wa_conv_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_conv_cliente ON public.wa_conversaciones USING btree (cliente_id);


--
-- Name: idx_wa_conv_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_conv_estado ON public.wa_conversaciones USING btree (estado);


--
-- Name: idx_wa_conv_telefono; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_conv_telefono ON public.wa_conversaciones USING btree (telefono);


--
-- Name: idx_wa_escal_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_escal_cliente ON public.wa_escalamientos USING btree (cliente_id);


--
-- Name: idx_wa_msg_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_msg_cliente ON public.wa_mensajes USING btree (cliente_id);


--
-- Name: idx_wa_msg_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_msg_conv ON public.wa_mensajes USING btree (conversacion_id);


--
-- Name: idx_wa_msg_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_msg_created ON public.wa_mensajes USING btree (created_at DESC);


--
-- Name: idx_wa_reclamos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_reclamos_cliente ON public.wa_reclamos USING btree (cliente_id);


--
-- Name: idx_wa_reclamos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_reclamos_estado ON public.wa_reclamos USING btree (estado);


--
-- Name: pedido_notif_tienda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedido_notif_tienda_idx ON public.pedido_notificaciones USING btree (tienda_id);


--
-- Name: pedido_notif_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pedido_notif_uniq ON public.pedido_notificaciones USING btree (pedido_id, tipo);


--
-- Name: pedidos_tienda_idem_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pedidos_tienda_idem_uniq ON public.pedidos USING btree (tienda_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: productos_tienda_slug_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX productos_tienda_slug_uniq ON public.productos USING btree (tienda_id, slug);


--
-- Name: profiles_verificacion_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_verificacion_token_idx ON public.profiles USING btree (verificacion_token);


--
-- Name: resenas_moderacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resenas_moderacion_idx ON public.resenas USING btree (tienda_id, estado, created_at DESC);


--
-- Name: resenas_publico_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resenas_publico_idx ON public.resenas USING btree (producto_id) WHERE (estado = 'aprobada'::text);


--
-- Name: suscripciones_mp_preapproval_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suscripciones_mp_preapproval_idx ON public.suscripciones USING btree (mp_preapproval_id);


--
-- Name: diagnostico_gratuito diag_rate_limit_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER diag_rate_limit_trigger BEFORE INSERT ON public.diagnostico_gratuito FOR EACH ROW EXECUTE FUNCTION public.diag_rate_limit();


--
-- Name: profiles profiles_protect_privileged; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_protect_privileged BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: suscripciones suscripciones_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER suscripciones_updated_at BEFORE UPDATE ON public.suscripciones FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: productos trg_auto_slug_producto; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_slug_producto BEFORE INSERT OR UPDATE OF nombre, slug ON public.productos FOR EACH ROW EXECUTE FUNCTION public.auto_slug_producto();


--
-- Name: pedidos trg_codigo_publico_pedido; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_codigo_publico_pedido BEFORE INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.gen_codigo_publico_pedido();


--
-- Name: envios_config trg_envios_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envios_config_updated_at BEFORE UPDATE ON public.envios_config FOR EACH ROW EXECUTE FUNCTION public.tienda_ia_touch_updated_at();


--
-- Name: inventario_movimientos trg_inv_mov_sync_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inv_mov_sync_stock AFTER INSERT ON public.inventario_movimientos FOR EACH ROW EXECUTE FUNCTION public.inv_mov_sync_stock();


--
-- Name: pedidos trg_notif_pedido_cierre; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notif_pedido_cierre AFTER UPDATE ON public.pedidos FOR EACH ROW WHEN (((new.estado = 'cerrado'::text) AND (old.estado IS DISTINCT FROM 'cerrado'::text))) EXECUTE FUNCTION public.notif_pedido_webhook();


--
-- Name: pedidos trg_notif_pedido_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notif_pedido_insert AFTER INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.notif_pedido_webhook();


--
-- Name: pedidos trg_pedido_stock_lifecycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pedido_stock_lifecycle BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.pedido_stock_lifecycle();


--
-- Name: pedidos trg_pedidos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pedidos_updated_at BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.tienda_ia_touch_updated_at();


--
-- Name: productos trg_productos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_productos_updated_at BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.tienda_ia_touch_updated_at();


--
-- Name: tiendas trg_tiendas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tiendas_updated_at BEFORE UPDATE ON public.tiendas FOR EACH ROW EXECUTE FUNCTION public.tienda_ia_touch_updated_at();


--
-- Name: wa_clientes trg_wa_clientes_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wa_clientes_updated BEFORE UPDATE ON public.wa_clientes FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();


--
-- Name: audit_log_cuenta audit_log_cuenta_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_cuenta
    ADD CONSTRAINT audit_log_cuenta_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: categorias categorias_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categorias(id) ON DELETE CASCADE;


--
-- Name: categorias categorias_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: envios_config envios_config_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios_config
    ADD CONSTRAINT envios_config_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: envios_tarifas_ciudad envios_tarifas_ciudad_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios_tarifas_ciudad
    ADD CONSTRAINT envios_tarifas_ciudad_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: pedidos fk_pedidos_tienda_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT fk_pedidos_tienda_cliente FOREIGN KEY (tienda_cliente_id) REFERENCES public.tienda_clientes(id) ON DELETE SET NULL;


--
-- Name: tiendas fk_tiendas_paleta; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiendas
    ADD CONSTRAINT fk_tiendas_paleta FOREIGN KEY (paleta_id) REFERENCES public.paletas(id) ON DELETE SET NULL;


--
-- Name: tiendas fk_tiendas_plantilla; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiendas
    ADD CONSTRAINT fk_tiendas_plantilla FOREIGN KEY (plantilla_id) REFERENCES public.plantillas(id) ON DELETE SET NULL;


--
-- Name: form_submission_notifications form_submission_notifications_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submission_notifications
    ADD CONSTRAINT form_submission_notifications_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.form_submissions(id) ON DELETE CASCADE;


--
-- Name: form_submission_notifications form_submission_notifications_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submission_notifications
    ADD CONSTRAINT form_submission_notifications_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: form_submissions form_submissions_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: image_jobs image_jobs_modelo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_jobs
    ADD CONSTRAINT image_jobs_modelo_fkey FOREIGN KEY (modelo) REFERENCES public.model_costs(modelo);


--
-- Name: image_jobs image_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_jobs
    ADD CONSTRAINT image_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: inventario_movimientos inventario_movimientos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: inventario_movimientos inventario_movimientos_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;


--
-- Name: inventario_movimientos inventario_movimientos_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: inventario_movimientos inventario_movimientos_variante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES public.producto_variantes(id) ON DELETE CASCADE;


--
-- Name: logs_acceso logs_acceso_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_acceso
    ADD CONSTRAINT logs_acceso_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: mp_webhook_log mp_webhook_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mp_webhook_log
    ADD CONSTRAINT mp_webhook_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: paginas_ia_generadas paginas_ia_generadas_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paginas_ia_generadas
    ADD CONSTRAINT paginas_ia_generadas_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: paginas_legales paginas_legales_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paginas_legales
    ADD CONSTRAINT paginas_legales_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: paletas paletas_plantilla_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paletas
    ADD CONSTRAINT paletas_plantilla_id_fkey FOREIGN KEY (plantilla_id) REFERENCES public.plantillas(id) ON DELETE CASCADE;


--
-- Name: pedido_items pedido_items_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT pedido_items_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: pedido_items pedido_items_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT pedido_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE SET NULL;


--
-- Name: pedido_items pedido_items_variante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT pedido_items_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES public.producto_variantes(id) ON DELETE SET NULL;


--
-- Name: pedido_notificaciones pedido_notificaciones_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_notificaciones
    ADD CONSTRAINT pedido_notificaciones_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: pedido_notificaciones pedido_notificaciones_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_notificaciones
    ADD CONSTRAINT pedido_notificaciones_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: pedidos pedidos_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE RESTRICT;


--
-- Name: preview_tokens preview_tokens_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preview_tokens
    ADD CONSTRAINT preview_tokens_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: producto_variantes producto_variantes_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT producto_variantes_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;


--
-- Name: productos productos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL;


--
-- Name: productos productos_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE SET NULL;


--
-- Name: productos productos_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: proveedores proveedores_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: resenas resenas_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resenas
    ADD CONSTRAINT resenas_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;


--
-- Name: resenas resenas_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resenas
    ADD CONSTRAINT resenas_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: reservas_stock reservas_stock_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_stock
    ADD CONSTRAINT reservas_stock_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: reservas_stock reservas_stock_variante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_stock
    ADD CONSTRAINT reservas_stock_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES public.producto_variantes(id) ON DELETE RESTRICT;


--
-- Name: suscripciones suscripciones_plan_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripciones
    ADD CONSTRAINT suscripciones_plan_codigo_fkey FOREIGN KEY (plan_codigo) REFERENCES public.planes(codigo);


--
-- Name: suscripciones suscripciones_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripciones
    ADD CONSTRAINT suscripciones_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tienda_clientes_otp tienda_clientes_otp_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tienda_clientes_otp
    ADD CONSTRAINT tienda_clientes_otp_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: tienda_clientes tienda_clientes_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tienda_clientes
    ADD CONSTRAINT tienda_clientes_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id) ON DELETE CASCADE;


--
-- Name: tiendas tiendas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiendas
    ADD CONSTRAINT tiendas_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: token_ledger token_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_ledger
    ADD CONSTRAINT token_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: token_pack_orders token_pack_orders_pack_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_pack_orders
    ADD CONSTRAINT token_pack_orders_pack_codigo_fkey FOREIGN KEY (pack_codigo) REFERENCES public.token_packs(codigo);


--
-- Name: token_pack_orders token_pack_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_pack_orders
    ADD CONSTRAINT token_pack_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: wa_clientes wa_clientes_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_clientes
    ADD CONSTRAINT wa_clientes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: wa_consultorias wa_consultorias_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_consultorias
    ADD CONSTRAINT wa_consultorias_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.wa_clientes(id) ON DELETE SET NULL;


--
-- Name: wa_consultorias wa_consultorias_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_consultorias
    ADD CONSTRAINT wa_consultorias_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.wa_conversaciones(id) ON DELETE SET NULL;


--
-- Name: wa_conversaciones wa_conversaciones_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_conversaciones
    ADD CONSTRAINT wa_conversaciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.wa_clientes(id) ON DELETE CASCADE;


--
-- Name: wa_escalamientos wa_escalamientos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_escalamientos
    ADD CONSTRAINT wa_escalamientos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.wa_clientes(id) ON DELETE SET NULL;


--
-- Name: wa_escalamientos wa_escalamientos_consultoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_escalamientos
    ADD CONSTRAINT wa_escalamientos_consultoria_id_fkey FOREIGN KEY (consultoria_id) REFERENCES public.wa_consultorias(id) ON DELETE SET NULL;


--
-- Name: wa_escalamientos wa_escalamientos_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_escalamientos
    ADD CONSTRAINT wa_escalamientos_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.wa_conversaciones(id) ON DELETE SET NULL;


--
-- Name: wa_escalamientos wa_escalamientos_reclamo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_escalamientos
    ADD CONSTRAINT wa_escalamientos_reclamo_id_fkey FOREIGN KEY (reclamo_id) REFERENCES public.wa_reclamos(id) ON DELETE SET NULL;


--
-- Name: wa_mensajes wa_mensajes_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_mensajes
    ADD CONSTRAINT wa_mensajes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.wa_clientes(id) ON DELETE CASCADE;


--
-- Name: wa_mensajes wa_mensajes_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_mensajes
    ADD CONSTRAINT wa_mensajes_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.wa_conversaciones(id) ON DELETE CASCADE;


--
-- Name: wa_reclamos wa_reclamos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_reclamos
    ADD CONSTRAINT wa_reclamos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.wa_clientes(id) ON DELETE SET NULL;


--
-- Name: wa_reclamos wa_reclamos_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_reclamos
    ADD CONSTRAINT wa_reclamos_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.wa_conversaciones(id) ON DELETE SET NULL;


--
-- Name: diagnostico_gratuito anon_insert_diagnostico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_insert_diagnostico ON public.diagnostico_gratuito FOR INSERT TO anon WITH CHECK (true);


--
-- Name: audit_log_cuenta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_cuenta ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_cuenta audit_log_cuenta_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_cuenta_admin_select ON public.audit_log_cuenta FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: audit_log_cuenta audit_log_cuenta_service_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_cuenta_service_insert ON public.audit_log_cuenta FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: POLICY audit_log_cuenta_service_insert ON audit_log_cuenta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY audit_log_cuenta_service_insert ON public.audit_log_cuenta IS 'Solo service_role inserta. Las EFs (cancelar-cuenta, reactivar-cuenta, cancelar-trial, cancelar-suscripcion, admin-export-usuarios) usan supabaseAdmin con service_role.';


--
-- Name: categorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias categorias_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categorias_select_dueno ON public.categorias FOR SELECT TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: categorias categorias_select_publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categorias_select_publico ON public.categorias FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.tiendas t
  WHERE ((t.id = categorias.tienda_id) AND (t.estado = 'publicada'::text)))));


--
-- Name: categorias categorias_write_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categorias_write_dueno ON public.categorias TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: email_rate_limit deny_all_anon_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_anon_auth ON public.email_rate_limit TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: mp_webhook_log deny_all_anon_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_anon_auth ON public.mp_webhook_log TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: n8n_chat_histories deny_all_anon_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_anon_auth ON public.n8n_chat_histories TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: wa_clientes deny_all_anon_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_anon_auth ON public.wa_clientes TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: wa_consultorias deny_all_anon_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_anon_auth ON public.wa_consultorias TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: wa_conversaciones deny_all_anon_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_anon_auth ON public.wa_conversaciones TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: wa_escalamientos deny_all_anon_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_anon_auth ON public.wa_escalamientos TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: wa_mensajes deny_all_anon_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_anon_auth ON public.wa_mensajes TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: wa_reclamos deny_all_anon_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_anon_auth ON public.wa_reclamos TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: diagnostico_gratuito diag_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY diag_admin_delete ON public.diagnostico_gratuito FOR DELETE TO authenticated USING (public.is_admin_or_cofounder());


--
-- Name: diagnostico_gratuito diag_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY diag_admin_select ON public.diagnostico_gratuito FOR SELECT TO authenticated USING (public.is_admin_or_cofounder());


--
-- Name: diagnostico_gratuito diag_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY diag_admin_update ON public.diagnostico_gratuito FOR UPDATE TO authenticated USING (public.is_admin_or_cofounder()) WITH CHECK (public.is_admin_or_cofounder());


--
-- Name: diagnostico_gratuito; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.diagnostico_gratuito ENABLE ROW LEVEL SECURITY;

--
-- Name: email_rate_limit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_rate_limit ENABLE ROW LEVEL SECURITY;

--
-- Name: envios_tarifas_ciudad envios_ciudad_select_publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY envios_ciudad_select_publico ON public.envios_tarifas_ciudad FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.tiendas t
  WHERE ((t.id = envios_tarifas_ciudad.tienda_id) AND (t.estado = 'publicada'::text)))));


--
-- Name: envios_tarifas_ciudad envios_ciudad_write_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY envios_ciudad_write_dueno ON public.envios_tarifas_ciudad TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: envios_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.envios_config ENABLE ROW LEVEL SECURITY;

--
-- Name: envios_config envios_config_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY envios_config_select_dueno ON public.envios_config FOR SELECT TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: envios_config envios_config_select_publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY envios_config_select_publico ON public.envios_config FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.tiendas t
  WHERE ((t.id = envios_config.tienda_id) AND (t.estado = 'publicada'::text)))));


--
-- Name: envios_config envios_config_write_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY envios_config_write_dueno ON public.envios_config TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: envios_tarifas_ciudad; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.envios_tarifas_ciudad ENABLE ROW LEVEL SECURITY;

--
-- Name: form_submission_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_submission_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: form_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: image_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.image_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: image_jobs image_jobs_own_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY image_jobs_own_select ON public.image_jobs FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin_or_cofounder()));


--
-- Name: inventario_movimientos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;

--
-- Name: inventario_movimientos invmov_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invmov_select_dueno ON public.inventario_movimientos FOR SELECT TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: inventario_movimientos invmov_write_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invmov_write_dueno ON public.inventario_movimientos TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: pedido_items items_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_select_dueno ON public.pedido_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_items.pedido_id) AND (public.tienda_ia_es_dueno(p.tienda_id) OR public.is_admin_or_cofounder())))));


--
-- Name: tienda_paginas_legales_templates legales_templates_select_todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY legales_templates_select_todos ON public.tienda_paginas_legales_templates FOR SELECT TO authenticated, anon USING (true);


--
-- Name: tienda_paginas_legales_templates legales_templates_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY legales_templates_write_admin ON public.tienda_paginas_legales_templates TO authenticated USING (public.is_admin_or_cofounder()) WITH CHECK (public.is_admin_or_cofounder());


--
-- Name: logs_acceso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logs_acceso ENABLE ROW LEVEL SECURITY;

--
-- Name: logs_acceso logs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logs_admin_all ON public.logs_acceso USING (public.is_admin());


--
-- Name: logs_acceso logs_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logs_insert_authenticated ON public.logs_acceso FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: logs_acceso logs_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logs_select_own ON public.logs_acceso FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: model_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.model_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: model_costs model_costs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY model_costs_read ON public.model_costs FOR SELECT TO authenticated USING ((activo = true));


--
-- Name: mp_webhook_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mp_webhook_log ENABLE ROW LEVEL SECURITY;

--
-- Name: n8n_chat_histories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;

--
-- Name: notif_webhook_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notif_webhook_config ENABLE ROW LEVEL SECURITY;

--
-- Name: form_submission_notifications owner_read_notifs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_notifs ON public.form_submission_notifications FOR SELECT USING ((tienda_id IN ( SELECT tiendas.id
   FROM public.tiendas
  WHERE (tiendas.user_id = auth.uid()))));


--
-- Name: pedido_notificaciones owner_read_pedido_notif; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_pedido_notif ON public.pedido_notificaciones FOR SELECT USING (public.tienda_ia_es_dueno(tienda_id));


--
-- Name: form_submissions owner_select_submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_select_submissions ON public.form_submissions FOR SELECT USING ((tienda_id IN ( SELECT tiendas.id
   FROM public.tiendas
  WHERE (tiendas.user_id = auth.uid()))));


--
-- Name: form_submissions owner_update_submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_update_submissions ON public.form_submissions FOR UPDATE USING ((tienda_id IN ( SELECT tiendas.id
   FROM public.tiendas
  WHERE (tiendas.user_id = auth.uid()))));


--
-- Name: paginas_ia_generadas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paginas_ia_generadas ENABLE ROW LEVEL SECURITY;

--
-- Name: paginas_ia_generadas paginas_ia_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY paginas_ia_select_dueno ON public.paginas_ia_generadas FOR SELECT TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: paginas_ia_generadas paginas_ia_select_publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY paginas_ia_select_publico ON public.paginas_ia_generadas FOR SELECT TO authenticated, anon USING ((publicada AND (EXISTS ( SELECT 1
   FROM public.tiendas t
  WHERE ((t.id = paginas_ia_generadas.tienda_id) AND (t.estado = 'publicada'::text))))));


--
-- Name: paginas_ia_generadas paginas_ia_write_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY paginas_ia_write_dueno ON public.paginas_ia_generadas TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: paginas_legales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paginas_legales ENABLE ROW LEVEL SECURITY;

--
-- Name: paginas_legales paginas_legales_select_publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY paginas_legales_select_publico ON public.paginas_legales FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.tiendas t
  WHERE ((t.id = paginas_legales.tienda_id) AND (t.estado = 'publicada'::text)))));


--
-- Name: paginas_legales paginas_legales_write_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY paginas_legales_write_dueno ON public.paginas_legales TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: paletas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paletas ENABLE ROW LEVEL SECURITY;

--
-- Name: paletas paletas_select_todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY paletas_select_todos ON public.paletas FOR SELECT TO authenticated, anon USING (true);


--
-- Name: paletas paletas_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY paletas_write_admin ON public.paletas TO authenticated USING (public.is_admin_or_cofounder()) WITH CHECK (public.is_admin_or_cofounder());


--
-- Name: pedido_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_notificaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedido_notificaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos pedidos_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pedidos_select_dueno ON public.pedidos FOR SELECT TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: pedidos pedidos_update_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pedidos_update_dueno ON public.pedidos FOR UPDATE TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: planes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY;

--
-- Name: planes planes_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY planes_admin_all ON public.planes USING (public.is_admin());


--
-- Name: planes planes_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY planes_select_active ON public.planes FOR SELECT USING ((activo = true));


--
-- Name: plantillas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plantillas ENABLE ROW LEVEL SECURITY;

--
-- Name: plantillas plantillas_select_todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plantillas_select_todos ON public.plantillas FOR SELECT TO authenticated, anon USING (activa);


--
-- Name: plantillas plantillas_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plantillas_write_admin ON public.plantillas TO authenticated USING (public.is_admin_or_cofounder()) WITH CHECK (public.is_admin_or_cofounder());


--
-- Name: preview_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preview_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: producto_variantes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.producto_variantes ENABLE ROW LEVEL SECURITY;

--
-- Name: productos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

--
-- Name: productos productos_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY productos_select_dueno ON public.productos FOR SELECT TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: productos productos_select_publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY productos_select_publico ON public.productos FOR SELECT TO authenticated, anon USING (((estado = 'activo'::text) AND (EXISTS ( SELECT 1
   FROM public.tiendas t
  WHERE ((t.id = productos.tienda_id) AND (t.estado = 'publicada'::text))))));


--
-- Name: productos productos_write_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY productos_write_dueno ON public.productos TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles profiles_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_admin ON public.profiles FOR SELECT TO authenticated USING (public.is_admin_or_cofounder());


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: profiles profiles_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE USING (public.is_admin());


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: proveedores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedores proveedores_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proveedores_select_dueno ON public.proveedores FOR SELECT TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: proveedores proveedores_write_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proveedores_write_dueno ON public.proveedores TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: resenas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resenas ENABLE ROW LEVEL SECURITY;

--
-- Name: resenas resenas_delete_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resenas_delete_dueno ON public.resenas FOR DELETE TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: resenas resenas_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resenas_select_dueno ON public.resenas FOR SELECT TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: resenas resenas_select_publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resenas_select_publico ON public.resenas FOR SELECT TO authenticated, anon USING (((estado = 'aprobada'::text) AND (EXISTS ( SELECT 1
   FROM public.tiendas t
  WHERE ((t.id = resenas.tienda_id) AND (t.estado = 'publicada'::text))))));


--
-- Name: resenas resenas_update_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resenas_update_dueno ON public.resenas FOR UPDATE TO authenticated USING ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder())) WITH CHECK ((public.tienda_ia_es_dueno(tienda_id) OR public.is_admin_or_cofounder()));


--
-- Name: reservas_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservas_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: tienda_slugs_reservados slugs_reservados_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY slugs_reservados_select ON public.tienda_slugs_reservados FOR SELECT TO authenticated, anon USING (true);


--
-- Name: tienda_slugs_reservados slugs_reservados_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY slugs_reservados_write_admin ON public.tienda_slugs_reservados TO authenticated USING (public.is_admin_or_cofounder()) WITH CHECK (public.is_admin_or_cofounder());


--
-- Name: suscripciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;

--
-- Name: suscripciones suscripciones_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suscripciones_admin_all ON public.suscripciones USING (public.is_admin());


--
-- Name: suscripciones suscripciones_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suscripciones_select_own ON public.suscripciones FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: system_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

--
-- Name: system_config system_config_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY system_config_admin ON public.system_config FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: tienda_clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tienda_clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: tienda_clientes_otp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tienda_clientes_otp ENABLE ROW LEVEL SECURITY;

--
-- Name: tienda_paginas_legales_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tienda_paginas_legales_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: tienda_slugs_reservados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tienda_slugs_reservados ENABLE ROW LEVEL SECURITY;

--
-- Name: tiendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tiendas ENABLE ROW LEVEL SECURITY;

--
-- Name: tiendas tiendas_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tiendas_delete_admin ON public.tiendas FOR DELETE TO authenticated USING (public.is_admin_or_cofounder());


--
-- Name: tiendas tiendas_insert_propia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tiendas_insert_propia ON public.tiendas FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR public.is_admin_or_cofounder()));


--
-- Name: tiendas tiendas_select_propia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tiendas_select_propia ON public.tiendas FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin_or_cofounder()));


--
-- Name: tiendas tiendas_select_publicas_publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tiendas_select_publicas_publico ON public.tiendas FOR SELECT TO authenticated, anon USING ((estado = 'publicada'::text));


--
-- Name: tiendas tiendas_update_propia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tiendas_update_propia ON public.tiendas FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR public.is_admin_or_cofounder())) WITH CHECK (((user_id = auth.uid()) OR public.is_admin_or_cofounder()));


--
-- Name: token_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.token_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: token_ledger token_ledger_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY token_ledger_own ON public.token_ledger FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin_or_cofounder()));


--
-- Name: token_pack_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.token_pack_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: token_pack_orders token_pack_orders_own_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY token_pack_orders_own_select ON public.token_pack_orders FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin_or_cofounder()));


--
-- Name: token_packs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.token_packs ENABLE ROW LEVEL SECURITY;

--
-- Name: token_packs token_packs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY token_packs_read ON public.token_packs FOR SELECT TO authenticated USING ((activo = true));


--
-- Name: producto_variantes variantes_select_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variantes_select_dueno ON public.producto_variantes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.productos p
  WHERE ((p.id = producto_variantes.producto_id) AND (public.tienda_ia_es_dueno(p.tienda_id) OR public.is_admin_or_cofounder())))));


--
-- Name: producto_variantes variantes_select_publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variantes_select_publico ON public.producto_variantes FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM (public.productos p
     JOIN public.tiendas t ON ((t.id = p.tienda_id)))
  WHERE ((p.id = producto_variantes.producto_id) AND (p.estado = 'activo'::text) AND (t.estado = 'publicada'::text)))));


--
-- Name: producto_variantes variantes_write_dueno; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variantes_write_dueno ON public.producto_variantes TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.productos p
  WHERE ((p.id = producto_variantes.producto_id) AND (public.tienda_ia_es_dueno(p.tienda_id) OR public.is_admin_or_cofounder()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.productos p
  WHERE ((p.id = producto_variantes.producto_id) AND (public.tienda_ia_es_dueno(p.tienda_id) OR public.is_admin_or_cofounder())))));


--
-- Name: wa_clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wa_clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: wa_consultorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wa_consultorias ENABLE ROW LEVEL SECURITY;

--
-- Name: wa_conversaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wa_conversaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: wa_escalamientos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wa_escalamientos ENABLE ROW LEVEL SECURITY;

--
-- Name: wa_mensajes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wa_mensajes ENABLE ROW LEVEL SECURITY;

--
-- Name: wa_reclamos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wa_reclamos ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION acreditar_tokens(p_user_id uuid, p_cantidad integer, p_tipo text, p_referencia text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.acreditar_tokens(p_user_id uuid, p_cantidad integer, p_tipo text, p_referencia text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.acreditar_tokens(p_user_id uuid, p_cantidad integer, p_tipo text, p_referencia text) TO service_role;


--
-- Name: FUNCTION auto_slug_producto(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_slug_producto() TO anon;
GRANT ALL ON FUNCTION public.auto_slug_producto() TO authenticated;
GRANT ALL ON FUNCTION public.auto_slug_producto() TO service_role;


--
-- Name: FUNCTION buscar_productos(p_tienda_id uuid, p_q text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.buscar_productos(p_tienda_id uuid, p_q text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.buscar_productos(p_tienda_id uuid, p_q text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.buscar_productos(p_tienda_id uuid, p_q text, p_limit integer) TO service_role;


--
-- Name: FUNCTION categoria_descendientes(p_categoria_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.categoria_descendientes(p_categoria_id uuid) TO anon;
GRANT ALL ON FUNCTION public.categoria_descendientes(p_categoria_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.categoria_descendientes(p_categoria_id uuid) TO service_role;


--
-- Name: FUNCTION check_email_rate_limit(p_correo text, p_evento text, p_max integer, p_ventana_min integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_email_rate_limit(p_correo text, p_evento text, p_max integer, p_ventana_min integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_email_rate_limit(p_correo text, p_evento text, p_max integer, p_ventana_min integer) TO service_role;


--
-- Name: FUNCTION check_rate_limit_form_submit(p_key text, p_max integer, p_window_minutes integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_rate_limit_form_submit(p_key text, p_max integer, p_window_minutes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_rate_limit_form_submit(p_key text, p_max integer, p_window_minutes integer) TO anon;
GRANT ALL ON FUNCTION public.check_rate_limit_form_submit(p_key text, p_max integer, p_window_minutes integer) TO authenticated;
GRANT ALL ON FUNCTION public.check_rate_limit_form_submit(p_key text, p_max integer, p_window_minutes integer) TO service_role;


--
-- Name: FUNCTION cleanup_form_submit_rate_limit(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_form_submit_rate_limit() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_form_submit_rate_limit() TO anon;
GRANT ALL ON FUNCTION public.cleanup_form_submit_rate_limit() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_form_submit_rate_limit() TO service_role;


--
-- Name: FUNCTION cleanup_preview_tokens(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_preview_tokens() TO anon;
GRANT ALL ON FUNCTION public.cleanup_preview_tokens() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_preview_tokens() TO service_role;


--
-- Name: FUNCTION diag_rate_limit(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.diag_rate_limit() FROM PUBLIC;
GRANT ALL ON FUNCTION public.diag_rate_limit() TO service_role;


--
-- Name: FUNCTION gen_codigo_publico_pedido(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gen_codigo_publico_pedido() TO anon;
GRANT ALL ON FUNCTION public.gen_codigo_publico_pedido() TO authenticated;
GRANT ALL ON FUNCTION public.gen_codigo_publico_pedido() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_updated_at() TO service_role;


--
-- Name: FUNCTION inv_mov_sync_stock(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.inv_mov_sync_stock() FROM PUBLIC;
GRANT ALL ON FUNCTION public.inv_mov_sync_stock() TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION is_admin_or_cofounder(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin_or_cofounder() TO anon;
GRANT ALL ON FUNCTION public.is_admin_or_cofounder() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin_or_cofounder() TO service_role;


--
-- Name: FUNCTION kardex_registrar(p_producto_id uuid, p_variante_id uuid, p_tipo text, p_cantidad integer, p_costo_unitario numeric, p_fecha timestamp with time zone, p_pedido_id uuid, p_nota text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.kardex_registrar(p_producto_id uuid, p_variante_id uuid, p_tipo text, p_cantidad integer, p_costo_unitario numeric, p_fecha timestamp with time zone, p_pedido_id uuid, p_nota text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.kardex_registrar(p_producto_id uuid, p_variante_id uuid, p_tipo text, p_cantidad integer, p_costo_unitario numeric, p_fecha timestamp with time zone, p_pedido_id uuid, p_nota text) TO service_role;


--
-- Name: FUNCTION notif_pedido_webhook(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notif_pedido_webhook() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notif_pedido_webhook() TO service_role;


--
-- Name: FUNCTION pedido_stock_lifecycle(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pedido_stock_lifecycle() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pedido_stock_lifecycle() TO service_role;


--
-- Name: FUNCTION protect_profile_privileged_columns(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC;
GRANT ALL ON FUNCTION public.protect_profile_privileged_columns() TO service_role;


--
-- Name: FUNCTION reembolsar_tokens(p_job_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reembolsar_tokens(p_job_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reembolsar_tokens(p_job_id text) TO service_role;


--
-- Name: FUNCTION reservar_stock_variante(p_variante_id uuid, p_cantidad integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reservar_stock_variante(p_variante_id uuid, p_cantidad integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reservar_stock_variante(p_variante_id uuid, p_cantidad integer) TO anon;
GRANT ALL ON FUNCTION public.reservar_stock_variante(p_variante_id uuid, p_cantidad integer) TO authenticated;
GRANT ALL ON FUNCTION public.reservar_stock_variante(p_variante_id uuid, p_cantidad integer) TO service_role;


--
-- Name: FUNCTION reservar_tokens(p_user_id uuid, p_cantidad integer, p_job_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reservar_tokens(p_user_id uuid, p_cantidad integer, p_job_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reservar_tokens(p_user_id uuid, p_cantidad integer, p_job_id text) TO authenticated;
GRANT ALL ON FUNCTION public.reservar_tokens(p_user_id uuid, p_cantidad integer, p_job_id text) TO service_role;


--
-- Name: FUNCTION reservar_tokens_v2(p_user_id uuid, p_cantidad integer, p_job_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reservar_tokens_v2(p_user_id uuid, p_cantidad integer, p_job_id text) TO anon;
GRANT ALL ON FUNCTION public.reservar_tokens_v2(p_user_id uuid, p_cantidad integer, p_job_id text) TO authenticated;
GRANT ALL ON FUNCTION public.reservar_tokens_v2(p_user_id uuid, p_cantidad integer, p_job_id text) TO service_role;


--
-- Name: FUNCTION slugify_text(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.slugify_text(input text) TO anon;
GRANT ALL ON FUNCTION public.slugify_text(input text) TO authenticated;
GRANT ALL ON FUNCTION public.slugify_text(input text) TO service_role;


--
-- Name: FUNCTION tienda_ia_es_dueno(p_tienda_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tienda_ia_es_dueno(p_tienda_id uuid) TO anon;
GRANT ALL ON FUNCTION public.tienda_ia_es_dueno(p_tienda_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.tienda_ia_es_dueno(p_tienda_id uuid) TO service_role;


--
-- Name: FUNCTION tienda_ia_touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tienda_ia_touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.tienda_ia_touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.tienda_ia_touch_updated_at() TO service_role;


--
-- Name: FUNCTION tiene_acceso_pro(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tiene_acceso_pro(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.tiene_acceso_pro(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.tiene_acceso_pro(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION try_consume_rate_token(p_provider text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.try_consume_rate_token(p_provider text) TO anon;
GRANT ALL ON FUNCTION public.try_consume_rate_token(p_provider text) TO authenticated;
GRANT ALL ON FUNCTION public.try_consume_rate_token(p_provider text) TO service_role;


--
-- Name: FUNCTION validate_preview_token(p_token uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_preview_token(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.validate_preview_token(p_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.validate_preview_token(p_token uuid) TO service_role;


--
-- Name: FUNCTION verify_email_by_token(p_token uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.verify_email_by_token(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.verify_email_by_token(p_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.verify_email_by_token(p_token uuid) TO service_role;


--
-- Name: FUNCTION wa_fn_actualizar_cliente(p_cliente_id uuid, p_nombre text, p_correo text, p_empresa text, p_cedula text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wa_fn_actualizar_cliente(p_cliente_id uuid, p_nombre text, p_correo text, p_empresa text, p_cedula text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_fn_actualizar_cliente(p_cliente_id uuid, p_nombre text, p_correo text, p_empresa text, p_cedula text) TO service_role;


--
-- Name: FUNCTION wa_fn_consultoria(p_cliente_id uuid, p_conversacion_id uuid, p_tipo text, p_descripcion text, p_prioridad text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wa_fn_consultoria(p_cliente_id uuid, p_conversacion_id uuid, p_tipo text, p_descripcion text, p_prioridad text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_fn_consultoria(p_cliente_id uuid, p_conversacion_id uuid, p_tipo text, p_descripcion text, p_prioridad text) TO service_role;


--
-- Name: FUNCTION wa_fn_entrante(p_telefono text, p_nombre_wa text, p_tipo text, p_texto text, p_message_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wa_fn_entrante(p_telefono text, p_nombre_wa text, p_tipo text, p_texto text, p_message_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_fn_entrante(p_telefono text, p_nombre_wa text, p_tipo text, p_texto text, p_message_id text) TO service_role;


--
-- Name: FUNCTION wa_fn_reclamo(p_cliente_id uuid, p_conversacion_id uuid, p_categoria text, p_descripcion text, p_detalle text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wa_fn_reclamo(p_cliente_id uuid, p_conversacion_id uuid, p_categoria text, p_descripcion text, p_detalle text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_fn_reclamo(p_cliente_id uuid, p_conversacion_id uuid, p_categoria text, p_descripcion text, p_detalle text) TO service_role;


--
-- Name: FUNCTION wa_fn_saliente(p_conversacion_id uuid, p_cliente_id uuid, p_texto text, p_tokens integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wa_fn_saliente(p_conversacion_id uuid, p_cliente_id uuid, p_texto text, p_tokens integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_fn_saliente(p_conversacion_id uuid, p_cliente_id uuid, p_texto text, p_tokens integer) TO service_role;


--
-- Name: FUNCTION wa_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wa_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.wa_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.wa_set_updated_at() TO service_role;


--
-- Name: TABLE audit_log_cuenta; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.audit_log_cuenta TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.audit_log_cuenta TO authenticated;
GRANT ALL ON TABLE public.audit_log_cuenta TO service_role;


--
-- Name: SEQUENCE audit_log_cuenta_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.audit_log_cuenta_id_seq TO anon;
GRANT ALL ON SEQUENCE public.audit_log_cuenta_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.audit_log_cuenta_id_seq TO service_role;


--
-- Name: TABLE categorias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.categorias TO anon;
GRANT ALL ON TABLE public.categorias TO authenticated;
GRANT ALL ON TABLE public.categorias TO service_role;


--
-- Name: TABLE diagnostico_gratuito; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.diagnostico_gratuito TO anon;
GRANT ALL ON TABLE public.diagnostico_gratuito TO authenticated;
GRANT ALL ON TABLE public.diagnostico_gratuito TO service_role;


--
-- Name: TABLE editor_v2_backup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.editor_v2_backup TO anon;
GRANT ALL ON TABLE public.editor_v2_backup TO authenticated;
GRANT ALL ON TABLE public.editor_v2_backup TO service_role;


--
-- Name: TABLE email_rate_limit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_rate_limit TO service_role;


--
-- Name: SEQUENCE email_rate_limit_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.email_rate_limit_id_seq TO anon;
GRANT ALL ON SEQUENCE public.email_rate_limit_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.email_rate_limit_id_seq TO service_role;


--
-- Name: TABLE envios_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.envios_config TO anon;
GRANT ALL ON TABLE public.envios_config TO authenticated;
GRANT ALL ON TABLE public.envios_config TO service_role;


--
-- Name: TABLE envios_tarifas_ciudad; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.envios_tarifas_ciudad TO anon;
GRANT ALL ON TABLE public.envios_tarifas_ciudad TO authenticated;
GRANT ALL ON TABLE public.envios_tarifas_ciudad TO service_role;


--
-- Name: TABLE form_submission_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.form_submission_notifications TO anon;
GRANT ALL ON TABLE public.form_submission_notifications TO authenticated;
GRANT ALL ON TABLE public.form_submission_notifications TO service_role;


--
-- Name: TABLE form_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.form_submissions TO anon;
GRANT ALL ON TABLE public.form_submissions TO authenticated;
GRANT ALL ON TABLE public.form_submissions TO service_role;


--
-- Name: TABLE form_submit_rate_limit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.form_submit_rate_limit TO anon;
GRANT ALL ON TABLE public.form_submit_rate_limit TO authenticated;
GRANT ALL ON TABLE public.form_submit_rate_limit TO service_role;


--
-- Name: TABLE image_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.image_jobs TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.image_jobs TO authenticated;
GRANT ALL ON TABLE public.image_jobs TO service_role;


--
-- Name: TABLE inventario_movimientos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventario_movimientos TO anon;
GRANT ALL ON TABLE public.inventario_movimientos TO authenticated;
GRANT ALL ON TABLE public.inventario_movimientos TO service_role;


--
-- Name: TABLE logs_acceso; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.logs_acceso TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.logs_acceso TO authenticated;
GRANT ALL ON TABLE public.logs_acceso TO service_role;


--
-- Name: TABLE model_costs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.model_costs TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.model_costs TO authenticated;
GRANT ALL ON TABLE public.model_costs TO service_role;


--
-- Name: SEQUENCE model_costs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.model_costs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.model_costs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.model_costs_id_seq TO service_role;


--
-- Name: TABLE mp_webhook_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mp_webhook_log TO service_role;


--
-- Name: SEQUENCE mp_webhook_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.mp_webhook_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.mp_webhook_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.mp_webhook_log_id_seq TO service_role;


--
-- Name: TABLE n8n_chat_histories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.n8n_chat_histories TO service_role;


--
-- Name: SEQUENCE n8n_chat_histories_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.n8n_chat_histories_id_seq TO anon;
GRANT ALL ON SEQUENCE public.n8n_chat_histories_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.n8n_chat_histories_id_seq TO service_role;


--
-- Name: TABLE notif_webhook_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notif_webhook_config TO anon;
GRANT ALL ON TABLE public.notif_webhook_config TO authenticated;
GRANT ALL ON TABLE public.notif_webhook_config TO service_role;


--
-- Name: TABLE paginas_ia_generadas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.paginas_ia_generadas TO anon;
GRANT ALL ON TABLE public.paginas_ia_generadas TO authenticated;
GRANT ALL ON TABLE public.paginas_ia_generadas TO service_role;


--
-- Name: TABLE paginas_legales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.paginas_legales TO anon;
GRANT ALL ON TABLE public.paginas_legales TO authenticated;
GRANT ALL ON TABLE public.paginas_legales TO service_role;


--
-- Name: TABLE paletas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.paletas TO anon;
GRANT ALL ON TABLE public.paletas TO authenticated;
GRANT ALL ON TABLE public.paletas TO service_role;


--
-- Name: TABLE pedido_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pedido_items TO anon;
GRANT ALL ON TABLE public.pedido_items TO authenticated;
GRANT ALL ON TABLE public.pedido_items TO service_role;


--
-- Name: TABLE pedido_notificaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pedido_notificaciones TO anon;
GRANT ALL ON TABLE public.pedido_notificaciones TO authenticated;
GRANT ALL ON TABLE public.pedido_notificaciones TO service_role;


--
-- Name: TABLE pedidos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pedidos TO anon;
GRANT ALL ON TABLE public.pedidos TO authenticated;
GRANT ALL ON TABLE public.pedidos TO service_role;


--
-- Name: TABLE planes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.planes TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.planes TO authenticated;
GRANT ALL ON TABLE public.planes TO service_role;


--
-- Name: TABLE plantillas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plantillas TO anon;
GRANT ALL ON TABLE public.plantillas TO authenticated;
GRANT ALL ON TABLE public.plantillas TO service_role;


--
-- Name: TABLE preview_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preview_tokens TO anon;
GRANT ALL ON TABLE public.preview_tokens TO authenticated;
GRANT ALL ON TABLE public.preview_tokens TO service_role;


--
-- Name: TABLE producto_variantes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.producto_variantes TO anon;
GRANT ALL ON TABLE public.producto_variantes TO authenticated;
GRANT ALL ON TABLE public.producto_variantes TO service_role;


--
-- Name: TABLE productos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.productos TO anon;
GRANT ALL ON TABLE public.productos TO authenticated;
GRANT ALL ON TABLE public.productos TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: COLUMN profiles.nombre_completo; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(nombre_completo) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.cedula; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(cedula) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.direccion; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(direccion) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.telefono; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(telefono) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.nombre_empresa; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(nombre_empresa) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.pagina_web; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(pagina_web) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.perfil_completo; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(perfil_completo) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE proveedores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proveedores TO anon;
GRANT ALL ON TABLE public.proveedores TO authenticated;
GRANT ALL ON TABLE public.proveedores TO service_role;


--
-- Name: TABLE rate_buckets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_buckets TO anon;
GRANT ALL ON TABLE public.rate_buckets TO authenticated;
GRANT ALL ON TABLE public.rate_buckets TO service_role;


--
-- Name: TABLE resenas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resenas TO anon;
GRANT ALL ON TABLE public.resenas TO authenticated;
GRANT ALL ON TABLE public.resenas TO service_role;


--
-- Name: TABLE reservas_stock; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reservas_stock TO anon;
GRANT ALL ON TABLE public.reservas_stock TO authenticated;
GRANT ALL ON TABLE public.reservas_stock TO service_role;


--
-- Name: TABLE suscripciones; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.suscripciones TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.suscripciones TO authenticated;
GRANT ALL ON TABLE public.suscripciones TO service_role;


--
-- Name: TABLE system_config; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.system_config TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.system_config TO authenticated;
GRANT ALL ON TABLE public.system_config TO service_role;


--
-- Name: TABLE tienda_clientes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tienda_clientes TO anon;
GRANT ALL ON TABLE public.tienda_clientes TO authenticated;
GRANT ALL ON TABLE public.tienda_clientes TO service_role;


--
-- Name: TABLE tienda_clientes_otp; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tienda_clientes_otp TO anon;
GRANT ALL ON TABLE public.tienda_clientes_otp TO authenticated;
GRANT ALL ON TABLE public.tienda_clientes_otp TO service_role;


--
-- Name: TABLE tienda_paginas_legales_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tienda_paginas_legales_templates TO anon;
GRANT ALL ON TABLE public.tienda_paginas_legales_templates TO authenticated;
GRANT ALL ON TABLE public.tienda_paginas_legales_templates TO service_role;


--
-- Name: TABLE tienda_slugs_reservados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tienda_slugs_reservados TO anon;
GRANT ALL ON TABLE public.tienda_slugs_reservados TO authenticated;
GRANT ALL ON TABLE public.tienda_slugs_reservados TO service_role;


--
-- Name: TABLE tiendas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tiendas TO anon;
GRANT ALL ON TABLE public.tiendas TO authenticated;
GRANT ALL ON TABLE public.tiendas TO service_role;


--
-- Name: TABLE token_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.token_ledger TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.token_ledger TO authenticated;
GRANT ALL ON TABLE public.token_ledger TO service_role;


--
-- Name: SEQUENCE token_ledger_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.token_ledger_id_seq TO anon;
GRANT ALL ON SEQUENCE public.token_ledger_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.token_ledger_id_seq TO service_role;


--
-- Name: TABLE token_pack_orders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.token_pack_orders TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.token_pack_orders TO authenticated;
GRANT ALL ON TABLE public.token_pack_orders TO service_role;


--
-- Name: TABLE token_packs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.token_packs TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.token_packs TO authenticated;
GRANT ALL ON TABLE public.token_packs TO service_role;


--
-- Name: SEQUENCE token_packs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.token_packs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.token_packs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.token_packs_id_seq TO service_role;


--
-- Name: TABLE wa_clientes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wa_clientes TO service_role;


--
-- Name: TABLE wa_consultorias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wa_consultorias TO service_role;


--
-- Name: SEQUENCE wa_consultorias_folio_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.wa_consultorias_folio_seq TO anon;
GRANT ALL ON SEQUENCE public.wa_consultorias_folio_seq TO authenticated;
GRANT ALL ON SEQUENCE public.wa_consultorias_folio_seq TO service_role;


--
-- Name: TABLE wa_conversaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wa_conversaciones TO service_role;


--
-- Name: TABLE wa_escalamientos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wa_escalamientos TO service_role;


--
-- Name: TABLE wa_mensajes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wa_mensajes TO service_role;


--
-- Name: TABLE wa_reclamos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wa_reclamos TO service_role;


--
-- Name: SEQUENCE wa_reclamos_folio_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.wa_reclamos_folio_seq TO anon;
GRANT ALL ON SEQUENCE public.wa_reclamos_folio_seq TO authenticated;
GRANT ALL ON SEQUENCE public.wa_reclamos_folio_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
-- (omitido: rol gestionado por Supabase) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict FZvzljggNWcNRBl1EX1zWY1xJdgQb31TMknhcaTgrIkjyuJleBWfgv0DMna8bUL

