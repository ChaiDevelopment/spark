import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Heart, MessageCircle, ShieldAlert, Sparkles } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/brand";
import { MarkAllRead } from "@/components/notifications/mark-all-read";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

interface Notification {
  id: string;
  type: "new_like" | "new_match" | "new_message" | "moderation" | "safety" | "system";
  title: string;
  body: string;
  data: { conversation_id?: string; user_id?: string };
  read_at: string | null;
  created_at: string;
}

const ICONS = {
  new_like: { icon: Heart, cls: "bg-coral/12 text-coral" },
  new_match: { icon: Sparkles, cls: "bg-peach/25 text-[#a3561a]" },
  new_message: { icon: MessageCircle, cls: "bg-lavender/15 text-lavender-deep" },
  moderation: { icon: ShieldAlert, cls: "bg-mint/18 text-mint-deep" },
  safety: { icon: ShieldAlert, cls: "bg-danger/10 text-danger" },
  system: { icon: Bell, cls: "bg-cream text-ink-soft" },
};

function hrefFor(n: Notification) {
  if (n.data?.conversation_id) return `/chat/${n.data.conversation_id}`;
  if (n.type === "new_like") return "/likes";
  if (n.type === "moderation") return "/me/edit";
  return null;
}

export default async function NotificationsPage() {
  await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, type, title, body, data, read_at, created_at").order("created_at", { ascending: false }).limit(50);
  const items = (data ?? []) as Notification[];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Notifications" action={unread > 0 ? <MarkAllRead /> : undefined} />
      {items.length === 0 ? (
        <EmptyState icon={<Bell />} title="All quiet for now">
          Likes, matches and messages will show up here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-soft">
          {items.map((n) => {
            const { icon: Icon, cls } = ICONS[n.type];
            const href = hrefFor(n);
            const content = (
              <>
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", cls)}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", !n.read_at ? "font-bold" : "font-semibold")}>{n.title}</p>
                  {n.body && <p className="truncate text-sm text-ink-soft">{n.body}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <time className="text-xs text-ink-faint" dateTime={n.created_at}>
                    {timeAgo(n.created_at)}
                  </time>
                  {!n.read_at && <span className="size-2 rounded-full bg-coral" aria-label="Unread" />}
                </div>
              </>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-cream/40">
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
