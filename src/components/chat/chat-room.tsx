"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCheck, Flag, Loader2, MoreVertical, SendHorizonal } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Avatar } from "@/components/photos";
import { SafetyActions } from "@/components/safety/safety-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { useOnline } from "@/components/pwa";
import { MAX_MESSAGE_LENGTH, MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import { cn, formatTime } from "@/lib/utils";
import { messageSchema } from "@/lib/validation/schemas";
import type { ConversationSummary } from "@/server/conversations";

export interface ChatMessage {
  id: string;
  sender_id: string | null;
  body: string;
  client_id: string | null;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
}

const OPENERS = ["What's your perfect weekend? ☀️", "Best street food in your city — go!", "Your chemistry says we'd get along. Agree? 😄"];

export function ChatRoom({
  userId,
  conversation,
  initialMessages,
  hasMore: initialHasMore,
  otherLastReadAt: initialRead,
}: {
  userId: string;
  conversation: ConversationSummary;
  initialMessages: ChatMessage[];
  hasMore: boolean;
  otherLastReadAt: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const online = useOnline();
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(initialRead);
  const [menuOpen, setMenuOpen] = useState(false);
  const closed = conversation.status !== "active";
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const typingChannel = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const convId = conversation.conversation_id;

  const markRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      if (document.visibilityState === "visible") void supabase.rpc("mark_conversation_read", { p_conversation: convId });
    }, 600);
  }, [supabase, convId]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => scrollToBottom(), [scrollToBottom]);
  useEffect(() => {
    markRead();
    const onVisible = () => document.visibilityState === "visible" && markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  // Realtime: new messages + read receipts (Postgres Changes, RLS-checked) and
  // typing (Broadcast on a private channel authorized by RLS on realtime.messages).
  useEffect(() => {
    const changes = supabase
      .channel(`chat:${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, (payload) => {
        const m = payload.new as ChatMessage;
        setMessages((list) => {
          if (list.some((x) => x.id === m.id)) return list;
          const i = m.client_id ? list.findIndex((x) => x.client_id === m.client_id) : -1;
          if (i >= 0) return list.map((x, j) => (j === i ? m : x));
          return [...list, m];
        });
        if (m.sender_id !== userId) {
          setOtherTyping(false);
          markRead();
        }
        if (atBottom.current) requestAnimationFrame(() => scrollToBottom(true));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_read_receipts", filter: `conversation_id=eq.${convId}` }, (payload) => {
        const r = payload.new as { user_id: string; last_read_at: string };
        if (r.user_id && r.user_id !== userId) setOtherReadAt(r.last_read_at);
      })
      .subscribe();

    const typing = supabase.channel(`conversation:${convId}`, { config: { private: true, broadcast: { self: false } } });
    typing
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if ((payload as { userId?: string }).userId === userId) return;
        setOtherTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setOtherTyping(false), 4000);
      })
      .subscribe();
    typingChannel.current = typing;

    return () => {
      void supabase.removeChannel(changes);
      void supabase.removeChannel(typing);
      clearTimeout(typingTimer.current);
    };
  }, [supabase, convId, userId, markRead, scrollToBottom]);

  function onDraftChange(v: string) {
    setDraft(v);
    const now = Date.now();
    if (v && now - lastTypingSent.current > 2500 && typingChannel.current) {
      lastTypingSent.current = now;
      void typingChannel.current.send({ type: "broadcast", event: "typing", payload: { userId } });
    }
  }

  async function send(text = draft) {
    const clientId = crypto.randomUUID();
    const parsed = messageSchema.safeParse({ conversationId: convId, body: text, clientId });
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message);
    const optimistic: ChatMessage = { id: `tmp-${clientId}`, sender_id: userId, body: parsed.data.body, client_id: clientId, created_at: new Date().toISOString(), pending: true };
    setMessages((l) => [...l, optimistic]);
    setDraft("");
    requestAnimationFrame(() => scrollToBottom(true));
    const { data, error } = await supabase.rpc("send_message", { p_conversation: convId, p_body: parsed.data.body, p_client_id: clientId });
    if (error) {
      setMessages((l) => l.map((m) => (m.client_id === clientId ? { ...m, pending: false, failed: true } : m)));
      toast.error(friendlyError(error, "Message not sent."));
      if (error.code === "P0004") router.refresh();
      return;
    }
    const saved = data as ChatMessage;
    setMessages((l) => {
      const without = l.filter((m) => m.id !== saved.id);
      return without.map((m) => (m.client_id === clientId ? saved : m));
    });
  }

  async function loadEarlier() {
    const oldest = messages.find((m) => !m.pending);
    if (!oldest) return;
    setLoadingMore(true);
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, body, client_id, created_at")
      .eq("conversation_id", convId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    setLoadingMore(false);
    if (error) return void toast.error("Couldn't load earlier messages.");
    const older = ((data ?? []) as ChatMessage[]).reverse();
    setHasMore(older.length === MESSAGE_PAGE_SIZE);
    setMessages((l) => [...older.filter((o) => !l.some((m) => m.id === o.id)), ...l]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  const lastMine = [...messages].reverse().find((m) => m.sender_id === userId && !m.pending && !m.failed);
  const seen = lastMine && otherReadAt && new Date(otherReadAt) >= new Date(lastMine.created_at);
  const name = conversation.other_display_name;

  return (
    <div className="-mx-4 flex h-[100dvh] flex-col bg-canvas sm:-mx-6 md:mx-0 md:h-[calc(100dvh-3rem)] md:overflow-hidden md:rounded-3xl md:border md:border-line md:bg-white md:shadow-soft">
      <header className="flex items-center gap-3 border-b border-line/70 bg-white/90 px-3 py-2.5 backdrop-blur">
        <Button variant="ghost" size="iconSm" asChild>
          <Link href="/chat" aria-label="Back to chats">
            <ArrowLeft />
          </Link>
        </Button>
        <Link href={`/profile/${conversation.other_user_id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar photoId={conversation.other_photo_id} name={name} className="size-10" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="text-xs text-ink-faint" aria-live="polite">
              {otherTyping ? <span className="text-coral-deep">typing…</span> : closed ? "Conversation ended" : "Tap to view profile"}
            </p>
          </div>
        </Link>
        <Button variant="ghost" size="iconSm" onClick={() => setMenuOpen(true)} aria-label="Conversation options">
          <MoreVertical />
        </Button>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-5"
        role="log"
        aria-label={`Messages with ${name}`}
      >
        {hasMore && (
          <div className="mb-3 text-center">
            <Button variant="outline" size="sm" onClick={loadEarlier} loading={loadingMore}>
              Load earlier messages
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="mx-auto max-w-xs py-10 text-center">
            <p className="font-display text-lg font-bold">You matched with {name}! ✨</p>
            <p className="mt-1 text-sm text-ink-soft">Break the ice — try one of these:</p>
            <div className="mt-4 flex flex-col gap-2">
              {OPENERS.map((o) => (
                <button key={o} onClick={() => send(o)} disabled={closed} className="rounded-2xl bg-white px-4 py-2.5 text-sm shadow-soft hover:shadow-card">
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === userId;
          const prev = messages[i - 1];
          const grouped = prev && prev.sender_id === m.sender_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
          return (
            <div key={m.id} className={cn("group flex", mine ? "justify-end" : "justify-start", !grouped && "pt-2")}>
              <div className={cn("max-w-[80%] sm:max-w-[70%]")}>
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed",
                    mine ? "rounded-br-lg bg-ink text-white" : "rounded-bl-lg bg-white text-ink shadow-soft",
                    m.pending && "opacity-60",
                    m.failed && "bg-danger/90",
                  )}
                >
                  {m.body}
                </p>
                <div className={cn("mt-0.5 flex items-center gap-2 px-2 text-[11px] text-ink-faint", mine ? "justify-end" : "justify-start")}>
                  <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
                  {m.pending && <Loader2 className="size-3 animate-spin" aria-label="Sending" />}
                  {m.failed && <span className="font-semibold text-danger">Not sent</span>}
                  {!mine && m.sender_id && !m.id.startsWith("tmp-") && (
                    <Link href={`/report/${m.sender_id}?message=${m.id}`} className="hidden items-center gap-0.5 hover:text-danger group-hover:inline-flex" aria-label="Report this message">
                      <Flag className="size-3" /> Report
                    </Link>
                  )}
                  {mine && m.id === lastMine?.id && seen && (
                    <span className="inline-flex items-center gap-0.5 text-mint-deep">
                      <CheckCheck className="size-3.5" aria-hidden /> Seen
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="border-t border-line/70 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {closed ? (
          <p className="py-2 text-center text-sm text-ink-soft">This conversation has ended.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="message" className="sr-only">
              Message {name}
            </label>
            <textarea
              id="message"
              rows={1}
              value={draft}
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={online ? `Message ${name}…` : "You're offline"}
              disabled={!online}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-canvas px-4 py-2.5 text-[15px] focus-visible:border-coral focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-coral/15"
            />
            <Button type="submit" size="icon" variant="spark" disabled={!draft.trim() || !online} aria-label="Send message">
              <SendHorizonal />
            </Button>
          </form>
        )}
      </footer>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent title={name} description="Your safety comes first. These actions are private.">
          <SafetyActions
            userId={conversation.other_user_id}
            name={name}
            matchId={conversation.match_id}
            onDone={() => {
              setMenuOpen(false);
              router.push("/chat");
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
