-- Feature flags stored in app_settings (optional toggles)
-- Non-breaking: inserts defaults only if missing.

insert into public.app_settings (key, value)
values (
  'features',
  jsonb_build_object(
    'backupsEnabled', false,
    'notificationsEnabled', true,
    'browserNotificationsEnabled', false,
    'remindersEnabled', true,
    'realtimeNotificationsEnabled', true,
    'globalSearchEnabled', true,
    'resetDemoEnabled', false
  )
)
on conflict (key) do nothing;
