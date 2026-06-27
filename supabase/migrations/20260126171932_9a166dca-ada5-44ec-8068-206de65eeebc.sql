-- Fleet Management System Database Schema

-- 1. DEPARTMENTS TABLE
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PERMISSIONS TABLE (granular feature actions)
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ROLES TABLE
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ROLE_PERMISSIONS TABLE (many-to-many)
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

-- 5. PROFILES TABLE (users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  job_title TEXT NOT NULL,
  phone TEXT,
  department_id UUID REFERENCES public.departments(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. USER_ROLES TABLE (many-to-many)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);

-- 7. VEHICLE_TYPES TABLE
CREATE TABLE public.vehicle_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  default_anomaly_distance_threshold_km NUMERIC(10,2),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. VEHICLES TABLE
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_code TEXT UNIQUE NOT NULL,
  plate_no TEXT UNIQUE NOT NULL,
  vehicle_type_id UUID REFERENCES public.vehicle_types(id),
  department_id UUID REFERENCES public.departments(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Maintenance', 'OutOfService')),
  current_odometer NUMERIC(12,2) NOT NULL DEFAULT 0,
  approvals_required BOOLEAN NOT NULL DEFAULT true,
  anomaly_distance_threshold_km NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. DESTINATIONS TABLE
CREATE TABLE public.destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. TRIPS TABLE
CREATE TYPE public.trip_status AS ENUM (
  'Draft', 'PendingApproval', 'Approved', 'Active', 'Rejected', 
  'Closed', 'Reviewed', 'Cancelled', 'Reopened'
);

CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_no TEXT UNIQUE NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  driver_user_id UUID NOT NULL REFERENCES public.profiles(id),
  department_id UUID REFERENCES public.departments(id),
  destination_id UUID REFERENCES public.destinations(id),
  destination_text TEXT NOT NULL,
  purpose TEXT,
  job_order_no TEXT,
  start_odometer_value NUMERIC(12,2) NOT NULL,
  start_odometer_photo_url TEXT NOT NULL,
  start_fuel_level TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.trip_status NOT NULL DEFAULT 'Draft',
  approved_by_user_id UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  rejected_by_user_id UUID REFERENCES public.profiles(id),
  rejected_at TIMESTAMPTZ,
  reject_reason TEXT,
  end_odometer_value NUMERIC(12,2),
  end_odometer_photo_url TEXT,
  end_fuel_level TEXT,
  closed_at TIMESTAMPTZ,
  distance_km NUMERIC(12,2),
  anomaly_flag BOOLEAN DEFAULT false,
  anomaly_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. TRIP_ACTIONS TABLE (audit trail)
CREATE TYPE public.trip_action_type AS ENUM (
  'Create', 'Submit', 'Approve', 'Reject', 'Start', 'Close', 'Reopen', 'Review', 'Edit'
);

CREATE TABLE public.trip_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  action public.trip_action_type NOT NULL,
  actor_user_id UUID REFERENCES public.profiles(id),
  comment TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. ATTACHMENTS TABLE
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. SETTINGS TABLE
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================
-- PERMISSION CHECK FUNCTION (security definer)
-- ================================================
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id
      AND p.key = _permission_key
  )
$$;

-- Function to get all permissions for a user
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id UUID)
RETURNS TABLE(permission_key TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.key
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = _user_id
$$;

-- ================================================
-- ENABLE ROW LEVEL SECURITY
-- ================================================
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- ================================================
-- RLS POLICIES
-- ================================================

-- Departments: Read by authenticated, manage by permission
CREATE POLICY "Authenticated can read departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage departments with permission" ON public.departments FOR ALL TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'settings.manage'));

-- Permissions: Read by authenticated users
CREATE POLICY "Authenticated can read permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage permissions" ON public.permissions FOR ALL TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'roles.edit'));

-- Roles: Read by users with roles.read
CREATE POLICY "Read roles with permission" ON public.roles FOR SELECT TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'roles.read'));
CREATE POLICY "Manage roles with permission" ON public.roles FOR ALL TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'roles.create') OR public.user_has_permission(auth.uid(), 'roles.edit') OR public.user_has_permission(auth.uid(), 'roles.delete'));

-- Role Permissions
CREATE POLICY "Read role_permissions" ON public.role_permissions FOR SELECT TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'roles.read'));
CREATE POLICY "Manage role_permissions" ON public.role_permissions FOR ALL TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'roles.edit'));

-- Profiles: Users can read all, manage with permission
CREATE POLICY "Authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Manage profiles with permission" ON public.profiles FOR INSERT TO authenticated 
  WITH CHECK (public.user_has_permission(auth.uid(), 'users.create') OR id = auth.uid());
