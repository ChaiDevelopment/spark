import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, MapPin, ShieldCheck } from "lucide-react";
import { PrivacyForm } from "@/components/settings/privacy-form";
import { Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export const metadata: Metadata = { title: "Privacy" };

export default async function PrivacySettingsPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("is_visible, show_gender").eq("id", viewer.userId).single();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Privacy & visibility</h1>
      <PrivacyForm isVisible={data?.is_visible ?? true} showGender={data?.show_gender ?? true} />
      <Card className="space-y-4 text-sm text-ink-soft">
        <p className="flex gap-3">
          <MapPin className="size-5 shrink-0 text-coral" aria-hidden /> We only store and show your city and province — never GPS coordinates.
        </p>
        <p className="flex gap-3">
          <Lock className="size-5 shrink-0 text-coral" aria-hidden /> Your date of birth, email, and questionnaire answers are never shown to other people.
        </p>
        <p className="flex gap-3">
          <ShieldCheck className="size-5 shrink-0 text-coral" aria-hidden /> Photos are stored privately and shown only through short-lived links. Location data inside photos is removed on upload.
        </p>
      </Card>
    </div>
  );
}
