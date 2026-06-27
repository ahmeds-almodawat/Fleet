-- Read: drivers can read their own disputes; managers/admin with trips.read can read all

DROP POLICY IF EXISTS "Drivers can read own disputes" ON public.odometer_disputes;
CREATE POLICY "Drivers can read own disputes"
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
  OR public.user_has_permission(auth.uid(), 'trips.read')
  OR public.user_has_permission(auth.uid(), 'trips.approve')
);

-- Insert: driver can create dispute only for own trip
DROP POLICY IF EXISTS "Drivers can create disputes for own trips" ON public.odometer_disputes;
CREATE POLICY "Drivers can create disputes for own trips"
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

-- Update: only approvers can resolve disputes
DROP POLICY IF EXISTS "Approvers can resolve disputes" ON public.odometer_disputes;
CREATE POLICY "Approvers can resolve disputes"
ON public.odometer_disputes
FOR UPDATE
TO authenticated
USING (public.user_has_permission(auth.uid(), 'trips.approve'))
WITH CHECK (public.user_has_permission(auth.uid(), 'trips.approve'));
