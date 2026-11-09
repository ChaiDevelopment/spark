# Database schema

The source of truth is `supabase/migrations/`. This document is a map of it. All tables use UUID primary keys, `created_at` and `updated_at` (kept current by the `private.set_updated_at` trigger), and have **RLS enabled**.

Three schemas are involved:
- **`public`:** tables and RPC functions exposed through the Supabase Data API.
- **`private`:** helper functions and internal tables, such as `rate_limit_hits`. It is not exposed to the API.
- **`auth`:** managed by Supabase Auth. `auth.users` cascades deletes to `profiles`.

## Migrations

| File | Contents |
|---|---|
| `…0100_foundation` | `private` schema, `app_today()` (Asia/Jakarta date), `admin_users`, role helpers, `admin_audit_logs`, rate limiting |
| `…0200_profiles` | `profiles`, `profile_private` (DOB), `user_preferences`, `interests`, `user_interests`, `user_verification`, `profile_photos` |
| `…0300_chemistry` | Questions, options, answers, results and result dimensions |
| `…0310_chemistry_questionnaire_v1` | Questionnaire v1 seed data: 42 questions across 6 dimensions |
| `…0400_safety` | Blocks, reports, moderation queue and actions, safety events, photo → queue trigger |
| `…0500_matching_chat_notifications` | Likes, passes, matches, usage limits, discovery events, conversations, messages, receipts, notifications, device tokens, subscription tables |
| `…0600_logic` | Eligibility and visibility rules, profile-completion triggers, and all RPC functions |
| `…0700_reference_data_realtime` | Interest catalogue, plans, Realtime publication, private-channel policies |
| `…0800_maintenance` | `run_maintenance()` (service_role only), called by the daily cron |

## Tables

### Users and profiles

| Table | Purpose | Client access |
|---|---|---|
| `profiles` | Public-facing profile: name, gender, bio, city or region, lifestyle, goals, visibility, `account_status`, `completion_percent`, `onboarding_completed_at` | Owner reads and updates editable columns only. Others read through `can_view_profile()`. Staff read all. |
| `profile_private` | `date_of_birth` | Owner reads. Writes only through `set_date_of_birth()`; a trigger enforces age 18 or older. |
| `user_preferences` | Age range, interested-in genders, location scope | Owner reads and updates |
| `interests` / `user_interests` | Catalogue, and a user's picks (cap enforced by trigger) | Catalogue is public; picks are owner-managed and visible on viewable profiles |
| `user_verification` | Verification status (future feature) | Owner, viewable profiles, staff |
| `profile_photos` | R2 `staging_key`, `object_key`, `thumb_key`; `status` (`uploading` → `pending` → `approved`/`rejected`); `position`; size; `processing_version` | Owner reads all of their own rows. Others see only `approved` rows of viewable profiles. **No client writes**: the server routes use the service role. |

### Chemistry

| Table | Purpose |
|---|---|
| `chemistry_questions` | `questionnaire_version`, `code`, `dimension`, `kind` (`scale`/`single`/`multi`), `weight`, `compat_matrix` |
| `chemistry_options` | Answer options (`key`, numeric `value` for scales) |
| `chemistry_answers` | A user's selected option keys. Owner CRUD; a trigger validates them against the question. |
| `chemistry_results` | One row per ordered pair (`user_low < user_high`) and version: overall score, explanations, `calculation_version`, `calculated_at`. **Read-only** for the two people in the pair. |
| `chemistry_result_dimensions` | Per-dimension score, raw similarity and coverage |

### Discovery and matching

| Table | Notes |
|---|---|
| `likes` | `unique (liker_id, likee_id)`; `is_super`. Readable by the liker only. Who liked you comes from `get_received_likes()`. |
| `passes` | `unique (passer_id, passee_id)` |
| `matches` | Ordered pair with `unique (user_low, user_high)`: **one match per pair, ever**. `status` is `active` or `unmatched`. |
| `match_members` | One row per participant, for simple RLS joins |
| `daily_usage_limits` | Per user and per day (Asia/Jakarta): `likes_used`, `super_likes_used` |
| `discovery_events` | Like, pass and match history |

