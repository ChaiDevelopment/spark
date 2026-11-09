import type { Metadata } from "next";
import { PhotoReview, ReportQueue, type PendingPhoto, type ReportRow } from "@/components/admin/moderation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Moderation" };

export default async function ModerationPage() {
  await requireStaff();
  const supabase = await createClient();
  const [reports, photos] = await Promise.all([
    supabase
      .from("user_reports")
      .select(
        "id, category, details, context_type, context_id, status, created_at, reported_user_ref, reporter:profiles!user_reports_reporter_id_fkey(display_name), reported:profiles!user_reports_reported_user_id_fkey(display_name, account_status), moderation_queue(priority)",
      )
      .in("status", ["open", "in_review"])
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("profile_photos")
      .select("id, user_id, created_at, owner:profiles!profile_photos_user_id_fkey(display_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(60),
  ]);

  const reportRows = ((reports.data ?? []) as unknown as ReportRow[]).sort(
    (a, b) => (a.moderation_queue?.[0]?.priority ?? 3) - (b.moderation_queue?.[0]?.priority ?? 3),
  );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Moderation</h1>
        <p className="text-ink-soft">Urgent reports first. Every decision is written to the audit log.</p>
      </div>
      <ReportQueue reports={reportRows} />
      <PhotoReview photos={(photos.data ?? []) as unknown as PendingPhoto[]} />
    </div>
  );
}
