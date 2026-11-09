import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env.server";
import { getApiUser } from "@/server/auth";
import { errorResponse, isSameOrigin, json } from "@/server/http";
import { deleteObjects, keyBelongsTo } from "@/server/r2";

/** Delete one of the caller's photos (R2 objects first, then the record). */
export async function DELETE(req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  if (!isSameOrigin(req)) return errorResponse(403, "Forbidden");
  const user = await getApiUser();
  if (!user) return errorResponse(401, "Please sign in again.");
  if (!isServiceRoleConfigured()) return errorResponse(503, "Photo storage isn't configured yet.");

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return errorResponse(400, "Invalid photo id");

  const admin = createAdminClient();
  const { data: photo } = await admin
    .from("profile_photos")
    .select("id, user_id, staging_key, object_key, thumb_key")
    .eq("id", id)
    .eq("user_id", user.userId)
    .maybeSingle();
  if (!photo) return errorResponse(404, "Photo not found.");

  const keys = [photo.staging_key, photo.object_key, photo.thumb_key].filter((k): k is string => Boolean(k));
  if (!keys.every((k) => keyBelongsTo(k, user.userId))) return errorResponse(403, "Forbidden");
  try {
    await deleteObjects(keys);
  } catch (e) {
    console.error("R2 delete failed", e);
    return errorResponse(502, "Couldn't delete the photo. Please try again.");
  }
  await admin.from("profile_photos").delete().eq("id", photo.id).eq("user_id", user.userId);

  // Compact remaining positions so the main photo is always position 0.
  const { data: rest } = await admin
    .from("profile_photos")
    .select("id")
    .eq("user_id", user.userId)
    .in("status", ["pending", "approved"])
    .order("position", { ascending: true, nullsFirst: false });
  // Sequential, ascending: each row only moves down into a slot already freed.
  for (const [i, p] of ((rest ?? []) as { id: string }[]).entries()) {
    await admin.from("profile_photos").update({ position: i }).eq("id", p.id);
  }
  return json({ deleted: true });
}
