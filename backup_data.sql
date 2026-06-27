


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."alert_severity" AS ENUM (
    'INFO',
    'WARN',
    'BLOCKER'
);


ALTER TYPE "public"."alert_severity" OWNER TO "postgres";


CREATE TYPE "public"."dispute_status" AS ENUM (
    'OPEN',
    'RESOLVED'
);


ALTER TYPE "public"."dispute_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_severity" AS ENUM (
    'INFO',
    'WARN',
    'BLOCKER'
);


ALTER TYPE "public"."notification_severity" OWNER TO "postgres";


CREATE TYPE "public"."odometer_stage" AS ENUM (
    'START',
    'END'
);


ALTER TYPE "public"."odometer_stage" OWNER TO "postgres";


CREATE TYPE "public"."trip_action_type" AS ENUM (
    'Create',
    'Submit',
    'Approve',
    'Reject',
    'Start',
    'Close',
    'Reopen',
    'Review',
    'Edit'
);


ALTER TYPE "public"."trip_action_type" OWNER TO "postgres";


CREATE TYPE "public"."trip_status" AS ENUM (
    'Draft',
    'PendingApproval',
    'Approved',
    'Active',
    'Rejected',
    'Closed',
    'Reviewed',
    'Cancelled',
    'Reopened'
);


ALTER TYPE "public"."trip_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_export_backup"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select public.has_permission(v_uid, 'system.backup.export') into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'No access';
  end if;

  -- Only include safe tables (do NOT include auth.users, secrets, or service keys)
  result := jsonb_build_object(
    'meta', jsonb_build_object(
      'exported_at', now(),
      'version', 'fleet_backup_v1'
    ),
    'departments', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public.departments d),
    'vehicle_types', (select coalesce(jsonb_agg(to_jsonb(vt)), '[]'::jsonb) from public.vehicle_types vt),
    'destinations', (select coalesce(jsonb_agg(to_jsonb(ds)), '[]'::jsonb) from public.destinations ds),
    'vehicles', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.vehicles v),
    'trips', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.trips t),
    'maintenance', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.maintenance m),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from public.notifications n),
    'audit_events', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.audit_events a),
    'app_settings', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.app_settings s)
  );

  return result;
end;
$$;


