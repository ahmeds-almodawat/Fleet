-- App settings (branding, UI configuration)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Public read for branding so the login page can render without authentication
drop policy if exists "public_read_branding" on public.app_settings;
create policy "public_read_branding"
on public.app_settings
for select
using (key = 'branding');

-- Only Settings Managers can write/change settings
drop policy if exists "manage_app_settings" on public.app_settings;
create policy "manage_app_settings"
on public.app_settings
for all
using (public.user_has_permission(auth.uid(), 'settings.manage'))
with check (public.user_has_permission(auth.uid(), 'settings.manage'));
