# Testing

| Suite | Command | Needs | Covers |
|---|---|---|---|
| Unit | `npm run test:unit` | Nothing | Chemistry engine (determinism, weights, missing answers, Jaccard, matrices, versions); image pipeline (magic bytes, EXIF/GPS stripping, sizes, rejection of fake or animated files) |
| Database / RLS | `npm run test:db` | Nothing (in-process Postgres via PGlite) | Applies **every migration** in order, then tests authorization as anonymous users, several regular users, a moderator and an admin: private data, protected columns, the age gate, discovery filters, likes, limits, idempotent matching, blocking, chat membership and impersonation, reports, staff boundaries, audit logs, notifications and maintenance |
| E2E (public) | `npm run test:e2e -- tests/e2e/public.spec.ts` | `npm run build` first | Landing and legal pages, auth form validation, protected-route redirects, 401/403 on APIs, cross-origin refusal, cron secret, manifest and service worker, security headers, no horizontal overflow, on **mobile, tablet and desktop** |
| E2E (journeys) | `E2E_SUPABASE=1 npm run test:e2e -- tests/e2e/flows.spec.ts` | A **dedicated test** Supabase project and storage bucket, configured in `.env.local` | Two users sign up, onboard, upload photos, answer chemistry, like each other, match and chat in real time |

Also run `npm run lint` and `npm run typecheck`.

## Notes
- The PGlite harness (`tests/db/harness.ts`) recreates the Supabase roles (`anon`, `authenticated`, `service_role`), Supabase's default grants and `auth.uid()`. This means the explicit `REVOKE`s in the migrations are actually exercised. Realtime-specific statements are skipped there.
- Install the Playwright browser once with `npx playwright install chromium`. If your system drive is full, set `PLAYWRIGHT_BROWSERS_PATH` to another drive, and point `TEMP`/`TMP` there too.
- The journey suite creates real accounts. Never point it at production.
- Never fabricate results: if a suite is skipped because credentials are missing, report it as skipped.

## Manual checks before a release
- Google sign-in works end to end.
- Password-reset email links open `/reset-password`.
- A bucket object URL without a signature is refused.
- A non-staff account gets 404 at `/admin`.
- The app installs as a PWA on Android Chrome and iOS Safari, and the offline page appears when the network is off.
