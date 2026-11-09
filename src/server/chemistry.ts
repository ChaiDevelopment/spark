import "server-only";
import {
  CALCULATION_VERSION,
  computeChemistry,
  type AnswerMap,
  type ChemistryQuestion,
  type ChemistryResult,
  type Dimension,
} from "@/lib/chemistry/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env.server";

export const CURRENT_QUESTIONNAIRE_VERSION = 1;

export interface QuestionnaireQuestion extends ChemistryQuestion {
  prompt: string;
  maxChoices: number;
  position: number;
  options: { key: string; label: string; value: number | null }[];
}

interface QuestionRow {
  id: string;
  code: string;
  dimension: Dimension;
  kind: "scale" | "single" | "multi";
  prompt: string;
  short_label: string;
  max_choices: number;
  weight: number | string;
  compat_matrix: ChemistryQuestion["compatMatrix"];
  position: number;
  chemistry_options: { key: string; label: string; value: number | string | null; position: number }[];
}

let cache: { at: number; version: number; questions: QuestionnaireQuestion[] } | undefined;

/** Active questionnaire (reference data; cached in memory for 10 minutes). */
export async function loadQuestionnaire(version = CURRENT_QUESTIONNAIRE_VERSION): Promise<QuestionnaireQuestion[]> {
  if (cache && cache.version === version && Date.now() - cache.at < 10 * 60_000) return cache.questions;
  const { data, error } = await createAdminClient()
    .from("chemistry_questions")
    .select("id, code, dimension, kind, prompt, short_label, max_choices, weight, compat_matrix, position, chemistry_options(key, label, value, position)")
    .eq("questionnaire_version", version)
    .eq("is_active", true)
    .order("position");
  if (error) throw error;
  const questions = (data as QuestionRow[]).map((q) => ({
    id: q.id,
    code: q.code,
    dimension: q.dimension,
    kind: q.kind,
    prompt: q.prompt,
    shortLabel: q.short_label,
    maxChoices: q.max_choices,
    weight: Number(q.weight),
    compatMatrix: q.compat_matrix,
    position: q.position,
    options: [...q.chemistry_options]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ key: o.key, label: o.label, value: o.value === null ? null : Number(o.value) })),
  }));
  cache = { at: Date.now(), version, questions };
  return questions;
}

export type ChemistrySummary = Pick<
  ChemistryResult,
  "overallScore" | "confidence" | "dimensions" | "explanations" | "aligned" | "differences" | "sharedInterestCount"
>;

/**
 * Compute chemistry between `meId` and each of `otherIds`, persist the result
 * (versioned) and return summaries keyed by the other user's id.
 *
 * Uses the service role because it must read BOTH users' private answers.
 * Callers must only pass ids the viewer is already authorized to see
 * (discovery candidates, matches, or a profile that passed can_view_profile).
 */
export async function chemistryFor(meId: string, otherIds: string[]): Promise<Map<string, ChemistrySummary>> {
  const result = new Map<string, ChemistrySummary>();
  const others = [...new Set(otherIds)].filter((id) => id !== meId);
  if (!others.length || !isServiceRoleConfigured()) return result;

  const admin = createAdminClient();
  const questions = await loadQuestionnaire();
  const ids = [meId, ...others];
  const [answersRes, interestsRes] = await Promise.all([
    admin
      .from("chemistry_answers")
      .select("user_id, question_id, option_keys")
      .in("user_id", ids)
      .eq("questionnaire_version", CURRENT_QUESTIONNAIRE_VERSION),
    admin.from("user_interests").select("user_id, interest_id").in("user_id", ids),
  ]);
  if (answersRes.error) throw answersRes.error;
  if (interestsRes.error) throw interestsRes.error;

  const answers = new Map<string, AnswerMap>();
  for (const a of answersRes.data as { user_id: string; question_id: string; option_keys: string[] }[]) {
    const m = answers.get(a.user_id) ?? {};
    m[a.question_id] = a.option_keys;
    answers.set(a.user_id, m);
  }
  const interests = new Map<string, string[]>();
  for (const i of interestsRes.data as { user_id: string; interest_id: string }[]) {
    interests.set(i.user_id, [...(interests.get(i.user_id) ?? []), i.interest_id]);
  }

  const me = { answers: answers.get(meId) ?? {}, interests: interests.get(meId) ?? [] };
  const rows: Record<string, unknown>[] = [];
  const computed: { low: string; high: string; r: ChemistryResult }[] = [];
  for (const other of others) {
    const r = computeChemistry(questions, me, { answers: answers.get(other) ?? {}, interests: interests.get(other) ?? [] }, CURRENT_QUESTIONNAIRE_VERSION);
    result.set(other, r);
    const [low, high] = meId < other ? [meId, other] : [other, meId];
    computed.push({ low, high, r });
    rows.push({
      user_low: low,
      user_high: high,
      questionnaire_version: r.questionnaireVersion,
      calculation_version: CALCULATION_VERSION,
      overall_score: r.overallScore,
      confidence: r.confidence,
      explanations: r.explanations,
      shared_interest_count: r.sharedInterestCount,
      calculated_at: new Date().toISOString(),
    });
  }

  // Persist (best-effort: a write failure must not break discovery).
  const { data: saved, error } = await admin
    .from("chemistry_results")
    .upsert(rows, { onConflict: "user_low,user_high,questionnaire_version,calculation_version" })
    .select("id, user_low, user_high");
  if (error) {
    console.error("chemistry persist failed", error.message);
    return result;
  }
  const dimRows = (saved as { id: string; user_low: string; user_high: string }[]).flatMap((s) => {
    const c = computed.find((x) => x.low === s.user_low && x.high === s.user_high);
    return (c?.r.dimensions ?? []).map((d) => ({
      result_id: s.id,
      dimension: d.dimension,
      score: d.score,
      raw_similarity: d.rawSimilarity,
      coverage: d.coverage,
      weight: d.weight,
    }));
  });
  if (dimRows.length) {
    const { error: dimError } = await admin.from("chemistry_result_dimensions").upsert(dimRows, { onConflict: "result_id,dimension" });
    if (dimError) console.error("chemistry dimension persist failed", dimError.message);
  }
  return result;
}
