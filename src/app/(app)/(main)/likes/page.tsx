import type { Metadata } from "next";
import Link from "next/link";
import { Heart, History, Lock, Star, X } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/brand";
import { Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Likes" };

interface ReceivedLikes {
  entitled: boolean;
  count: number;
  likes: { user_id: string; display_name: string; age: number; city: string | null; is_super: boolean; liked_at: string }[];
}

const EVENT = {
  like: { icon: Heart, label: "You liked", cls: "text-coral" },
  super_like: { icon: Star, label: "You super liked", cls: "text-lavender-deep" },
  pass: { icon: X, label: "You passed on", cls: "text-ink-faint" },
  match: { icon: Heart, label: "You matched with", cls: "text-mint-deep" },
} as const;

export default async function LikesPage() {
  await requireViewer();
  const supabase = await createClient();
  const [received, history] = await Promise.all([supabase.rpc("get_received_likes"), supabase.rpc("get_discovery_history", { p_limit: 60 })]);
  const r = (received.data ?? { entitled: false, count: 0, likes: [] }) as ReceivedLikes;
  const events = (history.data ?? []) as { target_id: string; display_name: string; event_type: keyof typeof EVENT; created_at: string }[];

  return (
    <div className="space-y-8">
      <PageHeader title="Likes" subtitle="People who are interested, and your recent activity." />

      <section aria-labelledby="liked-you">
        <h2 id="liked-you" className="mb-3 font-display text-lg font-bold">Liked you</h2>
        {r.count === 0 ? (
          <Card className="text-center text-ink-soft">No new likes yet. A complete profile with 3+ photos gets noticed more.</Card>
        ) : r.entitled ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {r.likes.map((l) => (
              <li key={l.user_id}>
                <Link href={`/profile/${l.user_id}`} className="block rounded-3xl bg-white p-4 shadow-soft hover:shadow-card">
                  <p className="font-semibold">
                    {l.display_name}, {l.age}
                  </p>
                  <p className="text-sm text-ink-faint">{l.city}</p>
                  {l.is_super && <p className="mt-1 text-xs font-bold text-lavender-deep">⭐ Super like</p>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="relative overflow-hidden bg-gradient-to-br from-white to-cream">
            <div className="flex items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-3xl bg-spark font-display text-2xl font-extrabold text-ink shadow-card">{r.count}</div>
              <div>
                <p className="font-display text-lg font-bold">
                  {r.count} {r.count === 1 ? "person likes" : "people like"} you
                </p>
                <p className="text-sm text-ink-soft">Keep discovering — if you like them back, it&apos;s an instant match.</p>
              </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-ink-faint">
              <Lock className="size-3.5" aria-hidden /> Seeing who liked you will be part of SPARK Plus (coming later — no payments are taken today).
            </p>
          </Card>
        )}
      </section>

      <section aria-labelledby="history">
        <h2 id="history" className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <History className="size-5" aria-hidden /> Discovery history
        </h2>
        {events.length === 0 ? (
          <EmptyState icon={<Heart />} title="Nothing here yet">
            Your likes and passes will show up here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-soft">
            {events.map((e) => {
              const ev = EVENT[e.event_type];
              const Icon = ev.icon;
              return (
                <li key={`${e.target_id}-${e.event_type}-${e.created_at}`} className="flex items-center gap-3 px-5 py-3.5">
                  <Icon className={`size-5 ${ev.cls}`} aria-hidden />
                  <p className="flex-1 text-sm">
                    <span className="text-ink-soft">{ev.label}</span> <span className="font-semibold">{e.display_name}</span>
                  </p>
                  <time className="text-xs text-ink-faint" dateTime={e.created_at}>
                    {timeAgo(e.created_at)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