ALTER FUNCTION "public"."admin_export_backup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reset_demo_data"("p_confirm" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  env_mode text;
begin
  select value->>'mode' into env_mode
    from public.app_settings
   where key='environment';
  if coalesce(env_mode,'development') = 'production' then
    raise exception 'Reset demo data is disabled in production';
  end if;
  if coalesce(p_confirm,'') <> 'RESET' then
    raise exception 'Confirmation required: pass p_confirm = RESET';
  end if;
  if not public.user_has_permission(auth.uid(), 'settings.manage')
     and not public.user_has_permission(auth.uid(), 'studio.manage') then
    raise exception 'Insufficient privileges';
  end if;
  delete from public.notifications;
  delete from public.audit_events;
  delete from public.odometer_disputes;
  delete from public.trip_actions;
  delete from public.trips;
  delete from public.maintenance_records;
end;
$$;


ALTER FUNCTION "public"."admin_reset_demo_data"("p_confirm" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_run_jobs"("p_force" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.has_permission(auth.uid(), 'system.jobs.run') is not true then
    raise exception 'No access';
  end if;

  -- Call core runner
  return public.run_due_jobs(p_force);
end;
$$;


ALTER FUNCTION "public"."admin_run_jobs"("p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_trigger_generic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."audit_trigger_generic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bootstrap_super_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  admin_role_id uuid;
BEGIN
  IF (SELECT COUNT(*) FROM public.user_roles) > 0 THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO admin_role_id
  FROM public.roles
  WHERE name = 'System Administrator'
  LIMIT 1;

  IF admin_role_id IS NULL THEN
    RAISE EXCEPTION 'System Administrator role not found';
  END IF;

  INSERT INTO public.user_roles (user_id, role_id)
  VALUES (auth.uid(), admin_role_id);

  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."bootstrap_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_odometer_anomaly_alert"("p_vehicle_id" "uuid", "p_trip_id" "uuid", "p_expected_km" numeric, "p_actual_km" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  u record;
  title_en text := 'Odometer anomaly detected';
  title_ar text := 'تنبيه: اختلاف في قراءة العداد';
  body text;
BEGIN
  -- Bilingual, government tone. (We store one message; UI can display as-is.)
  body :=
    title_ar || ' / ' || title_en || E'\n'
    || 'Vehicle ID: ' || p_vehicle_id::text || E'\n'
    || 'Trip ID: ' || p_trip_id::text || E'\n'
    || 'Expected (last): ' || p_expected_km::text || ' km' || E'\n'
    || 'Actual (start): ' || p_actual_km::text || ' km' || E'\n'
    || 'Policy: allowed variance ≤ 3 km.';

  FOR u IN SELECT user_id FROM public.users_with_permission('alerts.odometer_anomaly')
  LOOP
    INSERT INTO public.notifications (recipient_id, title, body, severity, entity_type, entity_id)
    SELECT u.user_id, title_ar, body, 'WARN', 'trip', p_trip_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = u.user_id
        AND n.entity_type = 'trip'
        AND n.entity_id = p_trip_id
        AND n.title = title_ar
    );
  END LOOP;

  -- Audit event (best effort)
  BEGIN
    INSERT INTO public.audit_events (action, entity_type, entity_id, summary, metadata)
    VALUES (
      'trips.odometer_anomaly',
      'trip',
      p_trip_id,
      'Odometer anomaly alert generated',
      jsonb_build_object(
        'vehicle_id', p_vehicle_id,
        'expected_km', p_expected_km,
        'actual_km', p_actual_km,
        'threshold_km', 3
      )
    );
  EXCEPTION WHEN undefined_table THEN
    -- audit_events might not exist in some environments
    NULL;
  END;
END;
$$;


ALTER FUNCTION "public"."create_odometer_anomaly_alert"("p_vehicle_id" "uuid", "p_trip_id" "uuid", "p_expected_km" numeric, "p_actual_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_department_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select department_id from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_department_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_trip_compliance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_reason text;
begin
  if new.vehicle_id is null then
    return new;
  end if;

  -- Only enforce on create, or when vehicle changes, or when moving into submitted/active states
  if (tg_op = 'INSERT')
     or (tg_op = 'UPDATE' and new.vehicle_id is distinct from old.vehicle_id)
     or (tg_op = 'UPDATE' and coalesce(new.status,'') is distinct from coalesce(old.status,'')) then

    v_reason := public.vehicle_trip_block_reason(new.vehicle_id);

    if v_reason is not null and length(trim(v_reason)) > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'TRIP_BLOCKED:' || v_reason;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_trip_compliance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_vehicle_trip_block"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  reason text;
BEGIN
  IF NEW.vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  reason := public.vehicle_trip_block_reason(NEW.vehicle_id);

  IF reason IS NOT NULL THEN
    RAISE EXCEPTION 'Vehicle is blocked: %', reason
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_vehicle_trip_block"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_trip_no"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.trip_no := 'TRP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(CAST(EXTRACT(EPOCH FROM now())::bigint % 10000 AS TEXT), 4, '0');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_trip_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_vehicle_deadline_notifications"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r record;
  u record;
  inserted_count int := 0;
  last_rowcount int := 0;
  title text;
  body text;
  sev public.notification_severity;
BEGIN
  -- recipients: approvers + settings managers + vehicle editors
  FOR r IN
    SELECT v.*
    FROM public.vehicles v
  LOOP
    -- Insurance 30-day warning
    IF r.insurance_end_date IS NOT NULL
      AND r.insurance_end_date >= CURRENT_DATE
      AND r.insurance_end_date <= (CURRENT_DATE + 30)
    THEN
      title := 'Insurance expiring soon';
      body := 'Vehicle ' || r.plate_number || ' insurance ends on ' || r.insurance_end_date::text;
      sev := 'WARN';
      IF r.insurance_end_date <= (CURRENT_DATE + 1) THEN
        sev := 'BLOCKER';
      END IF;

      FOR u IN
        SELECT user_id FROM public.users_with_permission('settings.manage')
        UNION SELECT user_id FROM public.users_with_permission('trips.approve')
        UNION SELECT user_id FROM public.users_with_permission('vehicles.edit')
      LOOP
        INSERT INTO public.notifications (recipient_id, title, body, severity, entity_type, entity_id)
        SELECT u.user_id, title, body, sev, 'vehicle', r.id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.recipient_id = u.user_id
            AND n.entity_type = 'vehicle'
            AND n.entity_id = r.id
            AND n.title = title
            AND n.created_at::date = CURRENT_DATE
        );

        GET DIAGNOSTICS last_rowcount = ROW_COUNT;
        inserted_count := inserted_count + last_rowcount;
      END LOOP;
    END IF;

    -- Registration 30-day warning
    IF r.registration_end_date IS NOT NULL
      AND r.registration_end_date >= CURRENT_DATE
      AND r.registration_end_date <= (CURRENT_DATE + 30)
    THEN
      title := 'Registration expiring soon';
      body := 'Vehicle ' || r.plate_number || ' registration ends on ' || r.registration_end_date::text;
      sev := 'WARN';
      IF r.registration_end_date <= (CURRENT_DATE + 1) THEN
        sev := 'BLOCKER';
      END IF;

      FOR u IN
        SELECT user_id FROM public.users_with_permission('settings.manage')
        UNION SELECT user_id FROM public.users_with_permission('trips.approve')
        UNION SELECT user_id FROM public.users_with_permission('vehicles.edit')
      LOOP
        INSERT INTO public.notifications (recipient_id, title, body, severity, entity_type, entity_id)
        SELECT u.user_id, title, body, sev, 'vehicle', r.id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.recipient_id = u.user_id
            AND n.entity_type = 'vehicle'
            AND n.entity_id = r.id
            AND n.title = title
            AND n.created_at::date = CURRENT_DATE
        );

        GET DIAGNOSTICS last_rowcount = ROW_COUNT;
        inserted_count := inserted_count + last_rowcount;
      END LOOP;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$;


ALTER FUNCTION "public"."generate_vehicle_deadline_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_fleet_kpis"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total int;
  v_active int;
  v_maint int;
  v_oos int;
  v_pending int;
  v_active_trips int;
  v_service_overdue int;
  v_insurance_exp_30 int;
  v_registration_exp_30 int;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.vehicles;
  SELECT COUNT(*) INTO v_active FROM public.vehicles WHERE status = 'Active';
  SELECT COUNT(*) INTO v_maint FROM public.vehicles WHERE status = 'Maintenance';
  SELECT COUNT(*) INTO v_oos FROM public.vehicles WHERE status = 'OutOfService';

  SELECT COUNT(*) INTO v_pending FROM public.trips WHERE status = 'PendingApproval';
  SELECT COUNT(*) INTO v_active_trips FROM public.trips WHERE status IN ('Active', 'Approved');

  -- Service overdue: based on vehicle_trip_block_reason
  SELECT COUNT(*) INTO v_service_overdue
  FROM public.vehicles v
  WHERE public.vehicle_trip_block_reason(v.id) = 'SERVICE_OVERDUE';

  SELECT COUNT(*) INTO v_insurance_exp_30
  FROM public.vehicles
  WHERE insurance_end_date IS NOT NULL
    AND insurance_end_date >= CURRENT_DATE
    AND insurance_end_date <= (CURRENT_DATE + 30);

  SELECT COUNT(*) INTO v_registration_exp_30
  FROM public.vehicles
  WHERE registration_end_date IS NOT NULL
    AND registration_end_date >= CURRENT_DATE
    AND registration_end_date <= (CURRENT_DATE + 30);

  RETURN jsonb_build_object(
    'totalVehicles', v_total,
    'activeVehicles', v_active,
    'maintenanceVehicles', v_maint,
    'outOfServiceVehicles', v_oos,
    'pendingApprovals', v_pending,
    'activeTrips', v_active_trips,
    'serviceOverdue', v_service_overdue,
    'insuranceExpiring30', v_insurance_exp_30,
    'registrationExpiring30', v_registration_exp_30
  );
END;
$$;


ALTER FUNCTION "public"."get_fleet_kpis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_notifications_count"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COUNT(*)::int
  FROM public.notifications
  WHERE recipient_id = auth.uid()
    AND is_read = false
$$;


ALTER FUNCTION "public"."get_unread_notifications_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_permissions"("_user_id" "uuid") RETURNS TABLE("permission_key" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT p.key
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = _user_id
$$;


ALTER FUNCTION "public"."get_user_permissions"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id, staff_id, name_en, name_ar, job_title, phone, department_id, active, created_at, updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'staff_id', 'TEMP-' || LEFT(NEW.id::text, 8)),
    COALESCE(NEW.raw_user_meta_data->>'name_en', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'name_ar', 'مستخدم جديد'),
    COALESCE(NEW.raw_user_meta_data->>'job_title', 'Employee'),
    NEW.raw_user_meta_data->>'phone',
    NULL,
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_permission_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id
      and p.key = p_permission_key
  );
$$;


ALTER FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_permission_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_audit_event"("p_action" "text", "p_entity_type" "text" DEFAULT NULL::"text", "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_summary" "text" DEFAULT NULL::"text", "p_metadata_json" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_events (
    actor_user_id, action, entity_type, entity_id, summary, metadata_json
  ) VALUES (
    auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, p_metadata_json
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."log_audit_event"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_summary" "text", "p_metadata_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_all_notifications_read"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  c int;
BEGIN
  UPDATE public.notifications
  SET is_read = true, read_at = now()
  WHERE recipient_id = auth.uid()
    AND is_read = false;

  GET DIAGNOSTICS c = ROW_COUNT;
  RETURN c;
END;
$$;


ALTER FUNCTION "public"."mark_all_notifications_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_due_jobs"("p_force" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := now();
  v_job record;
  v_run_id uuid;
  v_ran int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_features jsonb;
  v_reminders_enabled boolean := true;
begin
  -- Feature flag gate: app_settings key 'features' -> remindersEnabled
  select value into v_features
  from public.app_settings
  where key = 'features'
  limit 1;

  if v_features is not null and (v_features ? 'remindersEnabled') then
    v_reminders_enabled := coalesce((v_features->>'remindersEnabled')::boolean, true);
  end if;

  for v_job in
    select *
    from public.system_jobs
    where is_enabled = true
  loop
    -- Decide if due
    if not p_force then
      if v_job.last_run_at is not null then
        if v_now < (v_job.last_run_at + make_interval(mins => v_job.interval_minutes)) then
          v_skipped := v_skipped + 1;
          continue;
        end if;
      end if;
    end if;

    -- Start run record
    insert into public.system_job_runs (job_id, status, meta)
    values (v_job.id, 'running', jsonb_build_object('forced', p_force))
    returning id into v_run_id;

    begin
      -- Execute job by key
      if v_job.job_key = 'reminders.generate' then
        if v_reminders_enabled = false then
          update public.system_job_runs
          set status = 'skipped', finished_at = now(),
              meta = meta || jsonb_build_object('reason','remindersDisabled')
          where id = v_run_id;

          update public.system_jobs
          set last_run_at = now(),
              last_status = 'skipped',
              last_error = null
          where id = v_job.id;

          v_skipped := v_skipped + 1;
        else
          perform public.generate_vehicle_deadline_notifications();

          update public.system_job_runs
          set status = 'success', finished_at = now()
          where id = v_run_id;

          update public.system_jobs
          set last_run_at = now(),
              last_status = 'success',
              last_error = null
          where id = v_job.id;

          v_ran := v_ran + 1;
        end if;
      else
        -- Unknown job key (skip, but record)
        update public.system_job_runs
        set status = 'skipped', finished_at = now(),
            meta = meta || jsonb_build_object('reason','unknown_job_key')
        where id = v_run_id;

        update public.system_jobs
        set last_run_at = now(),
            last_status = 'skipped',
            last_error = null
        where id = v_job.id;

        v_skipped := v_skipped + 1;
      end if;

    exception when others then
      v_failed := v_failed + 1;

      update public.system_job_runs
      set status = 'failed', finished_at = now(),
          error = sqlerrm
      where id = v_run_id;

      update public.system_jobs
      set last_run_at = now(),
          last_status = 'failed',
          last_error = sqlerrm
      where id = v_job.id;
    end;
  end loop;

  return jsonb_build_object(
    'ran', v_ran,
    'skipped', v_skipped,
    'failed', v_failed
  );
end;
$$;


ALTER FUNCTION "public"."run_due_jobs"("p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_vehicle_odometer_from_trip"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current numeric;
  v_new numeric;
BEGIN
  -- pick the best available odometer value from the trip
  v_new := NULL;

  IF NEW.end_odometer_final_value IS NOT NULL THEN
    v_new := NEW.end_odometer_final_value;
  ELSIF NEW.start_odometer_final_value IS NOT NULL THEN
    v_new := NEW.start_odometer_final_value;
  END IF;

  IF v_new IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT current_odometer INTO v_current
  FROM public.vehicles
  WHERE id = NEW.vehicle_id
  FOR UPDATE;

  UPDATE public.vehicles
  SET current_odometer = GREATEST(COALESCE(v_current, 0), COALESCE(v_new, 0)),
      updated_at = now()
  WHERE id = NEW.vehicle_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_vehicle_odometer_from_trip"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_detect_trip_start_odometer_anomaly"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current numeric;
  v_diff numeric;
BEGIN
  -- Use vehicles.current_odometer as the authoritative "last recorded".
  SELECT current_odometer INTO v_current
  FROM public.vehicles
  WHERE id = NEW.vehicle_id;

  IF v_current IS NULL OR NEW.start_odometer_final_value IS NULL THEN
    RETURN NEW;
  END IF;

  v_diff := abs(NEW.start_odometer_final_value - v_current);

  IF v_diff > 3 THEN
    PERFORM public.create_odometer_anomaly_alert(
      NEW.vehicle_id,
      NEW.id,
      v_current,
      NEW.start_odometer_final_value
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_detect_trip_start_odometer_anomaly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_permission"("_user_id" "uuid", "_permission_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id
      AND p.key = _permission_key
  )
$$;


ALTER FUNCTION "public"."user_has_permission"("_user_id" "uuid", "_permission_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_with_permission"("p_perm" "text") RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id AS user_id
  FROM public.profiles p
  WHERE public.user_has_permission(p.id, p_perm) = true
$$;


ALTER FUNCTION "public"."users_with_permission"("p_perm" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vehicle_trip_block_reason"("p_vehicle_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v RECORD;
  current_km NUMERIC;
  next_service_km NUMERIC;
BEGIN
  SELECT
    id,
    current_odometer,
    service_interval_km,
    service_notify_before_km,
    insurance_end_date,
    registration_end_date
  INTO v
  FROM public.vehicles
  WHERE id = p_vehicle_id;

  IF NOT FOUND THEN
    RETURN 'VEHICLE_NOT_FOUND';
  END IF;

  -- Insurance blocks
  IF v.insurance_end_date IS NOT NULL THEN
    IF v.insurance_end_date < CURRENT_DATE THEN
      RETURN 'INSURANCE_EXPIRED';
    ELSIF v.insurance_end_date <= (CURRENT_DATE + 1) THEN
      RETURN 'INSURANCE_EXPIRES_WITHIN_1_DAY';
    END IF;
  END IF;

  -- Registration blocks
  IF v.registration_end_date IS NOT NULL THEN
    IF v.registration_end_date < CURRENT_DATE THEN
      RETURN 'REGISTRATION_EXPIRED';
    ELSIF v.registration_end_date <= (CURRENT_DATE + 1) THEN
      RETURN 'REGISTRATION_EXPIRES_WITHIN_1_DAY';
    END IF;
  END IF;

  -- Service blocks
  current_km := COALESCE(v.current_odometer::NUMERIC, 0);

  IF v.service_interval_km IS NOT NULL AND v.service_interval_km > 0 THEN
    -- next interval: ceil(current/interval)*interval
    next_service_km := CEIL(current_km / v.service_interval_km::NUMERIC) * v.service_interval_km::NUMERIC;

    IF current_km >= next_service_km THEN
      RETURN 'SERVICE_OVERDUE';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."vehicle_trip_block_reason"("p_vehicle_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_type" "text" NOT NULL,
    "severity" "public"."alert_severity" DEFAULT 'INFO'::"public"."alert_severity" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "due_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid"
);


ALTER TABLE "public"."alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "file_url" "text" NOT NULL,
    "uploaded_by" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "summary" "text",
    "metadata_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."destinations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."destinations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "default_interval_days" integer,
    "default_interval_km" integer,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."maintenance_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "severity" "public"."notification_severity" DEFAULT 'INFO'::"public"."notification_severity" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."odometer_disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "stage" "public"."odometer_stage" NOT NULL,
    "extracted_value" numeric(12,2),
    "claimed_value" numeric(12,2),
    "reason" "text",
    "status" "public"."dispute_status" DEFAULT 'OPEN'::"public"."dispute_status" NOT NULL,
    "resolved_value" numeric(12,2),
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."odometer_disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "staff_id" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "job_title" "text" NOT NULL,
    "phone" "text",
    "department_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_job_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "error" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."system_job_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "is_enabled" boolean DEFAULT true NOT NULL,
    "interval_minutes" integer DEFAULT 1440 NOT NULL,
    "last_run_at" timestamp with time zone,
    "last_status" "text",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "action" "public"."trip_action_type" NOT NULL,
    "actor_user_id" "uuid",
    "comment" "text",
    "metadata_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trip_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_no" "text" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "driver_user_id" "uuid" NOT NULL,
    "department_id" "uuid",
    "destination_id" "uuid",
    "destination_text" "text" NOT NULL,
    "purpose" "text",
    "job_order_no" "text",
    "start_odometer_value" numeric(12,2) NOT NULL,
    "start_odometer_photo_url" "text" NOT NULL,
    "start_fuel_level" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."trip_status" DEFAULT 'Draft'::"public"."trip_status" NOT NULL,
    "approved_by_user_id" "uuid",
    "approved_at" timestamp with time zone,
    "rejected_by_user_id" "uuid",
    "rejected_at" timestamp with time zone,
    "reject_reason" "text",
    "end_odometer_value" numeric(12,2),
    "end_odometer_photo_url" "text",
    "end_fuel_level" "text",
    "closed_at" timestamp with time zone,
    "distance_km" numeric(12,2),
    "anomaly_flag" boolean DEFAULT false,
    "anomaly_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_odometer_extracted_value" numeric(12,2),
    "start_odometer_ocr_confidence" numeric(5,2),
    "start_odometer_ocr_raw_text" "text",
    "start_odometer_final_value" numeric(12,2),
    "start_odometer_disputed" boolean DEFAULT false NOT NULL,
    "start_odometer_claimed_value" numeric(12,2),
    "end_odometer_extracted_value" numeric(12,2),
    "end_odometer_ocr_confidence" numeric(5,2),
    "end_odometer_ocr_raw_text" "text",
    "end_odometer_final_value" numeric(12,2),
    "end_odometer_disputed" boolean DEFAULT false NOT NULL,
    "end_odometer_claimed_value" numeric(12,2),
    "requested_by" "uuid",
    "requested_driver_id" "uuid",
    "requested_by_user_id" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "trips_end_odometer_photo_required_when_closed" CHECK ((("status" <> 'Closed'::"public"."trip_status") OR (("end_odometer_photo_url" IS NOT NULL) AND ("length"("end_odometer_photo_url") > 0) AND ("end_odometer_value" IS NOT NULL)))),
    CONSTRAINT "trips_start_odometer_photo_required" CHECK ((("start_odometer_photo_url" IS NOT NULL) AND ("length"("start_odometer_photo_url") > 0)))
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_maintenance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "maintenance_type_id" "uuid",
    "custom_type_name" "text",
    "description" "text",
    "scheduled_date" "date",
    "scheduled_odometer" integer,
    "completed_date" "date",
    "completed_odometer" integer,
    "cost" numeric(10,2),
    "notes" "text",
    "status" "text" DEFAULT 'Scheduled'::"text" NOT NULL,
    "reminder_sent" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_maintenance_status_check" CHECK (("status" = ANY (ARRAY['Scheduled'::"text", 'Overdue'::"text", 'InProgress'::"text", 'Completed'::"text", 'Cancelled'::"text"])))
);


ALTER TABLE "public"."vehicle_maintenance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "default_anomaly_distance_threshold_km" numeric(10,2) DEFAULT 3,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_types_default_anomaly_distance_threshold_km_range" CHECK ((("default_anomaly_distance_threshold_km" >= (0)::numeric) AND ("default_anomaly_distance_threshold_km" <= (50)::numeric)))
);


ALTER TABLE "public"."vehicle_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_code" "text" NOT NULL,
    "plate_no" "text" NOT NULL,
    "vehicle_type_id" "uuid",
    "department_id" "uuid",
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "current_odometer" numeric(12,2) DEFAULT 0 NOT NULL,
    "approvals_required" boolean DEFAULT true NOT NULL,
    "anomaly_distance_threshold_km" numeric(10,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "service_interval_km" integer DEFAULT 10000 NOT NULL,
    "service_notify_before_km" integer DEFAULT 1000 NOT NULL,
    "insurance_policy_no" "text",
    "insurance_start_date" "date",
    "insurance_end_date" "date",
    "registration_no" "text",
    "registration_end_date" "date",
    "vin" "text",
    "make" "text",
    "model" "text",
    "year" integer,
    "color" "text",
    "insurance_document_url" "text",
    "registration_start_date" "date",
    "registration_document_url" "text",
    "authority_user_id" "uuid",
    CONSTRAINT "vehicles_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Maintenance'::"text", 'OutOfService'::"text"])))
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."destinations"
    ADD CONSTRAINT "destinations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_types"
    ADD CONSTRAINT "maintenance_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."odometer_disputes"
    ADD CONSTRAINT "odometer_disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_staff_id_key" UNIQUE ("staff_id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_permission_id_key" UNIQUE ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_job_runs"
    ADD CONSTRAINT "system_job_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_jobs"
    ADD CONSTRAINT "system_jobs_job_key_key" UNIQUE ("job_key");



ALTER TABLE ONLY "public"."system_jobs"
    ADD CONSTRAINT "system_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_actions"
    ADD CONSTRAINT "trip_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_trip_no_key" UNIQUE ("trip_no");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_id_key" UNIQUE ("user_id", "role_id");



ALTER TABLE ONLY "public"."vehicle_maintenance"
    ADD CONSTRAINT "vehicle_maintenance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_types"
    ADD CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_plate_no_key" UNIQUE ("plate_no");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_vehicle_code_key" UNIQUE ("vehicle_code");



CREATE INDEX "idx_trips_requested_by_user_id" ON "public"."trips" USING "btree" ("requested_by_user_id");



CREATE OR REPLACE TRIGGER "audit_app_settings_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_generic"();



CREATE OR REPLACE TRIGGER "audit_destinations_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."destinations" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_generic"();



CREATE OR REPLACE TRIGGER "audit_vehicle_maintenance_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."vehicle_maintenance" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_generic"();



CREATE OR REPLACE TRIGGER "audit_vehicles_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_generic"();



CREATE OR REPLACE TRIGGER "detect_trip_start_odometer_anomaly" AFTER INSERT ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."trg_detect_trip_start_odometer_anomaly"();



CREATE OR REPLACE TRIGGER "set_trip_no" BEFORE INSERT ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."generate_trip_no"();



CREATE OR REPLACE TRIGGER "trg_enforce_vehicle_trip_block" BEFORE INSERT ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_vehicle_trip_block"();



CREATE OR REPLACE TRIGGER "trg_system_jobs_updated_at" BEFORE UPDATE ON "public"."system_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_trips_enforce_compliance" BEFORE INSERT OR UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_trip_compliance"();



CREATE OR REPLACE TRIGGER "trips_sync_vehicle_odometer" AFTER INSERT OR UPDATE OF "start_odometer_final_value", "end_odometer_final_value" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."sync_vehicle_odometer_from_trip"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_settings_updated_at" BEFORE UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_trips_updated_at" BEFORE UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_vehicle_maintenance_updated_at" BEFORE UPDATE ON "public"."vehicle_maintenance" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_vehicles_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."odometer_disputes"
    ADD CONSTRAINT "odometer_disputes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."odometer_disputes"
    ADD CONSTRAINT "odometer_disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."odometer_disputes"
    ADD CONSTRAINT "odometer_disputes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_job_runs"
    ADD CONSTRAINT "system_job_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."system_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_actions"
    ADD CONSTRAINT "trip_actions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."trip_actions"
    ADD CONSTRAINT "trip_actions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_driver_user_id_fkey" FOREIGN KEY ("driver_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_rejected_by_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_requested_driver_id_fkey" FOREIGN KEY ("requested_driver_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_maintenance"
    ADD CONSTRAINT "vehicle_maintenance_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."vehicle_maintenance"
    ADD CONSTRAINT "vehicle_maintenance_maintenance_type_id_fkey" FOREIGN KEY ("maintenance_type_id") REFERENCES "public"."maintenance_types"("id");



ALTER TABLE ONLY "public"."vehicle_maintenance"
    ADD CONSTRAINT "vehicle_maintenance_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_authority_user_id_fkey" FOREIGN KEY ("authority_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."vehicle_types"("id");



CREATE POLICY "Approvers can resolve disputes" ON "public"."odometer_disputes" FOR UPDATE TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'trips.approve'::"text")) WITH CHECK ("public"."user_has_permission"("auth"."uid"(), 'trips.approve'::"text"));



CREATE POLICY "Authenticated can read departments" ON "public"."departments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can read destinations" ON "public"."destinations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can read maintenance_types" ON "public"."maintenance_types" FOR SELECT USING (true);



CREATE POLICY "Authenticated can read permissions" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can read profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can read roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can read vehicle_types" ON "public"."vehicle_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Bootstrap first System Administrator" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (( SELECT "count"(*) AS "count"
   FROM "public"."user_roles" "user_roles_1") = 0) AND ("role_id" = ( SELECT "roles"."id"
   FROM "public"."roles"
  WHERE ("roles"."name" = 'System Administrator'::"text")
 LIMIT 1))));



CREATE POLICY "Create attachments" ON "public"."attachments" FOR INSERT TO "authenticated" WITH CHECK ((("uploaded_by" = "auth"."uid"()) OR ("uploaded_by" IS NULL)));



CREATE POLICY "Create dispute for own trip" ON "public"."odometer_disputes" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "odometer_disputes"."trip_id") AND ("t"."driver_user_id" = "auth"."uid"()))))));



