-- Enforce trip compliance at the database level (enterprise / hospital-grade)
-- Blocks inserting/updating a trip if the selected vehicle is non-compliant (insurance/registration/service overdue)
-- Requires existing function: public.vehicle_trip_block_reason(uuid) returns text

begin;

create or replace function public.enforce_trip_compliance()
returns trigger
language plpgsql
as $$
declare
  v_reason text;
begin
  if new.vehicle_id is null then
    return new;
  end if;

  -- Only enforce on create, or when vehicle changes, or when moving into submitted/active states
  if (tg_op = 'INSERT')
     or (tg_op = 'UPDATE' and new.vehicle_id is distinct from old.vehicle_id)
     or (tg_op = 'UPDATE' and coalesce(new.status,'') is distinct from coalesce(old.status,'')) then

    v_reason := public.vehicle_trip_block_reason(new.vehicle_id);

    if v_reason is not null and length(trim(v_reason)) > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'TRIP_BLOCKED:' || v_reason;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_trips_enforce_compliance on public.trips;

create trigger trg_trips_enforce_compliance
before insert or update on public.trips
for each row
execute function public.enforce_trip_compliance();

commit;
