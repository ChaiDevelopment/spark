# MVP roadmap

Status as of 2026-11-10.

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0. Repository audit | ✅ | |
| 1. Foundation (Next.js, TypeScript, Tailwind, design tokens, Supabase SSR) | ✅ | |
| 2. Database and authentication | ✅ Code complete | 9 migrations, RLS on every table, email/password and Google, protected routes. RLS is tested on Postgres (PGlite). |
| 3. Onboarding and profile | ✅ | Server-side 18+ gate, calculated completion |
| 4. Photo storage | ✅ Code complete | Server-side upload with re-encoding and EXIF stripping, signed view, delete, reorder, cleanup cron. Moved from Cloudflare R2 to a Railway Storage Bucket (S3-compatible, no CORS needed). **Not yet run against a real bucket.** |
| 5. Chemistry | ✅ | 42 questions, 6 weighted dimensions, deterministic and versioned, with explanations |
| 6. Discovery and matching | ✅ | Filters, daily limits, atomic idempotent matching |
| 7. Chat | ✅ Code complete | Realtime, receipts, typing (Broadcast), pagination, unmatch, block, archive |
| 8. Safety and admin | ✅ | Reports, blocks, moderation queue, photo review, suspension, roles, audit log |
| 9. PWA and deployment | 🟡 | Manifest, service worker and offline page are done. Deployed to Railway (`spark-production-73e8.up.railway.app`) against the Supabase project with all migrations applied. Pending: photo bucket and cron service. |

## Not yet verified (needs credentials)
The code for these exists, but nothing has run them against live services yet:
- Real sign-up, email verification and password reset on a Supabase project
- Google OAuth
- Photo upload, view and delete on the Railway bucket
- Realtime delivery and typing on hosted Supabase
- The `flows.spec.ts` end-to-end journey (`E2E_SUPABASE=1`)

**Next step:** create the Railway bucket (STORAGE_SETUP.md), fill in `S3_*` locally and on Railway, then run `E2E_SUPABASE=1 npm run test:e2e`.

## Known limitations and deliberate choices
- **Photo moderation** is automatic by default (`PHOTO_MODERATION_MODE=auto`): photos go live after technical checks only, so users can match right away. There is no automated nudity or face detection; reports and staff review are the safety net. Set `manual` to require approval before photos are shown.
- **Typing status** uses Realtime Broadcast instead of a `typing_status` table. This avoids a database write per keystroke and saves quota.
- **Email:** Supabase's built-in mailer sends only a few emails per hour. Custom SMTP is needed before inviting testers.
- **Push notifications:** `device_tokens` and `notification_preferences` exist, but Web Push (VAPID and a sender) is not implemented. In-app notifications work.
- **Identity verification:** the `user_verification` table exists; there is no selfie or ID verification flow yet.
- **Backups:** the Supabase Free plan has none, so run `supabase db dump` manually.
- **Hosting:** Railway has no permanent free plan; budget for it before the trial credit ends.

## Post-MVP (in order)
1. Custom SMTP and branded auth emails
2. Web Push for new matches and messages
3. Photo verification (a selfie compared against profile photos)
4. Premium entitlements wired to a payment provider (Midtrans or Xendit for Indonesia) through webhooks into `payment_events`. The schema is ready; no client writes are needed.
5. Premium features: see who liked you, more likes, rewind, boosts, advanced filters
6. Indonesian (Bahasa Indonesia) UI localisation
7. Message retention policy automation, and data export for users
