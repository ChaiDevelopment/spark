# Supabase setup

SPARK runs on the **Supabase Free plan**. Do not enable paid add-ons such as PITR, compute upgrades or custom domains without an explicit decision.

## 1. Create the project
1. Go to <https://supabase.com/dashboard> and create a **New project**. Pick the region closest to your users; for Indonesia, **Southeast Asia (Singapore)**.
2. Store the database password in a password manager.
3. Open **Project Settings → API Keys** and copy these values into `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (`sb_publishable_…`) or the legacy **anon** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Secret key** (`sb_secret_…`) or the legacy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses RLS: keep it **server only** and never use a `NEXT_PUBLIC_` name for it.

## 2. Apply the migrations
All schema, RLS policies, functions, seed reference data (interests, the v1 questionnaire, subscription plans) and Realtime configuration are in `supabase/migrations/`. Do not create tables by hand in the dashboard.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push            # = supabase db push
```

Afterwards, confirm three things in **Database → Tables**:
- every `public` table shows **RLS enabled**;
- **Database → Publications → supabase_realtime** includes `messages`, `message_read_receipts`, `notifications` and `conversations`;
- **Realtime → Settings** has *Allow public access* switched **off**. This makes private channels (used for typing indicators) require authorization.

## 3. Auth settings
**Authentication → URL Configuration**
- **Site URL:** `https://<your-domain>` (in development, `http://localhost:3000`)
- **Redirect URLs** (add both, for every environment):
  - `https://<your-domain>/auth/callback`
  - `https://<your-domain>/auth/confirm`

**Authentication → Providers → Email**
- Enable **Confirm email**.
- Set **Minimum password length** to `8`, with the requirement **letters and digits**. This matches the app's Zod rule; `supabase/config.toml` does the same for local development.

**Authentication → Email Templates.** Use token-hash links so verification also works when the email is opened on a different device or browser:

| Template | Link |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |
| Change email address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change` |

The default `{{ .ConfirmationURL }}` links also work through `/auth/callback`, but only in the same browser that started the flow.

**Email sending limits.** The built-in Supabase mailer is heavily rate limited, to a handful of emails per hour, and is meant for development only. Before inviting real testers, configure **Authentication → SMTP** with a provider that has a free tier, such as Resend or Brevo.

## 4. Google sign-in
See [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md).

## 5. Local development with the Supabase CLI (optional)
This requires Docker Desktop.
```bash
npm run db:start        # starts Postgres, Auth, Realtime, Studio and Inbucket
npm run db:reset        # re-applies all migrations from scratch
```
`supabase start` prints a local URL and keys. Put them in `.env.local`. Local emails appear in Inbucket at <http://localhost:54324>.

To test Google sign-in locally, put the secrets in `supabase/.env` (git-ignored):
```
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
```

## 6. Create the first admin
Staff roles cannot be granted from the app until an admin exists. After signing up normally, run this once in **SQL Editor**:

```sql
insert into public.admin_users (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

From then on, admins can grant `moderator` or `admin` from **/admin**. Every grant goes through `admin_set_role()` and is recorded in `admin_audit_logs`.

## 7. Free-plan notes
- **Pausing.** Free projects pause after about 7 days without activity. Restore them from the dashboard. Any request also counts as activity, including the daily Vercel cron.
- **Quotas.** 500 MB database, 5 GB egress, 200 concurrent Realtime connections and 2 million Realtime messages per month. Watch them in **Project Settings → Usage**.
- **Backups.** The Free plan has no downloadable backups. For a controlled MVP, run `supabase db dump` regularly yourself.
