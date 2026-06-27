-- Hard guard: prevent empty-string status for trip_status enum

alter table public.trips
  alter column status set default 'Draft';

alter table public.trips
  drop constraint if exists trips_status_not_empty;

alter table public.trips
  add constraint trips_status_not_empty check (status::text <> '');
