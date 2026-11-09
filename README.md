# SPARK — Meet beyond the swipe

SPARK is a mobile-first dating web app for adults (18+), built for the Indonesian market and ready to expand internationally. Its main differentiator is **Chemistry**: a deterministic, explainable compatibility score built from a 42-question assessment.

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Radix/shadcn-style UI, Framer Motion, React Hook Form + Zod |
| Auth, DB, Realtime | Supabase (Auth, PostgreSQL 17, RLS, Realtime) |
| Photos | Cloudflare R2 (private bucket, presigned URLs), processed with `sharp` |
| Hosting | Vercel (Hobby tier is enough for the MVP) |
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
2. **A Cloudflare R2 bucket** for photos → [R2_SETUP.md](R2_SETUP.md)
3. *(Optional)* **Google OAuth** → [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)
4. **An admin account**, granted with one SQL statement → [SUPABASE_SETUP.md#6-create-the-first-admin](SUPABASE_SETUP.md#6-create-the-first-admin)

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
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md), [R2_SETUP.md](R2_SETUP.md) and [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md): external services
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md): every variable, and whether it is public or secret
- [DEPLOYMENT.md](DEPLOYMENT.md): Vercel deployment and free-tier limits
- [TESTING.md](TESTING.md): what is tested and how to run it
- [MVP_ROADMAP.md](MVP_ROADMAP.md): status, known gaps and next steps

## Project layout

```
src/
  app/            routes: (auth), (app)/(main), admin, (legal), api/*, auth/* callbacks
  components/     UI by feature (discover, chat, chemistry, profile, safety, admin, ui/)
  lib/            env, constants, Zod schemas, Supabase clients, chemistry engine (pure)
  server/         server-only logic: auth guards, R2, image pipeline, discovery, actions
  proxy.ts        session refresh (Next.js 16 "proxy", formerly middleware)
supabase/
  migrations/     the only source of truth for the schema, RLS and SQL functions
tests/
  unit/  db/  e2e/
```
