-- Add insurance & registration compliance fields to vehicles

alter table public.vehicles
  add column if not exists insurance_policy_no text,
  add column if not exists insurance_start_date date,
  add column if not exists insurance_end_date date,
  add column if not exists insurance_document_url text,
  add column if not exists registration_no text,
  add column if not exists registration_start_date date,
  add column if not exists registration_end_date date,
  add column if not exists registration_document_url text;

-- Optional: create a public storage bucket for vehicle documents
-- If you already created it in the dashboard, this is harmless.
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('vehicle-docs', 'vehicle-docs', true)
  on conflict (id) do update set public = excluded.public;
exception when undefined_table then
  -- storage not installed in this project
  null;
end $$;

-- Optional: storage RLS policies for vehicle-docs
-- Public read, authenticated upload.
do $$
begin
  -- Enable RLS if not already
  alter table storage.objects enable row level security;

  -- Public read
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vehicle_docs_public_read'
  ) then
    create policy vehicle_docs_public_read
      on storage.objects
      for select
      using (bucket_id = 'vehicle-docs');
  end if;

  -- Authenticated upload
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vehicle_docs_auth_upload'
  ) then
    create policy vehicle_docs_auth_upload
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'vehicle-docs');
  end if;
exception
  when undefined_table then
    null;
  when insufficient_privilege then
    -- In hosted Supabase projects, you may not own storage.objects.
    -- If this block is skipped, manage Storage policies via the Dashboard.
    null;
end $$;
