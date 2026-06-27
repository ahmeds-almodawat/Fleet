Fleet7 Update 01 - Soft Production Hardening

Replace/add the files in this pack into the same paths in your repo.

What this update does:
1. Removes public signup link and redirects /register to /login.
2. Adds route-level permission guards.
3. Adds safe CORS helper using CORS_ALLOWED_ORIGINS instead of CORS *.
4. Locks run-jobs and maintenance-reminders behind RUN_JOBS_SECRET or a user with permission.
5. Makes Edge Functions use one service role env preference: SERVICE_ROLE_KEY, with fallback support.
6. Adds .env.example and stronger .gitignore.
7. Fixes Supabase project_id mismatch in config.toml.
8. Adds a DB hardening migration for production mode and backup/reset table-name fixes.

Required environment variables after replacing:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SERVICE_ROLE_KEY
- OCRSPACE_API_KEY
- CORS_ALLOWED_ORIGINS
- RUN_JOBS_SECRET
- OWNER_USER_IDS optional
- RESEND_API_KEY optional

After replacing:
1. Rotate Supabase service role key, anon/publishable key, and OCR.Space key.
2. Add the new values to hosting/Supabase Edge Function secrets, not to git.
3. Run npm run build.
4. Apply the new migration to Supabase.
5. Deploy Edge Functions again.
6. Test Admin, Fleet Manager, and Driver flows.

Note: npx tsc still fails until src/integrations/supabase/types.ts is regenerated from Supabase. This update does not include generated DB types because they must match your live Supabase schema.