CREATE POLICY "Create trip_actions" ON "public"."trip_actions" FOR INSERT TO "authenticated" WITH CHECK ((("actor_user_id" = "auth"."uid"()) OR ("actor_user_id" IS NULL)));



CREATE POLICY "Create trips" ON "public"."trips" FOR INSERT TO "authenticated" WITH CHECK (((("driver_user_id" = "auth"."uid"()) AND ("requested_by_user_id" = "auth"."uid"())) OR (("requested_by_user_id" = "auth"."uid"()) AND "public"."user_has_permission"("auth"."uid"(), 'trips.request_for_others'::"text"))));



CREATE POLICY "Create vehicle_maintenance with permission" ON "public"."vehicle_maintenance" FOR INSERT WITH CHECK ("public"."user_has_permission"("auth"."uid"(), 'vehicles.edit'::"text"));



CREATE POLICY "Create vehicles" ON "public"."vehicles" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_permission"("auth"."uid"(), 'vehicles.create'::"text") AND ("public"."user_has_permission"("auth"."uid"(), 'vehicles.read_all'::"text") OR ("public"."user_has_permission"("auth"."uid"(), 'vehicles.read_department'::"text") AND (("department_id" IS NULL) OR ("department_id" = "public"."current_user_department_id"()))) OR ((NOT "public"."user_has_permission"("auth"."uid"(), 'vehicles.read_all'::"text")) AND (NOT "public"."user_has_permission"("auth"."uid"(), 'vehicles.read_department'::"text"))))));



