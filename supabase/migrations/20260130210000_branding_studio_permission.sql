-- Allow Studio Managers to update ONLY branding settings
-- Keeps Settings Managers as full managers for all settings.

alter table public.app_settings enable row level security;

drop policy if exists "manage_app_settings" on public.app_settings;
create policy "manage_app_settings"
on public.app_settings
for all
using (
  public.user_has_permission(auth.uid(), 'settings.manage')
  OR (
    key = 'branding'
    AND public.user_has_permission(auth.uid(), 'studio.manage')
  )
)
with check (
  public.user_has_permission(auth.uid(), 'settings.manage')
  OR (
    key = 'branding'
    AND public.user_has_permission(auth.uid(), 'studio.manage')
  )
);