CREATE POLICY "Edit profiles with permission" ON public.profiles FOR UPDATE TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'users.edit') OR id = auth.uid());

-- User Roles
CREATE POLICY "Read user_roles" ON public.user_roles FOR SELECT TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'users.read') OR user_id = auth.uid());
CREATE POLICY "Manage user_roles" ON public.user_roles FOR ALL TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'roles.edit'));

-- Vehicle Types
CREATE POLICY "Authenticated can read vehicle_types" ON public.vehicle_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage vehicle_types" ON public.vehicle_types FOR ALL TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'vehicle_types.create') OR public.user_has_permission(auth.uid(), 'vehicle_types.edit') OR public.user_has_permission(auth.uid(), 'vehicle_types.delete'));

-- Vehicles
CREATE POLICY "Read vehicles with permission" ON public.vehicles FOR SELECT TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'vehicles.read'));
CREATE POLICY "Manage vehicles" ON public.vehicles FOR ALL TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'vehicles.create') OR public.user_has_permission(auth.uid(), 'vehicles.edit') OR public.user_has_permission(auth.uid(), 'vehicles.delete'));

-- Destinations
CREATE POLICY "Authenticated can read destinations" ON public.destinations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage destinations" ON public.destinations FOR ALL TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'settings.manage'));

-- Trips
CREATE POLICY "Read all trips with permission" ON public.trips FOR SELECT TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'trips.read_all') OR driver_user_id = auth.uid());
CREATE POLICY "Create trips" ON public.trips FOR INSERT TO authenticated 
  WITH CHECK (public.user_has_permission(auth.uid(), 'trips.create') AND driver_user_id = auth.uid());
CREATE POLICY "Update own trips" ON public.trips FOR UPDATE TO authenticated 
  USING (driver_user_id = auth.uid() OR public.user_has_permission(auth.uid(), 'trips.edit'));

-- Trip Actions (audit trail)
CREATE POLICY "Read trip_actions" ON public.trip_actions FOR SELECT TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'audit.read') OR 
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.driver_user_id = auth.uid()));
CREATE POLICY "Create trip_actions" ON public.trip_actions FOR INSERT TO authenticated WITH CHECK (true);

-- Attachments
CREATE POLICY "Read attachments" ON public.attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Create attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (true);

-- Settings
CREATE POLICY "Read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage settings" ON public.settings FOR ALL TO authenticated 
  USING (public.user_has_permission(auth.uid(), 'settings.manage'));

-- ================================================
-- INSERT DEFAULT PERMISSIONS
-- ================================================
INSERT INTO public.permissions (key, name, description, category) VALUES
-- Vehicles
('vehicles.read', 'View Vehicles', 'View all vehicles in the fleet', 'Vehicles'),
('vehicles.create', 'Create Vehicles', 'Add new vehicles to the fleet', 'Vehicles'),
('vehicles.edit', 'Edit Vehicles', 'Modify vehicle information', 'Vehicles'),
('vehicles.delete', 'Delete Vehicles', 'Remove vehicles from the fleet', 'Vehicles'),
-- Vehicle Types
('vehicle_types.read', 'View Vehicle Types', 'View vehicle type categories', 'Vehicle Types'),
('vehicle_types.create', 'Create Vehicle Types', 'Add new vehicle types', 'Vehicle Types'),
('vehicle_types.edit', 'Edit Vehicle Types', 'Modify vehicle types', 'Vehicle Types'),
('vehicle_types.delete', 'Delete Vehicle Types', 'Remove vehicle types', 'Vehicle Types'),
-- Users
('users.read', 'View Users', 'View all users in the system', 'Users'),
('users.create', 'Create Users', 'Add new users to the system', 'Users'),
('users.edit', 'Edit Users', 'Modify user information', 'Users'),
('users.disable', 'Disable Users', 'Deactivate user accounts', 'Users'),
-- Roles & Permissions
('roles.read', 'View Roles', 'View all roles and permissions', 'Roles'),
('roles.create', 'Create Roles', 'Create new roles', 'Roles'),
('roles.edit', 'Edit Roles', 'Modify role permissions', 'Roles'),
('roles.delete', 'Delete Roles', 'Remove roles', 'Roles'),
('permissions.read', 'View Permissions', 'View all available permissions', 'Permissions'),
-- Trips
('trips.read_all', 'View All Trips', 'View all trips in the system', 'Trips'),
('trips.read_own', 'View Own Trips', 'View only own trips', 'Trips'),
('trips.create', 'Create Trips', 'Submit new trip requests', 'Trips'),
('trips.edit', 'Edit Trips', 'Modify trip information', 'Trips'),
('trips.close', 'Close Trips', 'Close completed trips', 'Trips'),
('trips.reopen', 'Reopen Trips', 'Reopen closed trips', 'Trips'),
-- Approvals
('trips.approve', 'Approve Trips', 'Approve trip requests', 'Approvals'),
('trips.reject', 'Reject Trips', 'Reject trip requests', 'Approvals'),
-- Reports
('reports.read', 'View Reports', 'Access fleet reports', 'Reports'),
('reports.export_csv', 'Export Reports', 'Export reports to CSV', 'Reports'),
-- Audit
('audit.read', 'View Audit Logs', 'Access audit trail logs', 'Audit'),
-- Settings
('settings.manage', 'Manage Settings', 'Configure system settings', 'Settings');

