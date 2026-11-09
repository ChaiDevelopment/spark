# MVP roadmap

Status as of 2026-11-10.

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0. Repository audit | ✅ | |
| 1. Foundation (Next.js, TypeScript, Tailwind, design tokens, Supabase SSR) | ✅ | |
| 2. Database and authentication | ✅ Code complete | 9 migrations, RLS on every table, email/password and Google, protected routes. RLS is tested on Postgres (PGlite). |
| 3. Onboarding and profile | ✅ | Server-side 18+ gate, calculated completion |
| 4. R2 image system | ✅ Code complete | Presign, confirm with re-encoding and EXIF stripping, signed view, delete, reorder, cleanup cron. **Not yet run against a real bucket.** |
| 5. Chemistry | ✅ | 42 questions, 6 weighted dimensions, deterministic and versioned, with explanations |
| 6. Discovery and matching | ✅ | Filters, daily limits, atomic idempotent matching |
| 7. Chat | ✅ Code complete | Realtime, receipts, typing (Broadcast), pagination, unmatch, block, archive |
| 8. Safety and admin | ✅ | Reports, blocks, moderation queue, photo review, suspension, roles, audit log |
| 9. PWA and deployment | 🟡 | Manifest, service worker and offline page are done, and the docs are written. **Not deployed:** this needs credentials and your approval. |

## Not yet verified (needs credentials)
The code for these exists, but nothing has run them against live services yet:
- Real sign-up, email verification and password reset on a Supabase project
- Google OAuth
- Photo upload, view and delete on a real R2 bucket, including the CORS rule
- Realtime delivery and typing on hosted Supabase
- The `flows.spec.ts` end-to-end journey (`E2E_SUPABASE=1`)

**Next step:** create a *test* Supabase project and R2 bucket, fill in `.env.local`, run `npm run db:push`, then run `E2E_SUPABASE=1 npm run test:e2e`.

## Known limitations and deliberate choices
- **Photo moderation** is manual by default (`PHOTO_MODERATION_MODE=manual`). There is no automated nudity or face detection; a free option would need evaluation. `auto` mode approves photos after the technical checks only.
- **Typing status** uses Realtime Broadcast instead of a `typing_status` table. This avoids a database write per keystroke and saves quota.
- **Email:** Supabase's built-in mailer sends only a few emails per hour. Custom SMTP is needed before inviting testers.
- **Push notifications:** `device_tokens` and `notification_preferences` exist, but Web Push (VAPID and a sender) is not implemented. In-app notifications work.
- **Identity verification:** the `user_verification` table exists; there is no selfie or ID verification flow yet.
- **Backups:** the Supabase Free plan has none, so run `supabase db dump` manually.
- **Hosting:** Vercel Hobby does not allow commercial use, so any paid launch needs a hosting decision first.

## Post-MVP (in order)
1. Custom SMTP and branded auth emails
2. Web Push for new matches and messages
3. Photo verification (a selfie compared against profile photos)
4. Premium entitlements wired to a payment provider (Midtrans or Xendit for Indonesia) through webhooks into `payment_events`. The schema is ready; no client writes are needed.
5. Premium features: see who liked you, more likes, rewind, boosts, advanced filters
6. Indonesian (Bahasa Indonesia) UI localisation
7. Message retention policy automation, and data export for users
