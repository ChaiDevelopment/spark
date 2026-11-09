"use client";

import { useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { PhotoImage } from "@/components/photos";
import { ChemistryBreakdown } from "@/components/chemistry/breakdown";
import { SafetyActions } from "@/components/safety/safety-actions";
import { Badge } from "@/components/ui/primitives";
import { COMMUNICATION_STYLES, DRINKING, EXERCISE, GENDERS, RELATIONSHIP_GOALS, SMOKING, labelFor } from "@/lib/constants";
import type { DiscoveryCard } from "@/server/discovery";

export function PhotoGallery({ photoIds, name }: { photoIds: string[]; name: string }) {
  const [i, setI] = useState(0);
  const count = photoIds.length;
  return (
    <div className="relative overflow-hidden rounded-3xl">
      <PhotoImage photoId={photoIds[i]} alt={`${name}'s photo ${i + 1} of ${Math.max(count, 1)}`} fallbackName={name} className="aspect-[4/5] w-full" />
      {count > 1 && (
        <>
          <div className="absolute inset-x-3 top-3 flex gap-1" aria-hidden>
            {photoIds.map((id, j) => (
              <span key={id} className={`h-1 flex-1 rounded-full ${j === i ? "bg-white" : "bg-white/45"}`} />
            ))}
          </div>
          <button type="button" onClick={() => setI((v) => (v - 1 + count) % count)} className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-soft" aria-label="Previous photo">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => setI((v) => (v + 1) % count)} className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-soft" aria-label="Next photo">
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
    </div>
  );
}

export function ProfileDetails({
  card,
  onRemoved,
  matchId,
  showSafety = true,
}: {
  card: DiscoveryCard;
  onRemoved?: () => void;
  matchId?: string | null;
  showSafety?: boolean;
}) {
  const goal = RELATIONSHIP_GOALS.find((g) => g.value === card.relationshipGoal);
  const facts = [
    labelFor(GENDERS, card.gender),
    card.pronouns,
    labelFor(DRINKING, card.drinking) && `🍹 ${labelFor(DRINKING, card.drinking)}`,
    labelFor(SMOKING, card.smoking) && `🚬 ${labelFor(SMOKING, card.smoking)}`,
    labelFor(EXERCISE, card.exercise) && `💪 ${labelFor(EXERCISE, card.exercise)}`,
    labelFor(COMMUNICATION_STYLES, card.communicationStyle) && `💬 ${labelFor(COMMUNICATION_STYLES, card.communicationStyle)}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <PhotoGallery photoIds={card.photoIds} name={card.displayName} />
      <div>
        <div className="flex flex-wrap items-center gap-2 text-ink-soft">
          {card.isVerified && (
            <Badge tone="mint">
              <BadgeCheck className="size-3.5" /> Verified
            </Badge>
          )}
          {card.city && (
            <span className="inline-flex items-center gap-1 text-sm">
              <MapPin className="size-4" aria-hidden /> {card.city}
              {card.region ? `, ${card.region}` : ""}
            </span>
          )}
        </div>
        {goal && (
          <p className="mt-3 rounded-2xl bg-cream px-4 py-3 text-sm font-semibold">
            {goal.emoji} Looking for: {goal.label}
          </p>
        )}
        {card.bio && <p className="mt-4 whitespace-pre-line leading-relaxed">{card.bio}</p>}
      </div>
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {facts.map((f) => (
            <Badge key={f}>{f}</Badge>
          ))}
        </div>
      )}
      {card.interests.length > 0 && (
        <div>
          <h3 className="mb-2 font-display font-bold">Interests</h3>
          <div className="flex flex-wrap gap-2">
            {card.interests.map((i) => (
              <Badge key={i.id} tone={i.shared ? "coral" : "neutral"}>
                {i.emoji} {i.label}
                {i.shared && <span className="sr-only"> (shared)</span>}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {card.chemistry && (
        <div className="rounded-3xl bg-canvas p-5">
          <ChemistryBreakdown chemistry={card.chemistry} name={card.displayName} />
        </div>
      )}
      {showSafety && <SafetyActions userId={card.id} name={card.displayName} matchId={matchId} onDone={onRemoved} />}
    </div>
  );
}
