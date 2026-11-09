# Photo storage setup (Railway Storage Bucket)

Profile photos are stored in a **private, S3-compatible bucket**. SPARK uses a **Railway Storage Bucket** in the same Railway project as the app. Any other S3-compatible provider also works, including Cloudflare R2; see the end of this guide.

## How photos flow
1. The browser sends the photo to `POST /api/photos/upload` on the app, never directly to the bucket.
2. The server:
   - checks the session, rate limit and 6-photo cap;
   - verifies the real file bytes;
   - strips all metadata, including **EXIF and GPS**;
   - re-encodes the image to WebP: a main image of at most 1600 px and a 480×600 thumbnail.
3. Only the processed files are written to the bucket, under `profiles/{userId}/{uuid}.webp` and `…_thumb.webp`. **The original upload is never stored.**
4. To display a photo, the server checks with RLS that the viewer may see it, then returns a **10-minute presigned GET URL**.

Because the server does all the writing, **the bucket needs no CORS rules** and the browser never gets write access.

## 1. Create the bucket
1. Open your Railway project, which already contains the `spark` service.
2. Click **+ Create → Bucket**. Choose a region; it cannot be changed later.
3. Name it `photos`. The bucket service is then called `photos` on the canvas.
4. Buckets are always private. Railway does not support public buckets.

## 2. Connect the bucket to the app
Open the **photos** bucket and go to the **Credentials** tab. It lists `BUCKET`, `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` and `REGION`, and says whether to use **virtual-hosted** or **path-style** URLs.

On the **spark** service, open **Variables** and add these **variable references**. Replace `photos` with your bucket service's name if it differs:

```env
S3_ENDPOINT=${{photos.ENDPOINT}}
S3_BUCKET=${{photos.BUCKET}}
S3_ACCESS_KEY_ID=${{photos.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{photos.SECRET_ACCESS_KEY}}
S3_REGION=${{photos.REGION}}
```

If the Credentials tab says the bucket needs **path-style** URLs, also add `S3_FORCE_PATH_STYLE=true`.

Then **Deploy**. The endpoint is also needed **at build time**, for the Content-Security-Policy that allows photo URLs. References are available during the build, so one normal deploy is enough.

`S3_BUCKET` must be the bucket's **`BUCKET`** value. That is the globally unique S3 name, such as `photos-ab12cd34`, not the display name.

## 3. Local development
The bucket is reachable over the internet, so local development can use the same bucket. Copy the values from the Credentials tab into `.env.local`:

```env
S3_ENDPOINT=https://t3.storageapi.dev
S3_BUCKET=<BUCKET>
S3_ACCESS_KEY_ID=<ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<SECRET_ACCESS_KEY>
S3_REGION=auto
```

Each Railway **environment** (production, staging, and so on) gets its own isolated bucket and credentials.

## 4. Verify
1. Sign in, then go to **My profile → Edit → Photos** and upload a JPEG.
2. In the bucket's **Files** view you should see `profiles/<your-user-id>/….webp` and `…_thumb.webp`, and nothing under `uploads/`.
3. Paste an object URL into a browser **without** the signature query string. It must be refused, which shows the bucket is private.

## Costs and limits
- Storage costs **$0.015 per GB-month**. A photo with its thumbnail is about 0.2 MB, so 10,000 photos come to about 2 GB, or about $0.03 per month.
- S3 API operations are **free**, and egress **from** the bucket (photo views) is **free**.
- The app uploading processed photos to the bucket counts as **service egress**. That is about 0.2 MB per photo.
- There are no lifecycle rules, versioning or automatic backups. The daily cleanup cron removes abandoned uploads (after 1 hour) and rejected photos (after 30 days). Deleting an account removes all of that user's objects immediately.
- Monitor usage in Railway under **Project → Usage**.

## Alternative: Cloudflare R2 or another S3 provider
Set the same `S3_*` variables to that provider's values. For R2, use the endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`, and an API token with Object Read & Write scoped to the bucket. The legacy `R2_*` variable names are still accepted.
