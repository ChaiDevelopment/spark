"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { DecisionDialog, type DecisionMode, type DecisionValues } from "@/components/admin/decision-dialog";
import { moderateUserAction } from "@/server/actions/admin";

type UserAction = Exclude<DecisionMode, "dismiss">;

/** Warn, suspend, ban or restore an account from its profile page. */
export function UserModerationPanel({ userId, name, status }: { userId: string; name: string; status: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<UserAction | null>(null);
  const isActive = status === "active";
  const isBanned = status === "banned";

  async function submit(action: UserAction, v: DecisionValues): Promise<string | null> {
    const res = await moderateUserAction({ userId, action, reason: v.reason, days: v.days });
    if (!res.ok) return res.error;
    toast.success("Saved to the audit log");
    router.refresh();
    return null;
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Moderation</h2>
        <p className="text-sm text-ink-soft">Every action is recorded with your name, the reason and the time.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setMode("warn")}>
          Warn
        </Button>
        {!isBanned && (
          <Button size="sm" variant="secondary" onClick={() => setMode("suspend")}>
            Suspend…
          </Button>
        )}
        {!isBanned && (
          <Button size="sm" variant="destructive" onClick={() => setMode("ban")}>
            Ban
          </Button>
        )}
        {!isActive && (
          <Button size="sm" variant="outline" onClick={() => setMode("unsuspend")}>
            Restore account
          </Button>
        )}
      </div>
      {mode && (
        <DecisionDialog
          mode={mode}
          subjectName={name}
          onOpenChange={(open) => !open && setMode(null)}
          onSubmit={(v) => submit(mode, v)}
        />
      )}
    </Card>
  );
}
