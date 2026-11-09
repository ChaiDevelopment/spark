import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ManagedPhoto } from "@/components/profile/photo-manager";

export interface OwnProfile {
  id: string;
  display_name: string;
  pronouns: string | null;
  gender: string | null;
  show_gender: boolean;
  city: string | null;
  region: string | null;
  country_code: string;
  bio: string;
  relationship_goal: string | null;
  drinking: string | null;
  smoking: string | null;
  exercise: string | null;
  communication_style: string | null;
  is_visible: boolean;
  completion_percent: number;
  onboarding_completed_at: string | null;
}

export interface OwnPreferences {
  interested_in: string[];
  min_age: number;
  max_age: number;
  location_scope: "city" | "region" | "country" | "anywhere";
}

export interface InterestOption {
  id: string;
  label: string;
  emoji: string | null;
  category: string;
}

/** Everything the signed-in user needs to edit their own profile (RLS: own rows only). */
export async function loadOwnProfile(userId: string) {
  const supabase = await createClient();
  const [profile, priv, prefs, catalog, mine, photos] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, display_name, pronouns, gender, show_gender, city, region, country_code, bio, relationship_goal, drinking, smoking, exercise, communication_style, is_visible, completion_percent, onboarding_completed_at",
      )
      .eq("id", userId)
      .single<OwnProfile>(),
    supabase.from("profile_private").select("date_of_birth").eq("user_id", userId).maybeSingle<{ date_of_birth: string }>(),
    supabase.from("user_preferences").select("interested_in, min_age, max_age, location_scope").eq("user_id", userId).single<OwnPreferences>(),
    supabase.from("interests").select("id, label, emoji, category").order("category").order("label"),
    supabase.from("user_interests").select("interest_id").eq("user_id", userId),
    supabase.from("profile_photos").select("id, status, position, rejection_reason").eq("user_id", userId).neq("status", "uploading").order("position"),
  ]);
  if (profile.error) throw profile.error;
  return {
    profile: profile.data,
    dateOfBirth: priv.data?.date_of_birth ?? null,
    preferences: prefs.data ?? { interested_in: [], min_age: 18, max_age: 45, location_scope: "country" as const },
    interests: (catalog.data ?? []) as InterestOption[],
    myInterestIds: (mine.data ?? []).map((r: { interest_id: string }) => r.interest_id),
    photos: (photos.data ?? []) as ManagedPhoto[],
  };
}
