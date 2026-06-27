-- Create maintenance types table
CREATE TABLE public.maintenance_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  default_interval_days INTEGER,
  default_interval_km INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create vehicle maintenance schedules/history table
CREATE TABLE public.vehicle_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  maintenance_type_id UUID REFERENCES public.maintenance_types(id),
  custom_type_name TEXT,
  description TEXT,
  scheduled_date DATE,
  scheduled_odometer INTEGER,
  completed_date DATE,
  completed_odometer INTEGER,
  cost NUMERIC(10,2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Overdue', 'InProgress', 'Completed', 'Cancelled')),
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.maintenance_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_maintenance ENABLE ROW LEVEL SECURITY;

-- RLS policies for maintenance_types
CREATE POLICY "Authenticated can read maintenance_types"
ON public.maintenance_types FOR SELECT
USING (true);

CREATE POLICY "Manage maintenance_types with permission"
ON public.maintenance_types FOR ALL
USING (user_has_permission(auth.uid(), 'settings.manage'));

-- RLS policies for vehicle_maintenance
CREATE POLICY "Read vehicle_maintenance with permission"
ON public.vehicle_maintenance FOR SELECT
USING (user_has_permission(auth.uid(), 'vehicles.read'));

CREATE POLICY "Create vehicle_maintenance with permission"
ON public.vehicle_maintenance FOR INSERT
WITH CHECK (user_has_permission(auth.uid(), 'vehicles.edit'));

CREATE POLICY "Update vehicle_maintenance with permission"
ON public.vehicle_maintenance FOR UPDATE
USING (user_has_permission(auth.uid(), 'vehicles.edit'));

CREATE POLICY "Delete vehicle_maintenance with permission"
ON public.vehicle_maintenance FOR DELETE
USING (user_has_permission(auth.uid(), 'vehicles.edit'));

-- Create trigger for updated_at
CREATE TRIGGER update_vehicle_maintenance_updated_at
BEFORE UPDATE ON public.vehicle_maintenance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default maintenance types
INSERT INTO public.maintenance_types (name, description, default_interval_days, default_interval_km) VALUES
('Oil Change', 'Engine oil and filter replacement', 90, 5000),
('Tire Rotation', 'Rotate tires for even wear', 180, 10000),
('Brake Inspection', 'Check brake pads, rotors, and fluid', 180, 15000),
('Air Filter', 'Replace engine air filter', 365, 20000),
('Transmission Service', 'Transmission fluid change', 730, 50000),
('Coolant Flush', 'Replace engine coolant', 730, 50000),
('Battery Check', 'Test and clean battery terminals', 180, NULL),
('Full Inspection', 'Comprehensive vehicle inspection', 365, 20000);

-- Add permissions for maintenance
INSERT INTO public.permissions (key, name, category, description) VALUES
('maintenance.read', 'View Maintenance', 'Maintenance', 'View vehicle maintenance schedules and history'),
('maintenance.create', 'Create Maintenance', 'Maintenance', 'Schedule new maintenance'),
('maintenance.edit', 'Edit Maintenance', 'Maintenance', 'Edit maintenance records'),
('maintenance.delete', 'Delete Maintenance', 'Maintenance', 'Delete maintenance records')
ON CONFLICT (key) DO NOTHING;