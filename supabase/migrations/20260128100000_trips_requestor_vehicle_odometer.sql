-- Fleet Guardian
-- Add requestor tracking for trips + permission to request trips for others
-- + keep vehicles.current_odometer synced from trip start/end odometer

-- ============================
-- 1) Trips: requestor (who created the request)
-- ============================
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES public.profiles(id);

-- Backfill for existing trips
UPDATE public.trips
SET requested_by_user_id = driver_user_id
WHERE requested_by_user_id IS NULL;

-- ============================
-- 2) Permission: trips.request_for_others
-- ============================
DO $$
DECLARE
  has_name boolean;
  has_category boolean;
  has_description boolean;
BEGIN
  -- Some installations enforce NOT NULL on (name/category/description). Insert only the columns that exist,
  -- but always provide values for the common NOT NULL columns.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='permissions' AND column_name='name'
  ) INTO has_name;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='permissions' AND column_name='category'
  ) INTO has_category;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='permissions' AND column_name='description'
  ) INTO has_description;

  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = 'trips.request_for_others') THEN
    IF has_name AND has_category AND has_description THEN
      INSERT INTO public.permissions (key, name, category, description)
      VALUES ('trips.request_for_others', 'Request trips for others', 'Trips', 'Create trip requests on behalf of another driver');
    ELSIF has_description AND has_name THEN
      INSERT INTO public.permissions (key, name, description)
      VALUES ('trips.request_for_others', 'Request trips for others', 'Create trip requests on behalf of another driver');
    ELSIF has_description THEN
      INSERT INTO public.permissions (key, description)
      VALUES ('trips.request_for_others', 'Create trip requests on behalf of another driver');
    ELSE
      INSERT INTO public.permissions (key)
      VALUES ('trips.request_for_others');
    END IF;
  END IF;
END $$;


-- grant to common roles (safe if already granted)
DO $$
DECLARE
  p_id uuid;
  r_admin uuid;
  r_fm uuid;
BEGIN
  SELECT id INTO p_id FROM public.permissions WHERE key = 'trips.request_for_others' LIMIT 1;
  SELECT id INTO r_admin FROM public.roles WHERE name = 'System Administrator' LIMIT 1;
  SELECT id INTO r_fm FROM public.roles WHERE name = 'Fleet Manager' LIMIT 1;

  IF p_id IS NOT NULL AND r_admin IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_admin, p_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r_admin AND rp.permission_id = p_id
    );
  END IF;

  IF p_id IS NOT NULL AND r_fm IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_fm, p_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r_fm AND rp.permission_id = p_id
    );
  END IF;
END $$;

-- ============================
-- 3) Update Trips RLS to include requestor
-- ============================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='trips' AND policyname='Read all trips with permission'
  ) THEN
    DROP POLICY "Read all trips with permission" ON public.trips;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='trips' AND policyname='Read own trips'
  ) THEN
    DROP POLICY "Read own trips" ON public.trips;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='trips' AND policyname='Create trips'
  ) THEN
    DROP POLICY "Create trips" ON public.trips;
  END IF;
END $$;

-- Drivers can read trips they drive OR trips they requested
CREATE POLICY "Read own trips" ON public.trips
  FOR SELECT TO authenticated
  USING (
    driver_user_id = auth.uid()
    OR requested_by_user_id = auth.uid()
  );

-- Approvers/admin can read all
CREATE POLICY "Read all trips with permission" ON public.trips
  FOR SELECT TO authenticated
  USING (
    public.user_has_permission(auth.uid(), 'trips.read')
    OR public.user_has_permission(auth.uid(), 'trips.approve')
  );

-- Insert: either creating for yourself OR you have trips.request_for_others
CREATE POLICY "Create trips" ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      driver_user_id = auth.uid()
      AND requested_by_user_id = auth.uid()
    )
    OR (
      requested_by_user_id = auth.uid()
      AND public.user_has_permission(auth.uid(), 'trips.request_for_others')
    )
  );

-- ============================
-- 4) Keep vehicles.current_odometer synced
-- ============================
CREATE OR REPLACE FUNCTION public.sync_vehicle_odometer_from_trip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current numeric;
  v_new numeric;
BEGIN
  -- pick the best available odometer value from the trip
  v_new := NULL;

  IF NEW.end_odometer_final_value IS NOT NULL THEN
    v_new := NEW.end_odometer_final_value;
  ELSIF NEW.start_odometer_final_value IS NOT NULL THEN
    v_new := NEW.start_odometer_final_value;
  END IF;

  IF v_new IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT current_odometer INTO v_current
  FROM public.vehicles
  WHERE id = NEW.vehicle_id
  FOR UPDATE;

  UPDATE public.vehicles
  SET current_odometer = GREATEST(COALESCE(v_current, 0), COALESCE(v_new, 0)),
      updated_at = now()
  WHERE id = NEW.vehicle_id;

  RETURN NEW;
END;
$$;

-- Trigger (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trips_sync_vehicle_odometer') THEN
    DROP TRIGGER trips_sync_vehicle_odometer ON public.trips;
  END IF;
END $$;

CREATE TRIGGER trips_sync_vehicle_odometer
AFTER INSERT OR UPDATE OF start_odometer_final_value, end_odometer_final_value
ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.sync_vehicle_odometer_from_trip();

GRANT EXECUTE ON FUNCTION public.sync_vehicle_odometer_from_trip() TO authenticated;
