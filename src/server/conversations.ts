import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ConversationSummary {
  conversation_id: string;
  match_id: string;
  other_user_id: string;
  other_display_name: string;
  other_photo_id: string | null;
  status: "active" | "closed";
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_id: string | null;
  unread_count: number;
  archived: boolean;
  matched_at: string;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_conversations");
  if (error) throw error;
  return (data ?? []) as ConversationSummary[];
}
