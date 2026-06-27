-- Storage buckets + policies (Fleet Control)
-- Uses your RBAC helper: public.user_has_permission(auth.uid(), '<perm_key>')

-- 0) Ensure Storage tables exist (hosted Supabase has them)
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage is not installed/enabled in this project.';
    return;
  end if;
end $$;

-- 1) Create/ensure buckets
insert into storage.buckets (id, name, public) values
  ('branding',       'branding',       true),
  ('vehicle-images', 'vehicle-images', true),
  ('vehicle-docs',   'vehicle-docs',   true),
  ('trip-photos',    'trip-photos',    true),
  ('assets',         'assets',         true),
  ('ocr',            'ocr',            false),
  ('exports',        'exports',        false)
on conflict (id) do update
set public = excluded.public;

-- 2) Ensure RLS enabled on storage.objects (Hosted projects may not allow ALTER because you're not the owner)
do $$
begin
  begin
    execute 'alter table storage.objects enable row level security';
  exception
    when insufficient_privilege then
      raise notice 'Skipping: cannot ENABLE RLS on storage.objects (not owner). It is usually already enabled in Supabase.';
  end;
end $$;

-- =========================
-- BRANDING bucket policies
-- =========================
drop policy if exists branding_public_read on storage.objects;
create policy branding_public_read
on storage.objects for select
using (bucket_id = 'branding');

drop policy if exists branding_insert on storage.objects;
create policy branding_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'branding'
  and (
    public.user_has_permission(auth.uid(), 'settings.manage')
    or public.user_has_permission(auth.uid(), 'studio.manage')
  )
);

drop policy if exists branding_update on storage.objects;
create policy branding_update
on storage.objects for update to authenticated
using (
  bucket_id = 'branding'
  and (
    public.user_has_permission(auth.uid(), 'settings.manage')
    or public.user_has_permission(auth.uid(), 'studio.manage')
  )
)
with check (
  bucket_id = 'branding'
  and (
    public.user_has_permission(auth.uid(), 'settings.manage')
    or public.user_has_permission(auth.uid(), 'studio.manage')
  )
);

drop policy if exists branding_delete on storage.objects;
create policy branding_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'branding'
  and (
    public.user_has_permission(auth.uid(), 'settings.manage')
    or public.user_has_permission(auth.uid(), 'studio.manage')
  )
);

-- =========================
-- ASSETS bucket policies
-- =========================
drop policy if exists assets_public_read on storage.objects;
create policy assets_public_read
on storage.objects for select
using (bucket_id = 'assets');

drop policy if exists assets_insert on storage.objects;
create policy assets_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'assets'
  and (
    public.user_has_permission(auth.uid(), 'settings.manage')
    or public.user_has_permission(auth.uid(), 'studio.manage')
  )
);

drop policy if exists assets_update on storage.objects;
create policy assets_update
on storage.objects for update to authenticated
using (
  bucket_id = 'assets'
  and (
    public.user_has_permission(auth.uid(), 'settings.manage')
    or public.user_has_permission(auth.uid(), 'studio.manage')
  )
)
with check (
  bucket_id = 'assets'
  and (
    public.user_has_permission(auth.uid(), 'settings.manage')
    or public.user_has_permission(auth.uid(), 'studio.manage')
  )
);

drop policy if exists assets_delete on storage.objects;
create policy assets_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'assets'
  and (
    public.user_has_permission(auth.uid(), 'settings.manage')
    or public.user_has_permission(auth.uid(), 'studio.manage')
  )
);

-- =========================
-- VEHICLE-IMAGES bucket policies
-- =========================
drop policy if exists "Authenticated can upload vehicle images" on storage.objects;
drop policy if exists "Authenticated can view vehicle images" on storage.objects;
drop policy if exists "Authenticated can update vehicle images" on storage.objects;
drop policy if exists "Authenticated can delete vehicle images" on storage.objects;

drop policy if exists vehicle_images_public_read on storage.objects;
create policy vehicle_images_public_read
on storage.objects for select
using (bucket_id = 'vehicle-images');

drop policy if exists vehicle_images_insert on storage.objects;
create policy vehicle_images_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-images'
  and (
    public.user_has_permission(auth.uid(), 'vehicles.create')
    or public.user_has_permission(auth.uid(), 'vehicles.edit')
  )
);

drop policy if exists vehicle_images_update on storage.objects;
create policy vehicle_images_update
on storage.objects for update to authenticated
using (
  bucket_id = 'vehicle-images'
  and public.user_has_permission(auth.uid(), 'vehicles.edit')
)
with check (
  bucket_id = 'vehicle-images'
  and public.user_has_permission(auth.uid(), 'vehicles.edit')
);

