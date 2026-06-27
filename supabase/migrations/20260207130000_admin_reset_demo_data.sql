-- Admin-only: Reset demo/operational data (keeps users, roles, permissions, settings, branding).
-- Safety: requires explicit confirmation string 'RESET'.
create or replace function public.admin_reset_demo_data(p_confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_confirm,'') <> 'RESET' then
    raise exception 'Confirmation required: pass p_confirm = RESET';
  end if;

  if not public.user_has_permission(auth.uid(), 'settings.manage')
     and not public.user_has_permission(auth.uid(), 'studio.manage') then
    raise exception 'Insufficient privileges';
  end if;

  -- Notifications & audit
  delete from public.notifications;
  delete from public.audit_events;

  -- Trip domain
  delete from public.odometer_disputes;
  delete from public.trip_actions;
  delete from public.trips;

  -- Maintenance domain
  delete from public.maintenance_records;

  -- Optional: uncomment if you want a truly empty fleet (requires recreating master data).
  -- delete from public.vehicles;
  -- delete from public.destinations;
  -- delete from public.vehicle_types;
  -- delete from public.departments;

end;
$$;

grant execute on function public.admin_reset_demo_data(text) to authenticated;