### Chat

| Table | Notes |
|---|---|
| `conversations` | One per match; `last_message_at` |
| `conversation_members` | Membership; `archived_at` (per-member archive) |
| `messages` | `body` 1–2000 characters; `unique (sender_id, client_id)` for idempotent retries. Sent only through `send_message()`. |
| `message_read_receipts` | Per member: `last_read_message_id`, `last_read_at` |

Typing indicators are **not stored**. They use Realtime Broadcast; see ARCHITECTURE.md.

### Safety and administration

| Table | Notes |
|---|---|
| `user_blocks` | Readable by the blocker only. The blocked person never learns about the block. |
| `user_reports` | Category from the fixed list; reporters read their own reports, staff read all |
| `moderation_queue` | Reports and pending photos. Staff only. |
| `moderation_actions` | Every decision made by a moderator |
| `user_safety_events` | Suspensions, deletions and other events. Staff only. |
| `admin_users` | `role` is `moderator` or `admin`. Granted only by admins, through `admin_set_role()`, or by the first-admin bootstrap SQL. |
| `admin_audit_logs` | Written inside every admin RPC. Readable by admins only. |

### Notifications

| Table | Notes |
|---|---|
| `notifications` | Types: `new_like`, `new_match`, `new_message`, `moderation`, `safety`, `system`. Owner reads; marked read through an RPC. |
| `notification_preferences` | Per-type opt-outs |
| `device_tokens` | Reserved for future Web Push |

### Monetization (prepared, no payments)

| Table | Notes |
|---|---|
| `subscription_plans` | Catalogue, with an `entitlements` JSON |
| `user_subscriptions` | Provider subscription state. **No client writes.** |
| `subscription_entitlements` | Per-user overrides, such as `daily_likes`. **No client writes.** Read through `private.entitlement()`. |
| `payment_events` | Idempotent webhook log: `unique (provider, provider_event_id)` |

## RPC functions (`public`, callable by `authenticated`)

| Area | Functions |
|---|---|
| Onboarding and profile | `set_date_of_birth`, `complete_onboarding`, `touch_last_active`, `reorder_photos` |
| Discovery | `get_discovery_candidates`, `get_profile_card`, `get_usage`, `get_discovery_history` |
| Matching | `like_user` (atomic, idempotent, creates the match), `pass_user`, `get_received_likes`, `unmatch` |
| Chat | `send_message`, `mark_conversation_read`, `set_conversation_archived`, `list_conversations` |
| Notifications | `mark_notifications_read` |
| Safety | `block_user`, `unblock_user`, `list_blocked_users`, `report_user` |
| Rate limiting | `consume_rate_limit` (whitelisted actions only) |
| Staff | `my_staff_role`, `admin_review_photo`, `admin_update_report`, `admin_set_suspension`, `admin_set_role`, `admin_stats`, `admin_search_users` |
| Service role only | `run_maintenance` |

Every function is `SECURITY DEFINER` with `search_path = ''`, takes the caller from `auth.uid()`, and never accepts a user id that stands for "me".

## Key private helpers
- `is_eligible(user)`: the account is active and onboarded.
- `is_discoverable(user)`: eligible, visible and has an approved photo.
- `wants(viewer, target)` and `mutually_compatible(a, b)`: age, gender and location preferences in both directions.
- `is_blocked_between(a, b)` and `have_active_match(a, b)`.
- `can_view_profile(target)`: the single rule behind the profile, photo and interest SELECT policies.
- `entitlement(user, key, default)`: subscription override, then plan, then default.
- `check_rate_limit(bucket, max, window)`: fixed-window counters in `private.rate_limit_hits`.