-- ================================================
-- INSERT DEFAULT ROLES (using gen_random_uuid)
-- ================================================
DO $$
DECLARE
  admin_role_id UUID;
  manager_role_id UUID;
  driver_role_id UUID;
  approver_role_id UUID;
  viewer_role_id UUID;
BEGIN
  -- Create roles
  INSERT INTO public.roles (name, description) VALUES ('System Administrator', 'Full access to all system features') RETURNING id INTO admin_role_id;
  INSERT INTO public.roles (name, description) VALUES ('Fleet Manager', 'Manage vehicles, approve trips, view reports') RETURNING id INTO manager_role_id;
  INSERT INTO public.roles (name, description) VALUES ('Driver', 'Create and manage own trips') RETURNING id INTO driver_role_id;
  INSERT INTO public.roles (name, description) VALUES ('Approver', 'Review and approve trip requests') RETURNING id INTO approver_role_id;
  INSERT INTO public.roles (name, description) VALUES ('Viewer', 'Read-only access to fleet data') RETURNING id INTO viewer_role_id;

  -- Assign all permissions to System Administrator
  INSERT INTO public.role_permissions (role_id, permission_id) SELECT admin_role_id, id FROM public.permissions;

  -- Fleet Manager permissions
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT manager_role_id, id FROM public.permissions 
  WHERE key IN ('vehicles.read', 'vehicles.create', 'vehicles.edit', 'vehicle_types.read', 'vehicle_types.create', 'vehicle_types.edit', 
    'users.read', 'trips.read_all', 'trips.edit', 'trips.close', 'trips.approve', 'trips.reject', 'reports.read', 'reports.export_csv', 'audit.read');

  -- Driver permissions
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT driver_role_id, id FROM public.permissions 
  WHERE key IN ('vehicles.read', 'trips.read_own', 'trips.create', 'trips.close');

  -- Approver permissions
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT approver_role_id, id FROM public.permissions 
  WHERE key IN ('vehicles.read', 'trips.read_all', 'trips.approve', 'trips.reject', 'audit.read');

  -- Viewer permissions
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT viewer_role_id, id FROM public.permissions 
  WHERE key IN ('vehicles.read', 'vehicle_types.read', 'trips.read_all', 'reports.read');
END $$;

-- ================================================
-- INSERT SAMPLE DATA
-- ================================================

-- Departments
INSERT INTO public.departments (name) VALUES
('Operations'),
('Medical Services'),
('Logistics'),
('Administration');

-- Vehicle Types
INSERT INTO public.vehicle_types (name, default_anomaly_distance_threshold_km, active) VALUES
('Ambulance', 500, true),
('Water Tank', 300, true),
('Sedan', 200, true),
('Bus', 400, true),
('Pickup Truck', 250, true);

-- Destinations
INSERT INTO public.destinations (name, category, active) VALUES
('Main Hospital', 'Medical', true),
('City Center', 'General', true),
('Industrial Zone', 'Logistics', true),
('Airport', 'Transport', true),
('Warehouse District', 'Logistics', true);

-- Settings
INSERT INTO public.settings (key, value, description) VALUES
('max_active_trip_hours', '12', 'Maximum hours a trip can remain active before flagging'),
('default_anomaly_threshold_km', '300', 'Default distance threshold for anomaly detection');

-- Create storage bucket for odometer photos
INSERT INTO storage.buckets (id, name, public) VALUES ('trip-photos', 'trip-photos', true);

-- Storage policies
CREATE POLICY "Authenticated can upload trip photos" ON storage.objects FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'trip-photos');
CREATE POLICY "Authenticated can view trip photos" ON storage.objects FOR SELECT TO authenticated 
  USING (bucket_id = 'trip-photos');

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trip number sequence function
CREATE OR REPLACE FUNCTION public.generate_trip_no()
RETURNS TRIGGER AS $$
BEGIN
  NEW.trip_no := 'TRP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(CAST(EXTRACT(EPOCH FROM now())::bigint % 10000 AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_trip_no BEFORE INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION public.generate_trip_no();