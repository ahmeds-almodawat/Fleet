-- Odometer anomaly authority notification + audit coverage (non-breaking)

-- 1) Permission (who receives the odometer anomaly alerts)
INSERT INTO public.permissions (key, name, description, category)
VALUES
  (
    'alerts.odometer_anomaly',
    'Receive Odometer Anomaly Alerts',
    'Receive notifications when a trip start odometer differs from the last recorded vehicle odometer by more than 3 km.',
    'System'
  )
ON CONFLICT (key) DO NOTHING;

-- 2) Helper: create odometer anomaly notifications for authority users
CREATE OR REPLACE FUNCTION public.create_odometer_anomaly_alert(
  p_vehicle_id uuid,
  p_trip_id uuid,
  p_expected_km numeric,
  p_actual_km numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u record;
  title_en text := 'Odometer anomaly detected';
  title_ar text := 'تنبيه: اختلاف في قراءة العداد';
  body text;
BEGIN
  -- Bilingual, government tone. (We store one message; UI can display as-is.)
  body :=
    title_ar || ' / ' || title_en || E'\n'
    || 'Vehicle ID: ' || p_vehicle_id::text || E'\n'
    || 'Trip ID: ' || p_trip_id::text || E'\n'
    || 'Expected (last): ' || p_expected_km::text || ' km' || E'\n'
    || 'Actual (start): ' || p_actual_km::text || ' km' || E'\n'
    || 'Policy: allowed variance ≤ 3 km.';

  FOR u IN SELECT user_id FROM public.users_with_permission('alerts.odometer_anomaly')
  LOOP
    INSERT INTO public.notifications (recipient_id, title, body, severity, entity_type, entity_id)
    SELECT u.user_id, title_ar, body, 'WARN', 'trip', p_trip_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = u.user_id
        AND n.entity_type = 'trip'
        AND n.entity_id = p_trip_id
        AND n.title = title_ar
    );
  END LOOP;

  -- Audit event (best effort)
  BEGIN
    INSERT INTO public.audit_events (action, entity_type, entity_id, summary, metadata)
    VALUES (
      'trips.odometer_anomaly',
      'trip',
      p_trip_id,
      'Odometer anomaly alert generated',
      jsonb_build_object(
        'vehicle_id', p_vehicle_id,
        'expected_km', p_expected_km,
        'actual_km', p_actual_km,
        'threshold_km', 3
      )
    );
  EXCEPTION WHEN undefined_table THEN
    -- audit_events might not exist in some environments
    NULL;
  END;
END;
$$;

-- 3) Trigger: detect anomaly on trip creation (start)
CREATE OR REPLACE FUNCTION public.trg_detect_trip_start_odometer_anomaly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current numeric;
  v_diff numeric;
BEGIN
  -- Use vehicles.current_odometer as the authoritative "last recorded".
  SELECT current_odometer INTO v_current
  FROM public.vehicles
  WHERE id = NEW.vehicle_id;

  IF v_current IS NULL OR NEW.start_odometer_final_value IS NULL THEN
    RETURN NEW;
  END IF;

  v_diff := abs(NEW.start_odometer_final_value - v_current);

  IF v_diff > 3 THEN
    PERFORM public.create_odometer_anomaly_alert(
      NEW.vehicle_id,
      NEW.id,
      v_current,
      NEW.start_odometer_final_value
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS detect_trip_start_odometer_anomaly ON public.trips;
CREATE TRIGGER detect_trip_start_odometer_anomaly
AFTER INSERT ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.trg_detect_trip_start_odometer_anomaly();

-- 4) Enforce odometer photos are required (enterprise integrity)
-- Postgres does NOT support "ADD CONSTRAINT IF NOT EXISTS", so we use pg_constraint checks.
do $$
begin
  -- Start photo required always
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_start_odometer_photo_required'
  ) then
    alter table public.trips
      add constraint trips_start_odometer_photo_required
      check (
        start_odometer_photo_url is not null
        and length(start_odometer_photo_url) > 0
      );
  end if;

  -- End photo/value required when closed
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_end_odometer_photo_required_when_closed'
  ) then
    alter table public.trips
      add constraint trips_end_odometer_photo_required_when_closed
      check (
        status <> 'Closed'
        or (
          end_odometer_photo_url is not null
          and length(end_odometer_photo_url) > 0
          and end_odometer_value is not null
        )
      );
  end if;
end $$;
