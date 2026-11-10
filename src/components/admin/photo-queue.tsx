"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { PhotoImage } from "@/components/photos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Badge, Card, Textarea } from "@/components/ui/primitives";
import { PHOTO_REJECT_REASONS, type PhotoRejectReason } from "@/lib/constants";
import { cn, timeAgo } from "@/lib/utils";
import { bulkReviewPhotosAction, reviewPhotoAction } from "@/server/actions/admin";

export interface QueuePhoto {
  id: string;
  ownerName: string;
  age: number | null;
  city: string | null;
  region: string | null;
  createdAt: string;
  priorReports: number;
  otherPhotoIds: string[];
}

/**
 * Review queue for pending photos. Oldest first. Keyboard:
 *   J / →  next      K / ←  previous      X  select
 *   A      approve   R      reject        Shift+A / Shift+R  act on the selection
 * Every action is a server action that re-checks the moderator role.
 */
export function PhotoQueue({ photos }: { photos: QueuePhoto[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  // A fresh server render replaces the list, so forget optimistic removals.
  // Done during render (not in an effect) so the reset happens before paint.
  const [basis, setBasis] = useState(photos);
  if (basis !== photos) {
    setBasis(photos);
    setGone(new Set());
    setPicked(new Set());
  }

  const cards = useMemo(() => photos.filter((p) => !gone.has(p.id)), [photos, gone]);
  const index = Math.min(focus, Math.max(cards.length - 1, 0));
  const current = cards[index];

  const togglePick = useCallback((id: string) => {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const approve = useCallback(
    async (ids: string[]) => {
      setBusy(true);
      if (ids.length === 1) {
        const res = await reviewPhotoAction({ photoId: ids[0], approve: true });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Photo approved — they can appear in Discover now");
      } else {
        const res = await bulkReviewPhotosAction({ photoIds: ids, approve: true });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        const { done, skipped, failed } = res.data;
        toast.success(`${done} approved${skipped ? `, ${skipped} already handled` : ""}${failed ? `, ${failed} failed` : ""}`);
      }
      setGone((g) => new Set([...g, ...ids]));
      setPicked(new Set());
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (rejecting || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [role='dialog']")) return;
      if (e.key === "j" || e.key === "ArrowRight") {
        e.preventDefault();
        setFocus(Math.min(index + 1, cards.length - 1));
      } else if (e.key === "k" || e.key === "ArrowLeft") {
        e.preventDefault();
        setFocus(Math.max(index - 1, 0));
      } else if (e.key === "a" && current) {
        approve([current.id]);
      } else if (e.key === "r" && current) {
        setRejecting([current.id]);
      } else if (e.key === "x" && current) {
        togglePick(current.id);
      } else if (e.key === "A" && picked.size) {
        approve([...picked]);
      } else if (e.key === "R" && picked.size) {
        setRejecting([...picked]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approve, busy, cards.length, current, index, picked, rejecting, togglePick]);

  useEffect(() => {
    if (current) cardRefs.current[current.id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  if (cards.length === 0) {
    return (
      <Card className="text-center text-ink-soft">
        <p className="font-semibold text-ink">Nothing waiting for review. 🎉</p>
        <p className="mt-1 text-sm">New uploads appear here. Approved photos go live right away.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-[57px] z-20 flex flex-wrap items-center gap-2 rounded-2xl bg-white/90 p-3 shadow-soft backdrop-blur">
        <span className="text-sm font-semibold">{picked.size} selected</span>
        <Button size="sm" variant="secondary" disabled={!picked.size || busy} onClick={() => approve([...picked])}>
          <Check /> Approve selected
        </Button>
        <Button size="sm" variant="outline" className="text-danger" disabled={!picked.size || busy} onClick={() => setRejecting([...picked])}>
          <X /> Reject selected
        </Button>
        <p className="ml-auto hidden text-xs text-ink-faint lg:block">
          J/K move · A approve · R reject · X select · Shift+A / Shift+R on selection
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((p, i) => {
          const focused = i === index;
          const selected = picked.has(p.id);
          const place = [p.city, p.region].filter(Boolean).join(", ");
          return (
            <li key={p.id}>
              <article
                ref={(el) => {
                  cardRefs.current[p.id] = el;
                }}
                tabIndex={-1}
                aria-label={`Photo from ${p.ownerName}`}
                onClick={() => setFocus(i)}
                className={cn(
                  "overflow-hidden rounded-3xl bg-white shadow-soft outline-none transition",
                  focused && "ring-2 ring-coral ring-offset-2",
                  selected && "bg-coral/5",
                )}
              >
                <PhotoImage photoId={p.id} alt={`Photo from ${p.ownerName}`} variant="main" className="aspect-[4/5] w-full" />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {p.ownerName}
                        {p.age !== null && `, ${p.age}`}
                      </p>
                      <p className="truncate text-xs text-ink-faint">
                        {place || "No city set"} · waiting {timeAgo(p.createdAt)}
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-soft">
                      <input type="checkbox" className="size-4 accent-coral" checked={selected} onChange={() => togglePick(p.id)} />
                      Select
                    </label>
                  </div>
                  {p.priorReports > 0 && (
                    <Badge tone="danger">
                      {p.priorReports} earlier report{p.priorReports === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {p.otherPhotoIds.length > 0 && (
                    <div className="flex gap-1.5" aria-label="Their other photos">
                      {p.otherPhotoIds.map((id) => (
                        <PhotoImage key={id} photoId={id} alt="Another photo of this person" variant="thumb" className="size-14 rounded-xl" />
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="secondary" className="flex-1" disabled={busy} onClick={() => approve([p.id])}>
                      <Check /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-danger" disabled={busy} onClick={() => setRejecting([p.id])}>
                      <X /> Reject
                    </Button>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {rejecting && (
        <RejectDialog
          count={rejecting.length}
          busy={busy}
          onClose={() => setRejecting(null)}
          onConfirm={async (code, note) => {
            setBusy(true);
            const ids = rejecting;
            const input = { approve: false as const, reasonCode: code, note: note || undefined };
            if (ids.length === 1) {
              const res = await reviewPhotoAction({ photoId: ids[0], ...input });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success("Photo rejected — the owner has been notified");
            } else {
              const res = await bulkReviewPhotosAction({ photoIds: ids, ...input });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              const { done, skipped, failed } = res.data;
              toast.success(`${done} rejected${skipped ? `, ${skipped} already handled` : ""}${failed ? `, ${failed} failed` : ""}`);
            }
            setGone((g) => new Set([...g, ...ids]));
            setPicked(new Set());
            setRejecting(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RejectDialog({
  count,
  busy,
  onClose,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (code: PhotoRejectReason, note: string) => void;
}) {
  const [code, setCode] = useState<PhotoRejectReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        title={`Reject ${count} photo${count === 1 ? "" : "s"}`}
        description="The owner gets a notification with this reason. Choose the closest reason."
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">Reason</legend>
          {PHOTO_REJECT_REASONS.map((r) => (
            <label
              key={r.value}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-sm transition",
                code === r.value ? "border-coral bg-coral/5" : "border-line hover:border-coral/40",
              )}
            >
              <input
                type="radio"
                name="reject-reason"
                value={r.value}
                checked={code === r.value}
                onChange={() => setCode(r.value)}
                className="size-4 accent-coral"
              />
              {r.label}
            </label>
          ))}
        </fieldset>
        <Textarea
          className="mt-3"
          rows={2}
          maxLength={300}
          placeholder="Optional note for the owner"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Optional note"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={busy}
            onClick={() => (code ? onConfirm(code, note.trim()) : setError("Choose a reason first."))}
          >
            Reject
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
