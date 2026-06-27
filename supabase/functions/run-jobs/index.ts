import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { requireSchedulerSecretOrUserPermission } from '../_shared/auth.ts';

// Runs scheduled system jobs. Production access is locked to either:
// 1) x-scheduler-secret matching RUN_JOBS_SECRET, or
// 2) an authenticated user with system.jobs.run permission / OWNER_USER_IDS.

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, 'GET, POST, OPTIONS');
  if (!['GET', 'POST'].includes(req.method)) {
    return jsonResponse(req, { ok: false, error: 'Method not allowed' }, 405, 'GET, POST, OPTIONS');
  }

  try {
    const { admin, userId, via } = await requireSchedulerSecretOrUserPermission(req, ['system.jobs.run']);

    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';

    const { data, error } = await admin.rpc('run_due_jobs', { p_force: force });
    if (error) throw new Error(error.message);

    return jsonResponse(req, {
      ok: true,
      result: data,
      via,
      actor_id: userId,
    }, 200, 'GET, POST, OPTIONS');
  } catch (e) {
    if (e instanceof Response) {
      const body = await e.text();
      return new Response(body, {
        status: e.status,
        headers: {
          ...Object.fromEntries(e.headers.entries()),
          ...Object.fromEntries(new Headers(jsonResponse(req, {}, 200, 'GET, POST, OPTIONS').headers).entries()),
        },
      });
    }

    return jsonResponse(req, {
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    }, 500, 'GET, POST, OPTIONS');
  }
});
