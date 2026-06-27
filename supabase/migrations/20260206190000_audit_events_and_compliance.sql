-- Audit Events (system-wide) + RLS policies

-- 1) AUDIT EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  summary TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Read: only users with audit.read
DROP POLICY IF EXISTS "Read audit_events" ON public.audit_events;
CREATE POLICY "Read audit_events" ON public.audit_events
FOR SELECT TO authenticated
USING (
  public.user_has_permission(auth.uid(), 'audit.read')
);

-- Insert: block direct inserts (must go through the security definer RPC)
DROP POLICY IF EXISTS "Insert audit_events blocked" ON public.audit_events;
CREATE POLICY "Insert audit_events blocked" ON public.audit_events
FOR INSERT TO authenticated
WITH CHECK (false);

-- 2) SECURITY DEFINER RPC TO LOG EVENTS
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_summary TEXT DEFAULT NULL,
  p_metadata_json JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_events (
    actor_user_id, action, entity_type, entity_id, summary, metadata_json
  ) VALUES (
    auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, p_metadata_json
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Allow authenticated users to execute (RLS still controls visibility)
GRANT EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- 3) TRIGGERS (minimal, high-value tables)

CREATE OR REPLACE FUNCTION public.audit_trigger_generic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_summary TEXT;
  v_meta JSONB;
BEGIN
  v_entity_type := TG_TABLE_NAME;

  IF (TG_OP = 'INSERT') THEN
    v_action := v_entity_type || '.create';
    v_entity_id := NEW.id;
    v_meta := jsonb_build_object('new', to_jsonb(NEW));
  ELSIF (TG_OP = 'UPDATE') THEN
    v_action := v_entity_type || '.update';
    v_entity_id := NEW.id;
    v_meta := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF (TG_OP = 'DELETE') THEN
    v_action := v_entity_type || '.delete';
    v_entity_id := OLD.id;
    v_meta := jsonb_build_object('old', to_jsonb(OLD));
  END IF;

  v_summary := coalesce(v_action, 'event');

  -- insert directly (bypasses RLS on audit_events due to SECURITY DEFINER)
  INSERT INTO public.audit_events (
    actor_user_id, action, entity_type, entity_id, summary, metadata_json
  ) VALUES (
    auth.uid(), v_action, v_entity_type, v_entity_id, v_summary, v_meta
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers to the most important master/ops tables
DO $$
BEGIN
  -- vehicles
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_vehicles_changes'
  ) THEN
    CREATE TRIGGER audit_vehicles_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_generic();
  END IF;

  -- destinations
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_destinations_changes'
  ) THEN
    CREATE TRIGGER audit_destinations_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.destinations
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_generic();
  END IF;

  -- vehicle_maintenance
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_vehicle_maintenance_changes'
  ) THEN
    CREATE TRIGGER audit_vehicle_maintenance_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_maintenance
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_generic();
  END IF;

  -- app_settings (branding, etc.)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_settings'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'audit_app_settings_changes'
    ) THEN
      CREATE TRIGGER audit_app_settings_changes
      AFTER INSERT OR UPDATE OR DELETE ON public.app_settings
      FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_generic();
    END IF;
  END IF;
END $$;
