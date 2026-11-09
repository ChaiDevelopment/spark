"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { PhotoImage } from "@/components/photos";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input } from "@/components/ui/primitives";
import { REPORT_CATEGORIES, labelFor } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import { reviewPhotoAction, setSuspensionAction, updateReportAction } from "@/server/actions/admin";

export interface ReportRow {
  id: string;
  category: string;
  details: string;
  context_type: string;
  context_id: string | null;
  status: "open" | "in_review";
  created_at: string;
  reported_user_ref: string;
  reporter: { display_name: string } | null;
  reported: { display_name: string; account_status: string } | null;
  moderation_queue: { priority: number }[] | null;
}

export interface PendingPhoto {
  id: string;
  user_id: string;
  created_at: string;
  owner: { display_name: string } | null;
}

const PRIORITY = { 1: { label: "Urgent", tone: "danger" }, 2: { label: "High", tone: "coral" }, 3: { label: "Normal", tone: "neutral" } } as const;

export function ReportQueue({ reports }: { reports: ReportRow[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function act(r: ReportRow, status: "in_review" | "actioned" | "dismissed", suspend = false) {
    setBusy(r.id);
    if (suspend) {
      const s = await setSuspensionAction({ userId: r.reported_user_ref, suspend: true, reason: `Report: ${labelFor(REPORT_CATEGORIES, r.category)}` });
      if (!s.ok) {
        setBusy(null);
        return void toast.error(s.error);
      }
    }
    const res = await updateReportAction({ reportId: r.id, status, notes: notes[r.id] || undefined });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Report updated");
    router.refresh();
  }

  return (
    <section aria-labelledby="reports-h">
      <h2 id="reports-h" className="mb-3 font-display text-xl font-bold">
        Reports <span className="text-ink-faint">({reports.length})</span>
      </h2>
      {reports.length === 0 ? (
        <Card className="text-center text-ink-soft">No open reports. 🎉</Card>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const p = PRIORITY[(r.moderation_queue?.[0]?.priority ?? 3) as 1 | 2 | 3];
            return (
              <li key={r.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={p.tone}>{p.label}</Badge>
                    <Badge>{labelFor(REPORT_CATEGORIES, r.category)}</Badge>
                    {r.status === "in_review" && <Badge tone="lavender">In review</Badge>}
                    <span className="ml-auto text-xs text-ink-faint">{timeAgo(r.created_at)} ago</span>
                  </div>
                  <p className="mt-3 text-sm">
                    <span className="font-semibold">{r.reporter?.display_name ?? "Deleted user"}</span> reported{" "}
                    <span className="font-semibold">{r.reported?.display_name ?? `deleted user (${r.reported_user_ref.slice(0, 8)})`}</span>
                    {r.reported?.account_status === "suspended" && <Badge tone="danger" className="ml-2">suspended</Badge>}
                    <span className="text-ink-faint"> · via {r.context_type}</span>
                  </p>
                  {r.details && <p className="mt-2 whitespace-pre-line rounded-2xl bg-cream/60 p-3 text-sm">{r.details}</p>}
                  <Input className="mt-3 h-10 text-sm" placeholder="Internal note (optional)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} aria-label="Internal note" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status === "open" && (
                      <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r, "in_review")}>
                        Mark in review
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r, "dismissed")}>
                      Dismiss
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => act(r, "actioned")}>
                      Resolve (warned / handled)
                    </Button>
                    {r.reported && r.reported.account_status === "active" && (
                      <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => act(r, "actioned", true)}>
                        Suspend & resolve
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function PhotoReview({ photos }: { photos: PendingPhoto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  async function review(p: PendingPhoto, approve: boolean) {
    let reason: string | undefined;
    if (!approve) {
      reason = window.prompt("Reason for rejection (shown to the user):", "Your face must be clearly visible") ?? undefined;
      if (reason === undefined) return;
    }
    setBusy(p.id);
    const res = await reviewPhotoAction({ photoId: p.id, approve, reason });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    setDone((d) => new Set(d).add(p.id));
    router.refresh();
  }

  const list = photos.filter((p) => !done.has(p.id));
  return (
    <section aria-labelledby="photos-h">
      <h2 id="photos-h" className="mb-3 font-display text-xl font-bold">
        Photo review <span className="text-ink-faint">({list.length})</span>
      </h2>
      {list.length === 0 ? (
        <Card className="text-center text-ink-soft">No photos waiting.</Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {list.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-3xl bg-white shadow-soft">
              <PhotoImage photoId={p.id} alt={`Pending photo from ${p.owner?.display_name ?? "user"}`} className="aspect-[4/5] w-full" />
              <div className="p-3">
                <p className="truncate text-sm font-semibold">{p.owner?.display_name ?? "User"}</p>
                <p className="text-xs text-ink-faint">{timeAgo(p.created_at)} ago</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1" disabled={busy === p.id} onClick={() => review(p, true)} aria-label="Approve photo">
                    <Check />
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-danger" disabled={busy === p.id} onClick={() => review(p, false)} aria-label="Reject photo">
                    <X />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
