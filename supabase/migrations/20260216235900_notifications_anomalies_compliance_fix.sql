-- 20260216235900_notifications_anomalies_compliance_fix.sql
-- Align notifications + anomaly/compliance to your actual schema
-- notifications columns: recipient_id,title,body,severity,entity_type,entity_id,is_read,created_at,read_at

-- ------------------------------------------------------------
-- 1) Notifications RLS (so UI can read + mark read)
-- ------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists "Read own notifications" on public.notifications;
create policy "Read own notifications"
on public.notifications
for select
to authenticated
using (recipient_id = auth.uid());

drop policy if exists "Update own notifications" on public.notifications;
create policy "Update own notifications"
on public.notifications
for update
to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

-- Helpful indexes
create index if not exists idx_notifications_recipient_unread
  on public.notifications (recipient_id, is_read, created_at desc);

create index if not exists idx_notifications_entity
  on public.notifications (entity_type, entity_id, created_at desc);

-- ------------------------------------------------------------
-- 2) Ensure trips anomaly columns exist
-- ------------------------------------------------------------
alter table public.trips
  add column if not exists anomaly_flag boolean not null default false,
  add column if not exists anomaly_reason text;

-- ------------------------------------------------------------
-- 3) Helper: insert notification (matches your table)
-- ------------------------------------------------------------
create or replace function public._notify(
  p_recipient uuid,
  p_title text,
  p_body text,
  p_severity public.notification_severity,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(recipient_id, title, body, severity, entity_type, entity_id)
  values (p_recipient, p_title, p_body, p_severity, p_entity_type, p_entity_id);
end;
$$;

-- Dedupe helper (same title+entity within 24h)
create or replace function public._notify_exists_24h(
  p_recipient uuid,
  p_title text,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.notifications n
    where n.recipient_id = p_recipient
      and n.title = p_title
      and n.entity_type = p_entity_type
      and n.entity_id = p_entity_id
      and n.created_at >= now() - interval '24 hours'
  );
end;
$$;

-- ------------------------------------------------------------
-- 4) Deadline notifications generator (REPLACE, still RETURNS INT)
--    Insurance / Registration / Scheduled Service
-- ------------------------------------------------------------
create or replace function public.generate_vehicle_deadline_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  notify_days int := 30;
  inserted_count int := 0;
  v record;
  u uuid;
  title text;
  body text;
  sev public.notification_severity;
  next_service_km numeric;
  notify_before_km numeric;
begin
  select coalesce((value->>'compliance_notify_days')::int, 30)
  into notify_days
  from public.app_settings
  where key = 'notifications';

  for v in
    select
      ve.id,
      ve.vehicle_code,
      ve.plate_no,
      ve.authority_user_id,
      ve.current_odometer,
      ve.insurance_end_date,
      ve.registration_end_date,
      coalesce(ve.service_interval_km, 10000) as service_interval_km,
      coalesce(ve.service_notify_before_km, 1000) as service_notify_before_km
    from public.vehicles ve
    where ve.status = 'Active'
  loop
    -- compute next service
    if v.current_odometer is not null and v.service_interval_km > 0 then
      next_service_km := ceil(v.current_odometer / v.service_interval_km) * v.service_interval_km;
    else
      next_service_km := null;
    end if;

    notify_before_km := coalesce(v.service_notify_before_km, 1000);

    -- emit up to 3 notifications per vehicle (insurance/reg/service)
    -- recipients: authority + users with permission alerts.compliance_deadlines
    for u in
      select distinct uu as user_id
      from (
        select v.authority_user_id as uu
        union
        select user_id from public.users_with_permission('alerts.compliance_deadlines')
      ) r
      where uu is not null
    loop
      -- INSURANCE
      title := null; body := null; sev := 'INFO';
      if v.insurance_end_date is not null and v.insurance_end_date < current_date then
        title := 'Insurance expired';
        body := format('Vehicle %s (%s): insurance expired on %s.', v.vehicle_code, v.plate_no, v.insurance_end_date);
        sev := 'BLOCKER';
      elsif v.insurance_end_date is not null and v.insurance_end_date <= current_date + notify_days then
        title := 'Insurance expiring soon';
        body := format('Vehicle %s (%s): insurance will expire on %s.', v.vehicle_code, v.plate_no, v.insurance_end_date);
        sev := 'WARN';
      end if;

      if title is not null and not public._notify_exists_24h(u, title, 'vehicle', v.id) then
        perform public._notify(u, title, body, sev, 'vehicle', v.id);
        inserted_count := inserted_count + 1;
      end if;

      -- REGISTRATION
      title := null; body := null; sev := 'INFO';
      if v.registration_end_date is not null and v.registration_end_date < current_date then
        title := 'Registration expired';
        body := format('Vehicle %s (%s): registration expired on %s.', v.vehicle_code, v.plate_no, v.registration_end_date);
        sev := 'BLOCKER';
      elsif v.registration_end_date is not null and v.registration_end_date <= current_date + notify_days then
        title := 'Registration expiring soon';
        body := format('Vehicle %s (%s): registration will expire on %s.', v.vehicle_code, v.plate_no, v.registration_end_date);
        sev := 'WARN';
      end if;

      if title is not null and not public._notify_exists_24h(u, title, 'vehicle', v.id) then
        perform public._notify(u, title, body, sev, 'vehicle', v.id);
        inserted_count := inserted_count + 1;
      end if;

      -- SERVICE
      title := null; body := null; sev := 'INFO';
      if next_service_km is not null and v.current_odometer is not null then
        if v.current_odometer >= next_service_km then
          title := 'Service overdue';
          body := format('Vehicle %s (%s): service overdue. Current %.0f km, due at %.0f km.',
                        v.vehicle_code, v.plate_no, v.current_odometer, next_service_km);
          sev := 'BLOCKER';
        elsif (next_service_km - v.current_odometer) <= notify_before_km and (next_service_km - v.current_odometer) > 0 then
          title := 'Service due soon';
          body := format('Vehicle %s (%s): service due soon. Current %.0f km, due at %.0f km.',
                        v.vehicle_code, v.plate_no, v.current_odometer, next_service_km);
          sev := 'WARN';
        end if;
      end if;

      if title is not null and not public._notify_exists_24h(u, title, 'vehicle', v.id) then
        perform public._notify(u, title, body, sev, 'vehicle', v.id);
        inserted_count := inserted_count + 1;
      end if;

    end loop;
  end loop;

  return inserted_count;
