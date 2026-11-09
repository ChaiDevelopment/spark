import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/brand";
import { PhotoImage } from "@/components/photos";
import { Button } from "@/components/ui/button";
import { requireViewer } from "@/server/auth";
import { listConversations } from "@/server/conversations";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Matches" };

export default async function MatchesPage() {
  await requireViewer();
  const all = await listConversations();
  const fresh = all.filter((c) => !c.last_message_at);
  const talking = all.filter((c) => c.last_message_at);

  if (all.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="No matches yet"
        action={
          <Button variant="spark" asChild>
            <Link href="/discover">Start discovering</Link>
          </Button>
        }
      >
        When you and someone else both like each other, they&apos;ll show up here.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Matches" subtitle={`${all.length} ${all.length === 1 ? "spark" : "sparks"} so far`} />
      {fresh.length > 0 && (
        <section aria-labelledby="new-matches">
          <h2 id="new-matches" className="mb-3 font-display text-lg font-bold">New matches — say hi!</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {fresh.map((m) => (
              <li key={m.match_id}>
                <Link href={`/chat/${m.conversation_id}`} className="group block">
                  <div className="relative overflow-hidden rounded-3xl ring-2 ring-coral ring-offset-2 ring-offset-canvas">
                    <PhotoImage photoId={m.other_photo_id} alt={m.other_display_name} variant="thumb" fallbackName={m.other_display_name} className="aspect-[4/5] w-full transition group-hover:scale-105" />
                  </div>
                  <p className="mt-2 truncate text-center text-sm font-semibold">{m.other_display_name}</p>
                  <p className="text-center text-xs text-ink-faint">{timeAgo(m.matched_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {talking.length > 0 && (
        <section aria-labelledby="talking">
          <h2 id="talking" className="mb-3 font-display text-lg font-bold">In conversation</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {talking.map((m) => (
              <li key={m.match_id}>
                <Link href={`/profile/${m.other_user_id}`} className="group block">
                  <PhotoImage photoId={m.other_photo_id} alt={m.other_display_name} variant="thumb" fallbackName={m.other_display_name} className="aspect-[4/5] w-full rounded-3xl" />
                  <p className="mt-2 truncate text-center text-sm font-semibold">{m.other_display_name}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
