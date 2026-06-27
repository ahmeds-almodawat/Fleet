import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function normalizeError(e: any) {
  const message = e?.message ?? String(e);
  const code = e?.code ?? null;

  // Postgres unique violation
  if (code === "23505") {
    const msgLower = String(message).toLowerCase();
    if (msgLower.includes("staff_id")) {
      return {
        status: 400,
        body: { code: 400, error: "staff_id_exists", message: "Staff ID already exists" },
      };
    }
    if (msgLower.includes("email")) {
      return {
        status: 400,
        body: { code: 400, error: "email_exists", message: "Email already exists" },
      };
    }
    return {
      status: 400,
      body: { code: 400, error: "unique_violation", message },
    };
  }

  const msgLower = String(message).toLowerCase();

  if (
    msgLower.includes("already registered") ||
    msgLower.includes("user already") ||
    msgLower.includes("email")
  ) {
    return { status: 400, body: { code: 400, error: "email_exists", message } };
  }

  if (
    msgLower.includes("password") &&
    (msgLower.includes("least") || msgLower.includes("weak") || msgLower.includes("length"))
  ) {
    return { status: 400, body: { code: 400, error: "weak_password", message } };
  }

  return { status: 400, body: { code: 400, error: "bad_request", message } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || "";

    // Break-glass Owner allowlist
    const ownerUserIdsRaw = (Deno.env.get("OWNER_USER_IDS") || "").trim();
    const ownerUserIds = ownerUserIdsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const SYSTEM_ADMIN_ROLE_NAME = "System Administrator";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ code: 500, message: "Missing required environment variables" }, 500);
    }

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ code: 401, message: "Missing Authorization bearer token" }, 401);
    }

    // Validate caller session
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ code: 401, message: "Invalid JWT" }, 401);

    const callerId = userData.user.id;
    const isOwner = ownerUserIds.includes(callerId);

    // Admin client (service role)
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Permission gate (Owner allowlist OR System Administrator role OR users.create permission)
    let allowed = false;
    let via: "none" | "owner_allowlist" | "system_admin_role" | "permission" = "none";

    if (isOwner) {
      allowed = true;
      via = "owner_allowlist";
    } else {
      const { data: sysRole, error: sysRoleErr } = await admin
        .from("roles")
        .select("id")
        .eq("name", SYSTEM_ADMIN_ROLE_NAME)
        .maybeSingle();

      if (sysRoleErr) return json({ code: 500, message: sysRoleErr.message }, 500);

      const sysRoleId = sysRole?.id ? String(sysRole.id) : null;

      const { data: roleRows, error: roleErr } = await admin
        .from("user_roles")
        .select("role_id")
        .eq("user_id", callerId)
        .limit(50);

      if (roleErr) return json({ code: 500, message: roleErr.message }, 500);

      const hasSysAdmin =
        Boolean(sysRoleId) &&
        Array.isArray(roleRows) &&
        roleRows.some((r: any) => String(r?.role_id) === sysRoleId);

      if (hasSysAdmin) {
        allowed = true;
        via = "system_admin_role";
      } else {
        const { data: hasPerm, error: permErr } = await admin.rpc("user_has_permission", {
          _user_id: callerId,
          _permission_key: "users.create",
        });

        if (permErr) return json({ code: 500, message: permErr.message }, 500);
        if (hasPerm) {
          allowed = true;
          via = "permission";
        }
      }
    }

    if (!allowed) {
      return json({ code: 400, error: "bad_request", message: "User not allowed" }, 400);
    }

    const body = await req.json();

    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password || !body.staff_id || !body.name_en || !body.name_ar || !body.job_title) {
      return json(
        {
          code: 400,
          error: "missing_fields",
          message:
            "Missing required fields (email, password, staff_id, name_en, name_ar, job_title)",
        },
        400,
      );
    }

    // 1) Create Auth user (include metadata so DB trigger can populate profiles too)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        staff_id: body.staff_id,
        name_en: body.name_en,
        name_ar: body.name_ar,
        job_title: body.job_title,
        phone: body.phone ?? null,
        department_id: body.department_id ?? null,
        is_driver: !!body.is_driver,
      },
    });

    if (createErr || !created?.user) {
      const norm = normalizeError(createErr ?? { message: "Failed to create user" });
      return json(norm.body, norm.status);
    }

    const newUserId = created.user.id;

    // 2) Profile: use UPSERT because your DB trigger already inserts profiles row
    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: newUserId,
        staff_id: body.staff_id,
        name_en: body.name_en,
        name_ar: body.name_ar,
        job_title: body.job_title,
        phone: body.phone ?? null,
        department_id: body.department_id ?? null,
        active: true,
        is_driver: !!body.is_driver,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (profileErr) {
      // Rollback auth user if profile upsert fails (e.g., staff_id already exists)
      await admin.auth.admin.deleteUser(newUserId);
      const norm = normalizeError(profileErr);
      return json(norm.body, norm.status);
    }

    // 3) Assign roles
    const roleIds = Array.isArray(body.role_ids) ? body.role_ids.filter(Boolean) : [];
    if (roleIds.length) {
      const { error: rolesErr } = await admin.from("user_roles").insert(
        roleIds.map((role_id: string) => ({ user_id: newUserId, role_id })),
      );

      if (rolesErr) {
        // Rollback (best effort): remove profile + remove auth user
        try {
          await admin.from("profiles").delete().eq("id", newUserId);
        } catch (_) {}
        await admin.auth.admin.deleteUser(newUserId);

        const norm = normalizeError(rolesErr);
        return json(norm.body, norm.status);
      }
    }

    // 4) Audit (best effort)
    try {
      await admin.from("audit_events").insert({
        actor_id: callerId,
        action: "users.create",
        entity_type: "user",
        entity_id: newUserId,
        metadata: { via },
      });
    } catch (_) {
      // ignore
    }

    return json({ ok: true, user_id: newUserId, via });
  } catch (e: any) {
    return json({ code: 500, message: e?.message ?? String(e) }, 500);
  }
});
