"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { REPORT_CATEGORIES, labelFor } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import { resolveReportAction, updateReportAction } from "@/server/actions/admin";
import { DecisionDialog, type DecisionMode } from "@/components/admin/decision-dialog";

export interface QueueReport {
  id: string;
  category: string;
  details: string;
  contextType: "profile" | "message" | "photo";
  messageBody: string | null;
  messageSentAt: string | null;
  status: "open" | "in_review";
  priority: number;
  createdAt: string;
  reporterName: string;
  reportedId: string;
  reportedName: string;
  reportedStatus: "active" | "suspended" | "banned" | "deactivated";
  priorReports: number;
  livePhotos: number;
}

const PRIORITY = { 1: { label: "Urgent", tone: "danger" }, 2: { label: "High", tone: "coral" }, 3: { label: "Normal", tone: "neutral" } } as const;

/**
 * Open reports, oldest first within priority. The reporter's identity is shown
 * to moderators only; nothing here is sent to the reported user. Message
 * reports show the reported message and nothing else from the chat.
 */
export function ReportQueue({ reports }: { reports: QueueReport[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ mode: DecisionMode; report: QueueReport } | null>(null);

  async function markInReview(r: QueueReport) {
    setBusy(r.id);
    const res = await updateReportAction({ reportId: r.id, status: "in_review" });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  }

  if (reports.length === 0) {
    return (
      <Card className="text-center text-ink-soft">
        <p className="font-semibold text-ink">No open reports. 🎉</p>
        <p className="mt-1 text-sm">Reports from members land here with the most urgent first.</p>
      </Card>
    );
  }

  return (
    <>
      <ul className="space-y-4">
        {reports.map((r) => {
          const p = PRIORITY[(r.priority as 1 | 2 | 3) ?? 3] ?? PRIORITY[3];
          const finished = r.reportedStatus === "banned";
          return (
            <li key={r.id}>
              <Card className="space-y-4 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={p.tone}>{p.label}</Badge>
                  <Badge>{labelFor(REPORT_CATEGORIES, r.category)}</Badge>
                  {r.status === "in_review" && <Badge tone="lavender">In review</Badge>}
                  {r.priorReports > 0 && (
                    <Badge tone="danger">
                      {r.priorReports} earlier report{r.priorReports === 1 ? "" : "s"} against them
                    </Badge>
                  )}
                  {r.reportedStatus !== "active" && <Badge tone="danger">{r.reportedStatus}</Badge>}
                  <span className="ml-auto text-xs text-ink-faint">{timeAgo(r.createdAt)} ago</span>
                </div>

                <p className="text-sm">
                  <span className="font-semibold">{r.reporterName}</span> reported{" "}
                  <span className="font-semibold">{r.reportedName}</span>
                  <span className="text-ink-faint"> · {r.contextType === "message" ? "from a chat message" : `from their ${r.contextType}`}</span>
                </p>

                {r.details && <p className="whitespace-pre-line rounded-2xl bg-cream/60 p-3 text-sm">{r.details}</p>}

                {r.contextType === "message" && (
                  <div className="rounded-2xl border border-danger/25 bg-danger/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-danger">Reported message</p>
                    {r.messageBody ? (
                      <>
                        <p className="mt-1 whitespace-pre-line text-sm">{r.messageBody}</p>
                        {r.messageSentAt && (
                          <p className="mt-1 text-xs text-ink-faint">Sent {new Date(r.messageSentAt).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" })} WIB</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-ink-faint">The message is no longer available.</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {r.status === "open" && (
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => markInReview(r)}>
                      Mark in review
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => setDecision({ mode: "dismiss", report: r })}>
                    Dismiss
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => setDecision({ mode: "warn", report: r })}>
                    Warn
                  </Button>
                  {r.reportedStatus !== "suspended" && !finished && (
                    <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => setDecision({ mode: "suspend", report: r })}>
                      Suspend…
                    </Button>
                  )}
                  {!finished && (
                    <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => setDecision({ mode: "ban", report: r })}>
                      Ban
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {decision && (
        <DecisionDialog
          mode={decision.mode}
          subjectName={decision.report.reportedName}
          livePhotos={decision.report.livePhotos}
          allowRemovePhotos={decision.mode !== "dismiss"}
          onOpenChange={(o) => !o && setDecision(null)}
          onSubmit={async (v) => {
            const res = await resolveReportAction({
              reportId: decision.report.id,
              outcome: decision.mode,
              reason: v.reason,
              days: v.days,
              removePhotos: v.removePhotos,
            });
            if (!res.ok) return res.error;
            toast.success(decision.mode === "dismiss" ? "Report dismissed" : "Report resolved and the decision is logged");
            router.refresh();
            return null;
          }}
        />
      )}
    </>
  );
}
