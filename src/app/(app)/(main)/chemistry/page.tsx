import type { Metadata } from "next";
import { Questionnaire } from "@/components/chemistry/questionnaire";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { CURRENT_QUESTIONNAIRE_VERSION, loadQuestionnaire } from "@/server/chemistry";

export const metadata: Metadata = { title: "Chemistry questionnaire" };

export default async function ChemistryPage({ searchParams }: PageProps<"/chemistry">) {
  const viewer = await requireViewer();
  const { welcome } = await searchParams;
  const supabase = await createClient();
  const [questions, answers] = await Promise.all([
    loadQuestionnaire(),
    supabase
      .from("chemistry_answers")
      .select("question_id, option_keys")
      .eq("user_id", viewer.userId)
      .eq("questionnaire_version", CURRENT_QUESTIONNAIRE_VERSION),
  ]);
  const initial = Object.fromEntries((answers.data ?? []).map((a: { question_id: string; option_keys: string[] }) => [a.question_id, a.option_keys]));

  return (
    <Questionnaire
      welcome={welcome === "1"}
      questions={questions.map(({ id, dimension, kind, prompt, maxChoices, options }) => ({ id, dimension, kind, prompt, maxChoices, options: options.map(({ key, label }) => ({ key, label })) }))}
      initial={initial}
    />
  );
}
