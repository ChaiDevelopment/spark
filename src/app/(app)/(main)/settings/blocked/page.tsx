import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Ban } from "lucide-react";
import { EmptyState } from "@/components/brand";
import { UnblockButton } from "@/components/settings/unblock-button";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Blocked people" };

export default async function BlockedPage() {
  await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_blocked_users");
  const blocked = (data ?? []) as { user_id: string; display_name: string; blocked_at: string }[];
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Blocked people</h1>
      {blocked.length === 0 ? (
        <EmptyState icon={<Ban />} title="No one blocked">
          People you block won&apos;t see you, and you won&apos;t see them.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-soft">
          {blocked.map((b) => (
            <li key={b.user_id} className="flex items-center gap-3 px-5 py-4">
              <div className="flex-1">
                <p className="font-semibold">{b.display_name || "Someone"}</p>
                <p className="text-xs text-ink-faint">Blocked {timeAgo(b.blocked_at)}</p>
              </div>
              <UnblockButton userId={b.user_id} name={b.display_name} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink-faint">Unblocking doesn&apos;t restore a previous match or conversation.</p>
    </div>
  );
}
