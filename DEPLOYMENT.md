# Deployment

Target: **Vercel Hobby**, **Supabase Free** and **Cloudflare R2** within its free tier. Nothing in this guide requires a paid plan. Do not upgrade any service without an explicit decision.

## Checklist

1. **Supabase:** create the project, run `npm run db:push`, and configure Auth URLs, email templates, SMTP and Google → [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
2. **R2:** create a private bucket, an API token scoped to that bucket, and a CORS rule that includes the production origin → [R2_SETUP.md](R2_SETUP.md)
3. **Vercel:**
   1. **Add New → Project** and import the repository. The framework is detected as Next.js automatically.
   2. Set all variables from [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for **Production**, and for **Preview** if you use it. Set `NEXT_PUBLIC_APP_URL` to the production URL and `CRON_SECRET` to a random value.
   3. Deploy.
   4. Add the production URL to the Supabase redirect URLs, the Google OAuth origins and the R2 CORS rule.
4. **Cron:** `vercel.json` schedules `/api/cron/cleanup` daily at 03:00 UTC. The Hobby plan allows daily crons. Vercel sends `CRON_SECRET` automatically.
5. **First admin:** run the bootstrap SQL in [SUPABASE_SETUP.md](SUPABASE_SETUP.md#6-create-the-first-admin).
6. **Smoke test:**
   1. sign up and verify the email;
   2. complete onboarding;
   3. upload a photo and approve it in `/admin/moderation`;
   4. answer the chemistry questions;
   5. have a second account like the first one back, and check that a match appears;
   6. chat in real time;
   7. block and report;
   8. delete the test account.

## Free-tier limits

| Service | Limit (free) | What hits it in SPARK | How to monitor |
|---|---|---|---|
| Supabase database | 500 MB | Messages and notifications make up most rows. Photos are not stored there. | Project Settings → Usage |
| Supabase egress | 5 GB/month | API responses | Usage |
| Supabase Realtime | 200 concurrent connections; 2M messages/month | About 1 connection per open tab, plus chat channels | Usage → Realtime |
| Supabase Auth | 50,000 monthly active users | — | Usage |
| Supabase emails | Built-in SMTP sends only a few per hour | Sign-up and password-reset emails | Use custom SMTP for real testers |
| Supabase pausing | After ~7 days without activity | — | The daily cron keeps the project active |
| R2 storage | 10 GB-month | Photos, ~0.2 MB per photo | R2 → Metrics |
| R2 operations | 1M Class A, 10M Class B per month | Uploads and views | R2 → Metrics |
| Vercel Hobby | 100 GB bandwidth, function execution limits, daily crons only; **non-commercial use** | Pages and API | Vercel → Usage |

**Note:** Vercel Hobby is for non-commercial projects only. A paid, commercial launch requires Vercel Pro or another host. Decide this before monetizing.

## Rollback
- **App:** use **Promote to Production** on the previous deployment in Vercel.
- **Database:** migrations are forward-only. Write a new corrective migration; never edit a migration that has already been applied.
