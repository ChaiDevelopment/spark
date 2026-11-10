import type { Metadata } from "next";
import { PhotoQueue, type QueuePhoto } from "@/components/admin/photo-queue";
import { Pager } from "@/components/admin/pager";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Photo review" };

const PAGE_SIZE = 24;

interface PersonRow {
  id: string;
  display_name: string;
  age: number | null;
  city: string | null;
  region: string | null;
  report_count: number;
}

export default async function PhotoReviewPage({ searchParams }: PageProps<"/admin/photos">) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(typeof sp.page === "string" ? sp.page : "1")) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("profile_photos")
    .select("id, user_id, created_at", { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;

  const rows = (data ?? []) as { id: string; user_id: string; created_at: string }[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  let people: PersonRow[] = [];
  let others: { id: string; user_id: string }[] = [];
  if (userIds.length) {
    const [p, o] = await Promise.all([
      supabase.rpc("admin_profiles", { p_ids: userIds }),
      supabase.from("profile_photos").select("id, user_id").in("user_id", userIds).in("status", ["pending", "approved"]),
    ]);
    people = (p.data ?? []) as PersonRow[];
    others = (o.data ?? []) as { id: string; user_id: string }[];
  }

  const byUser = new Map(people.map((p) => [p.id, p]));
  const photos: QueuePhoto[] = rows.map((r) => {
    const person = byUser.get(r.user_id);
    return {
      id: r.id,
      ownerName: person?.display_name || "Member",
      age: person?.age ?? null,
      city: person?.city ?? null,
      region: person?.region ?? null,
      createdAt: r.created_at,
      priorReports: person?.report_count ?? 0,
      otherPhotoIds: others.filter((o) => o.user_id === r.user_id && o.id !== r.id).map((o) => o.id),
    };
  });

  const total = count ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Photo review</h1>
        <p className="text-ink-soft">
          {total} waiting · oldest first. Approved photos can appear in Discover immediately.
        </p>
      </div>
      <PhotoQueue photos={photos} />
      <Pager page={page} hasNext={from + PAGE_SIZE < total} href={(p) => `/admin/photos?page=${p}`} />
    </div>
  );
}
