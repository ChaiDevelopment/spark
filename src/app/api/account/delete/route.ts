import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStorageConfigured, isServiceRoleConfigured } from "@/lib/env.server";
import { deleteAccountSchema } from "@/lib/validation/schemas";
import { getApiUser } from "@/server/auth";
import { errorResponse, isSameOrigin, json, parseBody } from "@/server/http";
import { deleteObjects } from "@/server/storage";

/**
 * Permanently delete the signed-in user's account.
 *
 *  1. Delete every storage object under the user's photo records.
 *  2. Record a minimal safety event (user id only) for abuse investigations.
 *  3. Delete the Supabase Auth user → ON DELETE CASCADE removes the profile,
 *     preferences, answers, likes, matches, conversations and messages.
 *     Reports and moderation history keep only the opaque user id.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return errorResponse(403, "Forbidden");
  const user = await getApiUser();
  if (!user) return errorResponse(401, "Please sign in again.");
  if (!isServiceRoleConfigured()) return errorResponse(503, "Account deletion isn't configured yet.");

  const body = await parseBody(req, deleteAccountSchema);
  if ("response" in body) return body.response;

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_action: "account_delete" });
  if (!allowed) return errorResponse(429, "Too many attempts. Try again later.");

  const admin = createAdminClient();
  const { data: photos, error: photoError } = await admin
    .from("profile_photos")
    .select("staging_key, object_key, thumb_key")
    .eq("user_id", user.userId);
  if (photoError) return errorResponse(500, "Couldn't delete your account. Please try again.");

  const keys = (photos ?? []).flatMap((p: { staging_key: string; object_key: string | null; thumb_key: string | null }) => [
    p.staging_key,
    p.object_key,
    p.thumb_key,
  ]);
  if (keys.some(Boolean)) {
    if (!isStorageConfigured()) return errorResponse(503, "Photo storage isn't configured; can't remove your photos.");
    try {
      await deleteObjects(keys);
    } catch (e) {
      console.error("storage delete during account deletion failed", e);
      return errorResponse(502, "Couldn't remove your photos. Please try again.");
    }
  }

  await admin.from("user_safety_events").insert({ user_id: user.userId, actor_id: user.userId, event_type: "account_deleted" });
  const { error } = await admin.auth.admin.deleteUser(user.userId);
  if (error) {
    console.error("auth deleteUser failed", error.message);
    return errorResponse(500, "Couldn't delete your account. Please contact support.");
  }
  await supabase.auth.signOut();
  return json({ deleted: true });
}
