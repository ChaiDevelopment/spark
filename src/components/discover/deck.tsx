"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { toast } from "sonner";
import { Clock, EyeOff, FlaskConical, Heart, RefreshCw, SearchX, Star, X } from "lucide-react";
import { EmptyState } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { ProfileCard } from "@/components/discover/profile-card";
import { ProfileDetails } from "@/components/discover/profile-details";
import { usePhotoUrls } from "@/components/photos";
import { likeAction, loadDeckAction, passAction, type LikeOutcome } from "@/server/actions/discovery";
import type { DiscoveryCard } from "@/server/discovery";

interface Usage {
  likesUsed: number;
  likesLimit: number;
  superUsed: number;
  superLimit: number;
}

export function DiscoverDeck({
  initialCards,
  usage: initialUsage,
  needsChemistry,
  hidden,
  photoPending,
}: {
  initialCards: DiscoveryCard[];
  usage: Usage;
  needsChemistry: boolean;
  hidden: boolean;
  photoPending: boolean;
}) {
  const [cards, setCards] = useState(initialCards);
  const [usage, setUsage] = useState(initialUsage);
  const [details, setDetails] = useState<DiscoveryCard | null>(null);
  const [match, setMatch] = useState<{ card: DiscoveryCard; outcome: LikeOutcome } | null>(null);
  const [exitDir, setExitDir] = useState<1 | -1>(1);
  const [loading, startLoading] = useTransition();
  const [acting, setActing] = useState(false);

  // Prefetch the next two cards' photos.
  usePhotoUrls(cards.slice(0, 3).flatMap((c) => c.photoIds.slice(0, 1)));

  const top = cards[0];
  const likesLeft = Math.max(0, usage.likesLimit - usage.likesUsed);

  const refill = useCallback(() => {
    startLoading(async () => {
      const res = await loadDeckAction();
      if (!res.ok) return void toast.error(res.error);
      setCards(res.data);
    });
  }, []);

  async function act(kind: "like" | "super" | "pass", card = top) {
    if (!card || acting) return;
    if (kind === "like" && likesLeft <= 0) return void toast.info("You've used today's likes. They reset at midnight (WIB).");
    if (kind === "super" && usage.superUsed >= usage.superLimit) return void toast.info("You've used today's Super Like.");
    setActing(true);
    setExitDir(kind === "pass" ? -1 : 1);
    const remaining = cards.filter((c) => c.id !== card.id);
    setCards(remaining);
    setDetails(null);
    try {
      if (kind === "pass") {
        const res = await passAction({ targetId: card.id });
        if (!res.ok) toast.error(res.error);
      } else {
        const res = await likeAction({ targetId: card.id, superLike: kind === "super" });
        if (!res.ok) {
          toast.error(res.error);
        } else {
          setUsage((u) => (kind === "super" ? { ...u, superUsed: u.superUsed + 1 } : { ...u, likesUsed: u.likesUsed + 1 }));
          if (res.data.matched) setMatch({ card, outcome: res.data });
        }
      }
    } finally {
      setActing(false);
      if (remaining.length === 0) refill();
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold">Discover</h1>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink-soft shadow-soft" aria-live="polite">
          <Heart className="mr-1 inline size-3.5 fill-coral text-coral" aria-hidden />
          {likesLeft} likes left today
        </span>
      </div>

      {(hidden || photoPending || needsChemistry) && (
        <div className="mb-4 space-y-2">
          {hidden && (
            <Notice icon={<EyeOff />} href="/settings/privacy" cta="Change">
              Your profile is paused — others can&apos;t see you.
            </Notice>
          )}
          {photoPending && (
            <Notice icon={<Clock />} href="/me/edit" cta="Photos">
              Your photos are in review. You&apos;ll appear in Discover once one is approved.
            </Notice>
          )}
          {needsChemistry && (
            <Notice icon={<FlaskConical />} href="/chemistry" cta="Answer">
              Answer the chemistry questions for more accurate scores.
            </Notice>
          )}
        </div>
      )}

      <div className="relative h-[min(68dvh,600px)] w-full">
        <AnimatePresence custom={exitDir}>
          {cards
            .slice(0, 2)
            .reverse()
            .map((card) => (
              <SwipeCard key={card.id} card={card} isTop={card.id === top?.id} exitDir={exitDir} onSwipe={(dir) => act(dir === 1 ? "like" : "pass", card)} onOpen={() => setDetails(card)} />
            ))}
        </AnimatePresence>
        {!top && (
          <div className="absolute inset-0 grid place-items-center rounded-[2rem] border border-dashed border-line bg-white/60">
            {loading ? (
              <RefreshCw className="size-8 animate-spin text-coral" aria-label="Loading" />
            ) : (
              <EmptyState
                icon={<SearchX />}
                title="You're all caught up"
                action={
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" onClick={refill}>
                      <RefreshCw /> Check again
                    </Button>
                    <Button asChild>
                      <Link href="/settings">Widen preferences</Link>
                    </Button>
                  </div>
                }
              >
                No one new matches your preferences right now. New people join every day.
              </EmptyState>
            )}
          </div>
        )}
      </div>

      {top && (
        <div className="mt-5 flex items-center justify-center gap-5" role="group" aria-label="Actions">
          <ActionButton label={`Pass on ${top.displayName}`} onClick={() => act("pass")} disabled={acting} className="size-16 bg-white text-ink-soft">
            <X className="size-7" />
          </ActionButton>
          <ActionButton label={`Super like ${top.displayName}`} onClick={() => act("super")} disabled={acting || usage.superUsed >= usage.superLimit} className="size-12 bg-white text-lavender-deep">
            <Star className="size-5 fill-lavender text-lavender-deep" />
          </ActionButton>
          <ActionButton label={`Like ${top.displayName}`} onClick={() => act("like")} disabled={acting || likesLeft <= 0} className="size-16 bg-spark text-ink">
            <Heart className="size-7 fill-ink" />
          </ActionButton>
        </div>
      )}
      <p className="mt-3 text-center text-xs text-ink-faint">Swipe right to like, left to pass, or tap a card for more.</p>

      <Dialog open={details !== null} onOpenChange={(o) => !o && setDetails(null)}>
        {details && (
          <DialogContent title={`${details.displayName}, ${details.age}`} className="sm:max-w-lg">
            <ProfileDetails card={details} onRemoved={() => setCards((c) => c.filter((x) => x.id !== details.id))} />
            <div className="sticky bottom-0 -mx-6 mt-6 flex justify-center gap-4 bg-gradient-to-t from-white via-white to-transparent px-6 pt-4">
              <Button variant="outline" size="lg" onClick={() => act("pass", details)}>
                <X /> Pass
              </Button>
              <Button variant="spark" size="lg" onClick={() => act("like", details)}>
                <Heart className="fill-ink" /> Like
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={match !== null} onOpenChange={(o) => !o && setMatch(null)}>
        {match && (
          <DialogContent title="It's a spark! ✨" description={`You and ${match.card.displayName} like each other.`} className="text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto my-4 w-40 overflow-hidden rounded-3xl shadow-card">
              <ProfileCard card={match.card} compact />
            </motion.div>
            {match.card.chemistry && <p className="text-sm text-ink-soft">{match.card.chemistry.explanations.find((e) => e.dimension === "overall")?.text}</p>}
            <div className="mt-6 flex flex-col gap-3">
              {match.outcome.conversationId && (
                <Button variant="spark" size="lg" asChild>
                  <Link href={`/chat/${match.outcome.conversationId}`}>Say hello</Link>
                </Button>
              )}
              <Button variant="ghost" onClick={() => setMatch(null)}>
                Keep discovering
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Notice({ icon, children, href, cta }: { icon: React.ReactNode; children: React.ReactNode; href: string; cta: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-soft [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-coral">
      {icon}
      <p className="flex-1 text-ink-soft">{children}</p>
      <Link href={href} className="font-semibold text-coral-deep hover:underline">
        {cta}
      </Link>
    </div>
  );
}

function ActionButton({ label, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.06 }}
      aria-label={label}
      className={`grid place-items-center rounded-full shadow-card transition disabled:opacity-40 ${className}`}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {children}
    </motion.button>
  );
}

function SwipeCard({
  card,
  isTop,
  exitDir,
  onSwipe,
  onOpen,
}: {
  card: DiscoveryCard;
  isTop: boolean;
  exitDir: 1 | -1;
  onSwipe: (dir: 1 | -1) => void;
  onOpen: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const likeOpacity = useTransform(x, [30, 140], [0, 1]);
  const passOpacity = useTransform(x, [-140, -30], [1, 0]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > 120 || info.velocity.x > 600) onSwipe(1);
    else if (info.offset.x < -120 || info.velocity.x < -600) onSwipe(-1);
  }

  return (
    <motion.div
      className="absolute inset-0"
      style={{ x, rotate, zIndex: isTop ? 2 : 1 }}
      drag={isTop ? "x" : false}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      initial={{ scale: 0.95, opacity: 0, y: 12 }}
      animate={{ scale: isTop ? 1 : 0.95, opacity: 1, y: isTop ? 0 : 12 }}
      exit={{ x: exitDir * 520, opacity: 0, rotate: exitDir * 18, transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <button type="button" onClick={onOpen} className="block size-full text-left" aria-label={`View ${card.displayName}'s profile`} tabIndex={isTop ? 0 : -1}>
        <ProfileCard card={card} />
      </button>
      {isTop && (
        <>
          <motion.span style={{ opacity: likeOpacity }} className="pointer-events-none absolute left-6 top-8 -rotate-12 rounded-2xl border-4 border-mint px-4 py-1 font-display text-3xl font-extrabold text-mint" aria-hidden>
            LIKE
          </motion.span>
          <motion.span style={{ opacity: passOpacity }} className="pointer-events-none absolute right-6 top-8 rotate-12 rounded-2xl border-4 border-coral px-4 py-1 font-display text-3xl font-extrabold text-coral" aria-hidden>
            PASS
          </motion.span>
        </>
      )}
    </motion.div>
  );
}
