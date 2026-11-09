import { createClient } from "@/lib/supabase/server";
import { isStorageConfigured } from "@/lib/env.server";
import { photoViewSchema } from "@/lib/validation/schemas";
import { getApiUser } from "@/server/auth";
import { errorResponse, json, parseBody } from "@/server/http";
import { presignView, VIEW_URL_TTL_SECONDS } from "@/server/storage";

/**
 * Exchange photo ids for short-lived signed view URLs.
 *
 * Authorization is delegated to Postgres RLS: the photo rows are read with the
 * USER-scoped client, so only photos the viewer may see come back (own photos,
 * approved photos of profiles they can view, or everything for staff).
 * Ids that aren't returned are silently omitted.
 */
export async function POST(req: Request) {
  const user = await getApiUser();
  if (!user) return errorResponse(401, "Please sign in again.");
  if (!isStorageConfigured()) return json({ urls: {}, expiresIn: 0 });

  const body = await parseBody(req, photoViewSchema);
  if ("response" in body) return body.response;

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_action: "photo_view" });
  if (!allowed) return errorResponse(429, "Slow down a little.");

  const { data, error } = await supabase
    .from("profile_photos")
    .select("id, object_key, thumb_key")
    .in("id", body.data.ids)
    .neq("status", "uploading");
  if (error) return errorResponse(500, "Couldn't load photos.");

  const urls: Record<string, string> = {};
  await Promise.all(
    (data ?? []).map(async (p: { id: string; object_key: string | null; thumb_key: string | null }) => {
      const key = body.data.variant === "thumb" ? (p.thumb_key ?? p.object_key) : (p.object_key ?? p.thumb_key);
      if (key) urls[p.id] = await presignView(key);
    }),
  );
  return json({ urls, expiresIn: VIEW_URL_TTL_SECONDS });
}
