-- Adds missing vehicle_types default service columns expected by the UI and compliance logic.
-- Safe to run on existing databases.

alter table public.vehicle_types
  add column if not exists default_service_interval_km numeric,
  add column if not exists default_service_notify_before_km numeric;

-- Backfill from legacy column names if they exist (older schemas).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicle_types'
      and column_name = 'service_interval_km'
  ) then
    execute $sql$
      update public.vehicle_types
      set default_service_interval_km = coalesce(default_service_interval_km, service_interval_km)
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicle_types'
      and column_name = 'service_notify_before_km'
  ) then
    execute $sql$
      update public.vehicle_types
      set default_service_notify_before_km = coalesce(default_service_notify_before_km, service_notify_before_km)
    $sql$;
  end if;
end;
$$;

-- Ensure sensible defaults for active types (enterprise requirement: every type should have service thresholds).
update public.vehicle_types
set
  default_service_interval_km = coalesce(default_service_interval_km, 10000),
  default_service_notify_before_km = coalesce(default_service_notify_before_km, 1000)
where coalesce(active, true) = true;

-- Ask PostgREST to refresh schema cache quickly (best-effort).
select pg_notify('pgrst', 'reload schema');
