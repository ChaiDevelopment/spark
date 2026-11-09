# Cloudflare R2 setup

R2 stores every profile photo. The bucket is **private**: there is no public bucket URL and no `r2.dev` access. Browsers only ever see presigned URLs that expire within minutes. All R2 credentials are server-side secrets.

## 1. Create the bucket
1. In the Cloudflare dashboard, open **R2 Object Storage** and enable R2. It needs a payment method on file, but usage stays free within the free tier (see below).
2. Click **Create bucket**:
   - **Name:** for example `spark-photos-prod`, plus a separate `spark-photos-dev` for development.
   - **Location:** Automatic, or *Asia-Pacific* as a hint.
   - **Default storage class:** **Standard**. Do **not** use Infrequent Access: it charges for retrieval.
3. Leave **Public access** disabled (both the `r2.dev` subdomain and custom domains).

## 2. Create an API token
1. Go to **R2 → Manage R2 API Tokens → Create API token**.
2. Set **Permissions** to **Object Read & Write**.
3. Under **Specify bucket(s)**, select only your SPARK bucket.
4. *(Optional)* Set a TTL, and restrict client IPs if your host has static egress IPs. Vercel does not.
5. Copy these values; the secret is shown only once:

| Value | Environment variable |
|---|---|
| Account ID (shown on the R2 overview page) | `R2_ACCOUNT_ID` |
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` |
| Bucket name | `R2_BUCKET_NAME` |
| S3 endpoint *(optional)* | `R2_ENDPOINT`, which defaults to `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Use the jurisdiction endpoint (for example `.eu.`) only if the bucket was created in one. |

None of these may use a `NEXT_PUBLIC_` name.

## 3. Configure CORS (required)
The browser uploads the original file **directly** to R2 with a presigned `PUT`, and displays photos from presigned `GET` URLs. Open **Bucket → Settings → CORS policy** and add:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-domain.example"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "content-length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add each Vercel preview domain you test on. Without this rule, uploads fail in the browser with a CORS error.

## 4. Object layout and lifecycle

| Prefix | Contents | Lifetime |
|---|---|---|
| `uploads/{userId}/{uuid}` | Original upload (may contain EXIF/GPS) | Deleted right after processing. The daily cron removes abandoned uploads after 1 hour. |
| `profiles/{userId}/{uuid}.webp` | Processed main image, ≤1600 px, no metadata | Until the photo or account is deleted |
| `profiles/{userId}/{uuid}_thumb.webp` | Thumbnail, 480×600 | Same as above |

**Recommended safety net:** under **Bucket → Settings → Object lifecycle rules**, add a rule that deletes objects with prefix `uploads/` after **1 day**.

Photos that a moderator rejected are removed from R2 30 days later by `/api/cron/cleanup`. Deleting an account removes all of that user's objects immediately.

## 5. Free-tier limits (R2 Standard)

| Resource | Free per month | SPARK usage |
|---|---|---|
| Storage | 10 GB-month | About 0.2 MB per photo (main and thumbnail): roughly 40,000 photos, or about 7,000 users with 6 photos each |
| Class A operations (writes, lists) | 1 million | About 4 per upload (staging PUT, 2 processed PUTs, delete) |
| Class B operations (reads) | 10 million | One per photo view, reduced by immutable browser caching |
| Egress | **Free** | — |

Monitor usage under **R2 → Overview → Metrics**, and set a **billing notification** in Cloudflare so you are warned before any charge.

## 6. Verify
1. Fill in `R2_*` in `.env.local` and restart `npm run dev`.
2. Sign in, open **My profile → Edit → Photos**, and upload a JPEG.
3. In the R2 bucket you should see `profiles/<your-user-id>/…webp` and `…_thumb.webp`, and **no** object left under `uploads/`.
4. Paste an object's plain URL (`https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`) into a browser. It must return **400 or 403**, which proves the bucket is private.
