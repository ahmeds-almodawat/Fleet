-- Soft production hardening
-- Safe to run after existing Fleet7 migrations.

-- 1) Force production mode so demo reset cannot wipe operational data.
insert into public.app_settings (key, value)
values ('environment', jsonb_build_object('mode','production'))
on conflict (key) do update
set value = jsonb_build_object('mode','production'),
    updated_at = now();

-- 2) Fix reset RPC table name and keep production guard.
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
  delete from public.vehicle_maintenance;
end;
$$;

grant execute on function public.admin_reset_demo_data(text) to authenticated;

-- 3) Fix backup export RPC table name: public.vehicle_maintenance, not public.maintenance.
insert into public.permissions (key, name, description, category)
values
  ('system.backup.export', 'Export System Backup', 'Export a JSON backup of system data (Admin only)', 'System')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'system.backup.export'
where r.name = 'System Administrator'
on conflict do nothing;

create or replace function public.admin_export_backup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select public.has_permission(v_uid, 'system.backup.export') into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'No access';
  end if;

  result := jsonb_build_object(
    'meta', jsonb_build_object(
      'exported_at', now(),
      'version', 'fleet_backup_v2'
    ),
    'departments', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public.departments d),
    'vehicle_types', (select coalesce(jsonb_agg(to_jsonb(vt)), '[]'::jsonb) from public.vehicle_types vt),
    'destinations', (select coalesce(jsonb_agg(to_jsonb(ds)), '[]'::jsonb) from public.destinations ds),
    'vehicles', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.vehicles v),
    'trips', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.trips t),
    'maintenance', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.vehicle_maintenance m),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from public.notifications n),
    'audit_events', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.audit_events a),
    'app_settings', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.app_settings s)
  );

  return result;
end;
$$;

revoke all on function public.admin_export_backup() from public;
grant execute on function public.admin_export_backup() to authenticated;
