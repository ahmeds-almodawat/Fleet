-- Bootstrap Super Admin + Dashboard KPIs

-- 1) Allow roles to be visible to authenticated users (UI needs this to render)
DROP POLICY IF EXISTS "Authenticated can read roles" ON public.roles;
DROP POLICY IF EXISTS "Read roles with permission" ON public.roles;

CREATE POLICY "Authenticated can read roles"
ON public.roles
FOR SELECT
TO authenticated
USING (true);

-- 2) Bootstrap policy: first authenticated user can assign themselves System Administrator role
DROP POLICY IF EXISTS "Bootstrap first System Administrator" ON public.user_roles;

CREATE POLICY "Bootstrap first System Administrator"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (SELECT COUNT(*) FROM public.user_roles) = 0
  AND role_id = (SELECT id FROM public.roles WHERE name = 'System Administrator' LIMIT 1)
);

-- 3) Convenience RPC: call from UI button to claim first admin role (only works when user_roles is empty)
CREATE OR REPLACE FUNCTION public.bootstrap_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_role_id uuid;
BEGIN
  IF (SELECT COUNT(*) FROM public.user_roles) > 0 THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO admin_role_id
  FROM public.roles
  WHERE name = 'System Administrator'
  LIMIT 1;

  IF admin_role_id IS NULL THEN
    RAISE EXCEPTION 'System Administrator role not found';
  END IF;

  INSERT INTO public.user_roles (user_id, role_id)
  VALUES (auth.uid(), admin_role_id)
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_super_admin() TO authenticated;

-- 4) Dashboard KPIs RPC (service/insurance/registration)
CREATE OR REPLACE FUNCTION public.get_fleet_kpis()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_active int;
  v_maint int;
  v_oos int;
  v_pending int;
  v_active_trips int;
  v_service_overdue int;
  v_insurance_exp_30 int;
  v_registration_exp_30 int;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.vehicles;
  SELECT COUNT(*) INTO v_active FROM public.vehicles WHERE status = 'Active';
  SELECT COUNT(*) INTO v_maint FROM public.vehicles WHERE status = 'Maintenance';
  SELECT COUNT(*) INTO v_oos FROM public.vehicles WHERE status = 'OutOfService';

  SELECT COUNT(*) INTO v_pending FROM public.trips WHERE status = 'PendingApproval';
  SELECT COUNT(*) INTO v_active_trips FROM public.trips WHERE status IN ('Active', 'Approved');

  SELECT COUNT(*) INTO v_service_overdue
  FROM public.vehicles v
  WHERE public.vehicle_trip_block_reason(v.id) = 'SERVICE_OVERDUE';

  SELECT COUNT(*) INTO v_insurance_exp_30
  FROM public.vehicles
  WHERE insurance_end_date IS NOT NULL
    AND insurance_end_date >= CURRENT_DATE
    AND insurance_end_date <= (CURRENT_DATE + 30);

  SELECT COUNT(*) INTO v_registration_exp_30
  FROM public.vehicles
  WHERE registration_end_date IS NOT NULL
    AND registration_end_date >= CURRENT_DATE
    AND registration_end_date <= (CURRENT_DATE + 30);

  RETURN jsonb_build_object(
    'totalVehicles', v_total,
    'activeVehicles', v_active,
    'maintenanceVehicles', v_maint,
    'outOfServiceVehicles', v_oos,
    'pendingApprovals', v_pending,
    'activeTrips', v_active_trips,
    'serviceOverdue', v_service_overdue,
    'insuranceExpiring30', v_insurance_exp_30,
    'registrationExpiring30', v_registration_exp_30
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fleet_kpis() TO authenticated;
