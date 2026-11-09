import type { Metadata } from "next";
import Link from "next/link";
import { UserTable, type AdminUserRow } from "@/components/admin/user-table";
import { Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Overview" };

const STAT_LABELS: [string, string][] = [
  ["users_total", "Accounts"],
  ["users_onboarded", "Onboarded"],
  ["users_active_7d", "Active (7d)"],
  ["users_suspended", "Suspended"],
  ["reports_open", "Open reports"],
  ["queue_urgent", "Urgent items"],
  ["photos_pending", "Photos to review"],
  ["matches_7d", "Matches (7d)"],
  ["messages_7d", "Messages (7d)"],
];

export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  const { role } = await requireStaff();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const supabase = await createClient();
  const [stats, users] = await Promise.all([supabase.rpc("admin_stats"), supabase.rpc("admin_search_users", { p_query: query || null, p_limit: 50 })]);
  const s = (stats.data ?? {}) as Record<string, number>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Overview</h1>
        <p className="text-ink-soft">Live counts from the database.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STAT_LABELS.map(([key, label]) => (
          <Card key={key} className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
            <p className="mt-1 font-display text-3xl font-extrabold">{s[key] ?? "—"}</p>
          </Card>
        ))}
      </div>
      {(s.queue_urgent ?? 0) > 0 && (
        <Link href="/admin/moderation" className="block rounded-3xl bg-danger/10 p-5 font-semibold text-danger">
          {s.queue_urgent} urgent moderation item{s.queue_urgent === 1 ? "" : "s"} (harassment, scams or underage concerns) need review →
        </Link>
      )}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Users</h2>
          <form className="flex gap-2" role="search">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search name, email or ID"
              className="h-10 w-64 rounded-full border border-line bg-white px-4 text-sm focus-visible:border-coral focus-visible:outline-none"
              aria-label="Search users"
            />
            <button className="h-10 rounded-full bg-ink px-4 text-sm font-semibold text-white">Search</button>
          </form>
        </div>
        <UserTable users={(users.data ?? []) as AdminUserRow[]} isAdmin={role === "admin"} />
      </section>
    </div>
  );
}
