-- Production lock for dangerous operations (Reset Demo)
-- Protects the reset RPC even if someone calls it directly.
--
-- In production, set:
--   update public.app_settings
--      set value = jsonb_build_object('mode','production')
--    where key = 'environment';

-- 1) Ensure environment setting exists (default: development)
insert into public.app_settings (key, value)
values ('environment', jsonb_build_object('mode','development'))
on conflict (key) do nothing;

-- 2) Replace reset function with production guard
create or replace function public.admin_reset_demo_data(p_confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  env_mode text;
begin
  select value->>'mode' into env_mode
    from public.app_settings
   where key='environment';
  if coalesce(env_mode,'development') = 'production' then
    raise exception 'Reset demo data is disabled in production';
  end if;
  if coalesce(p_confirm,'') <> 'RESET' then
    raise exception 'Confirmation required: pass p_confirm = RESET';
  end if;
  if not public.user_has_permission(auth.uid(), 'settings.manage')
     and not public.user_has_permission(auth.uid(), 'studio.manage') then
    raise exception 'Insufficient privileges';
  end if;
  delete from public.notifications;
  delete from public.audit_events;
  delete from public.odometer_disputes;
  delete from public.trip_actions;
  delete from public.trips;
  delete from public.maintenance_records;
end;
$$;

grant execute on function public.admin_reset_demo_data(text) to authenticated;
