-- Vehicle authority + per-vehicle-type odometer anomaly threshold (safe / non-breaking)
-- Fixes existing bad/null values BEFORE adding any CHECK constraints.

-- 1) Ensure the column exists (skip if already exists)
alter table public.vehicle_types
  add column if not exists default_anomaly_distance_threshold_km integer;

-- 2) Fix existing rows so constraint won't fail
-- Set NULL -> 3
update public.vehicle_types
set default_anomaly_distance_threshold_km = 3
where default_anomaly_distance_threshold_km is null;

-- Clamp anything out of range into 0..50 (safe)
update public.vehicle_types
set default_anomaly_distance_threshold_km =
  case
    when default_anomaly_distance_threshold_km < 0 then 0
    when default_anomaly_distance_threshold_km > 50 then 50
    else default_anomaly_distance_threshold_km
  end
where default_anomaly_distance_threshold_km < 0
   or default_anomaly_distance_threshold_km > 50;

-- 3) Set a default value going forward (non-breaking)
alter table public.vehicle_types
  alter column default_anomaly_distance_threshold_km set default 3;

-- 4) Add CHECK constraint safely (no "IF NOT EXISTS" for constraints; use pg_constraint)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicle_types_default_anomaly_distance_threshold_km_range'
  ) then
    alter table public.vehicle_types
      add constraint vehicle_types_default_anomaly_distance_threshold_km_range
      check (default_anomaly_distance_threshold_km between 0 and 50);
  end if;
end $$;

-- 5) Vehicles authority user (optional)
alter table public.vehicles
  add column if not exists authority_user_id uuid;

-- Add FK if profiles exists + FK not already added
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema='public' and table_name='profiles'
  ) then
    if not exists (
      select 1
      from information_schema.table_constraints
      where constraint_schema='public'
        and table_name='vehicles'
        and constraint_name='vehicles_authority_user_id_fkey'
    ) then
      alter table public.vehicles
        add constraint vehicles_authority_user_id_fkey
        foreign key (authority_user_id) references public.profiles(id)
        on delete set null;
    end if;
  end if;
end $$;
