import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

let admin: SupabaseClient | undefined;

/**
 * Service-role client. BYPASSES RLS — only for trusted server operations that
 * cannot be expressed as user-scoped queries:
 *   - photo pipeline writes (after the server validated the R2 object)
 *   - reading both users' private answers to compute chemistry
 *   - account deletion (auth.admin.deleteUser)
 * Always derive the acting user from a verified session first.
 */
export function createAdminClient(): SupabaseClient {
  if (!serverEnv.supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  admin ??= createClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