drop policy if exists vehicle_images_delete on storage.objects;
create policy vehicle_images_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'vehicle-images'
  and public.user_has_permission(auth.uid(), 'vehicles.delete')
);

-- =========================
-- VEHICLE-DOCS bucket policies
-- =========================
drop policy if exists vehicle_docs_public_read on storage.objects;
create policy vehicle_docs_public_read
on storage.objects for select
using (bucket_id = 'vehicle-docs');

drop policy if exists vehicle_docs_insert on storage.objects;
create policy vehicle_docs_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-docs'
  and (
    public.user_has_permission(auth.uid(), 'vehicles.edit')
    or public.user_has_permission(auth.uid(), 'vehicles.create')
    or public.user_has_permission(auth.uid(), 'maintenance.edit')
    or public.user_has_permission(auth.uid(), 'maintenance.create')
  )
);

drop policy if exists vehicle_docs_update on storage.objects;
create policy vehicle_docs_update
on storage.objects for update to authenticated
using (
  bucket_id = 'vehicle-docs'
  and (
    public.user_has_permission(auth.uid(), 'vehicles.edit')
    or public.user_has_permission(auth.uid(), 'maintenance.edit')
  )
)
with check (
  bucket_id = 'vehicle-docs'
  and (
    public.user_has_permission(auth.uid(), 'vehicles.edit')
    or public.user_has_permission(auth.uid(), 'maintenance.edit')
  )
);

drop policy if exists vehicle_docs_delete on storage.objects;
create policy vehicle_docs_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'vehicle-docs'
  and (
    public.user_has_permission(auth.uid(), 'vehicles.delete')
    or public.user_has_permission(auth.uid(), 'maintenance.delete')
  )
);

-- =========================
-- TRIP-PHOTOS bucket policies
-- =========================
drop policy if exists "Authenticated can upload trip photos" on storage.objects;
drop policy if exists "Authenticated can view trip photos" on storage.objects;

drop policy if exists trip_photos_read on storage.objects;
create policy trip_photos_read
on storage.objects for select to authenticated
using (
  bucket_id = 'trip-photos'
  and (
    public.user_has_permission(auth.uid(), 'trips.read_all')
    or public.user_has_permission(auth.uid(), 'trips.read_own')
    or public.user_has_permission(auth.uid(), 'trips.create')
  )
);

drop policy if exists trip_photos_insert on storage.objects;
create policy trip_photos_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'trip-photos'
  and (
    public.user_has_permission(auth.uid(), 'trips.create')
    or public.user_has_permission(auth.uid(), 'trips.edit')
  )
);

drop policy if exists trip_photos_update on storage.objects;
create policy trip_photos_update
on storage.objects for update to authenticated
using (
  bucket_id = 'trip-photos'
  and public.user_has_permission(auth.uid(), 'trips.edit')
)
with check (
  bucket_id = 'trip-photos'
  and public.user_has_permission(auth.uid(), 'trips.edit')
);

drop policy if exists trip_photos_delete on storage.objects;
create policy trip_photos_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'trip-photos'
  and (
    public.user_has_permission(auth.uid(), 'trips.edit')
    or public.user_has_permission(auth.uid(), 'trips.close')
  )
);

-- =========================
-- OCR bucket policies
-- =========================
drop policy if exists ocr_owner_read on storage.objects;
create policy ocr_owner_read
on storage.objects for select to authenticated
using (bucket_id = 'ocr' and owner = auth.uid());

drop policy if exists ocr_owner_insert on storage.objects;
create policy ocr_owner_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'ocr' and owner = auth.uid());

drop policy if exists ocr_owner_delete on storage.objects;
create policy ocr_owner_delete
on storage.objects for delete to authenticated
using (bucket_id = 'ocr' and owner = auth.uid());

-- =========================
-- EXPORTS bucket policies
-- =========================
drop policy if exists exports_read on storage.objects;
create policy exports_read
on storage.objects for select to authenticated
using (
  bucket_id = 'exports'
  and (
    public.user_has_permission(auth.uid(), 'reports.read')
    or public.user_has_permission(auth.uid(), 'reports.export_csv')
    or public.user_has_permission(auth.uid(), 'settings.manage')
  )
);

drop policy if exists exports_write on storage.objects;
create policy exports_write
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exports'
  and (
    public.user_has_permission(auth.uid(), 'reports.export_csv')
    or public.user_has_permission(auth.uid(), 'settings.manage')
  )
);

drop policy if exists exports_delete on storage.objects;
create policy exports_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'exports'
  and (
    public.user_has_permission(auth.uid(), 'reports.export_csv')
    or public.user_has_permission(auth.uid(), 'settings.manage')
  )
);
