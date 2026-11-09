"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import {
  aboutSchema,
  basicsSchema,
  interestsSchema,
  locationSchema,
  notificationPrefsSchema,
  preferencesSchema,
  privacySchema,
  profileEditSchema,
} from "@/lib/validation/schemas";
import { getApiUser } from "@/server/auth";

type Ctx =
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getApiUser>>>; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: ActionResult<never> };

async function authed(): Promise<Ctx> {
  const user = await getApiUser();
  if (!user) return { ok: false, error: fail("Please sign in again.") };
  if (!user.active) return { ok: false, error: fail("Your account is not active.") };
  return { ok: true, user, supabase: await createClient() };
}

function invalid(e: z.ZodError) {
  return fail("Please fix the highlighted fields.", z.flattenError(e).fieldErrors as Record<string, string[]>);
}

// ------------------------------------------------------------- Onboarding steps
export async function saveBasicsAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authed();
  if (!ctx.ok) return ctx.error;
  const parsed = basicsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { displayName, pronouns, gender, showGender, dateOfBirth } = parsed.data;

  const { data: existing } = await ctx.supabase.from("profile_private").select("date_of_birth").maybeSingle();
  if (!existing) {
    // Server-validated (Zod above) AND database-validated (trigger) 18+ check.
    const { error } = await ctx.supabase.rpc("set_date_of_birth", { p_dob: dateOfBirth });
    if (error) return fail(friendlyError(error), { dateOfBirth: [friendlyError(error)] });
  }
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ display_name: displayName, pronouns: pronouns || null, gender, show_gender: showGender })
    .eq("id", ctx.user.userId);
  if (error) return fail(friendlyError(error));
  return ok(null);
}

export async function saveLocationAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authed();
  if (!ctx.ok) return ctx.error;
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ city: parsed.data.city, region: parsed.data.region, country_code: parsed.data.countryCode })
    .eq("id", ctx.user.userId);
  return error ? fail(friendlyError(error)) : ok(null);
}

export async function savePreferencesAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authed();
  if (!ctx.ok) return ctx.error;
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await ctx.supabase
    .from("user_preferences")
    .update({
      interested_in: parsed.data.interestedIn,
      min_age: parsed.data.minAge,
      max_age: parsed.data.maxAge,
      location_scope: parsed.data.locationScope,
    })
    .eq("user_id", ctx.user.userId);
  if (error) return fail(friendlyError(error));
  revalidatePath("/discover");
  return ok(null);
}

export async function saveAboutAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authed();
  if (!ctx.ok) return ctx.error;
  const parsed = aboutSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { error } = await ctx.supabase
    .from("profiles")
    .update({
      bio: d.bio,
      relationship_goal: d.relationshipGoal,
      drinking: d.drinking,
      smoking: d.smoking,
      exercise: d.exercise,
      communication_style: d.communicationStyle,
    })
    .eq("id", ctx.user.userId);
  return error ? fail(friendlyError(error)) : ok(null);
}

export async function saveInterestsAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authed();
  if (!ctx.ok) return ctx.error;
  const parsed = interestsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const wanted = new Set(parsed.data.interestIds);

  const { data: current, error: readError } = await ctx.supabase.from("user_interests").select("interest_id").eq("user_id", ctx.user.userId);
  if (readError) return fail(friendlyError(readError));
  const have = new Set((current ?? []).map((r: { interest_id: string }) => r.interest_id));
  const toRemove = [...have].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !have.has(id));

  if (toRemove.length) {
    const { error } = await ctx.supabase.from("user_interests").delete().eq("user_id", ctx.user.userId).in("interest_id", toRemove);
    if (error) return fail(friendlyError(error));
  }
  if (toAdd.length) {
    const { error } = await ctx.supabase.from("user_interests").insert(toAdd.map((interest_id) => ({ user_id: ctx.user.userId, interest_id })));
    if (error) return fail(friendlyError(error));
  }
  return ok(null);
}

export async function completeOnboardingAction(): Promise<ActionResult<{ missing: string[] }>> {
  const ctx = await authed();
  if (!ctx.ok) return ctx.error;
  const { data, error } = await ctx.supabase.rpc("complete_onboarding");
  if (error) return fail(friendlyError(error));
  const res = data as { ok: boolean; missing: string[] };
  if (!res.ok) return fail("A few things are still missing.", { missing: res.missing });
  revalidatePath("/", "layout");
  return ok({ missing: [] });
}

// ------------------------------------------------------------- Edit profile & settings
export async function updateProfileAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authed();
  if (!ctx.ok) return ctx.error;
  const parsed = profileEditSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { data: allowed } = await ctx.supabase.rpc("consume_rate_limit", { p_action: "profile_update" });
  if (!allowed) return fail("You're updating your profile very often. Try again later.");
  const d = parsed.data;
  const { error } = await ctx.supabase
    .from("profiles")
    .update({
      display_name: d.displayName,
      pronouns: d.pronouns || null,
      gender: d.gender,
      show_gender: d.showGender,
      city: d.city,
      region: d.region,
      country_code: d.countryCode,
      bio: d.bio,
      relationship_goal: d.relationshipGoal,
      drinking: d.drinking,
      smoking: d.smoking,
      exercise: d.exercise,
      communication_style: d.communicationStyle,
    })
    .eq("id", ctx.user.userId);
  if (error) return fail(friendlyError(error));
  revalidatePath("/me");
  return ok(null);
}

export async function updatePrivacyAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authed();
  if (!ctx.ok) return ctx.error;
  const parsed = privacySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ is_visible: parsed.data.isVisible, show_gender: parsed.data.showGender })
    .eq("id", ctx.user.userId);
  if (error) return fail(friendlyError(error));
  revalidatePath("/settings/privacy");
  return ok(null);
}

export async function updateNotificationPrefsAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authed();
  if (!ctx.ok) return ctx.error;
  const parsed = notificationPrefsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await ctx.supabase
    .from("notification_preferences")
    .update({
      new_like: parsed.data.newLike,
      new_match: parsed.data.newMatch,
      new_message: parsed.data.newMessage,
      moderation: parsed.data.moderation,
    })
    .eq("user_id", ctx.user.userId);
  return error ? fail(friendlyError(error)) : ok(null);
}
