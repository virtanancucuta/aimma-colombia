-- Endurecer: el trigger fn no debe ser invocable como RPC por clientes (solo corre como trigger).
revoke execute on function public.notif_pedido_webhook() from anon, authenticated, public;
