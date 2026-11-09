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

export const serverEnv = {
  // Accepts a legacy service_role JWT or a new `sb_secret_...` key.
  supabaseServiceKey: read("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
  r2AccountId: read("R2_ACCOUNT_ID"),
  r2AccessKeyId: read("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: read("R2_SECRET_ACCESS_KEY"),
  r2Bucket: read("R2_BUCKET_NAME"),
  r2Endpoint: read("R2_ENDPOINT"),
  /** 'manual' (default): photos wait for moderator approval. 'auto': approved after automated checks. */
  photoModerationMode: read("PHOTO_MODERATION_MODE") === "auto" ? "auto" : "manual",
  cronSecret: read("CRON_SECRET"),
} as const;

export function isR2Configured(): boolean {
  return Boolean(serverEnv.r2AccessKeyId && serverEnv.r2SecretAccessKey && serverEnv.r2Bucket && (serverEnv.r2Endpoint || serverEnv.r2AccountId));
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(serverEnv.supabaseServiceKey);
}
