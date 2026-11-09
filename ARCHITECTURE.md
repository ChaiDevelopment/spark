# Architecture

## System overview

```
 Browser (PWA)
   │  HTTPS, cookie session (@supabase/ssr)
   ▼
 Railway — Next.js 16 App Router (behind Railway's reverse proxy)
   ├─ proxy.ts ............ refreshes the Supabase session cookie on every request
   ├─ Server Components ... read data with the USER-SCOPED Supabase client (RLS applies)
   ├─ Server Actions ...... mutations (profile, likes, chat, safety, admin) → SQL RPCs
   └─ Route Handlers ...... /api/photos/*, /api/account/delete, /api/cron/cleanup
          │                         │
          ▼                         ▼
 Supabase                       Railway Storage Bucket (private, S3-compatible)
   Auth · Postgres · Realtime     profiles/{userId}/{uuid}.webp (+ _thumb.webp)
```

**Supabase is the source of truth** for every record: accounts, profiles, preferences, answers, chemistry results, likes, passes, matches, chat, safety, notifications, admin data and entitlements. **The bucket stores only image bytes.** Postgres stores object keys and metadata, never URLs or binaries. Storage is provider-neutral (`S3_*` variables), so Cloudflare R2 or another S3-compatible service can be swapped in.

## Core principles

1. **The database enforces the rules.** RLS is enabled on every user-facing table. Every multi-row or rule-heavy operation is a `SECURITY DEFINER` SQL function that derives the caller from `auth.uid()`. Examples: liking, matching, sending messages, blocking, reporting and moderation. The Next.js layer validates input and handles UX, but it is never the only guard.
2. **Identity comes only from the verified session.** `getViewer()` (in `src/server/auth.ts`) calls `supabase.auth.getClaims()`, which verifies the JWT. Request bodies never carry a user id that the server trusts.
3. **The user-scoped client is the default.** The service-role client (`src/lib/supabase/admin.ts`, guarded by `server-only`) is used only for:
   - the photo pipeline, which writes server-validated metadata;
   - account deletion (`auth.admin.deleteUser`);
   - the cleanup cron.
4. **Nothing private is prerendered or cached.** Authenticated pages are dynamic (`connection()` in `getViewer`). API responses send `Cache-Control: private, no-store`. The service worker never caches API or authenticated responses.

## Request flows

### Authentication
- **Email and password:** `signUp` sends a verification email that links to `/auth/confirm` (`verifyOtp` with `token_hash`). Password reset follows the same path to `/reset-password`.
- **Google:** `signInWithOAuth` → Google → Supabase → `/auth/callback` (`exchangeCodeForSession`, PKCE).
- A database trigger, `handle_new_user`, creates the `profiles`, `user_preferences` and `notification_preferences` rows.
- `requireViewer()` gates every app page in this order:
  1. no session → `/login`
  2. no profile → sign out
  3. suspended account → `/suspended`
  4. onboarding not finished → `/onboarding`

### Onboarding and age gate
- Date of birth is stored in `profile_private`, which only the owner can read.
- The DOB is set only through `set_date_of_birth()`. A trigger (`enforce_adult_dob`) rejects anyone under 18, measured in the Asia/Jakarta calendar.
- `complete_onboarding()` re-checks the age, required fields and photos on the server.

### Photo upload
The browser sends the file to `POST /api/photos/upload` (multipart). The route:
1. checks the same origin and the session, then applies a rate limit (20 per hour);
2. rejects bodies over 10 MB and enforces the 6-photo cap;
3. verifies **magic bytes**, decodes the image with a pixel limit, and rejects animated or tiny images;
4. auto-rotates the image and **re-encodes it to WebP, which drops all EXIF/GPS data**: `profiles/{userId}/{uuid}.webp` (≤1600 px) and `_thumb.webp` (480×600);
5. reserves the `profile_photos` row (a database trigger enforces the cap atomically), writes both objects, then sets `status='pending'`. That status places the photo in the moderation queue; with `PHOTO_MODERATION_MODE=auto` it is `'approved'` instead.

**The original never reaches storage.** Because only the server writes to the bucket, the bucket needs **no CORS rules**. The upload route is excluded from `proxy.ts`, so the request body isn't buffered twice; it validates the session itself.

Next:
1. `POST /api/photos/view` returns 10-minute presigned GET URLs. RLS decides which photo rows the caller can see, so a key the caller cannot read never gets signed.
2. `DELETE /api/photos/[id]` and `POST /api/photos/reorder` handle deletion and ordering. Reordering goes through the `reorder_photos()` RPC.

The pipeline is versioned (`processing_version`). New variants such as AVIF or blur placeholders can be added in `src/server/images.ts` without changing the schema.

### Discovery → like → match
- `get_discovery_candidates()` returns only profiles that pass all of these checks:
  - both people are eligible (active, onboarded, visible);
  - each person matches the other's age and gender preferences;
  - the broad location scope matches;
  - neither has blocked the other;
  - the viewer has not already liked or passed them.
- Only city or province is ever exposed. Coordinates are never stored.
- `like_user()` runs as one transaction:
  1. checks the daily limit, using the `daily_likes` entitlement (default 25, plus 1 super like, reset on the Asia/Jakarta calendar day);
  2. inserts the like idempotently;
  3. checks for a reciprocal like, takes an advisory lock on the user pair, and creates the match, its members, the conversation, its members and the notifications.

  A unique constraint on the ordered pair `(user_low, user_high)` makes duplicate matches impossible, even under concurrent requests.
- Chemistry scores are computed on the server, using the pure engine in `src/lib/chemistry/engine.ts`, and stored with both `questionnaire_version` and `calculation_version`.

### Chat
- Messages are sent with `send_message()`. It checks membership and an active match, enforces 1–2000 characters, and applies rate limits of 30 per minute and 1000 per day. The function sets the sender itself, so a client cannot impersonate someone else.
- Delivery uses Supabase Realtime `postgres_changes` on `messages` and `message_read_receipts`. RLS still applies to every event.
- Typing indicators use **Realtime Broadcast** on a private channel, `conversation:{id}`. RLS on `realtime.messages` limits it to conversation members. Typing state is never written to the database, which saves storage and Realtime quota.
- History loads in pages of 30 messages, using a keyset on `created_at`.
- `unmatch()` and `block_user()` close the match and hide the conversation from both people.

### Safety and administration
- **Reports:** `report_user()` creates the report and a `moderation_queue` item. Rate limit: 10 per day.
- **Photos:** pending photos enter the queue automatically, via a trigger.
- **Staff roles:** roles live in `admin_users` (`moderator` or `admin`). Every admin RPC calls `private.require_staff()` and writes an `admin_audit_logs` row in the same transaction. Only admins can grant roles.
- **Hidden admin area:** the `/admin` layout returns 404 to anyone who is not staff, so it does not reveal that the area exists.

## Free-tier awareness
- Each open chat screen uses one Realtime channel for changes and one for typing. Typing events are throttled to one every 2.5 seconds. There is no polling.
- Discovery fetches 20 cards at a time.
- Photos are served as ~50–150 KB WebP files, with thumbnails for lists. Egress from the Railway bucket is free; viewers load photos directly from the bucket through presigned URLs, not through the app.
- Rate-limit rows are pruned by the cleanup cron. Abandoned uploads and old rejected photos are deleted daily.

See [DEPLOYMENT.md](DEPLOYMENT.md#free-tier-limits) for quotas and how to monitor them.
