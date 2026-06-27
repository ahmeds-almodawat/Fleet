-- ------------------------------------------------------------
-- Fleet Control - Compliance helper
-- RPC: anomaly counts per vehicle for a given window (days)
--
-- Why:
-- - vehicle_compliance_v includes anomalies_30d (fixed window)
-- - Compliance report UI allows 30/60/90/180/360 days
-- - This RPC lets the UI fetch anomalies_count for the selected window
--
-- Safe:
-- - New function name (no signature conflicts)
-- - Permission-gated (requires relevant permissions)
-- ------------------------------------------------------------

create or replace function public.get_vehicle_anomaly_counts(
  p_days int default 30
)
returns table(
  vehicle_id uuid,
  anomalies_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  days int := greatest(coalesce(p_days, 30), 1);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Permission gate: keep broad enough for reports/alerts readers
  if not (
    public.user_has_permission(auth.uid(), 'reports.read'::text)
    or public.user_has_permission(auth.uid(), 'reports.read_all'::text)
    or public.user_has_permission(auth.uid(), 'alerts.compliance_deadlines'::text)
    or public.user_has_permission(auth.uid(), 'alerts.odometer_anomaly'::text)
    or public.user_has_permission(auth.uid(), 'alerts.read'::text)
    or public.user_has_permission(auth.uid(), 'trips.read_all'::text)
  ) then
    raise exception 'not allowed';
  end if;

  return query
  select
    v.id as vehicle_id,
    (
      select count(*)::int
      from public.trips t
      where t.vehicle_id = v.id
        and t.anomaly_flag = true
        and t.created_at >= now() - (days::text || ' days')::interval
    ) as anomalies_count
  from public.vehicles v;
end;
$$;

revoke all on function public.get_vehicle_anomaly_counts(int) from public;
grant execute on function public.get_vehicle_anomaly_counts(int) to authenticated;