CREATE POLICY "Delete alerts with settings.manage" ON "public"."alerts" FOR DELETE TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text"));



CREATE POLICY "Delete vehicle_maintenance with permission" ON "public"."vehicle_maintenance" FOR DELETE USING ("public"."user_has_permission"("auth"."uid"(), 'vehicles.edit'::"text"));



CREATE POLICY "Delete vehicles" ON "public"."vehicles" FOR DELETE TO "authenticated" USING (("public"."user_has_permission"("auth"."uid"(), 'vehicles.delete'::"text") AND ("public"."user_has_permission"("auth"."uid"(), 'vehicles.read_all'::"text") OR ("public"."user_has_permission"("auth"."uid"(), 'vehicles.read_department'::"text") AND (("department_id" IS NULL) OR ("department_id" = "public"."current_user_department_id"()))) OR ((NOT "public"."user_has_permission"("auth"."uid"(), 'vehicles.read_all'::"text")) AND (NOT "public"."user_has_permission"("auth"."uid"(), 'vehicles.read_department'::"text"))))));



CREATE POLICY "Drivers can create disputes for own trips" ON "public"."odometer_disputes" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "odometer_disputes"."trip_id") AND ("t"."driver_user_id" = "auth"."uid"()))))));



CREATE POLICY "Drivers can read own disputes" ON "public"."odometer_disputes" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "odometer_disputes"."trip_id") AND ("t"."driver_user_id" = "auth"."uid"())))) OR "public"."user_has_permission"("auth"."uid"(), 'trips.read'::"text") OR "public"."user_has_permission"("auth"."uid"(), 'trips.approve'::"text")));



