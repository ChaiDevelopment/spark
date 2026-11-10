import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/utils";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  await requireStaff();
  const supabase = await createClient();
  const [stats, oldestPhoto, oldestReport] = await Promise.all([
    supabase.rpc("admin_stats"),
    supabase.from("profile_photos").select("created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase
      .from("user_reports")
      .select("created_at")
      .in("status", ["open", "in_review"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (stats.error) throw stats.error;
  const s = (stats.data ?? {}) as Record<string, number>;
  const photoOldest = (oldestPhoto.data as { created_at: string } | null)?.created_at ?? null;
  const reportOldest = (oldestReport.data as { created_at: string } | null)?.created_at ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Overview</h1>
        <p className="text-ink-soft">What needs attention right now.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <QueueCard
          href="/admin/photos"
          title="Photos waiting"
          count={s.photos_pending ?? 0}
          oldest={photoOldest}
          empty="Nothing waiting."
        />
        <QueueCard
          href="/admin/reports"
          title="Open reports"
          count={s.reports_open ?? 0}
          oldest={reportOldest}
          empty="No open reports."
          urgent={s.queue_urgent ?? 0}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["users_total", "Accounts"],
            ["users_onboarded", "Onboarded"],
            ["users_active_7d", "Active (7d)"],
            ["users_suspended", "Suspended"],
            ["matches_7d", "Matches (7d)"],
            ["messages_7d", "Messages (7d)"],
          ] as const
        ).map(([key, label]) => (
          <Card key={key} className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
            <p className="mt-1 font-display text-2xl font-extrabold">{s[key] ?? "—"}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/users" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
          Find a member
        </Link>
        <Link href="/admin/audit" className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink">
          Audit log
        </Link>
      </div>
    </div>
  );
}

function QueueCard({
  href,
  title,
  count,
  oldest,
  empty,
  urgent = 0,
}: {
  href: string;
  title: string;
  count: number;
  oldest: string | null;
  empty: string;
  urgent?: number;
}) {
  return (
    <Link href={href} className="block rounded-3xl bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{title}</p>
      <p className="mt-2 font-display text-4xl font-extrabold">{count}</p>
      <p className="mt-2 text-sm text-ink-soft">
        {count === 0 || !oldest ? empty : `Oldest waiting ${timeAgo(oldest)}`}
      </p>
      {urgent > 0 && <p className="mt-2 text-sm font-semibold text-danger">{urgent} urgent (harassment, scam or underage)</p>}
      <p className="mt-4 text-sm font-semibold text-coral-deep">Open queue →</p>
    </Link>
  );
}
