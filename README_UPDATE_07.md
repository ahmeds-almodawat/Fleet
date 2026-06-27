# Fleet7 Update 07 — Release Cleanup + Lazy Loading

This update focuses on stability and release quality after the operations expansion pack.

## Included improvements

- Reduces initial bundle size by lazy-loading route pages with `React.lazy` and `Suspense`.
- Keeps protected route permission checks active before loading protected pages.
- Adds route permission groups exported from `src/App.tsx` for easier tests and future audits.
- Adds pure export builders in `src/lib/exportFiles.ts` so CSV/Excel output can be unit-tested without triggering browser downloads.
- Adds tests for CSV escaping, Excel HTML escaping, and route permission groups.
- Cleans default lint output by making legacy generated `any`/Fast Refresh warnings non-blocking, while keeping hook rules-of-hooks as an error.
- Adds `npm run lint:strict` for stricter zero-warning checks when needed.
- Adds `scripts/release-clean.mjs` with dry-run/apply modes to remove old local artifacts safely.
- Improves README with setup, deployment, validation, cleanup, and operations guidance.

## Included files

```txt
src/App.tsx
src/lib/exportFiles.ts
src/test/exportFiles.test.ts
src/test/routes.test.ts
scripts/release-clean.mjs
eslint.config.js
package.json
package-lock.json
README.md
README_UPDATE_07.md
REMOVE_THESE_OLD_FILES_UPDATE_07.txt
```

## Apply commands

```powershell
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
vercel --prod
```

Optional cleanup preview:

```powershell
npm run release:clean
```

Optional cleanup apply:

```powershell
npm run release:clean:apply
```

## Notes

No Supabase migration. No bucket changes. No secrets changes. No Edge Function redeploy required.
