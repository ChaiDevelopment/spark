import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, isServiceRoleConfigured, serverEnv } from "@/lib/env.server";
import { photoIdSchema } from "@/lib/validation/schemas";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { getApiUser } from "@/server/auth";
import { errorResponse, isSameOrigin, json, parseBody } from "@/server/http";
import { ImageRejectedError, PROCESSING_VERSION, processProfileImage } from "@/server/images";
import { deleteObjects, getObjectBytes, headObject, keyBelongsTo, photoKeys, putObject } from "@/server/r2";

export const maxDuration = 30;

/**
 * Step 2: the browser has PUT the original to R2. Re-validate everything on
 * the server (ownership, real size, real content), strip metadata, produce the
 * WebP main image + thumbnail, then record the object keys.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return errorResponse(403, "Forbidden");
  const user = await getApiUser();
  if (!user) return errorResponse(401, "Please sign in again.");
  if (!user.active) return errorResponse(403, "Your account can't upload photos right now.");
  if (!isR2Configured() || !isServiceRoleConfigured()) return errorResponse(503, "Photo uploads aren't configured yet.");

  const body = await parseBody(req, photoIdSchema);
  if ("response" in body) return body.response;

  const admin = createAdminClient();
  const { data: photo } = await admin
    .from("profile_photos")
    .select("id, user_id, staging_key, status")
    .eq("id", body.data.photoId)
    .eq("user_id", user.userId) // ownership derived from the session, not the request
    .maybeSingle();
  if (!photo || photo.status !== "uploading" || !keyBelongsTo(photo.staging_key, user.userId)) {
    return errorResponse(404, "Upload not found.");
  }

  const discard = async () => {
    await deleteObjects([photo.staging_key]).catch(() => undefined);
    await admin.from("profile_photos").delete().eq("id", photo.id);
  };

  const head = await headObject(photo.staging_key);
  if (!head) return errorResponse(409, "We didn't receive the file. Please try again.");
  if (head.size > MAX_UPLOAD_BYTES) {
    await discard();
    return errorResponse(413, "Images must be 10 MB or smaller.");
  }

  let processed;
  try {
    processed = await processProfileImage(await getObjectBytes(photo.staging_key, MAX_UPLOAD_BYTES));
  } catch (e) {
    await discard();
    return errorResponse(422, e instanceof ImageRejectedError ? e.message : "We couldn't process that image.");
  }

  const { objectKey, thumbKey } = photoKeys(user.userId);
  try {
    await Promise.all([putObject(objectKey, processed.main.data, "image/webp"), putObject(thumbKey, processed.thumb.data, "image/webp")]);
  } catch (e) {
    console.error("R2 write failed", e);
    await deleteObjects([objectKey, thumbKey]).catch(() => undefined);
    return errorResponse(502, "Upload failed. Please try again.");
  }
  // The original may contain EXIF/GPS: never keep it.
  await deleteObjects([photo.staging_key]).catch((e) => console.error("staging cleanup failed", e));

  const { data: taken } = await admin
    .from("profile_photos")
    .select("position")
    .eq("user_id", user.userId)
    .in("status", ["pending", "approved"]);
  const used = new Set((taken ?? []).map((p: { position: number | null }) => p.position));
  const position = [0, 1, 2, 3, 4, 5].find((p) => !used.has(p)) ?? null;

  const status = serverEnv.photoModerationMode === "auto" ? "approved" : "pending";
  const { data: saved, error } = await admin
    .from("profile_photos")
    .update({
      object_key: objectKey,
      thumb_key: thumbKey,
      status,
      position,
      content_type: "image/webp",
      bytes: processed.main.data.byteLength,
      width: processed.main.width,
      height: processed.main.height,
      processing_version: PROCESSING_VERSION,
    })
    .eq("id", photo.id)
    .eq("status", "uploading")
    .select("id, status, position")
    .single();
  if (error || !saved) {
    await deleteObjects([objectKey, thumbKey]).catch(() => undefined);
    await admin.from("profile_photos").delete().eq("id", photo.id);
    return errorResponse(409, "Couldn't save the photo.");
  }
  return json({ photo: saved });
}
