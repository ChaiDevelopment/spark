import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChatRoom, type ChatMessage } from "@/components/chat/chat-room";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { listConversations } from "@/server/conversations";

export const metadata: Metadata = { title: "Chat" };

export default async function ConversationPage({ params }: PageProps<"/chat/[conversationId]">) {
  const viewer = await requireViewer();
  const { conversationId } = await params;
  if (!z.uuid().safeParse(conversationId).success) notFound();

  // list_conversations only returns conversations the viewer is a member of.
  const conversation = (await listConversations()).find((c) => c.conversation_id === conversationId);
  if (!conversation) notFound();

  const supabase = await createClient();
  const [messagesRes, receiptRes] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, body, client_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE),
    supabase
      .from("message_read_receipts")
      .select("last_read_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", conversation.other_user_id)
      .maybeSingle(),
  ]);
  const messages = ((messagesRes.data ?? []) as ChatMessage[]).reverse();

  return (
    <ChatRoom
      userId={viewer.userId}
      conversation={conversation}
      initialMessages={messages}
      hasMore={messages.length === MESSAGE_PAGE_SIZE}
      otherLastReadAt={(receiptRes.data?.last_read_at as string | undefined) ?? null}
    />
  );
}
