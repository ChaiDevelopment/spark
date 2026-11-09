# Deployment (Railway)

Production runs on **Railway**, which hosts the Next.js app, the photo bucket and the daily cron job. Data lives in **Supabase**.

| Piece | Where |
|---|---|
| Next.js app | Railway service `spark`, deployed from GitHub (`main`) |
| Photo storage | Railway Storage Bucket, see [STORAGE_SETUP.md](STORAGE_SETUP.md) |
| Daily cleanup | Railway cron service running `scripts/cron-cleanup.mjs` |
| Database, auth, realtime | Supabase, see [SUPABASE_SETUP.md](SUPABASE_SETUP.md) |

**Costs:** Railway has no permanent free plan. New accounts get a one-time trial credit; after that a paid plan is required. Check <https://railway.com/pricing> and the usage view before the trial ends. Supabase stays on its Free plan. Do not upgrade any plan without an explicit decision.

## 1. Supabase
1. Apply the migrations with `npx supabase db push`, as described in SUPABASE_SETUP.md. On networks without IPv6, use the **Session Pooler** connection string (Project Settings → Database → Connection string), not `db.<ref>.supabase.co`.
2. Configure the Auth URLs, email templates and SMTP.

## 2. App service
1. In Railway: **New Project → Deploy from GitHub repo** and choose the repository. Root directory: `/`. Build and start commands are detected automatically (`npm run build`, `npm start`).
2. Go to **Settings → Networking → Generate Domain**. Railway asks for a port: use **8080**. Railway sets `PORT=8080` and `next start` listens on it.
3. Under **Settings → Deploy**, set the healthcheck path to `/`. For the region, *Southeast Asia (Singapore)* is closest to Indonesian users.
4. Under **Variables**, add only the variables below. Railway may also suggest names it finds in the code. **Delete any suggestion that you don't fill in**, and never keep `${{ secret() }}` on a credential, because it generates a random, invalid value.

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
   NEXT_PUBLIC_APP_URL=https://<your-domain>.up.railway.app
   PHOTO_MODERATION_MODE=auto
   CRON_SECRET=<random 64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   S3_ENDPOINT=${{photos.ENDPOINT}}
   S3_BUCKET=${{photos.BUCKET}}
   S3_ACCESS_KEY_ID=${{photos.ACCESS_KEY_ID}}
   S3_SECRET_ACCESS_KEY=${{photos.SECRET_ACCESS_KEY}}
   S3_REGION=${{photos.REGION}}
   ```

   `NEXT_PUBLIC_*` values and `S3_ENDPOINT` are read **at build time**. After changing them, redeploy.

5. In **Supabase → Authentication → URL Configuration**, set the Site URL to the Railway domain. Add `https://<domain>/auth/callback` and `https://<domain>/auth/confirm` to the Redirect URLs. If you use Google sign-in, add the domain to the Authorized JavaScript origins in Google Cloud.

The app is reverse-proxied by Railway. The same-origin (CSRF) check compares the browser's `Origin` with `X-Forwarded-Host`, `Host` and `NEXT_PUBLIC_APP_URL`, so `NEXT_PUBLIC_APP_URL` must match the public domain exactly.

## 3. Photo bucket
Follow [STORAGE_SETUP.md](STORAGE_SETUP.md). If you connect the bucket to the `spark` service, Railway adds `AWS_*` variables that SPARK reads directly; in that case leave out the `S3_*` lines above. Otherwise, name the bucket `photos` so that the references resolve.

## 4. Cron service (daily cleanup)
1. In the same project, choose **+ Create → GitHub Repo** and select the same repository again. Name the service `cron`.
2. **Settings:**
   - Start command: `node scripts/cron-cleanup.mjs`
   - **Cron Schedule:** `0 20 * * *`. Railway runs schedules in UTC, so this is 03:00 WIB.
   - Remove the generated domain; this service doesn't need one.
3. **Variables:**
   ```env
   CRON_SECRET=${{spark.CRON_SECRET}}
   CRON_TARGET_URL=https://${{spark.RAILWAY_PUBLIC_DOMAIN}}
   ```
The job calls `/api/cron/cleanup`. That endpoint removes abandoned uploads and rejected photos older than 30 days, and prunes rate-limit rows. The job exits non-zero on failure, so failed runs show up in Railway.

## 5. Every deploy
Each push to `main` triggers a new build. Smoke test after a release:
1. Sign up and verify the email.
2. Complete onboarding, including a photo.
3. Approve the photo in `/admin/moderation`.
4. Answer the chemistry questions.
5. With a second account, like each other and confirm the match.
6. Chat in real time.
7. Block and report.
8. Delete the test account.

## Limits to watch

| Service | Limit | Where to look |
|---|---|---|
| Railway | Trial credit, then plan usage (CPU, RAM, egress, bucket GB) | Project → Usage |
| Supabase database | 500 MB (Free) | Project Settings → Usage |
| Supabase egress | 5 GB/month | Usage |
| Supabase Realtime | 200 concurrent connections; 2M messages/month | Usage → Realtime |
| Supabase email | The built-in SMTP sends only a few emails per hour | Use custom SMTP before inviting testers |
| Supabase pausing | Free projects pause after about 7 days idle | The daily cron keeps the project active |

## Rollback
- **App:** Railway → service → **Deployments** → choose an earlier deployment → **Redeploy**.
- **Database:** migrations are forward-only. Write a new corrective migration; never edit one that has already been applied.

## Alternative: Vercel
`vercel.json` still schedules the cron job for Vercel. Use the same variables there, and Vercel sends `CRON_SECRET` automatically.
