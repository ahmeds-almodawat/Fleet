-- System Jobs Framework (enterprise-safe, optional)
-- Creates:
--   - system_jobs
--   - system_job_runs
-- Permissions:
--   - system.jobs.view
--   - system.jobs.run
-- RPCs:
--   - run_due_jobs(p_force boolean)  (service-role use recommended)
--   - admin_run_jobs(p_force boolean) (permission-gated for Admin UI)
--
-- Notes:
-- - This version matches your schema where:
--     roles has column "name" (not "key")
--     role_permissions uses (role_id, permission_id) (not permission_key)

-- 1) Tables
create table if not exists public.system_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  title text not null,
  description text null,
  is_enabled boolean not null default true,
  interval_minutes integer not null default 1440, -- daily by default
  last_run_at timestamptz null,
  last_status text null, -- 'success' | 'failed' | 'skipped'
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.system_jobs(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running', -- running|success|failed|skipped
  error text null,
  meta jsonb not null default '{}'::jsonb
);

-- 2) Update timestamp trigger (if you already have one, this is harmless)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_system_jobs_updated_at on public.system_jobs;
create trigger trg_system_jobs_updated_at
before update on public.system_jobs
for each row execute function public.set_updated_at();

-- 3) Permissions
insert into public.permissions (key, name, description, category)
values
  ('system.jobs.view', 'View System Jobs', 'View scheduled jobs and run history', 'System'),
  ('system.jobs.run',  'Run System Jobs',  'Manually run scheduled jobs',          'System')
on conflict (key) do nothing;

-- ✅ FIXED: Assign permissions to the "System Administrator" role (your schema uses roles.name)
do $$
declare
  v_role_id uuid;
begin
  select id
  into v_role_id
  from public.roles
  where name = 'System Administrator'
  limit 1;

  if v_role_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from public.permissions p
    where p.key in ('system.jobs.view','system.jobs.run')
    on conflict (role_id, permission_id) do nothing;
  end if;
end $$;

-- 4) RLS
alter table public.system_jobs enable row level security;
alter table public.system_job_runs enable row level security;

-- Read: permission-gated
drop policy if exists system_jobs_read on public.system_jobs;
create policy system_jobs_read
on public.system_jobs
for select
to authenticated
using (public.has_permission(auth.uid(), 'system.jobs.view'));

drop policy if exists system_job_runs_read on public.system_job_runs;
create policy system_job_runs_read
on public.system_job_runs
for select
to authenticated
using (public.has_permission(auth.uid(), 'system.jobs.view'));

-- Block writes from normal users (jobs should be created by migrations / admins only)
drop policy if exists system_jobs_write_block on public.system_jobs;
create policy system_jobs_write_block
on public.system_jobs
for all
to authenticated
using (false)
with check (false);

drop policy if exists system_job_runs_write_block on public.system_job_runs;
create policy system_job_runs_write_block
on public.system_job_runs
for all
to authenticated
using (false)
with check (false);

-- 5) Seed default job (reminders)
-- This job will run generate_vehicle_deadline_notifications()
insert into public.system_jobs (job_key, title, description, is_enabled, interval_minutes)
values
  ('reminders.generate', 'Generate deadline reminders', 'Generates insurance/registration/service reminder notifications', true, 1440)
on conflict (job_key) do nothing;

-- 6) Core runner (service-side): run_due_jobs(p_force boolean)
-- Recommended to call with SERVICE ROLE (Edge Function / cron / Task Scheduler)
create or replace function public.run_due_jobs(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_job record;
  v_run_id uuid;
  v_ran int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_features jsonb;
  v_reminders_enabled boolean := true;
begin
  -- Feature flag gate: app_settings key 'features' -> remindersEnabled
  select value into v_features
  from public.app_settings
  where key = 'features'
  limit 1;

  if v_features is not null and (v_features ? 'remindersEnabled') then
    v_reminders_enabled := coalesce((v_features->>'remindersEnabled')::boolean, true);
  end if;

  for v_job in
    select *
    from public.system_jobs
    where is_enabled = true
  loop
    -- Decide if due
    if not p_force then
      if v_job.last_run_at is not null then
        if v_now < (v_job.last_run_at + make_interval(mins => v_job.interval_minutes)) then
          v_skipped := v_skipped + 1;
          continue;
        end if;
      end if;
    end if;

    -- Start run record
    insert into public.system_job_runs (job_id, status, meta)
    values (v_job.id, 'running', jsonb_build_object('forced', p_force))
    returning id into v_run_id;

    begin
      -- Execute job by key
      if v_job.job_key = 'reminders.generate' then
        if v_reminders_enabled = false then
          update public.system_job_runs
          set status = 'skipped', finished_at = now(),
              meta = meta || jsonb_build_object('reason','remindersDisabled')
          where id = v_run_id;

          update public.system_jobs
          set last_run_at = now(),
              last_status = 'skipped',
              last_error = null
          where id = v_job.id;

          v_skipped := v_skipped + 1;
        else
          perform public.generate_vehicle_deadline_notifications();

          update public.system_job_runs
          set status = 'success', finished_at = now()
          where id = v_run_id;

          update public.system_jobs
          set last_run_at = now(),
              last_status = 'success',
              last_error = null
          where id = v_job.id;

          v_ran := v_ran + 1;
        end if;
      else
        -- Unknown job key (skip, but record)
        update public.system_job_runs
        set status = 'skipped', finished_at = now(),
            meta = meta || jsonb_build_object('reason','unknown_job_key')
        where id = v_run_id;

        update public.system_jobs
        set last_run_at = now(),
            last_status = 'skipped',
            last_error = null
        where id = v_job.id;

        v_skipped := v_skipped + 1;
      end if;

    exception when others then
      v_failed := v_failed + 1;

      update public.system_job_runs
      set status = 'failed', finished_at = now(),
          error = sqlerrm
      where id = v_run_id;

      update public.system_jobs
      set last_run_at = now(),
          last_status = 'failed',
          last_error = sqlerrm
      where id = v_job.id;
    end;
  end loop;

  return jsonb_build_object(
    'ran', v_ran,
    'skipped', v_skipped,
    'failed', v_failed
  );
end;
$$;

revoke all on function public.run_due_jobs(boolean) from public;
grant execute on function public.run_due_jobs(boolean) to service_role;

-- 7) Admin-trigger runner (UI): admin_run_jobs(p_force boolean)
create or replace function public.admin_run_jobs(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.has_permission(auth.uid(), 'system.jobs.run') is not true then
    raise exception 'No access';
  end if;

  -- Call core runner
  return public.run_due_jobs(p_force);
end;
$$;

revoke all on function public.admin_run_jobs(boolean) from public;
grant execute on function public.admin_run_jobs(boolean) to authenticated;