CREATE POLICY "Edit profiles with permission" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("public"."user_has_permission"("auth"."uid"(), 'users.edit'::"text") OR ("id" = "auth"."uid"())));



CREATE POLICY "Insert alerts with settings.manage" ON "public"."alerts" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text"));



CREATE POLICY "Insert audit_events blocked" ON "public"."audit_events" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Manage departments with permission" ON "public"."departments" TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text"));



CREATE POLICY "Manage destinations" ON "public"."destinations" TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text"));



CREATE POLICY "Manage maintenance_types with permission" ON "public"."maintenance_types" USING ("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text"));



CREATE POLICY "Manage permissions" ON "public"."permissions" TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'roles.edit'::"text"));



CREATE POLICY "Manage profiles with permission" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_permission"("auth"."uid"(), 'users.create'::"text") OR ("id" = "auth"."uid"())));



CREATE POLICY "Manage role_permissions" ON "public"."role_permissions" TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'roles.edit'::"text"));



CREATE POLICY "Manage roles with permission" ON "public"."roles" TO "authenticated" USING (("public"."user_has_permission"("auth"."uid"(), 'roles.create'::"text") OR "public"."user_has_permission"("auth"."uid"(), 'roles.edit'::"text") OR "public"."user_has_permission"("auth"."uid"(), 'roles.delete'::"text")));



