-- Disparadores pg_net hacia la EF tienda-notif-pedido.
create or replace function public.notif_pedido_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notif_pedido_insert on public.pedidos;
create trigger trg_notif_pedido_insert
  after insert on public.pedidos
  for each row execute function public.notif_pedido_webhook();

drop trigger if exists trg_notif_pedido_cierre on public.pedidos;
create trigger trg_notif_pedido_cierre
  after update on public.pedidos
  for each row when (new.estado = 'cerrado' and old.estado is distinct from 'cerrado')
  execute function public.notif_pedido_webhook();
