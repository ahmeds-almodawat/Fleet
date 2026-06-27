-- Fix audit_trigger_generic: do NOT assume every table has NEW.id
-- app_settings uses key (text) not id (uuid), so entity_id must be NULL and key stored in metadata.

create or replace function public.audit_trigger_generic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_type text;
  v_entity_id uuid;
  v_summary text;
  v_meta jsonb;
  v_new jsonb;
  v_old jsonb;
  v_id_text text;
begin
  v_entity_type := tg_table_name;
  v_entity_id := null;

  if (tg_op = 'INSERT') then
    v_action := v_entity_type || '.create';
    v_new := to_jsonb(new);
    v_meta := jsonb_build_object('new', v_new);

    -- Only set entity_id if the row actually has an "id" field
    if (v_new ? 'id') then
      v_id_text := v_new->>'id';
      if v_id_text is not null and v_id_text <> '' then
        begin
          v_entity_id := v_id_text::uuid;
        exception when others then
          v_entity_id := null;
        end;
      end if;
    end if;

  elsif (tg_op = 'UPDATE') then
    v_action := v_entity_type || '.update';
    v_new := to_jsonb(new);
    v_old := to_jsonb(old);
    v_meta := jsonb_build_object('old', v_old, 'new', v_new);

    if (v_new ? 'id') then
      v_id_text := v_new->>'id';
      if v_id_text is not null and v_id_text <> '' then
        begin
          v_entity_id := v_id_text::uuid;
        exception when others then
          v_entity_id := null;
        end;
      end if;
    end if;

  elsif (tg_op = 'DELETE') then
    v_action := v_entity_type || '.delete';
    v_old := to_jsonb(old);
    v_meta := jsonb_build_object('old', v_old);

    if (v_old ? 'id') then
      v_id_text := v_old->>'id';
      if v_id_text is not null and v_id_text <> '' then
        begin
          v_entity_id := v_id_text::uuid;
        exception when others then
          v_entity_id := null;
        end;
      end if;
    end if;
  end if;

  -- For key-based tables (like app_settings), store identifier in metadata (entity_id stays NULL)
  if v_entity_id is null then
    if v_new is not null and (v_new ? 'key') then
      v_meta := v_meta || jsonb_build_object('key', v_new->>'key');
    end if;
    if v_old is not null and (v_old ? 'key') then
      v_meta := v_meta || jsonb_build_object('key', v_old->>'key');
    end if;
  end if;

  v_summary := coalesce(v_action, 'event');

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, summary, metadata_json
  ) values (
    auth.uid(), v_action, v_entity_type, v_entity_id, v_summary, v_meta
  );

  return coalesce(new, old);
end;
$$;
