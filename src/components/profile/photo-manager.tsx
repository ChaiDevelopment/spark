"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, ImagePlus, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { PhotoImage, invalidatePhoto } from "@/components/photos";
import { ConfirmDialog } from "@/components/ui/overlay";
import { ACCEPTED_IMAGE_TYPES, MAX_PHOTOS, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface ManagedPhoto {
  id: string;
  status: "pending" | "approved" | "rejected";
  position: number | null;
  rejection_reason?: string | null;
}

async function api<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "Something went wrong");
  return body as T;
}

/**
 * Upload flow: validate locally → send the file to the server, which verifies,
 * strips metadata, re-encodes and stores it in the private bucket.
 */
async function uploadPhoto(file: File): Promise<ManagedPhoto> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/photos/upload", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { photo?: ManagedPhoto; error?: string };
  if (!res.ok || !body.photo) {
    throw new Error(body.error ?? (res.status === 413 ? "Images must be 10 MB or smaller." : "Upload failed. Check your connection and try again."));
  }
  return body.photo;
}

export function PhotoManager({ initial, onChange }: { initial: ManagedPhoto[]; onChange?: (photos: ManagedPhoto[]) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<ManagedPhoto[]>(() =>
    [...initial].filter((p) => p.status !== "rejected").sort((a, b) => (a.position ?? 9) - (b.position ?? 9)),
  );
  const rejected = initial.filter((p) => p.status === "rejected");
  const [uploading, setUploading] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const update = (next: ManagedPhoto[]) => {
    setPhotos(next);
    onChange?.(next);
  };

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) toast.info(`You can add ${room} more photo${room === 1 ? "" : "s"}.`);
    let current = photos;
    for (const file of list) {
      if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
        toast.error(`${file.name}: use a JPEG, PNG, WebP or AVIF image.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is larger than 10 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const photo = await uploadPhoto(file);
        current = [...current, photo];
        update(current);
        toast.success(photo.status === "approved" ? "Photo added" : "Photo added — it'll be visible to others after a quick review.");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
    router.refresh();
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api(`/api/photos/${id}`, { method: "DELETE" });
      invalidatePhoto(id);
      update(photos.filter((p) => p.id !== id));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(null);
      setConfirmId(null);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    const previous = photos;
    update(next);
    try {
      await api("/api/photos/reorder", { method: "POST", body: JSON.stringify({ ids: next.map((p) => p.id) }) });
    } catch (e) {
      update(previous);
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <ul className="grid grid-cols-3 gap-3">
        {photos.map((p, i) => (
          <li key={p.id} className={cn("group relative aspect-[4/5] overflow-hidden rounded-2xl", i === 0 && "ring-2 ring-coral ring-offset-2")}>
            <PhotoImage photoId={p.id} alt={`Your photo ${i + 1}`} variant="thumb" className="size-full" />
            {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold">Main</span>}
            {p.status === "pending" && (
              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white">
                <Clock className="size-3" aria-hidden /> In review
              </span>
            )}
            <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setConfirmId(p.id)}
                disabled={deleting === p.id}
                className="grid size-8 place-items-center rounded-full bg-white/90 text-danger shadow-soft"
                aria-label={`Delete photo ${i + 1}`}
              >
                {deleting === p.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </button>
            </div>
            {photos.length > 1 && (
              <div className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid size-7 place-items-center rounded-full bg-white/90 shadow-soft disabled:opacity-0" aria-label={`Move photo ${i + 1} earlier`}>
                  <ChevronLeft className="size-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} className="grid size-7 place-items-center rounded-full bg-white/90 shadow-soft disabled:opacity-0" aria-label={`Move photo ${i + 1} later`}>
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </li>
        ))}
        {Array.from({ length: Math.max(0, MAX_PHOTOS - photos.length) }).map((_, i) => (
          <li key={`empty-${i}`} className="aspect-[4/5]">
            {i < uploading ? (
              <div className="grid size-full place-items-center rounded-2xl bg-cream">
                <Loader2 className="size-6 animate-spin text-coral" aria-label="Uploading" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="grid size-full place-items-center rounded-2xl border-2 border-dashed border-line bg-white text-ink-faint transition hover:border-coral hover:text-coral"
                aria-label="Add a photo"
              >
                <ImagePlus className="size-7" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        className="sr-only"
        onChange={(e) => onFiles(e.target.files)}
        aria-label="Choose photos"
      />
      <p className="mt-3 text-sm text-ink-faint">
        Up to {MAX_PHOTOS} photos, 10 MB each. We remove location data from every photo. Use the arrows to choose your main photo.
      </p>
      {rejected.length > 0 && (
        <div className="mt-4 flex gap-3 rounded-2xl bg-danger/8 p-4 text-sm">
          <ShieldAlert className="size-5 shrink-0 text-danger" aria-hidden />
          <p>
            {rejected.length} photo{rejected.length > 1 ? "s were" : " was"} not approved
            {rejected[0].rejection_reason ? ` (${rejected[0].rejection_reason})` : ""}. Please follow our{" "}
            <a href="/guidelines" className="font-semibold underline">photo guidelines</a>.
          </p>
        </div>
      )}
      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title="Delete this photo?"
        description="It will be permanently removed from SPARK."
        confirmLabel="Delete photo"
        destructive
        loading={deleting !== null}
        onConfirm={() => confirmId && remove(confirmId)}
      />
    </div>
  );
}
