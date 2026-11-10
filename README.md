# SPARK — Meet beyond the swipe

SPARK is a mobile-first dating web app for adults (18+), built for the Indonesian market and ready to expand internationally. Its main differentiator is **Chemistry**: a deterministic, explainable compatibility score built from a 42-question assessment.

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Radix/shadcn-style UI, Framer Motion, React Hook Form + Zod |
| Auth, DB, Realtime | Supabase (Auth, PostgreSQL 17, RLS, Realtime) |
| Photos | Railway Storage Bucket (private, S3-compatible, presigned view URLs), processed with `sharp` |
| Hosting | Railway |
| Tests | Vitest (unit + PGlite-based migration/RLS tests), React Testing Library, Playwright |

## Quick start (clean machine)

Prerequisites: Node.js ≥ 20.9 and npm. Docker is only needed if you want a local Supabase stack.

```bash
git clone <repo> spark && cd spark
npm install
cp .env.example .env.local          # then fill in values — see ENVIRONMENT_VARIABLES.md
npm run dev                         # http://localhost:3000
```

Without credentials the public pages (landing, legal, auth forms) still render, and protected pages redirect to `/login`. To use the app for real you need:

1. **A Supabase project**, with migrations applied → [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
2. **A Railway Storage Bucket** for photos → [STORAGE_SETUP.md](STORAGE_SETUP.md)
3. *(Optional)* **Google OAuth** → [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)
4. **An admin account**, granted with one SQL statement → [SUPABASE_SETUP.md#6-create-the-first-admin](SUPABASE_SETUP.md#6-create-the-first-admin)

## Moderation

The moderation area lives at `/admin`. Anyone who isn't staff gets a 404, so the area isn't revealed.

**Create the first moderator or admin** (once, after that person has signed up and verified their email):

```bash
node --env-file=.env.local scripts/make-moderator.mjs you@example.com admin
```

The script needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. The service key bypasses row-level security, so run the script only on a machine you control, and never commit or expose the key. After the first admin exists, promote others from **Admin → Users**.

| Page | What it does |
|---|---|
| `/admin/photos` | Pending photos, oldest first. Approve or reject with a reason; select several; keys J/K move, A approve, R reject, X select, Shift+A / Shift+R act on the selection. |
| `/admin/reports` | Open reports, most urgent first. Dismiss, warn, suspend (1–90 days), or ban; optionally remove the reported user's photos. A reported message is the only chat content staff can see, and each view is audited. |
| `/admin/users` | Search by name, email or ID. Open a member to see photos, reports against them, the moderation history, and to warn, suspend, ban or restore. |
| `/admin/audit` | Append-only log of every privileged action (admins only). |

Rules the database enforces, whatever the interface does:
- Each report and each photo can be decided once; a second moderator gets "already handled".
- Suspensions end automatically (the daily maintenance job and the next sign-in lift them). Banned accounts stay banned until an admin restores them.
- Suspended and banned accounts can't sign in, are hidden from Discover, and their conversations are hidden.
- The audit log can't be edited or deleted.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types + `tsc --noEmit` |
| `npm run test:unit` | Chemistry engine + image pipeline unit tests |
| `npm run test:db` | Applies **every migration** to an in-process Postgres (PGlite) and tests RLS with multiple users |
| `npm run test:e2e` | Playwright (mobile, tablet and desktop). Full user journeys need `E2E_SUPABASE=1` |
| `npm run db:start` / `db:reset` / `db:push` | Supabase CLI: local stack / re-apply migrations / push to a linked project |
| `npm run icons` | Regenerate PWA icons |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): how the pieces fit, request flows and design decisions
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md): tables, RPC functions and RLS model
- [SECURITY.md](SECURITY.md): threat model and controls
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md), [STORAGE_SETUP.md](STORAGE_SETUP.md) and [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md): external services
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md): every variable, and whether it is public or secret
- [DEPLOYMENT.md](DEPLOYMENT.md): Railway deployment, cron service and usage limits
- [TESTING.md](TESTING.md): what is tested and how to run it
- [MVP_ROADMAP.md](MVP_ROADMAP.md): status, known gaps and next steps

## Project layout

```
src/
  app/            routes: (auth), (app)/(main), admin, (legal), api/*, auth/* callbacks
  components/     UI by feature (discover, chat, chemistry, profile, safety, admin, ui/)
  lib/            env, constants, Zod schemas, Supabase clients, chemistry engine (pure)
  server/         server-only logic: auth guards, photo storage, image pipeline, discovery, actions
  proxy.ts        session refresh (Next.js 16 "proxy", formerly middleware)
supabase/
  migrations/     the only source of truth for the schema, RLS and SQL functions
tests/
  unit/  db/  e2e/
```
