"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Badge, Input, NativeSelect } from "@/components/ui/primitives";
import { setRoleAction, setSuspensionAction } from "@/server/actions/admin";

export interface AdminUserRow {
  id: string;
  display_name: string;
  email: string;
  account_status: "active" | "suspended" | "deactivated";
  onboarded: boolean;
  report_count: number;
  staff_role: "admin" | "moderator" | null;
  created_at: string;
}

export function UserTable({ users, isAdmin }: { users: AdminUserRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function suspend() {
    if (!target) return;
    setBusy(true);
    const suspendIt = target.account_status === "active";
    const res = await setSuspensionAction({ userId: target.id, suspend: suspendIt, reason: reason || undefined });
    setBusy(false);
    setTarget(null);
    setReason("");
    if (!res.ok) return void toast.error(res.error);
    toast.success(suspendIt ? "User suspended" : "User restored");
    router.refresh();
  }

  async function changeRole(u: AdminUserRow, role: string) {
    const res = await setRoleAction({ userId: u.id, role: role === "" ? null : role });
    if (!res.ok) return void toast.error(res.error);
    toast.success("Role updated");
    router.refresh();
  }

  if (!users.length) return <p className="rounded-3xl bg-white p-6 text-center text-ink-soft">No users found.</p>;

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
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">
                <p className="font-semibold">{u.display_name || "(no name)"}</p>
                <p className="text-xs text-ink-faint">{u.email}</p>
              </td>
              <td className="px-4 py-3">
                <Badge tone={u.account_status === "active" ? "mint" : "danger"}>{u.account_status}</Badge>
                {!u.onboarded && <Badge className="ml-1">onboarding</Badge>}
              </td>
              <td className="px-4 py-3">{u.report_count > 0 ? <Badge tone="coral">{u.report_count}</Badge> : "0"}</td>
              <td className="px-4 py-3">
                {isAdmin ? (
                  <NativeSelect className="h-9 w-32 rounded-full text-xs" value={u.staff_role ?? ""} onChange={(e) => changeRole(u, e.target.value)} aria-label={`Role for ${u.display_name}`}>
                    <option value="">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </NativeSelect>
                ) : (
                  (u.staff_role ?? "user")
                )}
              </td>
              <td className="px-4 py-3 text-ink-faint">{new Date(u.created_at).toLocaleDateString("en-GB")}</td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant={u.account_status === "active" ? "outline" : "secondary"} onClick={() => setTarget(u)}>
                  {u.account_status === "active" ? "Suspend" : "Restore"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.account_status === "active" ? `Suspend ${target?.display_name}?` : `Restore ${target?.display_name}?`}
        description="This action is recorded in the audit log and the user is notified."
        confirmLabel={target?.account_status === "active" ? "Suspend" : "Restore"}
        destructive={target?.account_status === "active"}
        loading={busy}
        onConfirm={suspend}
      >
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the user)" maxLength={300} aria-label="Reason" />
      </ConfirmDialog>
    </div>
  );
}
