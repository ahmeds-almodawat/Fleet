-- Notifications + profile auto-create + trip requester/driver optional + enforcement rules

-- 1) Auto-create profile row on signup (uses auth.users.raw_user_meta_data)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, staff_id, name_en, name_ar, job_title, phone, department_id, active, created_at, updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'staff_id', 'TEMP-' || LEFT(NEW.id::text, 8)),
    COALESCE(NEW.raw_user_meta_data->>'name_en', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'name_ar', 'مستخدم جديد'),
    COALESCE(NEW.raw_user_meta_data->>'job_title', 'Employee'),
    NEW.raw_user_meta_data->>'phone',
    NULL,
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_profile();

-- 2) Notifications table + enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_severity') THEN
    CREATE TYPE public.notification_severity AS ENUM ('INFO', 'WARN', 'BLOCKER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  severity public.notification_severity NOT NULL DEFAULT 'INFO',
  entity_type text,
  entity_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 3) RLS policies
DROP POLICY IF EXISTS "Read own notifications" ON public.notifications;
CREATE POLICY "Read own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Update own notifications" ON public.notifications;
CREATE POLICY "Update own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

-- 4) Trip requester enhancements (driver optional)
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS requested_driver_id uuid REFERENCES public.profiles(id);

-- 5) Permissions helper (list users with a permission)
-- NOTE: assumes you already have user_has_permission(user_id, perm_key) and profiles table
CREATE OR REPLACE FUNCTION public.users_with_permission(p_perm text)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id AS user_id
  FROM public.profiles p
  WHERE public.user_has_permission(p.id, p_perm) = true
$$;

GRANT EXECUTE ON FUNCTION public.users_with_permission(text) TO authenticated;

-- 6) Notification generator RPC (insurance/registration expiring within 30 days; blockers within 1 day)
CREATE OR REPLACE FUNCTION public.generate_vehicle_deadline_notifications()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  u record;
  inserted_count int := 0;
  last_rowcount int := 0;
  title text;
  body text;
  sev public.notification_severity;
BEGIN
  -- recipients: approvers + settings managers + vehicle editors
  FOR r IN
    SELECT v.*
    FROM public.vehicles v
  LOOP
    -- Insurance 30-day warning
    IF r.insurance_end_date IS NOT NULL
      AND r.insurance_end_date >= CURRENT_DATE
      AND r.insurance_end_date <= (CURRENT_DATE + 30)
    THEN
      title := 'Insurance expiring soon';
      body := 'Vehicle ' || r.plate_number || ' insurance ends on ' || r.insurance_end_date::text;
      sev := 'WARN';
      IF r.insurance_end_date <= (CURRENT_DATE + 1) THEN
        sev := 'BLOCKER';
      END IF;

      FOR u IN
        SELECT user_id FROM public.users_with_permission('settings.manage')
        UNION SELECT user_id FROM public.users_with_permission('trips.approve')
        UNION SELECT user_id FROM public.users_with_permission('vehicles.edit')
      LOOP
        INSERT INTO public.notifications (recipient_id, title, body, severity, entity_type, entity_id)
        SELECT u.user_id, title, body, sev, 'vehicle', r.id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.recipient_id = u.user_id
            AND n.entity_type = 'vehicle'
            AND n.entity_id = r.id
            AND n.title = title
            AND n.created_at::date = CURRENT_DATE
        );

        GET DIAGNOSTICS last_rowcount = ROW_COUNT;
        inserted_count := inserted_count + last_rowcount;
      END LOOP;
    END IF;

    -- Registration 30-day warning
    IF r.registration_end_date IS NOT NULL
      AND r.registration_end_date >= CURRENT_DATE
      AND r.registration_end_date <= (CURRENT_DATE + 30)
    THEN
      title := 'Registration expiring soon';
      body := 'Vehicle ' || r.plate_number || ' registration ends on ' || r.registration_end_date::text;
      sev := 'WARN';
      IF r.registration_end_date <= (CURRENT_DATE + 1) THEN
        sev := 'BLOCKER';
      END IF;

      FOR u IN
        SELECT user_id FROM public.users_with_permission('settings.manage')
        UNION SELECT user_id FROM public.users_with_permission('trips.approve')
        UNION SELECT user_id FROM public.users_with_permission('vehicles.edit')
      LOOP
        INSERT INTO public.notifications (recipient_id, title, body, severity, entity_type, entity_id)
        SELECT u.user_id, title, body, sev, 'vehicle', r.id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.recipient_id = u.user_id
            AND n.entity_type = 'vehicle'
            AND n.entity_id = r.id
            AND n.title = title
            AND n.created_at::date = CURRENT_DATE
        );

        GET DIAGNOSTICS last_rowcount = ROW_COUNT;
        inserted_count := inserted_count + last_rowcount;
      END LOOP;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_vehicle_deadline_notifications() TO authenticated;

-- 7) Notifications helpers
CREATE OR REPLACE FUNCTION public.get_unread_notifications_count()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.notifications
  WHERE recipient_id = auth.uid()
    AND is_read = false
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_notifications_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c int;
BEGIN
  UPDATE public.notifications
  SET is_read = true, read_at = now()
  WHERE recipient_id = auth.uid()
    AND is_read = false;

  GET DIAGNOSTICS c = ROW_COUNT;
  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- 8) DB-level enforcement: block trip insert if vehicle is blocked (expired docs / service overdue)
CREATE OR REPLACE FUNCTION public.enforce_vehicle_trip_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reason text;
BEGIN
  IF NEW.vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  reason := public.vehicle_trip_block_reason(NEW.vehicle_id);

  IF reason IS NOT NULL THEN
    RAISE EXCEPTION 'Vehicle is blocked: %', reason
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vehicle_trip_block ON public.trips;

CREATE TRIGGER trg_enforce_vehicle_trip_block
BEFORE INSERT ON public.trips
FOR EACH ROW
EXECUTE PROCEDURE public.enforce_vehicle_trip_block();
