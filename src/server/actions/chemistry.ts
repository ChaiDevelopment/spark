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
 * validates each option against the question definition.
 */
export async function saveChemistryAnswersAction(input: unknown): Promise<ActionResult<{ saved: number }>> {
  const user = await getApiUser();
  if (!user) return fail("Please sign in again.");
  if (!user.active) return fail("Your account is not active.");
  const parsed = chemistryAnswersSchema.safeParse(input);
  if (!parsed.success) return fail("Some answers were invalid.");

  const supabase = await createClient();
  if (parsed.data.answers.length) {
    const rows = parsed.data.answers.map((a) => ({
      user_id: user.userId,
      question_id: a.questionId,
      questionnaire_version: CURRENT_QUESTIONNAIRE_VERSION,
      option_keys: a.optionKeys,
    }));
    const { error } = await supabase.from("chemistry_answers").upsert(rows, { onConflict: "user_id,question_id" });
    if (error) return fail(friendlyError(error, "Couldn't save your answers."));
  }
  if (parsed.data.skipped.length) {
    // "Skip" removes a previous answer — skipped questions count as unknown, never as agreement.
    const { error } = await supabase.from("chemistry_answers").delete().eq("user_id", user.userId).in("question_id", parsed.data.skipped);
    if (error) return fail(friendlyError(error, "Couldn't save your answers."));
  }
  revalidatePath("/chemistry/results");
  return ok({ saved: parsed.data.answers.length });
}
