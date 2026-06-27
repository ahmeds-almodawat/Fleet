-- Fix function search path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix function search path for generate_trip_no
CREATE OR REPLACE FUNCTION public.generate_trip_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.trip_no := 'TRP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(CAST(EXTRACT(EPOCH FROM now())::bigint % 10000 AS TEXT), 4, '0');
  RETURN NEW;
END;
$$;

-- Fix permissive RLS policies for trip_actions and attachments
DROP POLICY IF EXISTS "Create trip_actions" ON public.trip_actions;
CREATE POLICY "Create trip_actions" ON public.trip_actions FOR INSERT TO authenticated 
  WITH CHECK (actor_user_id = auth.uid() OR actor_user_id IS NULL);

DROP POLICY IF EXISTS "Create attachments" ON public.attachments;
CREATE POLICY "Create attachments" ON public.attachments FOR INSERT TO authenticated 
  WITH CHECK (uploaded_by = auth.uid() OR uploaded_by IS NULL);