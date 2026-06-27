-- AIMMA · Modulo Ventas · Fase 5 · fix de grant (minima superficie + coincidencia con spec).
-- Supabase auto-otorga EXECUTE a authenticated por DEFAULT PRIVILEGES en funciones nuevas de public;
-- el revoke from public,anon de la migracion anterior NO cubria a authenticated. telefono_norm solo se
-- llama desde las SECURITY DEFINER (como owner) -> authenticated no necesita ejecutarla directo.
revoke execute on function public.telefono_norm(text) from authenticated;
