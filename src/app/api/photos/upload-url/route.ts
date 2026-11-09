import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, isServiceRoleConfigured } from "@/lib/env.server";
import { uploadRequestSchema } from "@/lib/validation/schemas";
import { MAX_PHOTOS } from "@/lib/constants";
import { getApiUser } from "@/server/auth";
import { errorResponse, isSameOrigin, json, parseBody } from "@/server/http";
import { presignUpload, stagingKey, UPLOAD_URL_TTL_SECONDS } from "@/server/r2";

/**
 * Step 1 of the upload flow: authorize an upload and return a short-lived
 * presigned PUT URL to a private staging key in R2.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return errorResponse(403, "Forbidden");
  const user = await getApiUser();
  if (!user) return errorResponse(401, "Please sign in again.");
  if (!user.active) return errorResponse(403, "Your account can't upload photos right now.");
  if (!isR2Configured() || !isServiceRoleConfigured()) return errorResponse(503, "Photo uploads aren't configured yet.");

  const body = await parseBody(req, uploadRequestSchema);
  if ("response" in body) return body.response;

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_action: "photo_upload" });
  if (!allowed) return errorResponse(429, "Too many uploads. Try again in a little while.");

  const admin = createAdminClient();
  const { count } = await admin
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.userId)
    .in("status", ["pending", "approved"]);
  if ((count ?? 0) >= MAX_PHOTOS) return errorResponse(409, `You can have up to ${MAX_PHOTOS} photos.`);

  const key = stagingKey(user.userId);
  const { data: photo, error } = await admin
    .from("profile_photos")
    .insert({ user_id: user.userId, staging_key: key, status: "uploading", content_type: body.data.contentType, bytes: body.data.size })
    .select("id")
    .single();
  if (error) {
    // The DB trigger enforces the 6-photo cap (including in-flight uploads).
    return errorResponse(409, error.code === "23514" ? error.message : "Couldn't start the upload.");
  }

  const uploadUrl = await presignUpload(key, body.data.contentType, body.data.size);
  return json({
    photoId: photo.id,
    uploadUrl,
    headers: { "Content-Type": body.data.contentType },
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
}
