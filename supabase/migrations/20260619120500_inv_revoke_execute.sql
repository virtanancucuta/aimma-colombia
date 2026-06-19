-- 20260619120500_inv_revoke_execute — cerrar acceso RPC directo a funciones internas de inventario.
-- kardex_registrar es SECURITY DEFINER y NO valida ownership: invocable via /rpc por anon/authenticated
-- permitiria inyectar movimientos en el inventario de cualquier tienda (bypass de RLS).
-- Las llamadas INTERNAS (pedido_stock_lifecycle -> kardex_registrar; trigger -> inv_mov_sync_stock)
-- siguen funcionando porque esas funciones SECURITY DEFINER corren como owner (postgres),
-- que conserva EXECUTE. El modulo admin escribira movimientos manuales por una capa con ownership-check
-- (RPC wrapper / EF) en el build, no llamando estas funciones crudas.
revoke execute on function public.kardex_registrar(uuid,uuid,text,integer,numeric,timestamptz,uuid,text) from public, anon, authenticated;
revoke execute on function public.inv_mov_sync_stock() from public, anon, authenticated;
revoke execute on function public.pedido_stock_lifecycle() from public, anon, authenticated;
