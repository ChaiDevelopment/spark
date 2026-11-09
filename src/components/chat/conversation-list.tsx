"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/brand";
import { Avatar } from "@/components/photos";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { createClient } from "@/lib/supabase/client";
import { cn, timeAgo } from "@/lib/utils";
import { archiveConversationAction } from "@/server/actions/safety";
import type { ConversationSummary } from "@/server/conversations";

export function ConversationList({ userId, initial }: { userId: string; initial: ConversationSummary[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setItems(initial);
  }

  // Refresh the list when a conversation we belong to changes (RLS-filtered).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conversations:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => router.refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  async function toggleArchive(c: ConversationSummary) {
    const res = await archiveConversationAction({ conversationId: c.conversation_id, archived: !c.archived });
    if (!res.ok) return void toast.error(res.error);
    setItems((list) => list.map((x) => (x.conversation_id === c.conversation_id ? { ...x, archived: !c.archived } : x)));
  }

  const active = items.filter((c) => !c.archived);
  const archived = items.filter((c) => c.archived);

  const render = (list: ConversationSummary[]) =>
    list.length === 0 ? (
      <EmptyState icon={<MessageCircle />} title="No conversations here">
        Match with someone and your chats will appear here.
      </EmptyState>
    ) : (
      <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-soft">
        {list.map((c) => (
          <li key={c.conversation_id} className="group flex items-center">
            <Link href={`/chat/${c.conversation_id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 hover:bg-cream/40">
              <Avatar photoId={c.other_photo_id} name={c.other_display_name} className="size-14" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("truncate", c.unread_count ? "font-bold" : "font-semibold")}>{c.other_display_name}</p>
                  <time className="shrink-0 text-xs text-ink-faint">{timeAgo(c.last_message_at ?? c.matched_at)}</time>
                </div>
                <p className={cn("truncate text-sm", c.unread_count ? "font-semibold text-ink" : "text-ink-faint")}>
                  {c.last_message_preview ? `${c.last_sender_id === userId ? "You: " : ""}${c.last_message_preview}` : "New match — say hello 👋"}
                </p>
              </div>
              {c.unread_count > 0 && (
                <span className="grid min-w-6 place-items-center rounded-full bg-coral px-1.5 py-0.5 text-xs font-bold text-white" aria-label={`${c.unread_count} unread`}>
                  {c.unread_count}
                </span>
              )}
            </Link>
            <Button variant="ghost" size="iconSm" className="mr-2 opacity-60 group-hover:opacity-100" onClick={() => toggleArchive(c)} aria-label={c.archived ? "Unarchive" : "Archive"}>
              {c.archived ? <ArchiveRestore /> : <Archive />}
            </Button>
          </li>
        ))}
      </ul>
    );

  return (
    <div>
      <PageHeader title="Chats" />
      <Tabs defaultValue="active">
        <TabsList className="mb-4 max-w-xs">
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">{render(active)}</TabsContent>
        <TabsContent value="archived">{render(archived)}</TabsContent>
      </Tabs>
    </div>
  );
}
