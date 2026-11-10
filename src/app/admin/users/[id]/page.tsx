import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge, Card } from "@/components/ui/primitives";
import { PhotoImage } from "@/components/photos";
import { UserModerationPanel } from "@/components/admin/user-panel";
import { REPORT_CATEGORIES, labelFor } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/utils";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Member" };

interface Person {
  id: string;
  display_name: string;
  email: string;
  age: number | null;
  city: string | null;
  region: string | null;
  account_status: "active" | "suspended" | "banned" | "deactivated";
  suspended_until: string | null;
  suspended_reason: string | null;
  onboarded: boolean;
  report_count: number;
  created_at: string;
}

const STATUS_TONE = { active: "mint", suspended: "peach", banned: "danger", deactivated: "neutral" } as const;
const ACTION_LABEL: Record<string, string> = {
  warn: "Warning sent",
  suspend: "Suspended",
  ban: "Banned",
  unsuspend: "Restored",
  dismiss: "Report dismissed",
  resolve: "Report resolved",
  approve_photo: "Photo approved",
  reject_photo: "Photo rejected",
  note: "Note",
};

export default async function MemberPage({ params }: PageProps<"/admin/users/[id]">) {
  await requireStaff();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [peopleRes, photosRes, reportsRes, actionsRes] = await Promise.all([
    supabase.rpc("admin_profiles", { p_ids: [id] }),
    supabase.from("profile_photos").select("id, status, rejection_reason, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("user_reports")
      .select("id, reporter_id, category, details, context_type, status, created_at")
      .eq("reported_user_ref", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("moderation_actions")
      .select("id, action, notes, actor_id, created_at")
      .eq("subject_user_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (peopleRes.error) throw peopleRes.error;

  const person = ((peopleRes.data ?? []) as Person[])[0];
  if (!person) notFound();

  const reports = (reportsRes.data ?? []) as {
    id: string;
    reporter_id: string | null;
    category: string;
    details: string;
    context_type: string;
    status: string;
    created_at: string;
  }[];
  const actions = (actionsRes.data ?? []) as { id: string; action: string; notes: string | null; actor_id: string | null; created_at: string }[];
  const photos = (photosRes.data ?? []) as { id: string; status: string; rejection_reason: string | null; created_at: string }[];

  // Names for reporters and the moderators who acted. Staff-only lookup.
  const nameIds = [...new Set([...reports.map((r) => r.reporter_id), ...actions.map((a) => a.actor_id)].filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  if (nameIds.length) {
    const { data } = await supabase.rpc("admin_profiles", { p_ids: nameIds });
    for (const p of (data ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name || "Member");
  }

  const place = [person.city, person.region].filter(Boolean).join(", ");
  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm font-semibold text-ink-faint hover:text-ink">
        ← All users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">
            {person.display_name || "(no name yet)"}
            {person.age !== null && <span className="text-ink-faint">, {person.age}</span>}
          </h1>
          <p className="text-ink-soft">
            {person.email}
            {place && ` · ${place}`}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            Joined {new Date(person.created_at).toLocaleDateString("en-GB")} · user ID {person.id.slice(0, 8)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={STATUS_TONE[person.account_status]}>{person.account_status}</Badge>
          {person.account_status === "suspended" && person.suspended_until && (
            <p className="text-sm text-ink-soft">
              Until {new Date(person.suspended_until).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB
            </p>
          )}
          {person.suspended_reason && <p className="max-w-xs text-right text-xs text-ink-faint">{person.suspended_reason}</p>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-6">
          <UserModerationPanel userId={person.id} name={person.display_name || "this member"} status={person.account_status} />

          <Card className="p-5">
            <h2 className="font-display text-lg font-bold">Photos</h2>
            {photos.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">No photos uploaded.</p>
            ) : (
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <li key={p.id}>
                    <PhotoImage photoId={p.id} alt="Member photo" variant="thumb" className="aspect-[4/5] w-full rounded-2xl" />
                    <p className="mt-1 text-xs capitalize text-ink-faint">{p.status.replace("_", " ")}</p>
                    {p.rejection_reason && <p className="text-[11px] text-danger">{p.rejection_reason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold">
              Reports against this member <span className="text-ink-faint">({person.report_count})</span>
            </h2>
            {reports.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">No reports.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {reports.map((r) => (
                  <li key={r.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{labelFor(REPORT_CATEGORIES, r.category) ?? r.category}</Badge>
                      <Badge tone={r.status === "open" ? "coral" : "neutral"}>{r.status.replace("_", " ")}</Badge>
                      <span className="text-xs text-ink-faint">
                        {r.context_type} · {timeAgo(r.created_at)} ago
                      </span>
                    </div>
                    <p className="mt-1 text-ink-soft">
                      Reported by {(r.reporter_id && names.get(r.reporter_id)) || "a deleted account"}
                    </p>
                    {r.details && <p className="mt-1 whitespace-pre-line text-ink-soft">{r.details}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-bold">Moderation history</h2>
            {actions.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">No moderation actions yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {actions.map((a) => (
                  <li key={a.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action}</span>
                      <span className="text-xs text-ink-faint">
                        by {(a.actor_id && names.get(a.actor_id)) || "system"} · {new Date(a.created_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" })} WIB
                      </span>
                    </div>
                    {a.notes && <p className="mt-1 text-ink-soft">{a.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
