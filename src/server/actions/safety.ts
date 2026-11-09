"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { reportSchema, targetSchema } from "@/lib/validation/schemas";
import { getApiUser } from "@/server/auth";

export async function blockUserAction(input: unknown): Promise<ActionResult<null>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  const parsed = targetSchema.extend({ reason: z.string().trim().max(300).optional() }).safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("block_user", { p_target: parsed.data.targetId, p_reason: parsed.data.reason ?? null });
  if (error) return fail(friendlyError(error));
  revalidatePath("/matches");
  revalidatePath("/chat");
  revalidatePath("/settings/blocked");
  return ok(null);
}

export async function unblockUserAction(input: unknown): Promise<ActionResult<null>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_user", { p_target: parsed.data.targetId });
  if (error) return fail(friendlyError(error));
  revalidatePath("/settings/blocked");
  return ok(null);
}

export async function reportUserAction(input: unknown): Promise<ActionResult<{ reportId: string }>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const supabase = await createClient();
  const d = parsed.data;
  const { data, error } = await supabase.rpc("report_user", {
    p_target: d.targetId,
    p_category: d.category,
    p_details: d.details,
    p_context_type: d.contextType,
    p_context_id: d.contextId ?? null,
  });
  if (error) return fail(friendlyError(error));
  if (d.alsoBlock) {
    const { error: blockError } = await supabase.rpc("block_user", { p_target: d.targetId, p_reason: `report:${d.category}` });
    if (blockError) return fail(`Report sent, but blocking failed: ${friendlyError(blockError)}`);
    revalidatePath("/matches");
    revalidatePath("/chat");
  }
  return ok({ reportId: data as string });
}

export async function unmatchAction(input: unknown): Promise<ActionResult<null>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  const parsed = z.object({ matchId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("unmatch", { p_match: parsed.data.matchId });
  if (error) return fail(friendlyError(error));
  revalidatePath("/matches");
  revalidatePath("/chat");
  return ok(null);
}

export async function archiveConversationAction(input: unknown): Promise<ActionResult<null>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  const parsed = z.object({ conversationId: z.uuid(), archived: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_conversation_archived", { p_conversation: parsed.data.conversationId, p_archived: parsed.data.archived });
  if (error) return fail(friendlyError(error));
  revalidatePath("/chat");
  return ok(null);
}

export async function markNotificationsReadAction(input: unknown): Promise<ActionResult<null>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  const parsed = z.object({ ids: z.array(z.uuid()).max(200).nullable() }).safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: parsed.data.ids });
  if (error) return fail(friendlyError(error));
  revalidatePath("/notifications");
  return ok(null);
}
