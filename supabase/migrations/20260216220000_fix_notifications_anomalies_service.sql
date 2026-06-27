-- 20260216220000_fix_notifications_anomalies_service.sql
-- Fixes:
-- - generate_vehicle_deadline_notifications() stays RETURNS INT (no 42P13)
-- - Odometer anomaly uses NEW function name create_odometer_anomaly_alert_v2 (no param rename 42P13)
-- - Inserts notifications compatible with BOTH schemas (recipient_id/notification_type OR user_id/type)

-- -------------------------------------------------------
-- A) Permissions (safe)
-- -------------------------------------------------------
insert into public.permissions(key, name, category)
values
  ('alerts.compliance_deadlines', 'Compliance deadline alerts (insurance/registration/service)', 'Alerts'),
  ('alerts.odometer_anomaly', 'Odometer anomaly alerts', 'Alerts')
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('alerts.compliance_deadlines','alerts.odometer_anomaly')
where r.name in ('System Administrator','Fleet Manager')
on conflict do nothing;

-- -------------------------------------------------------
-- B) Ensure trips anomaly fields exist (safe)
-- -------------------------------------------------------
alter table public.trips
  add column if not exists anomaly_flag boolean not null default false,
  add column if not exists anomaly_reason text;

-- -------------------------------------------------------
-- C) Helper: insert notification (supports both schemas)
-- -------------------------------------------------------
create or replace function public._insert_notification_compat(
  p_user uuid,
  p_title text,
  p_body text,
  p_type text,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Preferred (newer) schema
  begin
    insert into public.notifications(recipient_id, title, body, notification_type, entity_type, entity_id)
    values (p_user, p_title, p_body, p_type, p_entity_type, p_entity_id);
    return;
  exception when undefined_column then
    -- fallthrough to old schema
    null;
  end;

  -- Older schema
  insert into public.notifications(user_id, title, body, type, entity_type, entity_id)
  values (p_user, p_title, p_body, p_type, p_entity_type, p_entity_id);
end;
$$;

-- -------------------------------------------------------
-- D) Helper: dedupe within last 24h (supports both schemas)
-- -------------------------------------------------------
create or replace function public._notification_exists_24h_compat(
  p_user uuid,
  p_type text,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  exists_flag boolean := false;
begin
  -- Preferred (newer) schema
  begin
    select exists(
      select 1 from public.notifications n
      where n.recipient_id = p_user
        and n.notification_type = p_type
        and n.entity_type = p_entity_type
        and n.entity_id = p_entity_id
        and n.created_at >= now() - interval '24 hours'
    )
    into exists_flag;
    return exists_flag;
  exception when undefined_column then
    null;
  end;

  -- Older schema
  select exists(
    select 1 from public.notifications n
    where n.user_id = p_user
      and n.type = p_type
      and n.entity_type = p_entity_type
      and n.entity_id = p_entity_id
      and n.created_at >= now() - interval '24 hours'
  )
  into exists_flag;

  return exists_flag;
end;
$$;

-- -------------------------------------------------------
-- E) Deadline notifications (KEEP RETURNS INT!)
-- -------------------------------------------------------
create or replace function public.generate_vehicle_deadline_notifications()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  notify_days int := 30;
  inserted_count int := 0;
  r record;
  u uuid;
