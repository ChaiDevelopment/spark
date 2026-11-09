import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, PencilLine } from "lucide-react";
import { ChemistryRing, EmptyState, PageHeader } from "@/components/brand";
import { Avatar } from "@/components/photos";
import { ChemistryBreakdown } from "@/components/chemistry/breakdown";
import { Button } from "@/components/ui/button";
import { Card, Progress } from "@/components/ui/primitives";
import { DIMENSIONS, dimensionLabel } from "@/lib/chemistry/engine";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { CURRENT_QUESTIONNAIRE_VERSION, chemistryFor, loadQuestionnaire } from "@/server/chemistry";

export const metadata: Metadata = { title: "Your chemistry" };

interface ConversationRow {
  match_id: string;
  conversation_id: string;
  other_user_id: string;
  other_display_name: string;
  other_photo_id: string | null;
}

export default async function ChemistryResultsPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [questions, answersRes, convRes] = await Promise.all([
    loadQuestionnaire(),
    supabase.from("chemistry_answers").select("question_id, option_keys").eq("user_id", viewer.userId).eq("questionnaire_version", CURRENT_QUESTIONNAIRE_VERSION),
    supabase.rpc("list_conversations"),
  ]);
  const answers = new Map((answersRes.data ?? []).map((a: { question_id: string; option_keys: string[] }) => [a.question_id, a.option_keys]));
  const matches = (convRes.data ?? []) as ConversationRow[];
  const chemistry = await chemistryFor(viewer.userId, matches.map((m) => m.other_user_id)).catch(() => new Map());
  const ranked = matches
    .map((m) => ({ ...m, chem: chemistry.get(m.other_user_id) }))
    .filter((m) => m.chem)
    .sort((a, b) => b.chem!.overallScore - a.chem!.overallScore);

  if (answers.size === 0) {
    return (
      <EmptyState
        icon={<FlaskConical />}
        title="Discover your chemistry"
        action={
          <Button variant="spark" asChild>
            <Link href="/chemistry">Start the questionnaire</Link>
          </Button>
        }
      >
        Answer a few questions about how you think, talk and live. Your answers stay private — others only see your shared chemistry.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your chemistry"
        subtitle={`${answers.size} of ${questions.length} questions answered`}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/chemistry">
              <PencilLine /> Edit answers
            </Link>
          </Button>
        }
      />

      <Card>
        <h2 className="font-display text-lg font-bold">Your profile at a glance</h2>
        <p className="mt-1 text-sm text-ink-soft">Your answers are private. Each section you complete makes your chemistry scores more accurate.</p>
        <ul className="mt-5 space-y-5">
          {DIMENSIONS.map((d) => {
            const qs = questions.filter((q) => q.dimension === d);
            const done = qs.filter((q) => answers.has(q.id));
            const highlights = done
              .filter((q) => q.kind !== "scale")
              .slice(0, 3)
              .flatMap((q) => (answers.get(q.id) ?? []).map((k) => q.options.find((o) => o.key === k)?.label))
              .filter(Boolean)
              .slice(0, 4);
            return (
              <li key={d}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-semibold">{dimensionLabel(d)}</span>
                  <span className="text-ink-faint">
                    {done.length}/{qs.length}
                  </span>
                </div>
                <Progress value={(done.length / qs.length) * 100} label={`${dimensionLabel(d)} completion`} />
                {highlights.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {highlights.map((h) => (
                      <span key={h} className="rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-ink-soft">
                        {h}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {ranked.length === 0 ? (
        <Card className="text-center">
          <p className="font-display text-lg font-bold">Your chemistry shows up on every profile</p>
          <p className="mt-1 text-ink-soft">Head to Discover to see who you click with.</p>
          <Button className="mt-4" asChild>
            <Link href="/discover">Start discovering</Link>
          </Button>
        </Card>
      ) : (
        <>
          <h2 className="font-display text-xl font-extrabold">Chemistry with your matches</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {ranked.slice(0, 6).map((m) => (
              <li key={m.match_id}>
                <Link href={`/profile/${m.other_user_id}`} className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-soft transition hover:shadow-card">
                  <Avatar photoId={m.other_photo_id} name={m.other_display_name} className="size-14" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{m.other_display_name}</p>
                    <p className="truncate text-sm text-ink-faint">{m.chem!.aligned[0] ? `In sync on ${m.chem!.aligned[0]}` : "Tap to see details"}</p>
                  </div>
                  <ChemistryRing score={m.chem!.overallScore} size={52} />
                </Link>
              </li>
            ))}
          </ul>
          <Card>
            <ChemistryBreakdown chemistry={ranked[0].chem!} name={ranked[0].other_display_name} />
          </Card>
        </>
      )}
    </div>
  );
}
