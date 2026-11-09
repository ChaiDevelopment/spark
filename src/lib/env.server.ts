import "server-only";

/** Server-only secrets. Never prefix these with NEXT_PUBLIC_. */
export const serverEnv = {
  // Accepts a legacy service_role JWT or a new `sb_secret_...` key.
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "",
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2Bucket: process.env.R2_BUCKET_NAME ?? "",
  r2Endpoint: process.env.R2_ENDPOINT ?? "",
  /** 'manual' (default): photos wait for moderator approval. 'auto': approved after automated checks. */
  photoModerationMode: process.env.PHOTO_MODERATION_MODE === "auto" ? "auto" : "manual",
  cronSecret: process.env.CRON_SECRET ?? "",
} as const;

export function isR2Configured(): boolean {
  return Boolean(serverEnv.r2AccessKeyId && serverEnv.r2SecretAccessKey && serverEnv.r2Bucket && (serverEnv.r2Endpoint || serverEnv.r2AccountId));
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(serverEnv.supabaseServiceKey);
}
