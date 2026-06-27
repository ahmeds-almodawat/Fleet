-- Fix enforce_trip_compliance(): do NOT coalesce enum with '' (causes 22P02)

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

  -- Only enforce on:
  -- INSERT
  -- UPDATE when vehicle changes
  -- UPDATE when status changes
  if tg_op = 'INSERT'
     or (
       tg_op = 'UPDATE'
       and (
         new.vehicle_id is distinct from old.vehicle_id
         or new.status is distinct from old.status
       )
     ) then

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

-- trigger already points to this function, no need to recreate it
