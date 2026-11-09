import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Audit log" };

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export default async function AuditPage() {
  const { role } = await requireStaff();
  if (role !== "admin") notFound();
  const supabase = await createClient();
  // RLS: only admins can read the audit log.
  const { data } = await supabase.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as AuditRow[];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, display_name").in("id", actorIds) : { data: [] };
  const names = new Map((actors ?? []).map((a: { id: string; display_name: string }) => [a.id, a.display_name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Audit log</h1>
        <p className="text-ink-soft">Append-only record of privileged actions. Latest 200 entries.</p>
      </div>
      {rows.length === 0 ? (
        <Card className="text-center text-ink-soft">No privileged actions yet.</Card>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-soft">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-ink-faint">{new Date(r.created_at).toLocaleString("en-GB")}</td>
                  <td className="px-4 py-3">{(r.actor_id && names.get(r.actor_id)) ?? r.actor_id?.slice(0, 8) ?? "system"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.target_type}:{r.target_id?.slice(0, 8)}
                  </td>
                  <td className="max-w-xs px-4 py-3 font-mono text-xs text-ink-soft">{JSON.stringify(r.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
