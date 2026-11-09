/**
 * SPARK Chemistry Engine — deterministic, explainable compatibility scoring.
 *
 * Pure functions only: no I/O, no randomness, no clock. Given the same
 * questionnaire and answers it always returns the same result, which is
 * what we persist in `chemistry_results` together with both version numbers.
 *
 * Algorithms per question kind:
 *   scale  → numeric similarity: 1 - |a - b| / (max - min)
 *   single → explicit compatibility matrix (identical answers = 1)
 *   multi  → Jaccard similarity |A ∩ B| / |A ∪ B|
 * Profile interests are blended into the "interests" dimension via Jaccard.
 *
 * Missing answers are never treated as agreement: each dimension's similarity
 * is shrunk toward a neutral prior (0.5) in proportion to how much of that
 * dimension both people actually answered (coverage).
 */

export const CALCULATION_VERSION = 1;
export const NEUTRAL_PRIOR = 0.5;

export const DIMENSIONS = ["personality", "communication", "lifestyle", "interests", "values", "expectations"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Product-defined dimension weights (sum = 1). */
export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  personality: 0.2,
  communication: 0.2,
  lifestyle: 0.15,
  interests: 0.15,
  values: 0.2,
  expectations: 0.1,
};

/** Weight of the profile-interests overlap inside the "interests" dimension. */
export const PROFILE_INTERESTS_WEIGHT = 2;

export type QuestionKind = "scale" | "single" | "multi";

export interface CompatMatrix {
  default?: number;
  pairs?: Record<string, number>;
}

export interface ChemistryQuestion {
  id: string;
  code: string;
  dimension: Dimension;
  kind: QuestionKind;
  weight: number;
  shortLabel: string;
  compatMatrix?: CompatMatrix | null;
  options: { key: string; value: number | null }[];
}

/** question id → selected option keys */
export type AnswerMap = Record<string, string[]>;

export interface Participant {
  answers: AnswerMap;
  /** interest ids from the profile */
  interests: string[];
}

export interface DimensionResult {
  dimension: Dimension;
  /** 0–100 after neutral shrinkage */
  score: number;
  /** 0–1 weighted similarity over questions both answered (null if none) */
  rawSimilarity: number | null;
  /** 0–1 share of the dimension both people answered */
  coverage: number;
  weight: number;
}

export interface Explanation {
  dimension: Dimension | "overall";
  tone: "strong" | "good" | "mixed" | "different" | "unknown";
  text: string;
}

export interface ChemistryResult {
  questionnaireVersion: number;
  calculationVersion: number;
  overallScore: number;
  confidence: number;
  dimensions: DimensionResult[];
  sharedInterestCount: number;
  explanations: Explanation[];
  aligned: string[];
  differences: string[];
}

const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
};
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function scaleSimilarity(q: ChemistryQuestion, a: string, b: string): number {
  const values = q.options.map((o) => o.value).filter((v): v is number => typeof v === "number");
  const va = q.options.find((o) => o.key === a)?.value;
  const vb = q.options.find((o) => o.key === b)?.value;
  if (va == null || vb == null || values.length < 2) return NaN;
  const span = Math.max(...values) - Math.min(...values);
  if (span === 0) return 1;
  return clamp01(1 - Math.abs(va - vb) / span);
}

export function matrixSimilarity(matrix: CompatMatrix | null | undefined, a: string, b: string): number {
  if (a === b) return 1;
  const pairs = matrix?.pairs ?? {};
  const v = pairs[`${a}:${b}`] ?? pairs[`${b}:${a}`] ?? matrix?.default ?? 0;
  return clamp01(v);
}

/** Similarity for one question, or NaN when either side didn't answer validly. */
export function questionSimilarity(q: ChemistryQuestion, a?: string[], b?: string[]): number {
  if (!a?.length || !b?.length) return NaN;
  const known = new Set(q.options.map((o) => o.key));
  const A = a.filter((k) => known.has(k));
  const B = b.filter((k) => known.has(k));
  if (!A.length || !B.length) return NaN;
  switch (q.kind) {
    case "scale":
      return scaleSimilarity(q, A[0], B[0]);
    case "single":
      return matrixSimilarity(q.compatMatrix, A[0], B[0]);
    case "multi":
      return jaccard(A, B);
  }
}

