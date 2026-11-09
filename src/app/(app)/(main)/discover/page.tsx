import type { Metadata } from "next";
import { DiscoverDeck } from "@/components/discover/deck";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { getDiscoveryDeck } from "@/server/discovery";

export const metadata: Metadata = { title: "Discover" };

export default async function DiscoverPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [cards, usage, answered, photos] = await Promise.all([
    getDiscoveryDeck(viewer.userId),
    supabase.rpc("get_usage"),
    supabase.from("chemistry_answers").select("question_id", { count: "exact", head: true }).eq("user_id", viewer.userId),
    supabase.from("profile_photos").select("status").eq("user_id", viewer.userId).in("status", ["pending", "approved"]),
  ]);
  const u = (usage.data ?? {}) as { likes_used?: number; likes_limit?: number; super_likes_used?: number; super_likes_limit?: number };
  const hasApprovedPhoto = (photos.data ?? []).some((p: { status: string }) => p.status === "approved");

  return (
    <DiscoverDeck
      initialCards={cards}
      usage={{
        likesUsed: u.likes_used ?? 0,
        likesLimit: u.likes_limit ?? 25,
        superUsed: u.super_likes_used ?? 0,
        superLimit: u.super_likes_limit ?? 1,
      }}
      needsChemistry={(answered.count ?? 0) < 10}
      hidden={!viewer.profile.is_visible}
      photoPending={!hasApprovedPhoto}
    />
  );
}
