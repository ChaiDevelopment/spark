import "server-only";

/** Server-only secrets. Never prefix these with NEXT_PUBLIC_. */
/** Empty or whitespace-only values (common on host dashboards) count as unset. */
const read = (...names: string[]): string => {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return "";
};

/**
 * Private S3-compatible photo storage. Provider-neutral; names are tried in order:
 *   S3_*                      — preferred (set these explicitly)
 *   AWS_*                     — standard SDK names; Railway adds these when a
 *                               bucket is connected to a service
 *   BUCKET / ENDPOINT / …     — Railway bucket credential names (references)
 *   R2_*                      — Cloudflare R2 (endpoint derived from R2_ACCOUNT_ID)
 */
const r2AccountId = read("R2_ACCOUNT_ID");
const storageEndpoint =
  read("S3_ENDPOINT", "AWS_ENDPOINT_URL_S3", "AWS_ENDPOINT_URL", "ENDPOINT", "R2_ENDPOINT") ||
  (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : "");

export const serverEnv = {
  // Accepts a legacy service_role JWT or a new `sb_secret_...` key.
  supabaseServiceKey: read("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
  storageEndpoint,
  storageBucket: read("S3_BUCKET", "AWS_S3_BUCKET_NAME", "BUCKET", "R2_BUCKET_NAME"),
  storageAccessKeyId: read("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", "ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"),
  storageSecretAccessKey: read("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"),
  storageRegion: read("S3_REGION", "AWS_REGION", "AWS_DEFAULT_REGION", "REGION") || "auto",
  /** Only for providers that require path-style URLs (e.g. older Railway buckets, MinIO). */
  storageForcePathStyle: read("S3_FORCE_PATH_STYLE") === "true",
  /**
   * 'auto' (default): photos go live right after the automated checks (real
   * image, size, not animated; EXIF stripped). Staff can still reject them and
   * users can report them. 'manual': photos wait for moderator approval.
   */
  photoModerationMode: read("PHOTO_MODERATION_MODE") === "manual" ? "manual" : "auto",
  cronSecret: read("CRON_SECRET"),
} as const;

export function isStorageConfigured(): boolean {
  return Boolean(serverEnv.storageEndpoint && serverEnv.storageBucket && serverEnv.storageAccessKeyId && serverEnv.storageSecretAccessKey);
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(serverEnv.supabaseServiceKey);
}
