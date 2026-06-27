# Fleet Control

Fleet Control is a bilingual EN/AR fleet operations platform for vehicles, trips, approvals, maintenance, compliance documents, notifications, reports, and soft-production health monitoring.

## Current release

`v0.7.0` focuses on release stability:

- Route-level lazy loading to reduce initial JavaScript bundle size.
- Cleaner production lint output.
- Release cleanup script for old local artifacts.
- Extra unit tests for export utilities and route permission groups.
- Updated operations/deployment documentation.

## Local setup

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

## Frontend environment variables

Only frontend-safe variables should be used in Vercel or local Vite builds:

```env
VITE_SUPABASE_PROJECT_ID=your_project_ref
VITE_SUPABASE_URL=https://your_project_ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Never put service-role keys in Vercel frontend variables.

## Supabase Edge Function secrets

Server-only secrets belong in Supabase Edge Function secrets:

```txt
ANON_KEY
SERVICE_ROLE_KEY
OCRSPACE_API_KEY
OWNER_USER_IDS
RUN_JOBS_SECRET
CORS_ALLOWED_ORIGINS
```

## Validation commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --omit=dev
```

For a stricter lint gate with zero warnings:

```bash
npm run lint:strict
```

## Release cleanup

Preview cleanup targets:

```bash
npm run release:clean
```

Apply cleanup:

```bash
npm run release:clean:apply
```

This removes old local artifacts such as backup SQL dumps, ZIP files, Bun lockfile, `dist`, and accidental env files.

## Deployment

Deploy frontend:

```bash
vercel --prod
```

Deploy Edge Functions only when function code or CORS secrets change:

```bash
npx supabase functions deploy admin-create-user
npx supabase functions deploy ocr-odometer
npx supabase functions deploy run-jobs
npx supabase functions deploy maintenance-reminders
```

Do not run `supabase db reset` on production.

## Operational checks

Daily during soft production:

- Open `/admin/health` and confirm 0 critical / 0 warning.
- Check GitHub Actions → Fleet Scheduled Jobs is green.
- Test one real driver trip from mobile.
- Confirm vehicle document expiry and maintenance reminders appear correctly.

## Production key rotation

Before official production, rotate leaked or old testing keys:

1. Rotate Supabase service-role key.
2. Rotate OCR.Space API key.
3. Update Supabase Edge Function secrets.
4. Redeploy Edge Functions.
5. Test `run-jobs` without secret = 401, with secret = 200.
