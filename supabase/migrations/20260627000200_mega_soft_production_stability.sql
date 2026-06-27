-- Mega soft-production stability pass.
-- Safe additive migration for Fleet7 after Update 01.

-- 1) Permission aliases used by the frontend and admin pages.
insert into public.permissions (key, name, description, category)
values
  ('vehicles.read_all', 'View All Vehicles', 'Alias/read scope for all vehicles', 'Vehicles'),
  ('vehicles.read_department', 'View Department Vehicles', 'Alias/read scope for department vehicles', 'Vehicles'),
  ('vehicles.read_all_departments', 'View All Department Vehicles', 'Alias/read scope for all department vehicles', 'Vehicles'),
  ('users.read_all', 'View All Users', 'Alias/read scope for all users', 'Users'),
  ('users.read_department', 'View Department Users', 'Alias/read scope for department users', 'Users'),
  ('trips.read_department', 'View Department Trips', 'Alias/read scope for department trips', 'Trips'),
  ('maintenance.read', 'View Maintenance', 'View maintenance records', 'Maintenance'),
  ('maintenance.read_all', 'View All Maintenance', 'View all maintenance records', 'Maintenance'),
  ('maintenance.read_department', 'View Department Maintenance', 'View department maintenance records', 'Maintenance'),
  ('maintenance.manage', 'Manage Maintenance', 'Create and update maintenance records', 'Maintenance'),
  ('fleet.read_all', 'View Full Fleet', 'Read all fleet records', 'Fleet'),
  ('fleet.manage', 'Manage Fleet', 'Manage fleet setup and operational records', 'Fleet'),
  ('reports.view', 'View Reports', 'Legacy alias for reports.read', 'Reports'),
  ('reports.read_all', 'View All Reports', 'Alias/read scope for all reports', 'Reports'),
  ('reports.export', 'Export Reports', 'Legacy alias for reports.export_csv', 'Reports'),
  ('audit.export', 'Export Audit Logs', 'Export audit trail data', 'Audit'),
  ('alerts.read', 'View Alerts', 'View alert and anomaly reports', 'Alerts'),
  ('destinations.read', 'View Destinations', 'View destination master data', 'Destinations'),
  ('roles.manage', 'Manage Roles', 'Legacy alias for role create/edit/delete', 'Roles')
on conflict (key) do nothing;

-- 2) Assign aliases to System Administrator.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'System Administrator'
on conflict do nothing;

-- 3) Assign practical aliases to existing operational roles based on their current permissions.
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_alias.id
from public.role_permissions rp
join public.permissions p_base on p_base.id = rp.permission_id
join public.permissions p_alias on p_alias.key in (
  case when p_base.key = 'vehicles.read' then 'vehicles.read_department' end,
  case when p_base.key = 'vehicles.read' then 'destinations.read' end,
  case when p_base.key = 'trips.read_all' then 'trips.read_department' end,
  case when p_base.key = 'reports.read' then 'reports.view' end,
  case when p_base.key = 'reports.read' then 'reports.read_all' end,
  case when p_base.key = 'reports.export_csv' then 'reports.export' end,
  case when p_base.key = 'reports.export_csv' then 'audit.export' end
)
where p_alias.key is not null
on conflict do nothing;

-- Managers/editors get maintenance/fleet management aliases.
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_alias.id
from public.role_permissions rp
join public.permissions p_base on p_base.id = rp.permission_id
join public.permissions p_alias on p_alias.key in (
  case when p_base.key = 'vehicles.edit' then 'maintenance.manage' end,
  case when p_base.key = 'vehicles.edit' then 'fleet.manage' end,
  case when p_base.key = 'vehicles.read' then 'maintenance.read' end,
  case when p_base.key = 'vehicles.read' then 'maintenance.read_department' end,
  case when p_base.key = 'trips.read_all' then 'fleet.read_all' end,
  case when p_base.key = 'alerts.odometer_anomaly' then 'alerts.read' end,
  case when p_base.key = 'roles.edit' then 'roles.manage' end
)
where p_alias.key is not null
on conflict do nothing;

-- 4) Fix service trip block logic so a 0-km/new vehicle is not immediately service-overdue.
create or replace function public.vehicle_trip_block_reason(p_vehicle_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
  current_km numeric;
  interval_km numeric;
  next_service_km numeric;
begin
  select
    id,
    current_odometer,
    service_interval_km,
    service_notify_before_km,
    insurance_end_date,
    registration_end_date
  into v
  from public.vehicles
  where id = p_vehicle_id;

  if not found then
    return 'VEHICLE_NOT_FOUND';
  end if;

  if v.insurance_end_date is not null then
    if v.insurance_end_date < current_date then
      return 'INSURANCE_EXPIRED';
    elsif v.insurance_end_date <= (current_date + 1) then
      return 'INSURANCE_EXPIRES_WITHIN_1_DAY';
    end if;
  end if;

  if v.registration_end_date is not null then
    if v.registration_end_date < current_date then
      return 'REGISTRATION_EXPIRED';
    elsif v.registration_end_date <= (current_date + 1) then
      return 'REGISTRATION_EXPIRES_WITHIN_1_DAY';
    end if;
  end if;

  current_km := greatest(coalesce(v.current_odometer::numeric, 0), 0);
  interval_km := coalesce(v.service_interval_km::numeric, 0);

  if interval_km > 0 then
    if current_km = 0 then
      next_service_km := interval_km;
    else
      next_service_km := ceil(current_km / interval_km) * interval_km;
    end if;

    if current_km > 0 and current_km >= next_service_km then
      return 'SERVICE_OVERDUE';
    end if;
  end if;

  return null;
end;
$$;

grant execute on function public.vehicle_trip_block_reason(uuid) to authenticated;

-- 5) Make vehicle documents private at bucket level and restrict reads to authenticated operators.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
       set public = false
     where id = 'vehicle-docs';
  end if;
exception when others then
  raise notice 'Storage bucket privacy update skipped: %', sqlerrm;
end $$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists vehicle_docs_public_read on storage.objects;
    drop policy if exists vehicle_docs_read on storage.objects;

    create policy vehicle_docs_read
    on storage.objects for select to authenticated
    using (
      bucket_id = 'vehicle-docs'
      and (
        public.user_has_permission(auth.uid(), 'vehicles.read')
        or public.user_has_permission(auth.uid(), 'vehicles.read_all')
        or public.user_has_permission(auth.uid(), 'vehicles.read_department')
        or public.user_has_permission(auth.uid(), 'maintenance.read')
        or public.user_has_permission(auth.uid(), 'maintenance.read_all')
        or public.user_has_permission(auth.uid(), 'maintenance.read_department')
      )
    );
  end if;
exception when others then
  raise notice 'Storage object policy update skipped: %', sqlerrm;
end $$;
