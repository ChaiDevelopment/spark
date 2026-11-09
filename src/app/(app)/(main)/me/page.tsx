import type { Metadata } from "next";
import Link from "next/link";
import { Eye, FlaskConical, PencilLine } from "lucide-react";
import { PageHeader } from "@/components/brand";
import { ProfileDetails } from "@/components/discover/profile-details";
import { Button } from "@/components/ui/button";
import { Card, Progress } from "@/components/ui/primitives";
import { requireViewer } from "@/server/auth";
import { loadProfileCard } from "@/server/profile-card";

export const metadata: Metadata = { title: "My profile" };

const TIPS: [number, string][] = [
  [60, "Add a bio and what you're looking for."],
  [80, "Three or more photos help people get a real sense of you."],
  [95, "Answer the chemistry questionnaire for accurate scores."],
];

export default async function MyProfilePage() {
  const viewer = await requireViewer();
  const result = await loadProfileCard(viewer.userId, viewer.userId);
  const completion = viewer.profile.completion_percent;
  const tip = TIPS.find(([t]) => completion < t)?.[1];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="My profile"
        action={
          <Button size="sm" asChild>
            <Link href="/me/edit">
              <PencilLine /> Edit
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="mb-2 flex justify-between text-sm font-semibold">
          <span>Profile strength</span>
          <span className="text-coral-deep">{completion}%</span>
        </div>
        <Progress value={completion} label="Profile completion" />
        {tip && <p className="mt-3 text-sm text-ink-soft">💡 {tip}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/chemistry/results">
              <FlaskConical /> My chemistry
            </Link>
          </Button>
          {!viewer.profile.is_visible && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/privacy">
                <Eye /> Profile paused — change
              </Link>
            </Button>
          )}
        </div>
      </Card>
      {result && (
        <Card className="p-4 sm:p-6">
          <p className="mb-4 text-sm font-semibold text-ink-faint">This is how others see you (photos in review are only visible to you).</p>
          <ProfileDetails card={result.card} showSafety={false} />
        </Card>
      )}
    </div>
  );
}
