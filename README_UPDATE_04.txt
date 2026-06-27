Fleet7 Update 04 — Release Gate + Health Audit + Dependency Cleanup

Replace/add the files in this ZIP on top of Updates 01, 02, and 03.

What changed:
- Updated Vite/Vitest dependency stack and package-lock.
- Production dependency audit is now 0 vulnerabilities.
- Added stronger soft-production validation script.
- Added /admin/health route and sidebar item.
- Replaced SystemHealthPage with permission-gated DB health RPC usage.
- Added DB migration for system.health.view permission and admin_system_health_check().
- Removed Supabase API runtime caching from PWA config to avoid browser-caching sensitive fleet/auth data.
- Added manual chunks to reduce single-bundle size.
- Added release runbook.

After replacement:
1. npm ci
2. npm run validate
3. Apply Supabase migration 20260627000300_health_audit_release_guardrails.sql
4. Deploy Edge Functions and frontend
5. Open /admin/health with System Administrator

Important manual steps still required:
- Rotate exposed keys if not already done.
- Delete secrets/artifacts from Git history if repo was pushed.
- Configure CORS_ALLOWED_ORIGINS and RUN_JOBS_SECRET in Edge Function secrets.
