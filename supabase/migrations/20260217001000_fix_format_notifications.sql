-- 20260217001000_fix_format_notifications.sql
-- Fix Postgres format() usage: remove %.0f and use %s with integer casts
-- This prevents trip insert from failing (22023).

-- Helper: format km numbers safely as integer text
create or replace function public._km(n numeric)
returns text
language sql
immutable
as $$
  select case
    when n is null then null
    else (round(n)::bigint)::text
  end
$$;

-- Fix your deadline generator (it MUST remain RETURNS integer)
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
    if v.current_odometer is not null and v.service_interval_km > 0 then
      next_service_km := ceil(v.current_odometer / v.service_interval_km) * v.service_interval_km;
    else
      next_service_km := null;
    end if;

    notify_before_km := coalesce(v.service_notify_before_km, 1000);

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
        body := format('Vehicle %s (%s): insurance expired on %s.',
                       v.vehicle_code, v.plate_no, v.insurance_end_date);
        sev := 'BLOCKER';
      elsif v.insurance_end_date is not null and v.insurance_end_date <= current_date + notify_days then
        title := 'Insurance expiring soon';
        body := format('Vehicle %s (%s): insurance will expire on %s.',
                       v.vehicle_code, v.plate_no, v.insurance_end_date);
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
        body := format('Vehicle %s (%s): registration expired on %s.',
                       v.vehicle_code, v.plate_no, v.registration_end_date);
        sev := 'BLOCKER';
      elsif v.registration_end_date is not null and v.registration_end_date <= current_date + notify_days then
        title := 'Registration expiring soon';
        body := format('Vehicle %s (%s): registration will expire on %s.',
                       v.vehicle_code, v.plate_no, v.registration_end_date);
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
          body := format(
            'Vehicle %s (%s): service overdue. Current %s km, due at %s km.',
            v.vehicle_code, v.plate_no, public._km(v.current_odometer), public._km(next_service_km)
          );
          sev := 'BLOCKER';
        elsif (next_service_km - v.current_odometer) <= notify_before_km
           and (next_service_km - v.current_odometer) > 0 then
          title := 'Service due soon';
          body := format(
            'Vehicle %s (%s): service due soon. Current %s km, due at %s km.',
            v.vehicle_code, v.plate_no, public._km(v.current_odometer), public._km(next_service_km)
          );
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

-- Fix the BEFORE INSERT anomaly trigger function (this is what blocks trip insert)
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
    msg := format(
      'Odometer decreased (%s -> %s). Diff %s km (threshold %s km).',
      public._km(prev_odometer), public._km(new_odometer), public._km(diff), public._km(threshold)
    );
  else
    sev := 'WARN';
    msg := format(
      'Odometer jump detected (%s -> %s). Diff %s km (threshold %s km).',
      public._km(prev_odometer), public._km(new_odometer), public._km(diff), public._km(threshold)
    );
  end if;

  new.anomaly_flag := true;
  new.anomaly_reason := msg;

  -- Notifications must NEVER block trip insert
  begin
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
  exception when others then
    null;
  end;

  return new;
end;
$$;

-- Ensure trigger is attached to the fixed function
drop trigger if exists trg_detect_trip_start_odometer_anomaly on public.trips;

create trigger trg_detect_trip_start_odometer_anomaly
before insert on public.trips
for each row
execute function public.trg_detect_trip_start_odometer_anomaly();
