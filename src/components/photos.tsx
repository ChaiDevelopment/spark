"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/**
 * Signed URL loader for private photos. Requests made in the same tick are
 * batched into one POST /api/photos/view call; URLs are cached in memory until
 * shortly before they expire. Nothing is persisted to storage.
 */
type Variant = "thumb" | "main";
const cache = new Map<string, { url: string; exp: number }>();
const pending = new Map<Variant, { ids: Set<string>; waiters: (() => void)[] }>();

function cacheKey(id: string, v: Variant) {
  return `${v}:${id}`;
}

async function flush(variant: Variant) {
  const batch = pending.get(variant);
  pending.delete(variant);
  if (!batch) return;
  const ids = [...batch.ids];
  try {
    for (let i = 0; i < ids.length; i += 60) {
      const res = await fetch("/api/photos/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.slice(i, i + 60), variant }),
      });
      if (!res.ok) continue;
      const { urls, expiresIn } = (await res.json()) as { urls: Record<string, string>; expiresIn: number };
      const exp = Date.now() + Math.max(0, expiresIn - 60) * 1000;
      for (const [id, url] of Object.entries(urls)) cache.set(cacheKey(id, variant), { url, exp });
    }
  } finally {
    batch.waiters.forEach((w) => w());
  }
}

function request(ids: string[], variant: Variant): Promise<void> {
  return new Promise((resolve) => {
    let batch = pending.get(variant);
    if (!batch) {
      batch = { ids: new Set(), waiters: [] };
      pending.set(variant, batch);
      queueMicrotask(() => void flush(variant));
    }
    ids.forEach((id) => batch!.ids.add(id));
    batch.waiters.push(resolve);
  });
}

function fresh(id: string, v: Variant) {
  const hit = cache.get(cacheKey(id, v));
  return hit && hit.exp > Date.now() ? hit.url : undefined;
}

export function usePhotoUrls(ids: (string | null | undefined)[], variant: Variant = "main") {
  const list = ids.filter((x): x is string => Boolean(x));
  const key = list.join(",");
  const [, setTick] = useState(0);
  useEffect(() => {
    const missing = list.filter((id) => !fresh(id, variant));
    if (!missing.length) return;
    let alive = true;
    void request(missing, variant).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, variant]);
  return Object.fromEntries(list.map((id) => [id, fresh(id, variant)])) as Record<string, string | undefined>;
}

export function invalidatePhoto(id: string) {
  cache.delete(cacheKey(id, "main"));
  cache.delete(cacheKey(id, "thumb"));
}

export function PhotoImage({
  photoId,
  alt,
  variant = "main",
  className,
  fallbackName,
}: {
  photoId: string | null | undefined;
  alt: string;
  variant?: Variant;
  className?: string;
  fallbackName?: string;
}) {
  const urls = usePhotoUrls([photoId], variant);
  const url = photoId ? urls[photoId] : undefined;
  const [loaded, setLoaded] = useState(false);
  if (!photoId) {
    return (
      <div className={cn("grid place-items-center bg-gradient-to-br from-cream to-[#ffe2d6] text-coral-deep", className)} aria-label={alt} role="img">
        {fallbackName ? <span className="font-display text-2xl font-extrabold">{initials(fallbackName)}</span> : <UserRound className="size-1/3" />}
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden bg-cream", className)}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-cream" aria-hidden />}
      {url && (
        // Plain <img>: signed, private, short-lived URLs must not go through a shared image optimizer cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          className={cn("size-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

export function Avatar({ photoId, name, className }: { photoId: string | null | undefined; name: string; className?: string }) {
  return <PhotoImage photoId={photoId} alt={name} variant="thumb" fallbackName={name} className={cn("size-12 shrink-0 rounded-full", className)} />;
}
