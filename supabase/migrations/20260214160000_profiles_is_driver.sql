-- Add driver flag on profiles (not all users are drivers)

alter table public.profiles
  add column if not exists is_driver boolean not null default false;

create index if not exists idx_profiles_is_driver on public.profiles(is_driver);
