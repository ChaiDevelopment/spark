import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export interface ViewerProfile {
  id: string;
  display_name: string;
  gender: string | null;
  account_status: "active" | "suspended" | "banned" | "deactivated";
  suspended_reason: string | null;
  suspended_until: string | null;
  onboarding_completed_at: string | null;
  completion_percent: number;
  is_visible: boolean;
}

export interface Viewer {
  userId: string;
  email: string | null;
  profile: ViewerProfile | null;
}

/**
 * Resolve the signed-in user from the verified session cookie. The user id
 * ALWAYS comes from the validated JWT claims, never from request input.
 * Cached per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Always opt into per-request rendering, even when Supabase env is missing
  // at build time — otherwise Next prerenders a static redirect for every
  // authenticated page and serves it until the next deploy.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  let { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, gender, account_status, suspended_reason, suspended_until, onboarding_completed_at, completion_percent, is_visible")
    .eq("id", sub)
    .maybeSingle<ViewerProfile>();
  // A suspension whose end date has passed is lifted as soon as the person returns.
  if (profile?.account_status === "suspended" && profile.suspended_until && new Date(profile.suspended_until) < new Date()) {
    const { data: lifted } = await supabase.rpc("lift_my_expired_suspension");
    if (lifted) profile = { ...profile, account_status: "active", suspended_until: null, suspended_reason: null };
  }
  return { userId: sub, email: (data.claims.email as string | undefined) ?? null, profile: profile ?? null };
});

export type ActiveViewer = Viewer & { profile: ViewerProfile };

export async function requireViewer(opts: { allowIncomplete?: boolean; allowSuspended?: boolean } = {}): Promise<ActiveViewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  // A missing profile row means the account was deleted while a session lingered.
  if (!viewer.profile) redirect("/auth/signout");
  if (!opts.allowSuspended && viewer.profile.account_status !== "active") redirect("/suspended");
  if (!opts.allowIncomplete && !viewer.profile.onboarding_completed_at) redirect("/onboarding");
  return viewer as ActiveViewer;
}

/** Staff role is read from the database via RPC (never trusted from the client). */
export const getStaffRole = cache(async (): Promise<"admin" | "moderator" | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_staff_role");
  return (data as "admin" | "moderator" | null) ?? null;
});

/**
 * Moderation area guard. Anonymous visitors, regular users, suspended users and
 * anyone without a staff role all get the same 404: the area isn't revealed.
 */
export async function requireStaff() {
  const viewer = await getViewer();
  if (!viewer?.profile || viewer.profile.account_status !== "active") notFound();
  const role = await getStaffRole();
  if (!role) notFound();
  return { ...(viewer as ActiveViewer), role };
}

/** For route handlers / actions: returns the active user, or null (caller responds 401). */
export async function getApiUser(): Promise<{ userId: string; active: boolean; onboarded: boolean } | null> {
  const viewer = await getViewer();
  if (!viewer?.profile) return null;
  return {
    userId: viewer.userId,
    active: viewer.profile.account_status === "active",
    onboarded: Boolean(viewer.profile.onboarding_completed_at),
  };
}
