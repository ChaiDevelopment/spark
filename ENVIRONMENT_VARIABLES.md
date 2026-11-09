# Environment variables

Copy `.env.example` to `.env.local` for development. In production, set these values on the Railway service under **Variables**. Never commit `.env.local`; it is ignored by `.gitignore`.

**Rule:** only variables that start with `NEXT_PUBLIC_` reach the browser bundle. Every secret is read in `src/lib/env.server.ts`, which imports `server-only`. Empty or whitespace-only values count as **unset**, so a blank variable left on a dashboard never shadows its alternative name.

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Yes | `sb_publishable_…` key. It is safe in the browser because RLS protects the data. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | For photos, account deletion and cron | `sb_secret_…` key or legacy service_role JWT. It **bypasses RLS**. `SUPABASE_SECRET_KEY` is also accepted. |
| `S3_ENDPOINT` | Server (also read at build for CSP) | For photos | S3 API endpoint. On Railway: `https://t3.storageapi.dev` |
| `S3_BUCKET` | **Secret** | For photos | The bucket's unique S3 name (`BUCKET` on Railway) |
| `S3_ACCESS_KEY_ID` | **Secret** | For photos | Bucket access key |
| `S3_SECRET_ACCESS_KEY` | **Secret** | For photos | Bucket secret key |
| `S3_REGION` | Server | No | Default `auto` |
| `S3_FORCE_PATH_STYLE` | Server | No | `true` only if the provider requires path-style URLs |
| `NEXT_PUBLIC_APP_URL` | Public | Yes | Public app URL without a trailing slash. Used for auth redirect links and for the same-origin check behind proxies. |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | Public | No | `true` shows "Continue with Google" (after completing GOOGLE_OAUTH_SETUP.md). Default: hidden, and the server refuses Google sign-in. Read at build time. |
| `PHOTO_MODERATION_MODE` | Server | No | `auto` (default): photos go live right after the automated checks; staff can still reject them and users can report them. `manual`: new photos wait for a moderator. |
| `CRON_SECRET` | **Secret** | In production | Random string of at least 32 characters, sent as `Authorization: Bearer …` to `/api/cron/cleanup` |
| `CRON_TARGET_URL` | Cron service only | On the cron service | Base URL the cron script calls. Falls back to `NEXT_PUBLIC_APP_URL`. |

Storage also accepts the standard `AWS_*` names that Railway adds when a bucket is connected to a service (`AWS_ENDPOINT_URL`, `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`), Railway's raw bucket variable names (`ENDPOINT`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`) and the legacy Cloudflare names (`R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`). `S3_*` takes precedence.

## Test-only variables

| Variable | Used by |
|---|---|
| `E2E_SUPABASE=1` | Enables `tests/e2e/flows.spec.ts`, the full journey against a real Supabase project |
| `E2E_PORT` | Port for the Playwright web server (default `3100`) |
| `PLAYWRIGHT_BROWSERS_PATH` | Optional location for Playwright browsers, for example on another drive |

## When a variable is missing
- **No Supabase URL or key:** public pages still work. Protected pages redirect to `/login`, and the auth forms say Supabase isn't connected.
- **No service role key or storage variables:** photo, account-deletion and cron endpoints return `503` with a clear message. Nothing pretends to succeed.