CREATE POLICY "Manage settings" ON "public"."settings" TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text"));



CREATE POLICY "Manage user_roles" ON "public"."user_roles" TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'roles.edit'::"text"));



CREATE POLICY "Manage vehicle_types" ON "public"."vehicle_types" TO "authenticated" USING (("public"."user_has_permission"("auth"."uid"(), 'vehicle_types.create'::"text") OR "public"."user_has_permission"("auth"."uid"(), 'vehicle_types.edit'::"text") OR "public"."user_has_permission"("auth"."uid"(), 'vehicle_types.delete'::"text")));



CREATE POLICY "Read alerts for authenticated" ON "public"."alerts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read attachments" ON "public"."attachments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read audit_events" ON "public"."audit_events" FOR SELECT TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'audit.read'::"text"));



CREATE POLICY "Read disputes for own trips or approvers" ON "public"."odometer_disputes" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "odometer_disputes"."trip_id") AND ("t"."driver_user_id" = "auth"."uid"())))) OR "public"."user_has_permission"("auth"."uid"(), 'trips.approve'::"text")));



CREATE POLICY "Read own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("recipient_id" = "auth"."uid"()));



CREATE POLICY "Read own trips" ON "public"."trips" FOR SELECT TO "authenticated" USING ((("driver_user_id" = "auth"."uid"()) OR ("requested_by_user_id" = "auth"."uid"())));



