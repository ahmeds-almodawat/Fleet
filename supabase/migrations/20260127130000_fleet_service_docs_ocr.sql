-- Fleet Guardian: Service/Insurance/Registration blocks + OCR scaffolding

-- ============================
-- VEHICLES: add service + documents fields
-- ============================
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS service_interval_km INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS service_notify_before_km INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS insurance_policy_no TEXT,
  ADD COLUMN IF NOT EXISTS insurance_start_date DATE,
  ADD COLUMN IF NOT EXISTS insurance_end_date DATE,
  ADD COLUMN IF NOT EXISTS registration_no TEXT,
  ADD COLUMN IF NOT EXISTS registration_end_date DATE,
  ADD COLUMN IF NOT EXISTS vin TEXT,
  ADD COLUMN IF NOT EXISTS make TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS color TEXT;

-- ============================
-- TRIPS: add OCR/dispute fields (non-breaking; keeps existing columns)
-- ============================
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS start_odometer_extracted_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS start_odometer_ocr_confidence NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS start_odometer_ocr_raw_text TEXT,
  ADD COLUMN IF NOT EXISTS start_odometer_final_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS start_odometer_disputed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS start_odometer_claimed_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS end_odometer_extracted_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS end_odometer_ocr_confidence NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS end_odometer_ocr_raw_text TEXT,
  ADD COLUMN IF NOT EXISTS end_odometer_final_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS end_odometer_disputed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS end_odometer_claimed_value NUMERIC(12,2);

-- ============================
-- ODOMETER DISPUTES
-- ============================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'odometer_stage') THEN
    CREATE TYPE public.odometer_stage AS ENUM ('START', 'END');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispute_status') THEN
    CREATE TYPE public.dispute_status AS ENUM ('OPEN', 'RESOLVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.odometer_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stage public.odometer_stage NOT NULL,
  extracted_value NUMERIC(12,2),
  claimed_value NUMERIC(12,2),
  reason TEXT,
  status public.dispute_status NOT NULL DEFAULT 'OPEN',
  resolved_value NUMERIC(12,2),
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.odometer_disputes ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: Postgres does NOT support "CREATE POLICY IF NOT EXISTS"
-- So we always: DROP POLICY IF EXISTS ... ON table; then CREATE POLICY ...

DROP POLICY IF EXISTS "Read disputes for own trips or approvers" ON public.odometer_disputes;
CREATE POLICY "Read disputes for own trips or approvers"
ON public.odometer_disputes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = odometer_disputes.trip_id
      AND t.driver_user_id = auth.uid()
  )
  OR public.user_has_permission(auth.uid(), 'trips.approve')
  OR public.user_has_permission(auth.uid(), 'trips.read_all')
);

DROP POLICY IF EXISTS "Create dispute for own trip" ON public.odometer_disputes;
CREATE POLICY "Create dispute for own trip"
ON public.odometer_disputes
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = odometer_disputes.trip_id
      AND t.driver_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Resolve dispute with approve permission" ON public.odometer_disputes;
CREATE POLICY "Resolve dispute with approve permission"
ON public.odometer_disputes
FOR UPDATE
TO authenticated
USING (public.user_has_permission(auth.uid(), 'trips.approve'))
WITH CHECK (public.user_has_permission(auth.uid(), 'trips.approve'));

-- ============================
-- ALERTS (minimal)
-- ============================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
    CREATE TYPE public.alert_severity AS ENUM ('INFO', 'WARN', 'BLOCKER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity public.alert_severity NOT NULL DEFAULT 'INFO',
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  message TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read alerts for authenticated" ON public.alerts;
CREATE POLICY "Read alerts for authenticated"
ON public.alerts
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Insert alerts with settings.manage" ON public.alerts;
CREATE POLICY "Insert alerts with settings.manage"
ON public.alerts
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_permission(auth.uid(), 'settings.manage'));

DROP POLICY IF EXISTS "Update alerts with settings.manage" ON public.alerts;
CREATE POLICY "Update alerts with settings.manage"
ON public.alerts
FOR UPDATE
TO authenticated
USING (public.user_has_permission(auth.uid(), 'settings.manage'))
WITH CHECK (public.user_has_permission(auth.uid(), 'settings.manage'));

DROP POLICY IF EXISTS "Delete alerts with settings.manage" ON public.alerts;
CREATE POLICY "Delete alerts with settings.manage"
ON public.alerts
FOR DELETE
TO authenticated
USING (public.user_has_permission(auth.uid(), 'settings.manage'));

-- ============================
-- Helper: compute blocking reason for a vehicle
-- ============================
CREATE OR REPLACE FUNCTION public.vehicle_trip_block_reason(p_vehicle_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
  current_km NUMERIC;
  next_service_km NUMERIC;
BEGIN
  SELECT
    id,
    current_odometer,
    service_interval_km,
    service_notify_before_km,
    insurance_end_date,
    registration_end_date
  INTO v
  FROM public.vehicles
  WHERE id = p_vehicle_id;

  IF NOT FOUND THEN
    RETURN 'VEHICLE_NOT_FOUND';
  END IF;

  -- Insurance blocks
  IF v.insurance_end_date IS NOT NULL THEN
    IF v.insurance_end_date < CURRENT_DATE THEN
      RETURN 'INSURANCE_EXPIRED';
    ELSIF v.insurance_end_date <= (CURRENT_DATE + 1) THEN
      RETURN 'INSURANCE_EXPIRES_WITHIN_1_DAY';
    END IF;
  END IF;

  -- Registration blocks
  IF v.registration_end_date IS NOT NULL THEN
    IF v.registration_end_date < CURRENT_DATE THEN
      RETURN 'REGISTRATION_EXPIRED';
    ELSIF v.registration_end_date <= (CURRENT_DATE + 1) THEN
      RETURN 'REGISTRATION_EXPIRES_WITHIN_1_DAY';
    END IF;
  END IF;

  -- Service blocks
  current_km := COALESCE(v.current_odometer::NUMERIC, 0);

  IF v.service_interval_km IS NOT NULL AND v.service_interval_km > 0 THEN
    next_service_km := CEIL(current_km / v.service_interval_km::NUMERIC) * v.service_interval_km::NUMERIC;
    IF current_km >= next_service_km THEN
      RETURN 'SERVICE_OVERDUE';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vehicle_trip_block_reason(UUID) TO authenticated;
