/**
 * Environment access. NEXT_PUBLIC_* values must be referenced literally so
 * Next.js can inline them into the browser bundle. Server secrets live in
 * src/lib/env.server.ts, which is guarded by `server-only`.
 */
// `||` (not `??`) so variables defined but left EMPTY on a host dashboard
// fall through to the alternative name instead of shadowing it.
export const publicEnv = {
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  // Accepts either a legacy anon JWT or a new `sb_publishable_...` key.
  supabaseAnonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim(),
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim().replace(/\/$/, ""),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}