CREATE POLICY "Read role_permissions" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'roles.read'::"text"));



CREATE POLICY "Read settings" ON "public"."settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read trip_actions" ON "public"."trip_actions" FOR SELECT TO "authenticated" USING (("public"."user_has_permission"("auth"."uid"(), 'audit.read'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_actions"."trip_id") AND ("t"."driver_user_id" = "auth"."uid"()))))));



CREATE POLICY "Read trips (scoped)" ON "public"."trips" FOR SELECT TO "authenticated" USING (("public"."user_has_permission"("auth"."uid"(), 'trips.read_all'::"text") OR ("public"."user_has_permission"("auth"."uid"(), 'trips.read_department'::"text") AND (("department_id" IS NULL) OR ("department_id" = "public"."current_user_department_id"()))) OR ("driver_user_id" = "auth"."uid"()) OR (COALESCE("requested_by_user_id", "requested_by") = "auth"."uid"())));



CREATE POLICY "Read user_roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("public"."user_has_permission"("auth"."uid"(), 'users.read'::"text") OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Read vehicle_maintenance (scoped)" ON "public"."vehicle_maintenance" FOR SELECT TO "authenticated" USING (("public"."user_has_permission"("auth"."uid"(), 'maintenance.read'::"text") AND ("public"."user_has_permission"("auth"."uid"(), 'maintenance.read_all'::"text") OR ("public"."user_has_permission"("auth"."uid"(), 'maintenance.read_department'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."vehicles" "v"
  WHERE (("v"."id" = "vehicle_maintenance"."vehicle_id") AND (("v"."department_id" IS NULL) OR ("v"."department_id" = "public"."current_user_department_id"())))))) OR ((NOT "public"."user_has_permission"("auth"."uid"(), 'maintenance.read_all'::"text")) AND (NOT "public"."user_has_permission"("auth"."uid"(), 'maintenance.read_department'::"text"))))));



CREATE POLICY "Read vehicles (scoped)" ON "public"."vehicles" FOR SELECT TO "authenticated" USING (("public"."user_has_permission"("auth"."uid"(), 'vehicles.read'::"text") AND ("public"."user_has_permission"("auth"."uid"(), 'vehicles.read_all'::"text") OR ("public"."user_has_permission"("auth"."uid"(), 'vehicles.read_department'::"text") AND (("department_id" IS NULL) OR ("department_id" = "public"."current_user_department_id"()))) OR ((NOT "public"."user_has_permission"("auth"."uid"(), 'vehicles.read_all'::"text")) AND (NOT "public"."user_has_permission"("auth"."uid"(), 'vehicles.read_department'::"text"))))));



CREATE POLICY "Resolve dispute with approve permission" ON "public"."odometer_disputes" FOR UPDATE TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'trips.approve'::"text")) WITH CHECK ("public"."user_has_permission"("auth"."uid"(), 'trips.approve'::"text"));



CREATE POLICY "Update alerts with settings.manage" ON "public"."alerts" FOR UPDATE TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text")) WITH CHECK ("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text"));



