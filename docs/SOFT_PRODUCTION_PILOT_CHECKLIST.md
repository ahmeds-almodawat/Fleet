# Fleet7 Soft Production Pilot Checklist

Use this checklist after applying Update 01, Update 02, and Update 03.

## 1. Security freeze

- [ ] Rotate Supabase anon key if needed.
- [ ] Rotate Supabase service role key.
- [ ] Rotate OCR.Space key.
- [ ] Remove `.env` from the repo.
- [ ] Remove `supabase/functions/.env` from the repo.
- [ ] Remove `supabase/.temp/` from the repo.
- [ ] Remove `backup_data.sql`, `backup_schema.sql`, and `Fleet7.zip` from the repo.
- [ ] Remove `bun.lockb` if using npm.
- [ ] Purge leaked files from Git history if the repo was ever pushed/shared.

## 2. Supabase production alignment

- [ ] Confirm only one Supabase project ref is used in `.env`, `supabase/config.toml`, and deployment settings.
- [ ] Set `app_settings.environment.mode` to `production`.
- [ ] Confirm demo reset is blocked in production.
- [ ] Confirm `run-jobs` requires an admin JWT or scheduler secret.
- [ ] Confirm function CORS is pinned to your real domain.

## 3. Functional pilot users

Create only these first:

- [ ] 1 System Administrator.
- [ ] 1 Fleet Manager.
- [ ] 2 Drivers.

## 4. Pilot vehicles

Start with only 2 or 3 vehicles:

- [ ] Add vehicle master data.
- [ ] Add insurance date.
- [ ] Add registration date.
- [ ] Add current odometer.
- [ ] Add service interval.
- [ ] Upload any required documents.

## 5. Workflow test

- [ ] Admin creates user.
- [ ] Admin assigns role.
- [ ] Fleet Manager adds vehicle.
- [ ] Driver creates trip.
- [ ] Fleet Manager approves trip.
- [ ] Driver starts trip.
- [ ] OCR odometer works or allows manual dispute.
- [ ] Driver completes trip.
- [ ] Vehicle odometer updates correctly.
- [ ] Expired insurance blocks a trip.
- [ ] Expired registration blocks a trip.
- [ ] 0-km vehicle is not blocked as service-overdue.
- [ ] Maintenance record can be created.
- [ ] Reports load.
- [ ] Backup export works.
- [ ] System jobs can be run only by authorized admin.
- [ ] Driver cannot access admin pages.

## 6. One-week pilot

- [ ] Use the platform internally for one week.
- [ ] Log issues daily.
- [ ] Do not add new features during pilot unless they block operations.
- [ ] Review audit logs after one week.
- [ ] Review notification quality after one week.

## Go/no-go

Soft production is acceptable when:

- Security blockers are closed.
- The validation script passes.
- Admin/Fleet Manager/Driver workflows pass.
- No data-loss or unauthorized-access issue appears during the pilot.
