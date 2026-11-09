# Google OAuth setup

Google sign-in goes through Supabase Auth. SPARK never sees the Google client secret at runtime: the secret is stored in Supabase only.

## 1. Google Cloud Console
1. Go to <https://console.cloud.google.com/> and create a project, for example "SPARK".
2. Configure **APIs & Services → OAuth consent screen**:
   - **User type:** External
   - App name **SPARK**, a support email, and the app logo (optional)
   - **Authorized domains:** your production domain and `supabase.co`
   - **Scopes:** `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. Request nothing else.
   - Add your test users while the app is in **Testing** mode. Publish the app before a public launch.
3. Under **APIs & Services → Credentials**, choose **Create credentials → OAuth client ID**:
   - **Application type:** Web application
   - **Authorized JavaScript origins:** `http://localhost:3000` and `https://<your-domain>`
   - **Authorized redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`. This must be the **Supabase** URL, not the app URL. For the local Supabase CLI, also add `http://127.0.0.1:54321/auth/v1/callback`.
4. Copy the **Client ID** and **Client secret**.

## 2. Supabase
1. Go to **Authentication → Providers → Google** and enable it.
2. Paste the Client ID and Client secret, then save.
3. Make sure `https://<your-domain>/auth/callback` is listed under **Authentication → URL Configuration → Redirect URLs**.

## 3. Turn the button on
Google sign-in is **hidden by default**. After steps 1–2, set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` on the app service and redeploy. The value is read at build time.

## 4. How it works in SPARK
1. **Continue with Google** calls `signInWithOAuth`, with `redirectTo = {NEXT_PUBLIC_APP_URL}/auth/callback?next=…`.
2. Google redirects to Supabase, and Supabase redirects to `/auth/callback?code=…`.
3. The route exchanges the code for a session cookie (PKCE). `next` is accepted only if it is a same-origin path.
4. New users are sent to `/onboarding`. The Google display name pre-fills the profile, but **date of birth is always collected and checked server-side**: Google sign-in does not prove the user is 18 or older.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `redirect_uri_mismatch` | The redirect URI in Google must be exactly `https://<project-ref>.supabase.co/auth/v1/callback` |
| Ends at `/login?error=oauth` | The app URL is missing from Supabase Redirect URLs, or `NEXT_PUBLIC_APP_URL` is wrong |
| "Access blocked: app not verified" | Add the account as a test user, or publish the consent screen |
