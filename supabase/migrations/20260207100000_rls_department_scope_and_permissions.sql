-- Department-scoped RLS hardening (vehicles, trips, maintenance)
-- Adds optional "read_all" and "read_department" permissions and upgrades policies.

-- 1) Helper to get current user's department
create or replace function public.current_user_department_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_user_department_id() to authenticated;

-- 2) New optional permissions (non-breaking)
insert into public.permissions (key, name, description, category) values
  ('vehicles.read_department', 'View Department Vehicles', 'View vehicles within the user''s department', 'Vehicles'),
  ('vehicles.read_all', 'View All Vehicles', 'View all vehicles across all departments', 'Vehicles'),
  ('trips.read_department', 'View Department Trips', 'View trips within the user''s department', 'Trips'),
  ('maintenance.read_department', 'View Department Maintenance', 'View maintenance within the user''s department', 'Maintenance'),
  ('maintenance.read_all', 'View All Maintenance', 'View all maintenance across all departments', 'Maintenance')
on conflict (key) do nothing;

-- Give new permissions to System Administrator by default
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'vehicles.read_department','vehicles.read_all','trips.read_department','maintenance.read_department','maintenance.read_all'
)
where r.name = 'System Administrator'
on conflict do nothing;

-- Give department-scope permissions to Fleet Manager and Approver by default
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('vehicles.read_department','trips.read_department','maintenance.read_department')
where r.name in ('Fleet Manager','Approver')
on conflict do nothing;

-- 3) Vehicles RLS upgrade
drop policy if exists "Read vehicles with permission" on public.vehicles;
create policy "Read vehicles (scoped)" on public.vehicles
for select to authenticated
using (
  public.user_has_permission(auth.uid(), 'vehicles.read')
  and (
    public.user_has_permission(auth.uid(), 'vehicles.read_all')
    or public.user_has_permission(auth.uid(), 'vehicles.read_department') and (
      department_id is null or department_id = public.current_user_department_id()
    )
    or (not public.user_has_permission(auth.uid(), 'vehicles.read_all') and not public.user_has_permission(auth.uid(), 'vehicles.read_department'))
  )
);

-- Replace broad ALL-policy with operation-specific policies (prevents accidental global read)
drop policy if exists "Manage vehicles" on public.vehicles;
drop policy if exists "Create vehicles" on public.vehicles;
drop policy if exists "Update vehicles" on public.vehicles;
drop policy if exists "Delete vehicles" on public.vehicles;

-- Insert
create policy "Create vehicles" on public.vehicles
for insert to authenticated
with check (
  public.user_has_permission(auth.uid(), 'vehicles.create')
  and (
    public.user_has_permission(auth.uid(), 'vehicles.read_all')
    or (public.user_has_permission(auth.uid(), 'vehicles.read_department') and (department_id is null or department_id = public.current_user_department_id()))
    or (not public.user_has_permission(auth.uid(), 'vehicles.read_all') and not public.user_has_permission(auth.uid(), 'vehicles.read_department'))
  )
);

-- Update
create policy "Update vehicles" on public.vehicles
for update to authenticated
using (public.user_has_permission(auth.uid(), 'vehicles.edit'))
with check (
  public.user_has_permission(auth.uid(), 'vehicles.edit')
  and (
    public.user_has_permission(auth.uid(), 'vehicles.read_all')
    or (public.user_has_permission(auth.uid(), 'vehicles.read_department') and (department_id is null or department_id = public.current_user_department_id()))
    or (not public.user_has_permission(auth.uid(), 'vehicles.read_all') and not public.user_has_permission(auth.uid(), 'vehicles.read_department'))
  )
);

-- Delete
create policy "Delete vehicles" on public.vehicles
for delete to authenticated
using (
  public.user_has_permission(auth.uid(), 'vehicles.delete')
  and (
    public.user_has_permission(auth.uid(), 'vehicles.read_all')
    or (public.user_has_permission(auth.uid(), 'vehicles.read_department') and (department_id is null or department_id = public.current_user_department_id()))
    or (not public.user_has_permission(auth.uid(), 'vehicles.read_all') and not public.user_has_permission(auth.uid(), 'vehicles.read_department'))
  )
);

-- 4) Trips RLS upgrade (select only; keep existing create/update policies compatible)
drop policy if exists "Read all trips with permission" on public.trips;
create policy "Read trips (scoped)" on public.trips
for select to authenticated
using (
  public.user_has_permission(auth.uid(), 'trips.read_all')
  or (
    public.user_has_permission(auth.uid(), 'trips.read_department')
    and (department_id is null or department_id = public.current_user_department_id())
  )
  or driver_user_id = auth.uid()
  or coalesce(requested_by_user_id, requested_by) = auth.uid()
);

-- 5) Maintenance RLS upgrade
drop policy if exists "Read vehicle_maintenance with permission" on public.vehicle_maintenance;
create policy "Read vehicle_maintenance (scoped)" on public.vehicle_maintenance
for select to authenticated
using (
  public.user_has_permission(auth.uid(), 'maintenance.read')
  and (
    public.user_has_permission(auth.uid(), 'maintenance.read_all')
    or (
      public.user_has_permission(auth.uid(), 'maintenance.read_department')
      and exists (
        select 1
        from public.vehicles v
        where v.id = vehicle_id
          and (v.department_id is null or v.department_id = public.current_user_department_id())
      )
    )
    or (not public.user_has_permission(auth.uid(), 'maintenance.read_all') and not public.user_has_permission(auth.uid(), 'maintenance.read_department'))
  )
);
