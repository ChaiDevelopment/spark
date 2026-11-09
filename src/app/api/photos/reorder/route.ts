import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { reorderSchema } from "@/lib/validation/schemas";
import { getApiUser } from "@/server/auth";
import { errorResponse, isSameOrigin, json, parseBody } from "@/server/http";

/** Reorder the caller's photos. Ownership is enforced inside reorder_photos(). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return errorResponse(403, "Forbidden");
  const user = await getApiUser();
  if (!user) return errorResponse(401, "Please sign in again.");
  const body = await parseBody(req, reorderSchema);
  if ("response" in body) return body.response;

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_photos", { p_ids: body.data.ids });
  if (error) return errorResponse(422, friendlyError(error));
  return json({ ok: true });
}