end;
$$;

-- ------------------------------------------------------------
-- 5) BEFORE INSERT anomaly trigger (fixes "sync trigger overwrote odometer")
-- ------------------------------------------------------------
create or replace function public.trg_detect_trip_start_odometer_anomaly()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_odometer numeric;
  new_odometer numeric;
  threshold numeric := 3;
  v_code text;
  v_plate text;
  authority_user uuid;
  diff numeric;
  msg text;
  sev public.notification_severity := 'WARN';
  u uuid;
begin
  if new.vehicle_id is null then
    return new;
  end if;

  new_odometer := coalesce(new.start_odometer_final_value, new.start_odometer_value);

  if new_odometer is null then
    return new;
  end if;

  -- read vehicle odometer BEFORE any AFTER triggers update it
  select
    ve.current_odometer,
    coalesce(vt.default_anomaly_distance_threshold_km, 3)::numeric,
    ve.vehicle_code,
    ve.plate_no,
    ve.authority_user_id
  into prev_odometer, threshold, v_code, v_plate, authority_user
  from public.vehicles ve
  left join public.vehicle_types vt on vt.id = ve.vehicle_type_id
  where ve.id = new.vehicle_id;

  if prev_odometer is null then
    return new;
  end if;

  diff := abs(new_odometer - prev_odometer);
  if diff <= threshold then
    return new;
  end if;

  if new_odometer < prev_odometer then
    sev := 'BLOCKER';
    msg := format('Odometer decreased (%.0f -> %.0f). Diff %.0f km (threshold %.0f km).',
                  prev_odometer, new_odometer, diff, threshold);
  else
    sev := 'WARN';
    msg := format('Odometer jump detected (%.0f -> %.0f). Diff %.0f km (threshold %.0f km).',
                  prev_odometer, new_odometer, diff, threshold);
  end if;

  -- flag trip row BEFORE insert
  new.anomaly_flag := true;
  new.anomaly_reason := msg;

  -- notify authority + permission users
  for u in
    select distinct uu as user_id
    from (
      select authority_user as uu
      union
      select user_id from public.users_with_permission('alerts.odometer_anomaly')
    ) r
    where uu is not null
  loop
    if not public._notify_exists_24h(u, 'Odometer anomaly detected', 'trip', new.id) then
      perform public._notify(
        u,
        'Odometer anomaly detected',
        format('Vehicle %s (%s): %s', coalesce(v_code,'?'), coalesce(v_plate,'?'), msg),
        sev,
        'trip',
        new.id
      );
    end if;
  end loop;

  return new;
end;
$$;

-- Attach trigger (BEFORE INSERT)
drop trigger if exists detect_trip_start_odometer_anomaly on public.trips;
drop trigger if exists trg_detect_trip_start_odometer_anomaly on public.trips;

create trigger trg_detect_trip_start_odometer_anomaly
before insert on public.trips
for each row
execute function public.trg_detect_trip_start_odometer_anomaly();

-- ------------------------------------------------------------
-- 6) Views for “Anomalies page” + “Compliance page”
-- ------------------------------------------------------------
create or replace view public.trip_anomalies_v as
select
  t.id,
  t.trip_no,
  t.created_at,
  t.vehicle_id,
  t.driver_user_id,
  t.requested_by_user_id,
  t.start_odometer_final_value,
  t.anomaly_flag,
  t.anomaly_reason,
  v.vehicle_code,
  v.plate_no
from public.trips t
left join public.vehicles v on v.id = t.vehicle_id
where t.anomaly_flag = true;

create or replace view public.vehicle_compliance_v as
select
  v.id as vehicle_id,
  v.vehicle_code,
  v.plate_no,
  v.current_odometer,
  v.insurance_end_date,
  v.registration_end_date,
  coalesce(v.service_interval_km, 10000) as service_interval_km,
  coalesce(v.service_notify_before_km, 1000) as service_notify_before_km,
  -- next service
  case
    when v.current_odometer is null or coalesce(v.service_interval_km,0) <= 0 then null
    else (ceil(v.current_odometer / coalesce(v.service_interval_km,10000)) * coalesce(v.service_interval_km,10000))
  end as next_service_km,
  -- flags
  (v.insurance_end_date is not null and v.insurance_end_date < current_date) as insurance_expired,
  (v.registration_end_date is not null and v.registration_end_date < current_date) as registration_expired,
  (
    case
      when v.current_odometer is null or coalesce(v.service_interval_km,0) <= 0 then false
      else v.current_odometer >= (ceil(v.current_odometer / coalesce(v.service_interval_km,10000)) * coalesce(v.service_interval_km,10000))
    end
  ) as service_overdue,
  -- anomaly count (recent)
  (
    select count(*)::int
    from public.trips t
    where t.vehicle_id = v.id
      and t.anomaly_flag = true
      and t.created_at >= now() - interval '30 days'
  ) as anomalies_30d
from public.vehicles v;
