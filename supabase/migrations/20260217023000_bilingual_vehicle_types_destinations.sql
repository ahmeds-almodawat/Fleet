-- Bilingual support for Vehicle Types and Destinations
-- Adds name_en/name_ar (and category_en/category_ar for destinations) while keeping legacy "name" for backward compatibility.

begin;

-- -------------------------------------------------------
-- Vehicle Types: bilingual names
-- -------------------------------------------------------
alter table public.vehicle_types
  add column if not exists name_en text,
  add column if not exists name_ar text;

-- Backfill: keep existing English in name_en (best effort)
update public.vehicle_types
set name_en = coalesce(name_en, name)
where name_en is null;

-- Keep legacy "name" aligned (best-effort): prefer name_en, else name_ar, else keep existing
create or replace function public._sync_vehicle_types_bilingual_name()
returns trigger
language plpgsql
as $$
begin
  -- If legacy name missing, derive it
  if new.name is null or btrim(new.name) = '' then
    new.name := coalesce(nullif(btrim(new.name_en), ''), nullif(btrim(new.name_ar), ''), new.name);
  end if;

  -- If name_en missing, derive from legacy name
  if new.name_en is null or btrim(new.name_en) = '' then
    new.name_en := coalesce(nullif(btrim(new.name), ''), new.name_en);
  end if;

  -- If legacy name present but name_en changed, keep legacy aligned to name_en
  if new.name_en is not null and btrim(new.name_en) <> '' then
    new.name := new.name_en;
  elsif new.name_ar is not null and btrim(new.name_ar) <> '' and (new.name is null or btrim(new.name) = '') then
    new.name := new.name_ar;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_vehicle_types_bilingual_name on public.vehicle_types;
create trigger trg_sync_vehicle_types_bilingual_name
before insert or update on public.vehicle_types
for each row
execute function public._sync_vehicle_types_bilingual_name();

-- -------------------------------------------------------
-- Destinations: bilingual names + category bilingual
-- -------------------------------------------------------
alter table public.destinations
  add column if not exists name_en text,
  add column if not exists name_ar text,
  add column if not exists category_en text,
  add column if not exists category_ar text;

update public.destinations
set name_en = coalesce(name_en, name)
where name_en is null;

update public.destinations
set category_en = coalesce(category_en, category)
where category_en is null and category is not null;

create or replace function public._sync_destinations_bilingual_name()
returns trigger
language plpgsql
as $$
begin
  if new.name is null or btrim(new.name) = '' then
    new.name := coalesce(nullif(btrim(new.name_en), ''), nullif(btrim(new.name_ar), ''), new.name);
  end if;

  if new.name_en is null or btrim(new.name_en) = '' then
    new.name_en := coalesce(nullif(btrim(new.name), ''), new.name_en);
  end if;

  if new.name_en is not null and btrim(new.name_en) <> '' then
    new.name := new.name_en;
  elsif new.name_ar is not null and btrim(new.name_ar) <> '' and (new.name is null or btrim(new.name) = '') then
    new.name := new.name_ar;
  end if;

  -- Category sync
  if new.category is null or btrim(new.category) = '' then
    new.category := coalesce(nullif(btrim(new.category_en), ''), nullif(btrim(new.category_ar), ''), new.category);
  end if;

  if new.category_en is null or btrim(new.category_en) = '' then
    new.category_en := coalesce(nullif(btrim(new.category), ''), new.category_en);
  end if;

  if new.category_en is not null and btrim(new.category_en) <> '' then
    new.category := new.category_en;
  elsif new.category_ar is not null and btrim(new.category_ar) <> '' and (new.category is null or btrim(new.category) = '') then
    new.category := new.category_ar;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_destinations_bilingual_name on public.destinations;
create trigger trg_sync_destinations_bilingual_name
before insert or update on public.destinations
for each row
execute function public._sync_destinations_bilingual_name();

commit;
