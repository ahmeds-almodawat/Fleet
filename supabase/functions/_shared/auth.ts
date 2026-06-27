import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAnonKey, getEnv, getRequiredEnv, getServiceRoleKey } from './env.ts';

type SupabaseClient = ReturnType<typeof createClient>;

export function getAdminClient(): SupabaseClient {
  return createClient(getRequiredEnv('SUPABASE_URL'), getServiceRoleKey(), {
    auth: { persistSession: false },
  });
}

export async function getAuthenticatedUser(req: Request): Promise<{ id: string; email?: string | null }> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new Response(JSON.stringify({ code: 401, message: 'Missing Authorization bearer token' }), { status: 401 });
  }

  const client = createClient(getRequiredEnv('SUPABASE_URL'), getAnonKey(req), {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    throw new Response(JSON.stringify({ code: 401, message: 'Invalid JWT' }), { status: 401 });
  }

  return { id: data.user.id, email: data.user.email };
}

export function isOwner(userId: string): boolean {
  return getEnv('OWNER_USER_IDS')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}

export async function userHasAnyPermission(admin: SupabaseClient, userId: string, permissionKeys: string[]): Promise<boolean> {
  for (const permissionKey of permissionKeys) {
    const { data, error } = await admin.rpc('user_has_permission', {
      _user_id: userId,
      _permission_key: permissionKey,
    });

    if (error) throw error;
    if (data === true) return true;
  }

  return false;
}

export async function requireUserPermission(
  req: Request,
  permissionKeys: string[],
): Promise<{ userId: string; admin: SupabaseClient; via: 'owner_allowlist' | 'permission' }> {
  const user = await getAuthenticatedUser(req);
  const admin = getAdminClient();

  if (isOwner(user.id)) return { userId: user.id, admin, via: 'owner_allowlist' };

  const allowed = await userHasAnyPermission(admin, user.id, permissionKeys);
  if (!allowed) {
    throw new Response(JSON.stringify({ code: 403, message: 'Insufficient privileges' }), { status: 403 });
  }

  return { userId: user.id, admin, via: 'permission' };
}

export async function requireSchedulerSecretOrUserPermission(
  req: Request,
  permissionKeys: string[],
): Promise<{ admin: SupabaseClient; userId: string | null; via: 'scheduler_secret' | 'owner_allowlist' | 'permission' }> {
  const expected = getEnv('RUN_JOBS_SECRET');
  const provided = (req.headers.get('x-scheduler-secret') || '').trim();

  if (expected && provided && provided === expected) {
    return { admin: getAdminClient(), userId: null, via: 'scheduler_secret' };
  }

  const { userId, admin, via } = await requireUserPermission(req, permissionKeys);
  return { admin, userId, via };
}
