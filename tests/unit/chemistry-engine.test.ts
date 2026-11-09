import { describe, expect, it } from "vitest";
import {
  CALCULATION_VERSION,
  DIMENSION_WEIGHTS,
  computeChemistry,
  jaccard,
  matrixSimilarity,
  questionSimilarity,
  type ChemistryQuestion,
  type Participant,
} from "@/lib/chemistry/engine";

const scale = (id: string, dimension: ChemistryQuestion["dimension"]): ChemistryQuestion => ({
  id,
  code: id,
  dimension,
  kind: "scale",
  weight: 1,
  shortLabel: `label ${id}`,
  options: [1, 2, 3, 4, 5].map((v) => ({ key: `s${v}`, value: v })),
});

const kids: ChemistryQuestion = {
  id: "kids",
  code: "v_kids",
  dimension: "values",
  kind: "single",
  weight: 1,
  shortLabel: "kids",
  compatMatrix: { default: 0.4, pairs: { "want:dont_want": 0, "want:open": 0.8 } },
  options: ["want", "open", "dont_want"].map((key) => ({ key, value: null })),
};

const music: ChemistryQuestion = {
  id: "music",
  code: "i_music",
  dimension: "interests",
  kind: "multi",
  weight: 1,
  shortLabel: "music taste",
  options: ["pop", "jazz", "rock", "kpop"].map((key) => ({ key, value: null })),
};

const questions: ChemistryQuestion[] = [
  scale("p1", "personality"),
  scale("p2", "personality"),
  scale("c1", "communication"),
  scale("l1", "lifestyle"),
  kids,
  music,
  scale("e1", "expectations"),
];

const full = (overrides: Record<string, string[]> = {}): Participant => ({
  answers: { p1: ["s3"], p2: ["s4"], c1: ["s2"], l1: ["s5"], kids: ["want"], music: ["pop", "jazz"], e1: ["s1"], ...overrides },
  interests: ["coffee", "hiking", "reading"],
});

describe("similarity primitives", () => {
  it("jaccard", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(["a"], ["a"])).toBe(1);
  });

  it("scale similarity is linear in distance", () => {
    const q = scale("x", "personality");
    expect(questionSimilarity(q, ["s1"], ["s1"])).toBe(1);
    expect(questionSimilarity(q, ["s1"], ["s5"])).toBe(0);
    expect(questionSimilarity(q, ["s2"], ["s4"])).toBe(0.5);
  });

  it("matrix similarity is symmetric with defaults", () => {
    expect(matrixSimilarity(kids.compatMatrix, "want", "dont_want")).toBe(0);
    expect(matrixSimilarity(kids.compatMatrix, "dont_want", "want")).toBe(0);
    expect(matrixSimilarity(kids.compatMatrix, "open", "want")).toBe(0.8);
    expect(matrixSimilarity(kids.compatMatrix, "open", "dont_want")).toBe(0.4);
    expect(matrixSimilarity(kids.compatMatrix, "open", "open")).toBe(1);
  });

  it("missing or invalid answers yield NaN (not agreement)", () => {
    expect(questionSimilarity(kids, undefined, ["want"])).toBeNaN();
    expect(questionSimilarity(kids, ["bogus"], ["want"])).toBeNaN();
  });
});

describe("computeChemistry", () => {
  it("weights sum to 1", () => {
    expect(Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("identical, complete answers score 100 with full confidence", () => {
    const r = computeChemistry(questions, full(), full(), 1);
    expect(r.overallScore).toBe(100);
    expect(r.confidence).toBe(1);
    expect(r.calculationVersion).toBe(CALCULATION_VERSION);
    expect(r.questionnaireVersion).toBe(1);
    expect(r.sharedInterestCount).toBe(3);
  });

  it("is deterministic and independent of question order", () => {
    const a = full();
    const b = full({ p1: ["s1"], kids: ["open"], music: ["rock"] });
    const r1 = computeChemistry(questions, a, b, 1);
    const r2 = computeChemistry([...questions].reverse(), a, b, 1);
    expect(r2).toEqual(r1);
    expect(computeChemistry(questions, a, b, 1)).toEqual(r1);
  });

  it("is symmetric", () => {
    const a = full();
    const b = full({ c1: ["s5"], kids: ["dont_want"] });
    expect(computeChemistry(questions, a, b, 1).overallScore).toBe(computeChemistry(questions, b, a, 1).overallScore);
  });

  it("missing answers never count as perfect compatibility", () => {
    const empty: Participant = { answers: {}, interests: [] };
    const r = computeChemistry(questions, full(), empty, 1);
    expect(r.overallScore).toBe(50); // neutral prior, not 100
    expect(r.confidence).toBe(0);
    expect(r.explanations.some((e) => e.tone === "unknown")).toBe(true);

    // Partially answered: agreement on the few answered questions cannot reach 100.
    const partial: Participant = { answers: { p1: ["s3"] }, interests: [] };
    const p = computeChemistry(questions, full(), partial, 1);
    expect(p.overallScore).toBeLessThan(60);
    expect(p.dimensions.find((d) => d.dimension === "personality")!.coverage).toBe(0.5);
  });

  it("deal-breaker differences lower the values dimension", () => {
    const r = computeChemistry(questions, full(), full({ kids: ["dont_want"] }), 1);
    const values = r.dimensions.find((d) => d.dimension === "values")!;
    expect(values.rawSimilarity).toBe(0);
    expect(r.differences).toContain("kids");
    expect(r.overallScore).toBeLessThan(100);
  });

  it("produces human-readable explanations, not just a number", () => {
    const r = computeChemistry(questions, full(), full({ p1: ["s1"] }), 1);
    expect(r.explanations.length).toBeGreaterThanOrEqual(6);
    for (const e of r.explanations) expect(e.text.length).toBeGreaterThan(10);
  });

  it("supports questionnaire versioning by echoing the version", () => {
    expect(computeChemistry(questions, full(), full(), 2).questionnaireVersion).toBe(2);
  });
});
