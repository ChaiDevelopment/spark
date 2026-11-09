"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Progress } from "@/components/ui/primitives";
import { CHEMISTRY_DISCLAIMER, DIMENSIONS, dimensionLabel, type Dimension } from "@/lib/chemistry/engine";
import { cn } from "@/lib/utils";
import { saveChemistryAnswersAction } from "@/server/actions/chemistry";

export interface QuestionView {
  id: string;
  dimension: Dimension;
  kind: "scale" | "single" | "multi";
  prompt: string;
  maxChoices: number;
  options: { key: string; label: string }[];
}

export function Questionnaire({ questions, initial, welcome }: { questions: QuestionView[]; initial: Record<string, string[]>; welcome?: boolean }) {
  const router = useRouter();
  const sections = useMemo(() => DIMENSIONS.map((d) => ({ dimension: d, questions: questions.filter((q) => q.dimension === d) })).filter((s) => s.questions.length), [questions]);
  const [answers, setAnswers] = useState<Record<string, string[]>>(initial);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(() => {
    const idx = sections.findIndex((s) => s.questions.some((q) => !initial[q.id]));
    return idx === -1 ? 0 : idx;
  });
  const [saving, setSaving] = useState(false);
  const answered = questions.filter((q) => answers[q.id]?.length).length;
  const section = sections[page];

  function choose(q: QuestionView, key: string) {
    setAnswers((prev) => {
      const cur = prev[q.id] ?? [];
      let next: string[];
      if (q.kind === "multi") {
        next = cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= q.maxChoices ? cur : [...cur, key];
      } else next = cur[0] === key ? [] : [key];
      return { ...prev, [q.id]: next };
    });
    setDirty((d) => new Set(d).add(q.id));
  }

  async function save(): Promise<boolean> {
    if (!dirty.size) return true;
    setSaving(true);
    const ids = [...dirty];
    const res = await saveChemistryAnswersAction({
      answers: ids.filter((id) => answers[id]?.length).map((id) => ({ questionId: id, optionKeys: answers[id] })),
      skipped: ids.filter((id) => !answers[id]?.length),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setDirty(new Set());
    return true;
  }

  async function go(delta: number) {
    if (!(await save())) return;
    if (page + delta >= sections.length) {
      toast.success("Chemistry profile saved!");
      router.push("/chemistry/results");
      router.refresh();
      return;
    }
    setPage((p) => Math.max(0, p + delta));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      {welcome && (
        <div className="mb-6 rounded-3xl bg-spark p-6 text-ink shadow-card">
          <Sparkles className="size-7" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-extrabold">One last thing: your chemistry</h1>
          <p className="mt-1 text-ink/80">42 quick questions, about 6 minutes. Skip anything you like — skipped questions are simply left out, never counted as a match.</p>
        </div>
      )}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {!welcome && <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Chemistry questionnaire</h1>}
          <p className="text-sm font-semibold text-ink-faint">
            {answered} of {questions.length} answered
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={async () => (await save()) && router.push("/discover")}>
          Save & exit
        </Button>
      </div>
      <Progress value={(answered / Math.max(1, questions.length)) * 100} label="Questionnaire progress" className="mb-4" />
      <nav className="mb-6 flex gap-1.5 overflow-x-auto pb-1" aria-label="Sections">
        {sections.map((s, i) => {
          const complete = s.questions.every((q) => answers[q.id]?.length);
          return (
            <button
              key={s.dimension}
              onClick={async () => (await save()) && setPage(i)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition",
                i === page ? "bg-ink text-white" : complete ? "bg-mint/20 text-mint-deep" : "bg-cream text-ink-soft",
              )}
              aria-current={i === page ? "step" : undefined}
            >
              {complete && i !== page && <Check className="size-3" aria-hidden />} {dimensionLabel(s.dimension)}
            </button>
          );
        })}
      </nav>

      <motion.div key={page} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {section.questions.map((q, i) => (
          <Card key={q.id} className="p-5">
            <fieldset>
              <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-ink-faint">
                {dimensionLabel(section.dimension)} · {i + 1}/{section.questions.length}
              </legend>
              <p className="font-display text-lg font-bold leading-snug">{q.prompt}</p>
              {q.kind === "multi" && <p className="mt-1 text-sm text-ink-faint">Choose up to {q.maxChoices}</p>}
              <div className={cn("mt-4 gap-2", q.kind === "scale" ? "grid grid-cols-5" : "flex flex-wrap")}>
                {q.options.map((o) => {
                  const on = answers[q.id]?.includes(o.key) ?? false;
                  return q.kind === "scale" ? (
                    <button
                      key={o.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => choose(q, o.key)}
                      className={cn(
                        "flex min-h-16 flex-col items-center justify-center rounded-2xl border px-1 py-2 text-center text-[11px] font-semibold leading-tight transition sm:text-xs",
                        on ? "border-coral bg-coral/10 text-coral-deep" : "border-line text-ink-soft hover:border-coral/40",
                      )}
                    >
                      <span className={cn("mb-1 size-3 rounded-full border-2", on ? "border-coral bg-coral" : "border-ink-faint/40")} aria-hidden />
                      {o.label}
                    </button>
                  ) : (
                    <button
                      key={o.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => choose(q, o.key)}
                      className={cn(
                        "min-h-11 rounded-2xl border px-4 py-2 text-left text-sm font-medium transition",
                        on ? "border-coral bg-coral/10 text-coral-deep" : "border-line text-ink-soft hover:border-coral/40 hover:text-ink",
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {answers[q.id]?.length ? (
                <button type="button" className="mt-3 text-xs font-semibold text-ink-faint hover:text-ink" onClick={() => { setAnswers((p) => ({ ...p, [q.id]: [] })); setDirty((d) => new Set(d).add(q.id)); }}>
                  Clear answer
                </button>
              ) : null}
            </fieldset>
          </Card>
        ))}
      </motion.div>

      <p className="mt-6 text-center text-xs text-ink-faint">{CHEMISTRY_DISCLAIMER}</p>
      <div className="sticky bottom-24 mt-4 flex justify-between gap-3 md:bottom-4">
        <Button variant="outline" onClick={() => go(-1)} disabled={page === 0 || saving}>
          <ArrowLeft /> Back
        </Button>
        <Button variant={page === sections.length - 1 ? "spark" : "default"} onClick={() => go(1)} loading={saving}>
          {page === sections.length - 1 ? "See my chemistry" : "Next"} <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
