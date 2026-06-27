# Fleet7 Soft Production Release Runbook

Use this before every soft-production deployment.

## 1) Secrets and project safety

- Rotate any Supabase/OCR key that was ever stored in a ZIP, Git repo, screenshot, or chat.
- Confirm the production Supabase project reference matches `supabase/config.toml`.
- Store real values only in the hosting provider and Supabase Edge Function secrets.
- Never commit `.env`, `supabase/functions/.env`, `supabase/.temp`, SQL backup dumps, ZIP builds, `node_modules`, or `dist`.

## 2) Required environment variables

Frontend hosting:

```txt
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Supabase Edge Functions:

```txt
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SERVICE_ROLE_KEY=YOUR_ROTATED_SERVICE_ROLE_KEY
OCRSPACE_API_KEY=YOUR_ROTATED_OCRSPACE_API_KEY
CORS_ALLOWED_ORIGINS=https://your-production-domain.com
RUN_JOBS_SECRET=long-random-secret
OWNER_USER_IDS=optional-comma-separated-owner-user-ids
```

## 3) Local release gate

Run:

```bash
npm ci
npm run validate
```

`npm run validate` checks repository hygiene, function guardrails, CORS, TypeScript, lint, tests, build, and production dependency audit.

## 4) Database release gate

Apply migrations in order, then open:

```txt
/admin/health
```

The page should show no critical failures. If environment mode is not production, run the production setting migration or update:

```sql
update public.app_settings
set value = jsonb_build_object('mode', 'production')
where key = 'environment';
```

## 5) Edge Function release gate

Deploy functions and verify:

- `run-jobs` rejects calls with no JWT and no `x-scheduler-secret`.
- `run-jobs` accepts calls with the correct `x-scheduler-secret`.
- `maintenance-reminders` rejects calls with no JWT and no `x-scheduler-secret`.
- `ocr-odometer` requires a valid user JWT.
- Browser CORS allows only the production domain and local dev domains.

## 6) Pilot workflow test

Test with two vehicles before full use:

1. Admin creates Fleet Manager and Driver.
2. Fleet Manager creates/edits vehicle.
3. Driver creates trip with odometer photo.
4. Approval workflow works if approvals are enabled.
5. Driver closes trip with end odometer photo.
6. Vehicle odometer updates correctly.
7. Expired registration/insurance blocks a trip.
8. Maintenance reminder and system jobs run.
9. Reports export.
10. Backup export.
11. Driver cannot open `/users`, `/roles`, `/admin/audit`, `/admin/jobs`, `/admin/backups`, `/admin/health`, or `/admin/studio`.

## 7) Rollback

If deployment fails:

- Roll back the hosting deployment to the previous build.
- Do not roll back database migrations blindly after real data entry.
- Disable risky features in `app_settings.features` first if possible.
- Export a backup before any manual data correction.
