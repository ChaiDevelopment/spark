# Environment variables

Copy `.env.example` to `.env.local` for development. On Vercel, set these values in **Project → Settings → Environment Variables**. Never commit `.env.local`; it is ignored by `.gitignore`.

**Rule:** only variables that start with `NEXT_PUBLIC_` reach the browser bundle. Every secret is read in `src/lib/env.server.ts`, which imports `server-only`, so the build fails if a client component imports it.

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Yes | Publishable key (`sb_publishable_…`) or legacy anon JWT. It is safe to expose because RLS protects the data. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is also accepted. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | For photos, account deletion and cron | Secret key (`sb_secret_…`) or legacy service_role JWT. It **bypasses RLS**. `SUPABASE_SECRET_KEY` is also accepted. |
| `R2_ACCOUNT_ID` | **Secret** | For photos | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | **Secret** | For photos | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | **Secret** | For photos | R2 API token secret |
| `R2_BUCKET_NAME` | **Secret** | For photos | Private bucket name |
| `R2_ENDPOINT` | **Secret** | No | S3 endpoint override. Defaults to `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `NEXT_PUBLIC_APP_URL` | Public | Yes | Canonical app URL, without a trailing slash. Used for auth redirect links. |
| `PHOTO_MODERATION_MODE` | Server | No | `manual` (default): new photos wait for a moderator. `auto`: approved after the automated checks. |
| `CRON_SECRET` | **Secret** | In production | A random string of at least 32 characters. Vercel Cron sends it as `Authorization: Bearer …` to `/api/cron/cleanup`. Generate one with `openssl rand -hex 32`. |

## Test-only variables

| Variable | Used by |
|---|---|
| `E2E_SUPABASE=1` | Enables `tests/e2e/flows.spec.ts`, the full journey against a real Supabase project |
| `E2E_PORT` | Port for the Playwright web server (default `3100`) |
| `PLAYWRIGHT_BROWSERS_PATH` | Optional location for Playwright browsers, for example on another drive |

## When a variable is missing
- **No Supabase URL or key:** public pages still work. Protected pages redirect to `/login`, and the auth forms show a "not configured" error.
- **No service role key or R2 variables:** photo, account-deletion and cron endpoints return `503`, with a clear message. Nothing pretends to succeed.
