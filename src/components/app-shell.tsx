"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Flame, Heart, MessageCircle, Settings, Shield, Sparkles, UserRound } from "lucide-react";
import { Logo } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: MessageKey; icon: typeof Flame }[] = [
  { href: "/discover", label: "nav.discover", icon: Flame },
  { href: "/likes", label: "nav.likes", icon: Heart },
  { href: "/matches", label: "nav.matches", icon: Sparkles },
  { href: "/chat", label: "nav.chats", icon: MessageCircle },
  { href: "/me", label: "nav.profile", icon: UserRound },
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

export function AppShell({
  children,
  userId,
  displayName,
  unread,
  staff,
}: {
  children: React.ReactNode;
  userId: string;
  displayName: string;
  unread: number;
  staff: boolean;
}) {
  const { t } = useT();
  const path = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(unread);
  const [prevUnread, setPrevUnread] = useState(unread);
  if (unread !== prevUnread) {
    // Server sent a fresh count (e.g. after router.refresh()).
    setPrevUnread(unread);
    setUnreadCount(unread);
  }

  // Realtime: one channel per signed-in user for their own notifications (RLS-filtered).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as { type: string; title: string; body: string; data: { conversation_id?: string } };
          setUnreadCount((c) => c + 1);
          const inThisChat = n.data?.conversation_id && path === `/chat/${n.data.conversation_id}`;
          if (!inThisChat) {
            toast(n.title, {
              description: n.body,
              action: n.data?.conversation_id ? { label: "Open", onClick: () => router.push(`/chat/${n.data.conversation_id}`) } : undefined,
            });
          }
          if (n.type === "new_match") router.refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, path, router]);

  const chatOpen = /^\/chat\/[^/]+$/.test(path);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line/70 bg-white/70 px-4 py-6 backdrop-blur md:flex">
        <Logo href="/discover" className="px-3" />
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-ink-soft transition hover:bg-cream hover:text-ink",
                isActive(path, href) && "bg-cream text-ink",
              )}
              aria-current={isActive(path, href) ? "page" : undefined}
            >
              <Icon className={cn("size-5", isActive(path, href) && "text-coral")} aria-hidden /> {t(label)}
            </Link>
          ))}
          <div className="my-3 h-px bg-line" />
          <Link
            href="/notifications"
            className={cn("flex items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-ink-soft hover:bg-cream hover:text-ink", isActive(path, "/notifications") && "bg-cream text-ink")}
          >
            <Bell className="size-5" aria-hidden /> {t("nav.notifications")}
            {unreadCount > 0 && <span className="ml-auto rounded-full bg-coral px-2 py-0.5 text-xs font-bold text-white">{unreadCount}</span>}
          </Link>
          <Link
            href="/settings"
            className={cn("flex items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-ink-soft hover:bg-cream hover:text-ink", isActive(path, "/settings") && "bg-cream text-ink")}
          >
            <Settings className="size-5" aria-hidden /> {t("nav.settings")}
          </Link>
          {staff && (
            <Link href="/admin" className="flex items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-lavender-deep hover:bg-lavender/10">
              <Shield className="size-5" aria-hidden /> {t("nav.admin")}
            </Link>
          )}
        </nav>
        <p className="truncate px-3 text-sm text-ink-faint">Signed in as {displayName || "you"}</p>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Mobile top bar */}
        {!chatOpen && (
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/60 bg-canvas/85 px-4 py-3 backdrop-blur md:hidden">
            <Logo href="/discover" />
            <div className="flex items-center gap-1">
              {staff && (
                <Link href="/admin" className="rounded-full p-2.5 text-lavender-deep" aria-label="Admin">
                  <Shield className="size-5" />
                </Link>
              )}
              <Link href="/notifications" className="relative rounded-full p-2.5 text-ink-soft hover:bg-cream" aria-label={`Notifications (${unreadCount} unread)`}>
                <Bell className="size-5" />
                {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-coral ring-2 ring-canvas" />}
              </Link>
              <Link href="/settings" className="rounded-full p-2.5 text-ink-soft hover:bg-cream" aria-label="Settings">
                <Settings className="size-5" />
              </Link>
            </div>
          </header>
        )}

        <main className={cn("mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6", chatOpen ? "pb-0 pt-0 md:py-6" : "pb-28 md:pb-10")}>{children}</main>

        {/* Mobile bottom tabs */}
        {!chatOpen && (
          <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-white/92 px-2 pt-2 backdrop-blur md:hidden" aria-label="Main">
            <ul className="mx-auto flex max-w-md justify-between">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = isActive(path, href);
                return (
                  <li key={href} className="flex-1">
                    <Link
                      href={href}
                      className={cn("flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-semibold", active ? "text-ink" : "text-ink-faint")}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className={cn("grid h-8 w-12 place-items-center rounded-full transition", active && "bg-coral/12")}>
                        <Icon className={cn("size-5", active && "text-coral")} aria-hidden />
                      </span>
                      {t(label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
