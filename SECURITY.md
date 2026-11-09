# Security

SPARK handles dating profiles, private messages, photos and dates of birth. The design assumes **the browser is hostile**. Any value that matters is decided by the server or the database.

## Controls

| Threat | Control | Where |
|---|---|---|
| Impersonation, IDOR | The user id always comes from the verified JWT (`getClaims()` on the server, `auth.uid()` in SQL). RPCs never take "my id" as a parameter. | `src/server/auth.ts`, every SQL function |
| Bypassing the UI to read or write data | RLS on every `public` table. Explicit `REVOKE`s remove Supabase's default grants, so tables without client-write policies are read-only. Sensitive writes go only through `SECURITY DEFINER` RPCs. | `supabase/migrations/*` |
| Privilege escalation | Roles live in `admin_users` and are checked with `private.is_staff()` / `is_admin()` inside every admin RPC. No `is_admin` flag is ever read from the client. The `/admin` area returns 404 to anyone who is not staff. | `0100_foundation`, `0600_logic`, `src/app/admin/layout.tsx` |
| Editing protected profile fields | Column-level grants: users cannot update `account_status`, `onboarding_completed_at`, `completion_percent` or verification fields | `0200_profiles` |
| Faked subscription | No client write access to `user_subscriptions`, `subscription_entitlements` or `payment_events`. Limits are read through `private.entitlement()` inside the RPCs. | `0500`, `0600` |
| Bypassing daily limits | Usage is counted and checked inside `like_user()`, in the same transaction as the like | `0600_logic` |
| Duplicate matches, race conditions | Ordered-pair unique constraint, `pg_advisory_xact_lock` on the pair, idempotent inserts | `like_user()` |
| Message spoofing or spam | `send_message()` sets the sender and checks membership and an active match. Limits: 1–2000 characters, 30 messages per minute, 1000 per day. `client_id` is unique, so retries cannot duplicate messages. | `0600_logic` |
| Unauthorized Realtime access | `postgres_changes` events respect RLS. Broadcast channels are private and authorized by policies on `realtime.messages`. | `0700` |
| Minors | DOB is required, and the database trigger rejects anyone under 18 (Asia/Jakarta date). DOB can be set once, through an RPC. Users can report an "Underage concern". | `0200`, `0600` |
| Location exposure | Only city, region and country are stored. No coordinates exist anywhere. | Schema |
| Private photo leakage | Private R2 bucket. Presigned GET URLs expire after 10 minutes and are only issued for rows the caller can read under RLS. Object keys contain random UUIDs. | `src/server/r2.ts`, `/api/photos/view` |
| Malicious uploads | Signed Content-Type and Content-Length. The server checks magic bytes and decodes with `sharp` using a pixel limit, rejecting animated images. It re-encodes to WebP, which **strips EXIF and GPS**, and deletes the original. Maximum 10 MB and 6 photos. | `src/server/images.ts`, `/api/photos/confirm` |
| Uploading into someone else's area | Keys are generated on the server under `uploads/{sessionUserId}/`. `keyBelongsTo()` is checked again at confirmation. | `src/server/r2.ts` |
| CSRF | SameSite=Lax session cookies, same-origin `Origin` checks on state-changing route handlers, and Server Actions' built-in origin checks | `src/server/http.ts` |
| XSS | React escaping, no `dangerouslySetInnerHTML` with user content, and a strict CSP: `object-src 'none'`, `frame-ancestors 'none'`, and connections allowed only to Supabase and R2 | `next.config.ts` |
| Clickjacking, sniffing, downgrade | `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy`, and a locked-down `Permissions-Policy` | `next.config.ts` |
| Brute force and abuse | Supabase Auth rate limits, plus `consume_rate_limit` for uploads, views, profile edits and account deletion, plus per-RPC limits for messages, blocks and reports | `0100`, `0600` |
| Leaking secrets | Secrets are only in `env.server.ts` (`server-only`). No `NEXT_PUBLIC_` secrets. `.env*.local` is git-ignored. | `src/lib/env*.ts` |
| Caching private data | Authenticated pages are dynamic. APIs send `Cache-Control: private, no-store`. The service worker caches only static assets and the offline page. | `src/server/auth.ts`, `public/sw.js` |
| Open redirects | `safeNextPath()` accepts only same-origin relative paths | `src/lib/utils.ts` |
| Error leakage | User-facing errors are generic, and details go only to server logs | `src/lib/errors.ts` |

## Account deletion and data retention
`POST /api/account/delete` requires typed confirmation and is rate limited. It:
1. deletes every R2 object belonging to the user;
2. records a minimal `user_safety_events` row (user id only), for abuse investigations;
3. deletes the Supabase Auth user. **ON DELETE CASCADE** then removes the profile, DOB, preferences, answers, results, likes, passes, matches, conversations and messages.

Reports, moderation actions and audit logs keep only the opaque user id, so moderation history stays intact for safety. Rejected photos are purged after 30 days, and abandoned uploads after 1 hour.

## Admin operations
- Every admin RPC writes `admin_audit_logs` (actor, action, target, details) **in the same transaction** as the change.
- Moderators can review photos and reports and can suspend regular users. Only admins can suspend staff, change roles or read the audit log.

## Verification
- `npm run test:db` applies all migrations to Postgres and tests the boundaries above as several different users: anonymous, two regular users, an incompatible user, a moderator and an admin.
- `npm run test:e2e` checks route protection, API authorization (401/403), cross-origin refusal, cron authentication and security headers.

## Reporting a vulnerability
Email the maintainers privately. Do not open a public issue.
