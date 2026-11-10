"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Field, NativeSelect, Textarea } from "@/components/ui/primitives";
import { SUSPEND_DAY_OPTIONS } from "@/lib/constants";

export type DecisionMode = "dismiss" | "warn" | "suspend" | "ban" | "unsuspend";

const COPY: Record<DecisionMode, { title: string; cta: string; needsReason: boolean; destructive?: boolean; hint: string }> = {
  dismiss: {
    title: "Dismiss report",
    cta: "Dismiss",
    needsReason: false,
    hint: "No action is taken against the account. The reporter is never told who else reported.",
  },
  warn: {
    title: "Send a warning",
    cta: "Send warning",
    needsReason: true,
    hint: "The user gets an in-app notification with your message. The reporter is never named.",
  },
  suspend: {
    title: "Suspend account",
    cta: "Suspend",
    needsReason: true,
    hint: "The profile is hidden and the account can't sign in or send messages until the end date. It is restored automatically afterwards.",
  },
  ban: {
    title: "Ban permanently",
    cta: "Ban account",
    needsReason: true,
    destructive: true,
    hint: "The account is closed: hidden from everyone, locked out, and its conversations are hidden.",
  },
  unsuspend: {
    title: "Restore account",
    cta: "Restore",
    needsReason: false,
    hint: "The account becomes active again and can be discovered and sign in.",
  },
};

export interface DecisionValues {
  reason: string | undefined;
  days: number | undefined;
  removePhotos: boolean;
}

/**
 * One confirmation dialog for every moderation decision. It validates what the
 * server requires, then calls `onSubmit`, which returns an error message or null.
 */
export function DecisionDialog({
  mode,
  onOpenChange,
  onSubmit,
  subjectName,
  livePhotos = 0,
  allowRemovePhotos = false,
}: {
  mode: DecisionMode;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DecisionValues) => Promise<string | null>;
  subjectName: string;
  livePhotos?: number;
  allowRemovePhotos?: boolean;
}) {
  const c = COPY[mode];
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<number>(7);
  const [removePhotos, setRemovePhotos] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    const trimmed = reason.trim();
    if (c.needsReason && !trimmed) return setError("Write a reason. It is saved in the audit log.");
    if (mode === "ban" && !confirmed) return setError("Tick the box to confirm the permanent ban.");
    setBusy(true);
    const err = await onSubmit({
      reason: trimmed || undefined,
      days: mode === "suspend" ? days : undefined,
      removePhotos,
    });
    setBusy(false);
    if (err) return setError(err);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent title={c.title} description={`${subjectName} · ${c.hint}`}>
        <div className="space-y-4">
          <Field label={c.needsReason ? "Reason (saved in the audit log)" : "Internal note (optional)"} htmlFor="decision-reason">
            <Textarea
              id="decision-reason"
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={c.needsReason ? "e.g. Repeated harassment in chat" : "Optional"}
            />
          </Field>

          {mode === "suspend" && (
            <Field label="Suspended for" htmlFor="decision-days">
              <NativeSelect id="decision-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {SUSPEND_DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? "day" : "days"}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          {allowRemovePhotos && livePhotos > 0 && (
            <label className="flex items-start gap-3 rounded-2xl bg-cream/60 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-coral" checked={removePhotos} onChange={(e) => setRemovePhotos(e.target.checked)} />
              <span>
                Also remove their {livePhotos} live photo{livePhotos === 1 ? "" : "s"}
              </span>
            </label>
          )}

          {mode === "ban" && (
            <label className="flex items-start gap-3 rounded-2xl bg-danger/8 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-danger" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>I understand this ban is permanent and only an admin can reverse it from the user page.</span>
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={c.destructive ? "destructive" : "default"} onClick={submit} loading={busy}>
            {c.cta}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
