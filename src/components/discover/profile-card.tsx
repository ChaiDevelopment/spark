"use client";

import { BadgeCheck, MapPin } from "lucide-react";
import { ChemistryRing } from "@/components/brand";
import { PhotoImage } from "@/components/photos";
import { RELATIONSHIP_GOALS, labelFor } from "@/lib/constants";
import type { DiscoveryCard } from "@/server/discovery";

export function ProfileCard({ card, compact }: { card: DiscoveryCard; compact?: boolean }) {
  const goal = RELATIONSHIP_GOALS.find((g) => g.value === card.relationshipGoal);
  return (
    <article className="relative size-full overflow-hidden rounded-[2rem] bg-white shadow-card">
      <PhotoImage photoId={card.photoIds[0]} alt={`${card.displayName}'s main photo`} fallbackName={card.displayName} className={compact ? "aspect-[4/5] w-full" : "absolute inset-0 size-full"} />
      {!compact && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent" aria-hidden />
          {card.chemistry && (
            <div className="absolute right-4 top-4 rounded-full bg-white/92 p-1 shadow-soft backdrop-blur">
              <ChemistryRing score={card.chemistry.overallScore} size={58} />
            </div>
          )}
          {card.photoIds.length > 1 && (
            <div className="absolute inset-x-4 top-3 flex gap-1" aria-hidden>
              {card.photoIds.map((id, i) => (
                <span key={id} className={`h-1 flex-1 rounded-full ${i === 0 ? "bg-white" : "bg-white/40"}`} />
              ))}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <h2 className="flex items-center gap-2 font-display text-3xl font-extrabold">
              {card.displayName}, <span className="font-semibold">{card.age}</span>
              {card.isVerified && <BadgeCheck className="size-6 text-mint" aria-label="Verified" />}
            </h2>
            {card.city && (
              <p className="mt-1 flex items-center gap-1 text-sm text-white/85">
                <MapPin className="size-4" aria-hidden /> {card.city}
              </p>
            )}
            {goal && (
              <p className="mt-3 inline-flex rounded-full bg-white/18 px-3 py-1 text-xs font-semibold backdrop-blur">
                {goal.emoji} {labelFor(RELATIONSHIP_GOALS, card.relationshipGoal)}
              </p>
            )}
            {card.interests.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {card.interests.slice(0, 4).map((i) => (
                  <span key={i.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${i.shared ? "bg-peach text-ink" : "bg-white/15 backdrop-blur"}`}>
                    {i.emoji} {i.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}
