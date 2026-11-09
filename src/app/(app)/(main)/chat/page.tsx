import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { listConversations } from "@/server/conversations";
import { ConversationList } from "@/components/chat/conversation-list";

export const metadata: Metadata = { title: "Chats" };

export default async function ChatListPage() {
  const viewer = await requireViewer();
  const conversations = await listConversations();
  return <ConversationList userId={viewer.userId} initial={conversations} />;
}
