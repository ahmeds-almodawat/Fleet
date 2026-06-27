# Fleet7 Update 05 — Operations UX Pack

Scope: UI/runtime-only update. No database reset, no bucket changes, no secret changes.

## Included improvements

- Driver mobile UX improvements
  - Trips list now has mobile card layout on small screens.
  - Trip detail action area and close-trip dialog are more mobile friendly.
  - Camera upload zone is larger and touch-friendly.

- Trip print/export
  - Trip details page now has Print and Export buttons.
  - Trips list now exports the current filtered list to CSV.
  - Print CSS improved for cleaner trip print/PDF output.

- Maintenance reminder polish
  - Maintenance page now uses the production `vehicle_maintenance` table instead of the old legacy `maintenance_records` name.
  - Adds reminder snapshot for overdue, due-soon, and scheduled work.

- Better dashboard KPIs
  - Adds operational pulse KPIs: average km/trip, compliance alerts, and operational queue.

- Backup restore dry-run
  - Adds JSON backup dry-run validator to the Backups page.
  - This validates backup file structure only and does not write to the database.
  - Restore testing should still be performed only on a separate Supabase test project.

## Replace/add files

- src/pages/trips/TripsPage.tsx
- src/pages/trips/TripDetailsPage.tsx
- src/pages/maintenance/MaintenancePage.tsx
- src/pages/dashboard/DashboardPage.tsx
- src/pages/admin/BackupExportPage.tsx
- src/lib/backupDryRun.ts
- src/test/backupDryRun.test.ts
- src/index.css
- README_UPDATE_05.md

## Validation performed

- npm run typecheck: PASSED
- npm run lint: PASSED with existing warnings only
- npm run test: PASSED, 10 tests
- npm run build: PASSED

## After replacement commands

```powershell
npm run typecheck
npm run test
npm run build
vercel --prod
```

No Supabase migration is required for this update.
