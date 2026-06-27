-- Update 04: health audit + release guardrails.
-- Safe additive migration. Adds a permission-gated DB health RPC used by /admin/health.

insert into public.permissions (key, name, description, category)
values
  ('system.health.view', 'View System Health', 'View production-readiness health checks', 'System')
on conflict (key) do nothing;

-- System Administrator gets health permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'System Administrator'
  and p.key = 'system.health.view'
on conflict do nothing;

-- Any role that can view system jobs can also view health checks.
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_health.id
from public.role_permissions rp
join public.permissions p_jobs on p_jobs.id = rp.permission_id and p_jobs.key = 'system.jobs.view'
cross join public.permissions p_health
where p_health.key = 'system.health.view'
on conflict do nothing;

create or replace function public.admin_system_health_check()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  checks jsonb := '[]'::jsonb;
  environment_mode text;
  vehicle_docs_public boolean;
  missing_permissions text[];
  missing_relations text[];
  missing_functions text[];
  critical_failures integer;
  warning_failures integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if public.has_permission(auth.uid(), 'system.health.view') is not true
     and public.has_permission(auth.uid(), 'system.jobs.view') is not true then
    raise exception 'Insufficient privileges for system health check' using errcode = '42501';
  end if;

  select value ->> 'mode'
  into environment_mode
  from public.app_settings
  where key = 'environment';

  checks := checks || jsonb_build_array(jsonb_build_object(
    'key', 'environment_mode',
    'label', 'Environment mode is production',
    'ok', coalesce(environment_mode, '') = 'production',
    'severity', 'critical',
    'detail', coalesce('Current mode: ' || environment_mode, 'Missing app_settings.environment')
  ));

  select b.public
  into vehicle_docs_public
  from storage.buckets b
  where b.id = 'vehicle-docs';

  checks := checks || jsonb_build_array(jsonb_build_object(
    'key', 'vehicle_docs_private',
    'label', 'vehicle-docs bucket is private',
    'ok', vehicle_docs_public is false,
    'severity', 'critical',
    'detail', case
      when vehicle_docs_public is false then 'vehicle-docs is private.'
      when vehicle_docs_public is true then 'vehicle-docs is public. Change it to private.'
      else 'vehicle-docs bucket was not found.'
    end
  ));

  select coalesce(array_agg(required_key), array[]::text[])
  into missing_permissions
  from unnest(array[
    'system.jobs.view',
    'system.jobs.run',
    'system.health.view',
    'system.backup.export',
    'audit.read',
    'vehicles.read',
    'trips.create',
    'maintenance.read',
    'reports.view'
  ]) as required_key
  where not exists (
    select 1 from public.permissions p where p.key = required_key
  );

  checks := checks || jsonb_build_array(jsonb_build_object(
    'key', 'required_permissions',
    'label', 'Required permissions exist',
    'ok', cardinality(missing_permissions) = 0,
    'severity', 'critical',
    'detail', case
      when cardinality(missing_permissions) = 0 then 'All required permissions exist.'
      else 'Missing permissions: ' || array_to_string(missing_permissions, ', ')
    end
  ));

  select coalesce(array_agg(required_relation), array[]::text[])
  into missing_relations
  from unnest(array[
    'public.vehicles',
    'public.trips',
    'public.vehicle_maintenance',
    'public.notifications',
    'public.audit_events',
    'public.system_jobs',
    'public.system_job_runs',
    'public.app_settings'
  ]) as required_relation
  where to_regclass(required_relation) is null;

  checks := checks || jsonb_build_array(jsonb_build_object(
    'key', 'required_relations',
    'label', 'Required tables exist',
    'ok', cardinality(missing_relations) = 0,
    'severity', 'critical',
    'detail', case
      when cardinality(missing_relations) = 0 then 'All required tables exist.'
      else 'Missing tables: ' || array_to_string(missing_relations, ', ')
    end
  ));

  select coalesce(array_agg(required_function), array[]::text[])
  into missing_functions
  from unnest(array[
    'public.vehicle_trip_block_reason(uuid)',
    'public.admin_export_backup()',
    'public.run_due_jobs(boolean)',
    'public.generate_vehicle_deadline_notifications()'
  ]) as required_function
  where to_regprocedure(required_function) is null;

  checks := checks || jsonb_build_array(jsonb_build_object(
    'key', 'required_functions',
    'label', 'Required RPC functions exist',
    'ok', cardinality(missing_functions) = 0,
    'severity', 'critical',
    'detail', case
      when cardinality(missing_functions) = 0 then 'All required RPC functions exist.'
      else 'Missing RPC functions: ' || array_to_string(missing_functions, ', ')
    end
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'key', 'backup_table_names',
    'label', 'Legacy maintenance table names are absent',
    'ok', to_regclass('public.maintenance') is null and to_regclass('public.maintenance_records') is null,
    'severity', 'warning',
    'detail', case
      when to_regclass('public.maintenance') is null and to_regclass('public.maintenance_records') is null then
        'No legacy maintenance/maintenance_records tables detected.'
      else
        'Legacy maintenance table names exist; verify backup/reset RPCs use vehicle_maintenance.'
    end
  ));

  select count(*)
  into critical_failures
  from jsonb_array_elements(checks) as item
  where (item ->> 'ok')::boolean is false
    and item ->> 'severity' = 'critical';

  select count(*)
  into warning_failures
  from jsonb_array_elements(checks) as item
  where (item ->> 'ok')::boolean is false
    and coalesce(item ->> 'severity', 'warning') <> 'critical';

  return jsonb_build_object(
    'ok', critical_failures = 0 and warning_failures = 0,
    'generated_at', now(),
    'critical_failures', critical_failures,
    'warning_failures', warning_failures,
    'checks', checks
  );
end;
$$;

grant execute on function public.admin_system_health_check() to authenticated;
