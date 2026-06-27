# Fleet7 Update 06 — Operations Expansion Pack

This update focuses on operational convenience after soft-production readiness. It does not include Supabase migrations, bucket changes, secrets changes, or destructive database commands.

## Included improvements

1. Mobile driver trip wizard
   - Adds `/trips/driver-wizard`.
   - Gives drivers a mobile-first guided view of their current/latest trip.
   - Provides quick access to New Trip and active trip action page.

2. Arabic/English print template polish
   - Adds bilingual trip print header/fields on Trip Details.
   - Adds print CSS improvements for cleaner PDF output.

3. Notification center improvements
   - Adds unread/warning/blocker summary cards.
   - Adds search, severity filter, read/unread filter.
   - Adds per-notification “Mark read”.

4. Vehicle document expiry dashboard
   - Adds `/vehicles/documents`.
   - Shows insurance/registration expiry, missing documents, and 30-day warnings.
   - Supports CSV, Excel-compatible `.xls`, and browser PDF print.

5. Maintenance calendar view
   - Adds `/maintenance/calendar`.
   - Groups maintenance by month.
   - Supports CSV, Excel-compatible `.xls`, and browser PDF print.

6. Export all reports to Excel/PDF
   - Adds `/reports/export-center`.
   - Exports trips, vehicles, maintenance, and notifications into one Excel-compatible workbook.
   - Browser print supports Save as PDF.

7. Admin activity/audit summary
   - Adds `/admin/activity`.
   - Summarizes audit events by actor, action, entity, exports, and sensitive actions.
   - Supports CSV, Excel-compatible `.xls`, and browser PDF print.

## Files to replace/add

- `src/App.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/index.css`
- `src/lib/exportFiles.ts`
- `src/pages/admin/AdminActivitySummaryPage.tsx`
- `src/pages/maintenance/MaintenanceCalendarPage.tsx`
- `src/pages/notifications/NotificationsPage.tsx`
- `src/pages/reports/ReportsExportCenterPage.tsx`
- `src/pages/trips/DriverTripWizardPage.tsx`
- `src/pages/trips/TripDetailsPage.tsx`
- `src/pages/vehicles/VehicleDocumentsDashboardPage.tsx`

## Validation performed

- `npm run typecheck` passed.
- `npm run lint` passed with existing warnings only.
- `npm run test` passed: 10 tests.
- `npm run build` passed.

## Deployment

After replacing files:

```powershell
npm run typecheck
npm run test
npm run build
vercel --prod
```

No Supabase migration is required for this update.
