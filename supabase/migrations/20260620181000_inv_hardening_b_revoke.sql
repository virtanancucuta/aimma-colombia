-- ============================================================================
-- HARDENING INVENTARIO — Fase B, parte 2 (FINAL): imponer la invariante.
-- stock/costo SOLO se mueven via kardex (RPCs definer + lifecycle). El cliente
-- (anon/authenticated) ya NO puede escribirlos directo.
--
-- GOTCHA Postgres: REVOKE UPDATE(columna) NO recorta un GRANT de nivel-TABLA.
-- authenticated tiene UPDATE de tabla (default privileges de Supabase), asi que
-- el column-revoke es inefectivo. Patron correcto: revocar el UPDATE de tabla y
-- re-otorgar UPDATE en TODAS las columnas EXCEPTO las protegidas (dinamico, para
-- no romperse si se agregan columnas). INSERT: creacion va por RPC → revocar.
--
-- ⚠️ ORDEN DE DEPLOY: DESPUES de que el front (productos.js con RPCs) este
--    desplegado y verificado en Easypanel. NUNCA antes (rompe el form viejo).
--
-- 🔧 MANTENIMIENTO (el grant de columnas es un SNAPSHOT): si en el futuro se
--    agrega una columna a producto_variantes o productos, NO queda en este grant
--    -> el comerciante no podra editarla (read-only silencioso). Al agregar una
--    columna editable por el cliente, re-correr el grant (o una migracion que
--    la otorgue). Un guard-test afirma que stock/reservado/costo NO estan en el
--    grant de authenticated (falla ruidoso si una migracion futura re-otorga el
--    update de tabla y reabre el hueco).
-- ============================================================================

do $$
declare cols text;
begin
  -- producto_variantes: proteger stock y reservado (kardex/reservas los manejan).
  select string_agg(quote_ident(column_name), ', ') into cols
    from information_schema.columns
    where table_schema='public' and table_name='producto_variantes'
      and column_name not in ('stock','reservado');
  execute 'revoke update on public.producto_variantes from anon, authenticated';
  execute 'grant update ('||cols||') on public.producto_variantes to authenticated';
  execute 'revoke insert on public.producto_variantes from anon, authenticated';

  -- productos: proteger costo (promedio del kardex).
  select string_agg(quote_ident(column_name), ', ') into cols
    from information_schema.columns
    where table_schema='public' and table_name='productos'
      and column_name not in ('costo');
  execute 'revoke update on public.productos from anon, authenticated';
  execute 'grant update ('||cols||') on public.productos to authenticated';
  execute 'revoke insert on public.productos from anon, authenticated';
end $$;