export function computeChemistry(
  questions: readonly ChemistryQuestion[],
  a: Participant,
  b: Participant,
  questionnaireVersion: number,
): ChemistryResult {
  // Deterministic iteration order regardless of input order.
  const ordered = [...questions].sort((x, y) => x.code.localeCompare(y.code));
  const sharedInterests = [...new Set(a.interests)].filter((i) => new Set(b.interests).has(i));

  const perQuestion: { q: ChemistryQuestion; sim: number }[] = [];
  const dimensions: DimensionResult[] = DIMENSIONS.map((dimension) => {
    let totalWeight = 0;
    let answeredWeight = 0;
    let weightedSim = 0;
    for (const q of ordered) {
      if (q.dimension !== dimension) continue;
      totalWeight += q.weight;
      const sim = questionSimilarity(q, a.answers[q.id], b.answers[q.id]);
      if (Number.isNaN(sim)) continue;
      answeredWeight += q.weight;
      weightedSim += q.weight * sim;
      perQuestion.push({ q, sim });
    }
    if (dimension === "interests") {
      totalWeight += PROFILE_INTERESTS_WEIGHT;
      if (a.interests.length > 0 && b.interests.length > 0) {
        answeredWeight += PROFILE_INTERESTS_WEIGHT;
        weightedSim += PROFILE_INTERESTS_WEIGHT * jaccardBoosted(a.interests, b.interests);
      }
    }
    const coverage = totalWeight > 0 ? answeredWeight / totalWeight : 0;
    const raw = answeredWeight > 0 ? weightedSim / answeredWeight : null;
    const shrunk = raw === null ? NEUTRAL_PRIOR : coverage * raw + (1 - coverage) * NEUTRAL_PRIOR;
    return {
      dimension,
      score: round(shrunk * 100),
      rawSimilarity: raw === null ? null : round(raw, 4),
      coverage: round(coverage, 3),
      weight: DIMENSION_WEIGHTS[dimension],
    };
  });

  const overall = dimensions.reduce((s, d) => s + d.weight * d.score, 0);
  const confidence = dimensions.reduce((s, d) => s + d.weight * d.coverage, 0);

  const aligned = perQuestion
    .filter((p) => p.sim >= 0.85)
    .sort((x, y) => y.sim - x.sim || y.q.weight - x.q.weight || x.q.code.localeCompare(y.q.code))
    .map((p) => p.q.shortLabel);
  const differences = perQuestion
    .filter((p) => p.sim <= 0.25)
    .sort((x, y) => x.sim - y.sim || y.q.weight - x.q.weight || x.q.code.localeCompare(y.q.code))
    .map((p) => p.q.shortLabel);

  const result: ChemistryResult = {
    questionnaireVersion,
    calculationVersion: CALCULATION_VERSION,
    overallScore: round(overall),
    confidence: round(confidence, 3),
    dimensions,
    sharedInterestCount: sharedInterests.length,
    explanations: [],
    aligned: aligned.slice(0, 5),
    differences: differences.slice(0, 3),
  };
  result.explanations = explain(result);
  return result;
}

/**
 * Raw Jaccard is harsh for interest lists (two people with 8 interests sharing
 * 3 is a lot in practice). We use a gentle square-root lift, still 0 for no
 * overlap and 1 for identical sets, and still deterministic.
 */
function jaccardBoosted(a: readonly string[], b: readonly string[]): number {
  return Math.sqrt(jaccard(a, b));
}

const DIMENSION_COPY: Record<Dimension, { name: string; strong: string; good: string; mixed: string; different: string }> = {
  personality: {
    name: "Personality",
    strong: "Your energy and temperament line up remarkably well.",
    good: "Your personalities look like they'd complement each other.",
    mixed: "Some similarities, some contrasts — that can keep things interesting.",
    different: "You recharge and react quite differently. Curiosity goes a long way.",
  },
  communication: {
    name: "Communication",
    strong: "You talk the same language — texting rhythm, conflict style and all.",
    good: "Your communication styles fit together nicely.",
    mixed: "You communicate a bit differently; agreeing on expectations early helps.",
    different: "Your communication habits differ a lot. Talk about what each of you needs.",
  },
  lifestyle: {
    name: "Lifestyle",
    strong: "Your day-to-day rhythms are a natural fit.",
    good: "Your lifestyles mostly mesh.",
    mixed: "A few lifestyle differences worth chatting about.",
    different: "Your routines and habits look quite different.",
  },
  interests: {
    name: "Interests",
    strong: "Plenty of shared interests — date ideas will come easily.",
    good: "You have good common ground to explore together.",
    mixed: "Some overlap, plus new things to show each other.",
    different: "Different interests — a chance to discover new things.",
  },
  values: {
    name: "Values",
    strong: "You share core values on the big things.",
    good: "Your values are broadly aligned.",
    mixed: "You see some important things differently. Worth an honest conversation.",
    different: "Your values differ in important areas. Talk openly before investing a lot.",
  },
  expectations: {
    name: "Relationship goals",
    strong: "You're looking for the same kind of relationship.",
    good: "Your relationship expectations are compatible.",
    mixed: "Your goals partly overlap — be clear about what you want.",
    different: "You may be looking for different things right now.",
  },
};

export function toneFor(score: number, coverage: number): Explanation["tone"] {
  if (coverage < 0.25) return "unknown";
  if (score >= 80) return "strong";
  if (score >= 65) return "good";
  if (score >= 45) return "mixed";
  return "different";
}

export function explain(result: Omit<ChemistryResult, "explanations">): Explanation[] {
  const out: Explanation[] = [];
  const sorted = [...result.dimensions].sort((x, y) => y.score - x.score || x.dimension.localeCompare(y.dimension));
  for (const d of sorted) {
    const tone = toneFor(d.score, d.coverage);
    const copy = DIMENSION_COPY[d.dimension];
    out.push({
      dimension: d.dimension,
      tone,
      text:
        tone === "unknown"
          ? `${copy.name}: not enough answers yet to say. Completing the questionnaire makes this more accurate.`
          : `${copy.name}: ${copy[tone]}`,
    });
  }
  if (result.aligned.length) {
    out.push({ dimension: "overall", tone: "good", text: `You're in sync on ${listify(result.aligned.slice(0, 3))}.` });
  }
  if (result.differences.length) {
    out.push({
      dimension: "overall",
      tone: "mixed",
      text: `You might see ${listify(result.differences.slice(0, 2))} differently — a great conversation starter.`,
    });
  }
  if (result.confidence < 0.5) {
    out.push({
      dimension: "overall",
      tone: "unknown",
      text: "This score is an early estimate because one or both of you skipped many questions.",
    });
  }
  return out;
}

function listify(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function dimensionLabel(d: Dimension): string {
  return DIMENSION_COPY[d].name;
}

export const CHEMISTRY_DISCLAIMER =
  "Chemistry is a conversation starter based on your answers, not a prediction. No score can guarantee how a relationship will go.";
