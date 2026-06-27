-- Optional: create a public storage bucket for branding assets (login/logo/background)
-- Recommended to create in Supabase Dashboard, but this helps ensure it exists.

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('branding', 'branding', true)
    on conflict (id) do update set public = excluded.public;
  end if;
exception
  when undefined_table then null;          -- storage not installed
  when insufficient_privilege then null;  -- not owner of storage schema
end $$;
