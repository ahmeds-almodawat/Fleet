export function getEnv(name: string): string {
  return (Deno.env.get(name) || '').trim();
}

export function getRequiredEnv(name: string): string {
  const value = getEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getServiceRoleKey(): string {
  const value = getEnv('SERVICE_ROLE_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_SERVICE_ROLE');
  if (!value) {
    throw new Error('Missing service role key. Set SERVICE_ROLE_KEY in the Edge Function environment.');
  }
  return value;
}

export function getAnonKey(req?: Request): string {
  const value =
    getEnv('SUPABASE_ANON_KEY') ||
    getEnv('ANON_KEY') ||
    req?.headers.get('apikey') ||
    req?.headers.get('x-api-key') ||
    '';

  if (!value) {
    throw new Error('Missing anon key. Set SUPABASE_ANON_KEY in the Edge Function environment.');
  }

  return value;
}

export function getAllowedOrigins(): string[] {
  return getEnv('CORS_ALLOWED_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