begin
  select coalesce((value->>'compliance_notify_days')::int, 30)
  into notify_days
  from public.app_settings
  where key = 'notifications';

  for r in
    with v as (
      select
        id,
        vehicle_code,
        plate_no,
        authority_user_id,
        current_odometer,
        insurance_end_date,
        registration_end_date,
        service_interval_km,
        service_notify_before_km,
        case
          when service_interval_km is null or service_interval_km <= 0 or current_odometer is null then null
          else (ceil(current_odometer / service_interval_km) * service_interval_km)
        end as next_service_km
      from public.vehicles
      where status = 'Active'
    )
    select
      v.id as entity_id,
      'vehicle'::text as entity_type,

      -- title
      case
        when v.insurance_end_date is not null and v.insurance_end_date < current_date then 'Insurance expired'
        when v.insurance_end_date is not null and v.insurance_end_date <= current_date + notify_days then 'Insurance expiring soon'
        when v.registration_end_date is not null and v.registration_end_date < current_date then 'Registration expired'
        when v.registration_end_date is not null and v.registration_end_date <= current_date + notify_days then 'Registration expiring soon'
        when v.next_service_km is not null and v.current_odometer >= v.next_service_km then 'Service overdue'
        when v.next_service_km is not null
          and (v.next_service_km - v.current_odometer) <= coalesce(v.service_notify_before_km, 1000)
          and (v.next_service_km - v.current_odometer) > 0
          then 'Service due soon'
        else null
      end as title,

      -- body
      case
        when v.insurance_end_date is not null and v.insurance_end_date < current_date
          then format('Vehicle %s (%s): insurance expired on %s.', v.vehicle_code, v.plate_no, v.insurance_end_date)
        when v.insurance_end_date is not null and v.insurance_end_date <= current_date + notify_days
          then format('Vehicle %s (%s): insurance will expire on %s.', v.vehicle_code, v.plate_no, v.insurance_end_date)
        when v.registration_end_date is not null and v.registration_end_date < current_date
          then format('Vehicle %s (%s): registration expired on %s.', v.vehicle_code, v.plate_no, v.registration_end_date)
        when v.registration_end_date is not null and v.registration_end_date <= current_date + notify_days
          then format('Vehicle %s (%s): registration will expire on %s.', v.vehicle_code, v.plate_no, v.registration_end_date)
        when v.next_service_km is not null and v.current_odometer >= v.next_service_km
          then format('Vehicle %s (%s): service overdue. Current %.0f km, due at %.0f km.',
                      v.vehicle_code, v.plate_no, v.current_odometer, v.next_service_km)
        when v.next_service_km is not null
          and (v.next_service_km - v.current_odometer) <= coalesce(v.service_notify_before_km, 1000)
          and (v.next_service_km - v.current_odometer) > 0
          then format('Vehicle %s (%s): service due soon. Current %.0f km, due at %.0f km.',
                      v.vehicle_code, v.plate_no, v.current_odometer, v.next_service_km)
        else null
      end as body,

      -- type key
      case
        when v.insurance_end_date is not null and v.insurance_end_date < current_date then 'insurance_expired'
        when v.insurance_end_date is not null and v.insurance_end_date <= current_date + notify_days then 'insurance_expiring'
        when v.registration_end_date is not null and v.registration_end_date < current_date then 'registration_expired'
        when v.registration_end_date is not null and v.registration_end_date <= current_date + notify_days then 'registration_expiring'
        when v.next_service_km is not null and v.current_odometer >= v.next_service_km then 'service_overdue'
        when v.next_service_km is not null
          and (v.next_service_km - v.current_odometer) <= coalesce(v.service_notify_before_km, 1000)
          and (v.next_service_km - v.current_odometer) > 0
          then 'service_due_soon'
        else null
      end as ntype,

      v.authority_user_id
    from v
  loop
    if r.title is null then
      continue;
    end if;

    -- recipients = vehicle authority + users with permission alerts.compliance_deadlines
    for u in
      select distinct uu as user_id
      from (
        select r.authority_user_id as uu
        union
        select user_id from public.users_with_permission('alerts.compliance_deadlines')
      ) x
      where uu is not null
    loop
      if not public._notification_exists_24h_compat(u, r.ntype, r.entity_type, r.entity_id) then
        perform public._insert_notification_compat(u, r.title, r.body, r.ntype, r.entity_type, r.entity_id);
        inserted_count := inserted_count + 1;
      end if;
    end loop;
  end loop;

  return inserted_count;
end;
$$;

-- -------------------------------------------------------
-- F) Odometer anomaly (NEW NAME to avoid param rename error)
-- Uses vehicle_types.default_anomaly_distance_threshold_km
-- -------------------------------------------------------
create or replace function public.create_odometer_anomaly_alert_v2(
  p_trip_id uuid,
  p_vehicle_id uuid,
  p_prev_odometer numeric,
  p_new_odometer numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  diff numeric;
  threshold numeric := 3;
  v_code text;
  v_plate text;
  authority_user uuid;
  msg text;
  u uuid;
begin
  if p_prev_odometer is null or p_new_odometer is null then
    return;
  end if;

  select
    coalesce(vt.default_anomaly_distance_threshold_km, 3)::numeric,
    ve.vehicle_code,
    ve.plate_no,
    ve.authority_user_id
  into threshold, v_code, v_plate, authority_user
  from public.vehicles ve
  left join public.vehicle_types vt on vt.id = ve.vehicle_type_id
  where ve.id = p_vehicle_id;

  diff := abs(p_new_odometer - p_prev_odometer);

  if diff <= threshold then
    return;
  end if;

  if p_new_odometer < p_prev_odometer then
    msg := format('Odometer decreased (%.0f -> %.0f). Diff %.0f km (threshold %.0f km).',
                  p_prev_odometer, p_new_odometer, diff, threshold);
  else
    msg := format('Odometer jump detected (%.0f -> %.0f). Diff %.0f km (threshold %.0f km).',
                  p_prev_odometer, p_new_odometer, diff, threshold);
  end if;

  update public.trips
  set anomaly_flag = true,
      anomaly_reason = msg
  where id = p_trip_id;

  for u in
    select distinct uu as user_id
    from (
      select authority_user as uu
      union
      select user_id from public.users_with_permission('alerts.odometer_anomaly')
    ) x
    where uu is not null
  loop
    if not public._notification_exists_24h_compat(u, 'odometer_anomaly', 'trip', p_trip_id) then
      perform public._insert_notification_compat(
        u,
        'Odometer anomaly detected',
        format('Vehicle %s (%s): %s', coalesce(v_code,'?'), coalesce(v_plate,'?'), msg),
        'odometer_anomaly',
        'trip',
        p_trip_id
      );
    end if;
  end loop;

end;
$$;

-- -------------------------------------------------------
-- G) Trigger: detect anomaly after trip insert (calls v2)
-- -------------------------------------------------------
create or replace function public.detect_trip_start_odometer_anomaly_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_odometer numeric;
begin
  if new.vehicle_id is null or new.start_odometer_final_value is null then
    return new;
  end if;

  select current_odometer
  into prev_odometer
  from public.vehicles
  where id = new.vehicle_id;

  if prev_odometer is null then
    return new;
  end if;

  perform public.create_odometer_anomaly_alert_v2(
    new.id,
    new.vehicle_id,
    prev_odometer,
    new.start_odometer_final_value
  );

  return new;
end;
$$;

drop trigger if exists detect_trip_start_odometer_anomaly on public.trips;
create trigger detect_trip_start_odometer_anomaly
after insert on public.trips
for each row
execute function public.detect_trip_start_odometer_anomaly_v2();
