import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { requireViewer } from "@/server/auth";
import { loadOwnProfile } from "@/server/profile-data";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage() {
  const viewer = await requireViewer({ allowIncomplete: true });
  if (viewer.profile.onboarding_completed_at) redirect("/discover");
  const data = await loadOwnProfile(viewer.userId);

  return (
    <div className="bg-glow min-h-dvh">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 pt-6">
        <Logo href="/onboarding" />
        <form action="/auth/signout" method="post">
          <button className="text-sm font-semibold text-ink-faint hover:text-ink">Sign out</button>
        </form>
      </header>
      <main className="mx-auto max-w-xl px-5 pb-16 pt-6">
        <OnboardingWizard {...data} />
      </main>
    </div>
  );
}
