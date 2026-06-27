-- 20260216230000_anomalies_notifications_compliance.sql
-- NO-OP migration:
-- This file previously attempted to redefine generate_vehicle_deadline_notifications() as RETURNS void
-- which causes SQLSTATE 42P13. All real fixes are implemented in 20260216220000.

do $$
begin
  raise notice 'Skipping: superseded migration. Notifications/anomalies fixes are in 20260216220000.';
end $$;
