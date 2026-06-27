import { getAllowedOrigins } from './env.ts';

const DEFAULT_LOCAL_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return true;
  return DEFAULT_LOCAL_ORIGINS.has(origin);
}

export function corsHeaders(req: Request, methods = 'POST, OPTIONS'): HeadersInit {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-scheduler-secret',
    'access-control-allow-methods': methods,
    'vary': 'Origin',
  };

  if (isAllowedOrigin(origin)) {
    headers['access-control-allow-origin'] = origin as string;
  }

  return headers;
}

export function optionsResponse(req: Request, methods = 'POST, OPTIONS'): Response {
  return new Response('ok', { headers: corsHeaders(req, methods) });
}

export function jsonResponse(req: Request, body: unknown, status = 200, methods = 'POST, OPTIONS'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req, methods),
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
