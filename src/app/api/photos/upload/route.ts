import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured, isStorageConfigured, serverEnv } from "@/lib/env.server";
import { MAX_PHOTOS, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { getApiUser } from "@/server/auth";
import { errorResponse, isSameOrigin, json } from "@/server/http";
import { ImageRejectedError, PROCESSING_VERSION, processProfileImage } from "@/server/images";
import { deleteObjects, photoKeys, putObject, stagingKey } from "@/server/storage";

export const maxDuration = 30;

// Multipart framing around a 10 MB file.
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

/**
 * Upload one profile photo (multipart/form-data, field "file").
 *
 * The original never reaches storage: the server verifies the real bytes
 * (magic numbers, decode limits), strips ALL metadata incl. EXIF/GPS,
 * re-encodes to WebP (main ≤1600px + 480×600 thumbnail) and writes only the
 * processed objects to the private bucket. Ownership comes from the session.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return errorResponse(403, "Forbidden");
  const user = await getApiUser();
  if (!user) return errorResponse(401, "Please sign in again.");
  if (!user.active) return errorResponse(403, "Your account can't upload photos right now.");
  if (!isStorageConfigured() || !isServiceRoleConfigured()) return errorResponse(503, "Photo uploads aren't configured yet.");

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_REQUEST_BYTES) return errorResponse(413, "Images must be 10 MB or smaller.");

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_action: "photo_upload" });
  if (!allowed) return errorResponse(429, "Too many uploads. Try again in a little while.");

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return errorResponse(400, "Send the photo as multipart/form-data.");
  }
  if (!(file instanceof File) || file.size === 0) return errorResponse(422, "Choose a photo to upload.");
  if (file.size > MAX_UPLOAD_BYTES) return errorResponse(413, "Images must be 10 MB or smaller.");

  const admin = createAdminClient();
  const { count } = await admin
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.userId)
    .in("status", ["uploading", "pending", "approved"]);
  if ((count ?? 0) >= MAX_PHOTOS) return errorResponse(409, `You can have up to ${MAX_PHOTOS} photos.`);

  let processed;
  try {
    processed = await processProfileImage(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return errorResponse(422, e instanceof ImageRejectedError ? e.message : "We couldn't process that image.");
  }

  // Reserve the slot first: the DB trigger enforces the 6-photo cap atomically.
  const { data: reserved, error: reserveError } = await admin
    .from("profile_photos")
    .insert({ user_id: user.userId, staging_key: stagingKey(user.userId), status: "uploading" })
    .select("id")
    .single();
  if (reserveError || !reserved) {
    return errorResponse(409, reserveError?.code === "23514" ? reserveError.message : "Couldn't start the upload.");
  }

  const { objectKey, thumbKey } = photoKeys(user.userId);
  const discard = async () => {
    await deleteObjects([objectKey, thumbKey]).catch(() => undefined);
    await admin.from("profile_photos").delete().eq("id", reserved.id);
  };

  try {
    await Promise.all([putObject(objectKey, processed.main.data, "image/webp"), putObject(thumbKey, processed.thumb.data, "image/webp")]);
  } catch (e) {
    console.error("photo storage write failed", e);
    await discard();
    return errorResponse(502, "Upload failed. Please try again.");
  }

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
    .eq("id", reserved.id)
    .eq("status", "uploading")
    .select("id, status, position")
    .single();
  if (error || !saved) {
    await discard();
    return errorResponse(409, "Couldn't save the photo.");
  }
  return json({ photo: saved });
}