CREATE POLICY "Update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("recipient_id" = "auth"."uid"())) WITH CHECK (("recipient_id" = "auth"."uid"()));



CREATE POLICY "Update own trips" ON "public"."trips" FOR UPDATE TO "authenticated" USING ((("driver_user_id" = "auth"."uid"()) OR "public"."user_has_permission"("auth"."uid"(), 'trips.edit'::"text")));



CREATE POLICY "Update vehicle_maintenance with permission" ON "public"."vehicle_maintenance" FOR UPDATE USING ("public"."user_has_permission"("auth"."uid"(), 'vehicles.edit'::"text"));



CREATE POLICY "Update vehicles" ON "public"."vehicles" FOR UPDATE TO "authenticated" USING ("public"."user_has_permission"("auth"."uid"(), 'vehicles.edit'::"text")) WITH CHECK (("public"."user_has_permission"("auth"."uid"(), 'vehicles.edit'::"text") AND ("public"."user_has_permission"("auth"."uid"(), 'vehicles.read_all'::"text") OR ("public"."user_has_permission"("auth"."uid"(), 'vehicles.read_department'::"text") AND (("department_id" IS NULL) OR ("department_id" = "public"."current_user_department_id"()))) OR ((NOT "public"."user_has_permission"("auth"."uid"(), 'vehicles.read_all'::"text")) AND (NOT "public"."user_has_permission"("auth"."uid"(), 'vehicles.read_department'::"text"))))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."destinations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manage_app_settings" ON "public"."app_settings" USING (("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text") OR (("key" = 'branding'::"text") AND "public"."user_has_permission"("auth"."uid"(), 'studio.manage'::"text")))) WITH CHECK (("public"."user_has_permission"("auth"."uid"(), 'settings.manage'::"text") OR (("key" = 'branding'::"text") AND "public"."user_has_permission"("auth"."uid"(), 'studio.manage'::"text"))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."odometer_disputes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_read_branding" ON "public"."app_settings" FOR SELECT USING (("key" = 'branding'::"text"));



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_job_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_job_runs_read" ON "public"."system_job_runs" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'system.jobs.view'::"text"));



CREATE POLICY "system_job_runs_write_block" ON "public"."system_job_runs" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."system_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_jobs_read" ON "public"."system_jobs" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'system.jobs.view'::"text"));



CREATE POLICY "system_jobs_write_block" ON "public"."system_jobs" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."trip_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_maintenance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."admin_export_backup"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_export_backup"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_export_backup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_export_backup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_reset_demo_data"("p_confirm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_reset_demo_data"("p_confirm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_reset_demo_data"("p_confirm" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_run_jobs"("p_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_run_jobs"("p_force" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_run_jobs"("p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_run_jobs"("p_force" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_trigger_generic"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_trigger_generic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_trigger_generic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bootstrap_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_odometer_anomaly_alert"("p_vehicle_id" "uuid", "p_trip_id" "uuid", "p_expected_km" numeric, "p_actual_km" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."create_odometer_anomaly_alert"("p_vehicle_id" "uuid", "p_trip_id" "uuid", "p_expected_km" numeric, "p_actual_km" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_odometer_anomaly_alert"("p_vehicle_id" "uuid", "p_trip_id" "uuid", "p_expected_km" numeric, "p_actual_km" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_department_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_department_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_department_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_trip_compliance"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_trip_compliance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_trip_compliance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_vehicle_trip_block"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_vehicle_trip_block"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_vehicle_trip_block"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_trip_no"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_trip_no"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_trip_no"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_vehicle_deadline_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_vehicle_deadline_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_vehicle_deadline_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_fleet_kpis"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_fleet_kpis"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_fleet_kpis"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_notifications_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_notifications_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_notifications_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_permissions"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_permissions"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_permissions"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_permission_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_permission_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_audit_event"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_summary" "text", "p_metadata_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit_event"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_summary" "text", "p_metadata_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit_event"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_summary" "text", "p_metadata_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_due_jobs"("p_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_due_jobs"("p_force" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."run_due_jobs"("p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_due_jobs"("p_force" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_vehicle_odometer_from_trip"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_vehicle_odometer_from_trip"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_vehicle_odometer_from_trip"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_detect_trip_start_odometer_anomaly"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_detect_trip_start_odometer_anomaly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_detect_trip_start_odometer_anomaly"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_permission"("_user_id" "uuid", "_permission_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_permission"("_user_id" "uuid", "_permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_permission"("_user_id" "uuid", "_permission_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."users_with_permission"("p_perm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."users_with_permission"("p_perm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_with_permission"("p_perm" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."vehicle_trip_block_reason"("p_vehicle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."vehicle_trip_block_reason"("p_vehicle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vehicle_trip_block_reason"("p_vehicle_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."alerts" TO "anon";
GRANT ALL ON TABLE "public"."alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."alerts" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."attachments" TO "anon";
GRANT ALL ON TABLE "public"."attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."attachments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_events" TO "anon";
GRANT ALL ON TABLE "public"."audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."destinations" TO "anon";
GRANT ALL ON TABLE "public"."destinations" TO "authenticated";
GRANT ALL ON TABLE "public"."destinations" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_types" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_types" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_types" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."odometer_disputes" TO "anon";
GRANT ALL ON TABLE "public"."odometer_disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."odometer_disputes" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."system_job_runs" TO "anon";
GRANT ALL ON TABLE "public"."system_job_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_job_runs" TO "service_role";



GRANT ALL ON TABLE "public"."system_jobs" TO "anon";
GRANT ALL ON TABLE "public"."system_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."trip_actions" TO "anon";
GRANT ALL ON TABLE "public"."trip_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_actions" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_maintenance" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_maintenance" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_maintenance" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_types" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_types" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_types" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































