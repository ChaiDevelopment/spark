import "server-only";
import { createClient } from "@/lib/supabase/server";
import { chemistryFor, type ChemistrySummary } from "@/server/chemistry";

export interface DiscoveryCard {
  id: string;
  displayName: string;
  pronouns: string | null;
  gender: string | null;
  age: number;
  city: string | null;
  region: string | null;
  bio: string;
  relationshipGoal: string | null;
  drinking: string | null;
  smoking: string | null;
  exercise: string | null;
  communicationStyle: string | null;
  isVerified: boolean;
  sharedInterests: number;
  interests: { id: string; label: string; emoji: string | null; shared: boolean }[];
  photoIds: string[];
  chemistry: ChemistrySummary | null;
}

interface CandidateRow {
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
  shared_interests: number;
}

/**
 * Build the discovery deck. Eligibility and every filter (preferences in both
 * directions, blocks, prior likes/passes, matches, visibility, suspension,
 * onboarding, approved photo) are enforced inside get_discovery_candidates()
 * in the database. This function only decorates and ranks the result.
 */
export async function getDiscoveryDeck(meId: string, limit = 20): Promise<DiscoveryCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_discovery_candidates", { p_limit: Math.min(limit * 2, 50) });
  if (error) throw error;
  const rows = (data ?? []) as CandidateRow[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const [photosRes, interestsRes, myInterestsRes, chemistry] = await Promise.all([
    // RLS: only approved photos of viewable profiles are returned.
    supabase.from("profile_photos").select("id, user_id, position, created_at").in("user_id", ids).eq("status", "approved").order("position"),
    supabase.from("user_interests").select("user_id, interests(id, label, emoji)").in("user_id", ids),
    supabase.from("user_interests").select("interest_id").eq("user_id", meId),
    chemistryFor(meId, ids).catch((e) => {
      console.error("chemistry failed", e);
      return new Map<string, ChemistrySummary>();
    }),
  ]);

  const mine = new Set((myInterestsRes.data ?? []).map((r: { interest_id: string }) => r.interest_id));
  const photos = new Map<string, string[]>();
  for (const p of (photosRes.data ?? []) as { id: string; user_id: string }[]) {
    photos.set(p.user_id, [...(photos.get(p.user_id) ?? []), p.id]);
  }
  const interests = new Map<string, DiscoveryCard["interests"]>();
  for (const r of (interestsRes.data ?? []) as unknown as { user_id: string; interests: { id: string; label: string; emoji: string | null } | null }[]) {
    if (!r.interests) continue;
    interests.set(r.user_id, [...(interests.get(r.user_id) ?? []), { ...r.interests, shared: mine.has(r.interests.id) }]);
  }

  const cards = rows.map<DiscoveryCard>((r) => ({
    id: r.id,
    displayName: r.display_name,
    pronouns: r.pronouns,
    gender: r.gender,
    age: r.age,
    city: r.city,
    region: r.region,
    bio: r.bio,
    relationshipGoal: r.relationship_goal,
    drinking: r.drinking,
    smoking: r.smoking,
    exercise: r.exercise,
    communicationStyle: r.communication_style,
    isVerified: r.is_verified,
    sharedInterests: r.shared_interests,
    interests: (interests.get(r.id) ?? []).sort((a, b) => Number(b.shared) - Number(a.shared) || a.label.localeCompare(b.label)),
    photoIds: photos.get(r.id) ?? [],
    chemistry: chemistry.get(r.id) ?? null,
  }));

  // Rank: chemistry (weighted by confidence) first, recency already applied in SQL as a tiebreaker.
  const rank = (c: DiscoveryCard) => (c.chemistry ? c.chemistry.overallScore * (0.6 + 0.4 * c.chemistry.confidence) : 50) + c.sharedInterests;
  return cards.sort((a, b) => rank(b) - rank(a)).slice(0, limit);
}
