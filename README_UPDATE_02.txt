Fleet7 Update 02 — Typecheck + Runtime Consistency

Replace these files after Update 01.

Main fixes:
1. Replaced corrupted src/integrations/supabase/types.ts with a temporary safe fallback so TypeScript can run.
   Important: this is a temporary fallback. When Supabase CLI access is available, regenerate real types:
   npx supabase gen types typescript --project-id <project-ref> --schema public > src/integrations/supabase/types.ts

2. Cleaned duplicate i18n translation keys by preserving the final effective value for each key.
   This removes TypeScript duplicate-key errors and Vite duplicate-key warnings.

3. Fixed TypeScript compile blockers:
   - PageHeader now supports subtitle/actions/icon plus children.
   - formatNumber/formatCurrency support the existing "integer" style preset.
   - MaintenanceCostReportPage imports toast.
   - Supabase join results use safe unknown casts where nested relationship typing is ambiguous.
   - TripDetails includes vehicle_id and department_id fields used in audit metadata and vehicle update.
   - VehiclesPage VehicleType supports bilingual name_en/name_ar fields.
   - ReportsPage audit logging no longer calls .catch() on a PostgREST builder.

4. CommandPalette maintenance search now uses vehicle_maintenance instead of maintenance_records.

5. Replaced the dummy test with real compliance smoke tests.

Validation performed after these replacements:
- npx tsc -p tsconfig.app.json --noEmit: PASSED
- npm run build: PASSED
- npm run test -- --run: PASSED, 3 tests

Known remaining issue:
- npm run lint still fails mostly because of existing no-explicit-any rules across the old codebase. This update improves TypeScript/build readiness but does not attempt the full lint cleanup yet.
