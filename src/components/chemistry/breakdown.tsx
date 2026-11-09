import { Info } from "lucide-react";
import { ChemistryRing } from "@/components/brand";
import { CHEMISTRY_DISCLAIMER, dimensionLabel, type Explanation } from "@/lib/chemistry/engine";
import type { ChemistrySummary } from "@/server/chemistry";
import { cn } from "@/lib/utils";

const TONE_STYLE: Record<Explanation["tone"], string> = {
  strong: "bg-mint/15 text-mint-deep",
  good: "bg-coral/10 text-coral-deep",
  mixed: "bg-peach/20 text-[#99501a]",
  different: "bg-lavender/15 text-lavender-deep",
  unknown: "bg-cream text-ink-soft",
};

export function ChemistryBreakdown({ chemistry, name, compact }: { chemistry: ChemistrySummary; name: string; compact?: boolean }) {
  const dims = [...chemistry.dimensions].sort((a, b) => b.weight - a.weight || b.score - a.score);
  const overall = chemistry.explanations.filter((e) => e.dimension === "overall");
  return (
    <section aria-labelledby="chem-title" className="space-y-5">
      <div className="flex items-center gap-4">
        <ChemistryRing score={chemistry.overallScore} size={76} />
        <div>
          <h2 id="chem-title" className="font-display text-xl font-extrabold">Your chemistry with {name}</h2>
          <p className="text-sm text-ink-soft">
            Confidence: {chemistry.confidence >= 0.75 ? "high" : chemistry.confidence >= 0.4 ? "medium" : "early estimate"}
            {chemistry.sharedInterestCount > 0 && ` · ${chemistry.sharedInterestCount} shared interest${chemistry.sharedInterestCount > 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {overall.length > 0 && (
        <ul className="space-y-2">
          {overall.map((e) => (
            <li key={e.text} className={cn("rounded-2xl px-4 py-3 text-sm font-medium", TONE_STYLE[e.tone])}>
              {e.text}
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-4">
        {dims.map((d) => {
          const exp = chemistry.explanations.find((e) => e.dimension === d.dimension);
          return (
            <li key={d.dimension}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-semibold">
                  {dimensionLabel(d.dimension)} <span className="font-normal text-ink-faint">· {Math.round(d.weight * 100)}% weight</span>
                </span>
                <span className="font-display font-bold">{d.coverage < 0.25 ? "—" : `${Math.round(d.score)}%`}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-cream" aria-hidden>
                <div className={cn("h-full rounded-full", d.coverage < 0.25 ? "bg-line" : "bg-spark")} style={{ width: `${d.coverage < 0.25 ? 100 : d.score}%` }} />
              </div>
              {!compact && exp && <p className="mt-1.5 text-sm text-ink-soft">{exp.text.replace(/^[^:]+:\s*/, "")}</p>}
            </li>
          );
        })}
      </ul>
      <p className="flex gap-2 text-xs text-ink-faint">
        <Info className="size-4 shrink-0" aria-hidden /> {CHEMISTRY_DISCLAIMER}
      </p>
    </section>
  );
}
