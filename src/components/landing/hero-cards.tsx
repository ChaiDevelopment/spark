"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Heart, MapPin, X } from "lucide-react";
import { ChemistryRing } from "@/components/brand";

/**
 * Decorative product illustration. Abstract shapes only — no real or fake
 * people, names, or statistics.
 */
export function HeroCards() {
  const reduce = useReducedMotion();
  const float = (delay: number) =>
    reduce ? {} : { animate: { y: [0, -10, 0] }, transition: { duration: 6, repeat: Infinity, ease: "easeInOut" as const, delay } };

  return (
    <div className="relative mx-auto h-[440px] w-full max-w-sm sm:h-[500px]" aria-hidden>
      <motion.div {...float(0.6)} className="absolute left-0 top-10 h-80 w-56 -rotate-6 rounded-[2rem] bg-gradient-to-br from-lavender/70 to-mint/60 shadow-card" />
      <motion.div {...float(0)} className="absolute right-0 top-0 w-72 rotate-3 overflow-hidden rounded-[2rem] bg-white shadow-card sm:w-80">
        <div className="relative h-72 bg-gradient-to-br from-coral via-[#ff8a73] to-peach sm:h-80">
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full opacity-90">
            <circle cx="100" cy="86" r="34" fill="#FFF0E7" />
            <path d="M40 200c4-44 30-66 60-66s56 22 60 66Z" fill="#FFF0E7" />
          </svg>
          <div className="absolute right-4 top-4 rounded-full bg-white/90 p-1.5 shadow-soft">
            <ChemistryRing score={86} size={60} />
          </div>
        </div>
        <div className="p-5">
          <div className="h-4 w-32 rounded-full bg-ink/85" />
          <p className="mt-3 flex items-center gap-1 text-sm text-ink-soft">
            <MapPin className="size-4" /> Your city
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["☕ Coffee", "🥾 Hiking", "📚 Reading"].map((t) => (
              <span key={t} className="rounded-full bg-coral/10 px-3 py-1 text-xs font-semibold text-coral-deep">
                {t}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-5">
        <span className="grid size-16 place-items-center rounded-full bg-white shadow-card">
          <X className="size-7 text-ink-soft" />
        </span>
        <motion.span
          animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="grid size-16 place-items-center rounded-full bg-spark shadow-card"
        >
          <Heart className="size-7 fill-ink text-ink" />
        </motion.span>
      </div>
    </div>
  );
}
