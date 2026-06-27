-- Admin backup export (JSON)
-- Exports core business data for operational backup/testing.
-- NOTE: This does NOT replace managed database backups / PITR.
-- Requires: public.has_permission(uuid, text) helper exists.

-- 1) Permission key (Admin)
insert into public.permissions (key, name, description, category)
values
  ('system.backup.export', 'Export System Backup', 'Export a JSON backup of system data (Admin only)', 'System')
on conflict (key) do nothing;

-- Map to System Administrator by default (non-breaking)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'system.backup.export'
where r.name = 'System Administrator'
on conflict do nothing;

-- 2) Export function (security definer)
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

  -- Only include safe tables (do NOT include auth.users, secrets, or service keys)
  result := jsonb_build_object(
    'meta', jsonb_build_object(
      'exported_at', now(),
      'version', 'fleet_backup_v1'
    ),
    'departments', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public.departments d),
    'vehicle_types', (select coalesce(jsonb_agg(to_jsonb(vt)), '[]'::jsonb) from public.vehicle_types vt),
    'destinations', (select coalesce(jsonb_agg(to_jsonb(ds)), '[]'::jsonb) from public.destinations ds),
    'vehicles', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.vehicles v),
    'trips', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.trips t),
    'maintenance', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.maintenance m),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from public.notifications n),
    'audit_events', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.audit_events a),
    'app_settings', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.app_settings s)
  );

  return result;
end;
$$;

revoke all on function public.admin_export_backup() from public;
grant execute on function public.admin_export_backup() to authenticated;
