export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Temporary safe fallback Supabase types.
 *
 * The previous generated file was syntactically corrupted, which blocked
 * TypeScript checks for the whole app. Replace this file with a freshly
 * generated schema when you have Supabase CLI access:
 *
 *   npx supabase gen types typescript --project-id <project-ref> --schema public \
 *     > src/integrations/supabase/types.ts
 *
 * Until then, this permissive type preserves compile-time validity without
 * changing runtime behavior.
 */
export type Database = any;
