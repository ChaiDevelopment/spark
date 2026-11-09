"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { likeSchema, targetSchema } from "@/lib/validation/schemas";
import { getApiUser } from "@/server/auth";
import { getDiscoveryDeck, type DiscoveryCard } from "@/server/discovery";

export interface LikeOutcome {
  matched: boolean;
  newMatch: boolean;
  conversationId: string | null;
}

/** Like via the atomic like_user() function (limits, eligibility, matching). */
export async function likeAction(input: unknown): Promise<ActionResult<LikeOutcome>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  const parsed = likeSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("like_user", { p_target: parsed.data.targetId, p_super: parsed.data.superLike });
  if (error) return fail(friendlyError(error));
  const r = data as { matched: boolean; new_match: boolean; conversation_id: string | null };
  if (r.new_match) revalidatePath("/matches");
  return ok({ matched: r.matched, newMatch: r.new_match, conversationId: r.conversation_id });
}

export async function passAction(input: unknown): Promise<ActionResult<null>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("pass_user", { p_target: parsed.data.targetId });
  return error ? fail(friendlyError(error)) : ok(null);
}

export async function loadDeckAction(): Promise<ActionResult<DiscoveryCard[]>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  if (!user.onboarded) return fail("Finish onboarding first.");
  try {
    return ok(await getDiscoveryDeck(user.userId));
  } catch (e) {
    return fail(friendlyError(e, "Couldn't load new profiles."));
  }
}

export async function getUsageAction(): Promise<ActionResult<{ likesUsed: number; likesLimit: number; superUsed: number; superLimit: number }>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_usage");
  if (error) return fail(friendlyError(error));
  const u = data as { likes_used: number; likes_limit: number; super_likes_used: number; super_likes_limit: number };
  return ok({ likesUsed: u.likes_used, likesLimit: u.likes_limit, superUsed: u.super_likes_used, superLimit: u.super_likes_limit });
}
