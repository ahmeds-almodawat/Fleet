import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceRoleKey } from '../_shared/env.ts';

function normalizeError(e: any) {
  const message = e?.message ?? String(e);
  const code = e?.code ?? null;

  if (code === '23505') {
    const msgLower = String(message).toLowerCase();
    if (msgLower.includes('staff_id')) {
      return { status: 400, body: { code: 400, error: 'staff_id_exists', message: 'Staff ID already exists' } };
    }
    if (msgLower.includes('email')) {
      return { status: 400, body: { code: 400, error: 'email_exists', message: 'Email already exists' } };
    }
    return { status: 400, body: { code: 400, error: 'unique_violation', message } };
  }

  const msgLower = String(message).toLowerCase();
  if (msgLower.includes('already registered') || msgLower.includes('user already') || msgLower.includes('email')) {
    return { status: 400, body: { code: 400, error: 'email_exists', message } };
  }

  if (msgLower.includes('password') && (msgLower.includes('least') || msgLower.includes('weak') || msgLower.includes('length'))) {
    return { status: 400, body: { code: 400, error: 'weak_password', message } };
  }

  return { status: 400, body: { code: 400, error: 'bad_request', message } };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = getServiceRoleKey();

    const ownerUserIds = (Deno.env.get('OWNER_USER_IDS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const SYSTEM_ADMIN_ROLE_NAME = 'System Administrator';

    if (!supabaseUrl || !anonKey) {
      return jsonResponse(req, { code: 500, message: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' }, 500);
    }

    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonResponse(req, { code: 401, message: 'Missing Authorization bearer token' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse(req, { code: 401, message: 'Invalid JWT' }, 401);

    const callerId = userData.user.id;
    const isOwner = ownerUserIds.includes(callerId);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let allowed = false;
    let via: 'none' | 'owner_allowlist' | 'system_admin_role' | 'permission' = 'none';

    if (isOwner) {
      allowed = true;
      via = 'owner_allowlist';
    } else {
      const { data: sysRole, error: sysRoleErr } = await admin
        .from('roles')
        .select('id')
        .eq('name', SYSTEM_ADMIN_ROLE_NAME)
        .maybeSingle();

      if (sysRoleErr) return jsonResponse(req, { code: 500, message: sysRoleErr.message }, 500);

      const sysRoleId = sysRole?.id ? String(sysRole.id) : null;

      const { data: roleRows, error: roleErr } = await admin
        .from('user_roles')
        .select('role_id')
        .eq('user_id', callerId)
        .limit(50);

      if (roleErr) return jsonResponse(req, { code: 500, message: roleErr.message }, 500);

      const hasSysAdmin =
        Boolean(sysRoleId) &&
        Array.isArray(roleRows) &&
        roleRows.some((r: any) => String(r?.role_id) === sysRoleId);

      if (hasSysAdmin) {
        allowed = true;
        via = 'system_admin_role';
      } else {
        const { data: hasPerm, error: permErr } = await admin.rpc('user_has_permission', {
          _user_id: callerId,
          _permission_key: 'users.create',
        });

        if (permErr) return jsonResponse(req, { code: 500, message: permErr.message }, 500);
        if (hasPerm) {
          allowed = true;
          via = 'permission';
        }
      }
    }

    if (!allowed) {
      return jsonResponse(req, { code: 403, error: 'forbidden', message: 'User not allowed' }, 403);
    }

    const body = await req.json();
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    if (!email || !password || !body.staff_id || !body.name_en || !body.name_ar || !body.job_title) {
      return jsonResponse(req, {
        code: 400,
        error: 'missing_fields',
        message: 'Missing required fields (email, password, staff_id, name_en, name_ar, job_title)',
      }, 400);
    }

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
      const norm = normalizeError(createErr ?? { message: 'Failed to create user' });
      return jsonResponse(req, norm.body, norm.status);
    }

    const newUserId = created.user.id;

    const { error: profileErr } = await admin.from('profiles').upsert(
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
      { onConflict: 'id' },
    );

    if (profileErr) {
      await admin.auth.admin.deleteUser(newUserId);
      const norm = normalizeError(profileErr);
      return jsonResponse(req, norm.body, norm.status);
    }

    const roleIds = Array.isArray(body.role_ids) ? body.role_ids.filter(Boolean) : [];
    if (roleIds.length) {
      const { error: rolesErr } = await admin.from('user_roles').insert(
        roleIds.map((role_id: string) => ({ user_id: newUserId, role_id })),
      );

      if (rolesErr) {
        try {
          await admin.from('profiles').delete().eq('id', newUserId);
        } catch (_) {}
        await admin.auth.admin.deleteUser(newUserId);

        const norm = normalizeError(rolesErr);
        return jsonResponse(req, norm.body, norm.status);
      }
    }

    try {
      await admin.from('audit_events').insert({
        actor_id: callerId,
        action: 'users.create',
        entity_type: 'user',
        entity_id: newUserId,
        metadata: { via },
      });
    } catch (_) {}

    return jsonResponse(req, { ok: true, user_id: newUserId, via });
  } catch (e: any) {
    return jsonResponse(req, { code: 500, message: e?.message ?? String(e) }, 500);
  }
});
