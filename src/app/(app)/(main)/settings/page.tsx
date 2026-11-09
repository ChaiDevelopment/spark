import type { Metadata } from "next";
import Link from "next/link";
import { Ban, ChevronRight, FileText, KeyRound, Shield, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/brand";
import { SettingsForms, DeleteAccount } from "@/components/settings/settings-forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [prefs, notif] = await Promise.all([
    supabase.from("user_preferences").select("interested_in, min_age, max_age, location_scope").eq("user_id", viewer.userId).single(),
    supabase.from("notification_preferences").select("new_like, new_match, new_message, moderation").eq("user_id", viewer.userId).single(),
  ]);

  const links = [
    { href: "/settings/privacy", label: "Privacy & visibility", icon: ShieldCheck },
    { href: "/settings/blocked", label: "Blocked people", icon: Ban },
    { href: "/reset-password", label: "Change password", icon: KeyRound },
    { href: "/guidelines", label: "Community guidelines", icon: Shield },
    { href: "/terms", label: "Terms of service", icon: FileText },
    { href: "/privacy", label: "Privacy policy", icon: FileText },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Settings" subtitle={viewer.email ?? undefined} />
      <SettingsForms
        preferences={{
          interestedIn: (prefs.data?.interested_in as string[]) ?? [],
          minAge: prefs.data?.min_age ?? 18,
          maxAge: prefs.data?.max_age ?? 45,
          locationScope: (prefs.data?.location_scope as "city" | "region" | "country" | "anywhere") ?? "country",
        }}
        notifications={{
          newLike: notif.data?.new_like ?? true,
          newMatch: notif.data?.new_match ?? true,
          newMessage: notif.data?.new_message ?? true,
          moderation: notif.data?.moderation ?? true,
        }}
      />
      <Card className="p-2">
        <ul>
          {links.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3 rounded-2xl px-4 py-3.5 font-medium hover:bg-cream">
                <Icon className="size-5 text-ink-faint" aria-hidden /> <span className="flex-1">{label}</span> <ChevronRight className="size-4 text-ink-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <form action="/auth/signout" method="post">
        <Button variant="outline" className="w-full" type="submit">
          Sign out
        </Button>
      </form>
      <DeleteAccount />
    </div>
  );
}
