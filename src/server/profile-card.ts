import "server-only";
import { createClient } from "@/lib/supabase/server";
import { chemistryFor } from "@/server/chemistry";
import type { DiscoveryCard } from "@/server/discovery";

interface CardJson {
  id: string;
  display_name: string;
  pronouns: string | null;
  gender: string | null;
  age: number;
  city: string | null;
  region: string | null;
  bio: string;
  relationship_goal: string | null;
  drinking: string | null;
  smoking: string | null;
  exercise: string | null;
  communication_style: string | null;
  is_verified: boolean;
  interests: { id: string; label: string; emoji: string | null; shared: boolean }[];
  photo_ids: string[];
  match_id: string | null;
  conversation_id: string | null;
  liked_by_me: boolean;
}

/**
 * Load another user's profile for display. Returns null when the viewer is not
 * allowed to see it (blocked, incompatible, hidden, suspended...): the check
 * is can_view_profile() inside get_profile_card().
 */
export async function loadProfileCard(meId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_profile_card", { p_user: userId });
  if (error || !data) return null;
  const c = data as CardJson;
  const chemistry = c.id === meId ? undefined : (await chemistryFor(meId, [c.id]).catch(() => new Map())).get(c.id);
  const card: DiscoveryCard = {
    id: c.id,
    displayName: c.display_name,
    pronouns: c.pronouns,
    gender: c.gender,
    age: c.age,
    city: c.city,
    region: c.region,
    bio: c.bio,
    relationshipGoal: c.relationship_goal,
    drinking: c.drinking,
    smoking: c.smoking,
    exercise: c.exercise,
    communicationStyle: c.communication_style,
    isVerified: c.is_verified,
    sharedInterests: c.interests.filter((i) => i.shared).length,
    interests: c.interests,
    photoIds: c.photo_ids,
    chemistry: chemistry ?? null,
  };
  return { card, matchId: c.match_id, conversationId: c.conversation_id, likedByMe: c.liked_by_me };
}
