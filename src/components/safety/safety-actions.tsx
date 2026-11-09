"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Flag, HeartCrack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/overlay";
import { Textarea } from "@/components/ui/primitives";
import { REPORT_CATEGORIES, type ReportCategory } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { blockUserAction, reportUserAction, unmatchAction } from "@/server/actions/safety";

export function ReportForm({
  userId,
  name,
  contextType = "profile",
  contextId,
  onDone,
}: {
  userId: string;
  name: string;
  contextType?: "profile" | "message" | "photo";
  contextId?: string;
  onDone?: (blocked: boolean) => void;
}) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!category) return void toast.error("Choose what happened.");
    setBusy(true);
    const res = await reportUserAction({ targetId: userId, category, details, contextType, contextId, alsoBlock });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setSent(true);
    onDone?.(alsoBlock);
  }

  if (sent) {
    return (
      <div className="py-4 text-center">
        <p className="font-display text-xl font-bold">Thank you for telling us</p>
        <p className="mt-2 text-ink-soft">
          Our moderation team will review this. {name} won&apos;t know who reported them.
          {category === "underage" && " Reports about minors are reviewed with the highest priority."}
        </p>
        <p className="mt-4 text-sm text-ink-faint">If you&apos;re in immediate danger, contact local emergency services (112 in Indonesia).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">What happened?</legend>
        <div className="grid gap-2">
          {REPORT_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={category === c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left transition",
                category === c.value ? "border-coral bg-coral/8" : "border-line hover:border-coral/40",
              )}
            >
              <span className="block font-semibold">{c.label}</span>
              <span className="block text-sm text-ink-faint">{c.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="report-details" className="mb-2 block text-sm font-semibold">
          Anything else we should know? <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <Textarea id="report-details" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Share details that help us review this." />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="size-5 accent-[#ff6482]" />
        Also block {name}
      </label>
      <Button variant="destructive" className="w-full" onClick={submit} loading={busy} disabled={!category}>
        Send report
      </Button>
    </div>
  );
}

/** Report / block / unmatch controls for another user. */
export function SafetyActions({ userId, name, matchId, onDone }: { userId: string; name: string; matchId?: string | null; onDone?: () => void }) {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const [confirm, setConfirm] = useState<"block" | "unmatch" | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res = confirm === "block" ? await blockUserAction({ targetId: userId }) : await unmatchAction({ matchId });
    setBusy(false);
    setConfirm(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(confirm === "block" ? `${name} is blocked.` : `You unmatched with ${name}.`);
    onDone?.();
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
      {matchId && (
        <Button variant="ghost" size="sm" onClick={() => setConfirm("unmatch")}>
          <HeartCrack /> Unmatch
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => setConfirm("block")}>
        <Ban /> Block
      </Button>
      <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setReportOpen(true)}>
        <Flag /> Report
      </Button>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent title={`Report ${name}`} description="Reports are confidential.">
          <ReportForm
            userId={userId}
            name={name}
            onDone={(blocked) => {
              if (blocked) {
                onDone?.();
                router.refresh();
              }
            }}
          />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "block" ? `Block ${name}?` : `Unmatch with ${name}?`}
        description={
          confirm === "block"
            ? "You won't see each other anywhere on SPARK, and any match or chat ends. They won't be notified."
            : "Your conversation will close and you won't be matched again. They won't be notified."
        }
        confirmLabel={confirm === "block" ? "Block" : "Unmatch"}
        destructive
        loading={busy}
        onConfirm={run}
      />
    </div>
  );
}
