"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { chemistryAnswersSchema } from "@/lib/validation/schemas";
import { getApiUser } from "@/server/auth";
import { CURRENT_QUESTIONNAIRE_VERSION } from "@/server/chemistry";

/**
 * Save questionnaire answers for the signed-in user. Answers are written with
 * the user-scoped client: RLS guarantees user_id = auth.uid(), and a trigger
 * validates each option against the question definition. Column grants only
 * allow updating option_keys — see tests/db/rls.test.ts ("saving answers…").
 */
export async function saveChemistryAnswersAction(input: unknown): Promise<ActionResult<{ saved: number }>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  if (!user.active) return fail("Your account is not active.");
  const parsed = chemistryAnswersSchema.safeParse(input);
  if (!parsed.success) return fail("Some answers were invalid.");

  const supabase = await createClient();
  if (parsed.data.answers.length) {
    const ids = parsed.data.answers.map((a) => a.questionId);
    const { data: existing, error: readError } = await supabase
      .from("chemistry_answers")
      .select("question_id")
      .eq("user_id", user.userId)
      .in("question_id", ids);
    if (readError) return fail(friendlyError(readError, "Couldn't save your answers."));
    const answered = new Set((existing ?? []).map((r: { question_id: string }) => r.question_id));

    // New answers: plain INSERT … ON CONFLICT DO NOTHING. (A regular upsert
    // would need UPDATE on user_id/question_id, which users deliberately lack.)
    const fresh = parsed.data.answers
      .filter((a) => !answered.has(a.questionId))
      .map((a) => ({
        user_id: user.userId,
        question_id: a.questionId,
        questionnaire_version: CURRENT_QUESTIONNAIRE_VERSION,
        option_keys: a.optionKeys,
      }));
    if (fresh.length) {
      const { error } = await supabase
        .from("chemistry_answers")
        .upsert(fresh, { onConflict: "user_id,question_id", ignoreDuplicates: true });
      if (error) return fail(friendlyError(error, "Couldn't save your answers."));
    }

    // Changed answers: update the one column users may change.
    const changed = parsed.data.answers.filter((a) => answered.has(a.questionId));
    const results = await Promise.all(
      changed.map((a) =>
        supabase
          .from("chemistry_answers")
          .update({ option_keys: a.optionKeys })
          .eq("user_id", user.userId)
          .eq("question_id", a.questionId),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return fail(friendlyError(failed.error, "Couldn't save your answers."));
  }
  if (parsed.data.skipped.length) {
    // "Skip" removes a previous answer — skipped questions count as unknown, never as agreement.
    const { error } = await supabase.from("chemistry_answers").delete().eq("user_id", user.userId).in("question_id", parsed.data.skipped);
    if (error) return fail(friendlyError(error, "Couldn't save your answers."));
  }
  revalidatePath("/chemistry/results");
  return ok({ saved: parsed.data.answers.length });
}
