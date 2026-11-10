"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge, NativeSelect } from "@/components/ui/primitives";
import { setRoleAction } from "@/server/actions/admin";

export interface AdminUserRow {
  id: string;
  display_name: string;
  email: string;
  account_status: "active" | "suspended" | "banned" | "deactivated";
  suspended_until?: string | null;
  onboarded: boolean;
  report_count: number;
  staff_role: "admin" | "moderator" | null;
  created_at: string;
}

const STATUS_TONE = { active: "mint", suspended: "peach", banned: "danger", deactivated: "neutral" } as const;

function statusLabel(u: AdminUserRow): string {
  if (u.account_status === "suspended") {
    return u.suspended_until
      ? `Suspended until ${new Date(u.suspended_until).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" })}`
      : "Suspended";
  }
  return u.account_status.charAt(0).toUpperCase() + u.account_status.slice(1);
}

export function UserTable({ users, isAdmin }: { users: AdminUserRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function changeRole(u: AdminUserRow, role: string) {
    setBusy(u.id);
    const res = await setRoleAction({ userId: u.id, role: role === "" ? null : role });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Role updated");
    router.refresh();
  }

  if (!users.length) {
    return <p className="rounded-3xl bg-white p-8 text-center text-ink-soft">No users match that search.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-3xl bg-white shadow-soft">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-faint">
          <tr>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Reports</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Joined</th>
            <th className="px-4 py-3 text-right">Open</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((u) => (
            <tr key={u.id} className="align-middle">
              <td className="px-4 py-3">
                <p className="font-semibold">{u.display_name || "(no name yet)"}</p>
                <p className="text-xs text-ink-faint">{u.email}</p>
              </td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONE[u.account_status]}>{statusLabel(u)}</Badge>
                {!u.onboarded && <span className="ml-2 text-xs text-ink-faint">not onboarded</span>}
              </td>
              <td className="px-4 py-3">
                {u.report_count > 0 ? <Badge tone="danger">{u.report_count}</Badge> : <span className="text-ink-faint">0</span>}
              </td>
              <td className="px-4 py-3">
                {isAdmin ? (
                  <NativeSelect
                    className="h-9 w-36 py-1 text-sm"
                    aria-label={`Role for ${u.display_name}`}
                    value={u.staff_role ?? ""}
                    disabled={busy === u.id}
                    onChange={(e) => changeRole(u, e.target.value)}
                  >
                    <option value="">Member</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </NativeSelect>
                ) : (
                  <span className="text-ink-soft">{u.staff_role ?? "Member"}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-faint">{new Date(u.created_at).toLocaleDateString("en-GB")}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/users/${u.id}`} className="font-semibold text-coral-deep hover:underline">
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
