import type { Metadata } from "next";
import { Pager } from "@/components/admin/pager";
import { ReportQueue, type QueueReport } from "@/components/admin/report-queue";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Reports" };

const PAGE_SIZE = 20;

interface ReportRow {
  id: string;
  reporter_id: string | null;
  reported_user_ref: string;
  category: string;
  details: string;
  context_type: "profile" | "message" | "photo";
  context_id: string | null;
  status: "open" | "in_review";
  created_at: string;
}

interface PersonRow {
  id: string;
  display_name: string;
  account_status: QueueReport["reportedStatus"];
  report_count: number;
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(typeof sp.page === "string" ? sp.page : "1")) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("user_reports")
    .select("id, reporter_id, reported_user_ref, category, details, context_type, context_id, status, created_at", { count: "exact" })
    .in("status", ["open", "in_review"])
    .order("created_at", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;

  const reports = (data ?? []) as ReportRow[];
  const reportIds = reports.map((r) => r.id);
  const reportedIds = [...new Set(reports.map((r) => r.reported_user_ref))];
  const personIds = [...new Set([...reports.map((r) => r.reporter_id), ...reportedIds].filter((x): x is string => Boolean(x)))];

  const queueRes = reportIds.length ? await supabase.from("moderation_queue").select("report_id, priority").in("report_id", reportIds) : null;
  const peopleRes = personIds.length ? await supabase.rpc("admin_profiles", { p_ids: personIds }) : null;
  const photosRes = reportedIds.length
    ? await supabase.from("profile_photos").select("user_id").in("user_id", reportedIds).in("status", ["pending", "approved"])
    : null;

  // Reported messages: the only chat content staff ever see, one call per message report.
  const messageReports = reports.filter((r) => r.context_type === "message" && r.context_id);
  const messages = await Promise.all(
    messageReports.map(async (r) => {
      const { data: rows } = await supabase.rpc("admin_reported_message", { p_message: r.context_id });
      const first = ((rows ?? []) as { body: string; sent_at: string }[])[0];
      return [r.id, first ?? null] as const;
    }),
  );

  const priorityById = new Map(((queueRes?.data ?? []) as { report_id: string; priority: number }[]).map((q) => [q.report_id, q.priority]));
  const personById = new Map(((peopleRes?.data ?? []) as PersonRow[]).map((p) => [p.id, p]));
  const livePerUser = new Map<string, number>();
  for (const p of (photosRes?.data ?? []) as { user_id: string }[]) {
    livePerUser.set(p.user_id, (livePerUser.get(p.user_id) ?? 0) + 1);
  }
  const messageById = new Map(messages);

  const items: QueueReport[] = reports.map((r) => {
    const reported = personById.get(r.reported_user_ref);
    const reporter = r.reporter_id ? personById.get(r.reporter_id) : undefined;
    const msg = messageById.get(r.id) as { body: string; sent_at: string } | null | undefined;
    return {
      id: r.id,
      category: r.category,
      details: r.details,
      contextType: r.context_type,
      messageBody: msg?.body ?? null,
      messageSentAt: msg?.sent_at ?? null,
      status: r.status,
      priority: priorityById.get(r.id) ?? 3,
      createdAt: r.created_at,
      reporterName: reporter?.display_name || "Deleted user",
      reportedId: r.reported_user_ref,
      reportedName: reported?.display_name || "Deleted user",
      reportedStatus: reported?.account_status ?? "deactivated",
      // report_count includes this report, so subtract it.
      priorReports: Math.max(0, (reported?.report_count ?? 1) - 1),
      livePhotos: livePerUser.get(r.reported_user_ref) ?? 0,
    };
  });

  const total = count ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Reports</h1>
        <p className="text-ink-soft">
          {total} open · most urgent first, then oldest. Each decision is written to the audit log.
        </p>
      </div>
      <ReportQueue reports={items} />
      <Pager page={page} hasNext={from + PAGE_SIZE < total} href={(p) => `/admin/reports?page=${p}`} />
    </div>
  );
}
