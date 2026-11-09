import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, isServiceRoleConfigured, serverEnv } from "@/lib/env.server";
import { errorResponse, json } from "@/server/http";
import { deleteObjects } from "@/server/r2";

/**
 * Daily maintenance (Vercel Cron, see vercel.json):
 *   - abandoned uploads ('uploading' > 1h): delete staging object + record
 *   - rejected photos older than 30 days: delete R2 objects + record
 *   - expired rate-limit windows (public.run_maintenance, service_role only)
 * Protected by CRON_SECRET (Vercel sends it as a Bearer token).
 */
export async function GET(req: Request) {
  const expected = `Bearer ${serverEnv.cronSecret}`;
  const got = req.headers.get("authorization") ?? "";
  if (!serverEnv.cronSecret || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return errorResponse(401, "Unauthorized");
  }
  if (!isServiceRoleConfigured() || !isR2Configured()) return errorResponse(503, "Not configured");

  const admin = createAdminClient();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [stale, rejected] = await Promise.all([
    admin.from("profile_photos").select("id, staging_key").eq("status", "uploading").lt("created_at", hourAgo).limit(500),
    admin.from("profile_photos").select("id, staging_key, object_key, thumb_key").eq("status", "rejected").lt("reviewed_at", monthAgo).limit(500),
  ]);
  const rows = [...(stale.data ?? []), ...(rejected.data ?? [])] as {
    id: string;
    staging_key: string;
    object_key?: string | null;
    thumb_key?: string | null;
  }[];
  if (rows.length) {
    await deleteObjects(rows.flatMap((r) => [r.staging_key, r.object_key, r.thumb_key]));
    await admin.from("profile_photos").delete().in("id", rows.map((r) => r.id));
  }
  // Prune expired rate-limit windows (private.rate_limit_hits).
  const { error: maintenanceError } = await admin.rpc("run_maintenance");
  if (maintenanceError) console.error("run_maintenance failed", maintenanceError.message);
  return json({ removedPhotos: rows.length, maintenance: !maintenanceError });
}
