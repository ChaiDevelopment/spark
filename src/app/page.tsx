import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Ban, Flag, Heart, Lock, MessageCircleHeart, ShieldCheck, Sparkles } from "lucide-react";
import { Logo, SparkMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { HeroCards } from "@/components/landing/hero-cards";
import { DIMENSION_WEIGHTS, dimensionLabel, DIMENSIONS } from "@/lib/chemistry/engine";
import { isSupabaseConfigured } from "@/lib/env";
import { getViewer } from "@/server/auth";

const DIMENSION_BLURB: Record<(typeof DIMENSIONS)[number], string> = {
  personality: "How you recharge, plan and handle surprises.",
  communication: "Texting rhythm, conflict style, how you show care.",
  lifestyle: "Weekends, routines, habits you live with daily.",
  interests: "The things you'd happily do together.",
  values: "Family, money, ambition, the big stuff.",
  expectations: "What you're looking for, and at what pace.",
};

export default async function LandingPage() {
  if (isSupabaseConfigured()) {
    const viewer = await getViewer();
    if (viewer?.profile) redirect(viewer.profile.onboarding_completed_at ? "/discover" : "/onboarding");
  }

  return (
    <div className="bg-glow min-h-dvh overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/signup">Join SPARK</Link>
          </Button>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-coral-deep shadow-soft">
              <Sparkles className="size-4" aria-hidden /> Dating built on chemistry, not just photos
            </p>
            <h1 className="font-display text-[2.75rem] font-extrabold leading-[1.02] sm:text-6xl lg:text-7xl">
              Meet <span className="text-spark">beyond</span>
              <br /> the swipe.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              SPARK looks at how you think, talk and live — then shows you why you click. Real people, real conversations, and safety
              built in from day one.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" variant="spark" asChild>
                <Link href="/signup">
                  <Heart className="fill-ink" aria-hidden /> Create your profile
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-ink-faint">Free to join · 18+ only · Made for Indonesia 🇮🇩</p>
          </div>
          <HeroCards />
        </section>

        {/* Chemistry */}
        <section className="border-y border-line/70 bg-white/70 py-20 backdrop-blur">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Chemistry you can actually read.</h2>
              <p className="mt-3 text-lg text-ink-soft">
                Answer 42 quick questions. SPARK compares six dimensions and explains where you align — and what&apos;s worth a
                conversation. No black box, no paid AI, and never a promise it will work out.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {DIMENSIONS.map((d, i) => (
                <div key={d} className="rounded-3xl border border-line/80 bg-canvas p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-bold">{dimensionLabel(d)}</h3>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold",
                        ["bg-coral/12 text-coral-deep", "bg-lavender/15 text-lavender-deep", "bg-mint/18 text-mint-deep"][i % 3],
                      ].join(" ")}
                    >
                      {Math.round(DIMENSION_WEIGHTS[d] * 100)}%
                    </span>
                  </div>
                  <p className="mt-2 text-ink-soft">{DIMENSION_BLURB[d]}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">How SPARK works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { icon: <SparkMark className="size-10" />, t: "Build your profile", d: "Photos, interests, and what you're really looking for." },
              { icon: <Heart className="size-10 text-coral" />, t: "Discover with context", d: "Every profile shows your chemistry and shared interests." },
              { icon: <MessageCircleHeart className="size-10 text-lavender-deep" />, t: "Match and talk", d: "When it's mutual, chat instantly — in real time." },
            ].map((s, i) => (
              <li key={s.t} className="relative rounded-3xl bg-white p-7 shadow-soft">
                <span className="absolute right-6 top-6 font-display text-5xl font-extrabold text-cream">{i + 1}</span>
                {s.icon}
                <h3 className="mt-5 font-display text-xl font-bold">{s.t}</h3>
                <p className="mt-2 text-ink-soft">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Safety */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <div className="grid gap-10 rounded-[2.5rem] bg-ink p-8 text-white sm:p-12 lg:grid-cols-2">
            <div>
              <ShieldCheck className="size-10 text-mint" aria-hidden />
              <h2 className="mt-5 font-display text-3xl font-extrabold">Safety isn&apos;t a feature. It&apos;s the foundation.</h2>
              <p className="mt-3 text-white/75">
                Adults only, with age checked on our servers. Every photo is reviewed. Your exact location is never shared — only your
                city.
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                { i: <Lock />, t: "Private photos", d: "Stored privately, shown only through expiring links." },
                { i: <Ban />, t: "One-tap block", d: "Blocking ends the match and hides you both, instantly." },
                { i: <Flag />, t: "Real reports", d: "Reports go to a human moderation queue." },
                { i: <BadgeCheck />, t: "Photo review", d: "Photos are checked before others can see them." },
              ].map((x) => (
                <li key={x.t} className="rounded-3xl bg-white/7 p-5 [&_svg]:size-6 [&_svg]:text-peach">
                  {x.i}
                  <p className="mt-3 font-semibold">{x.t}</p>
                  <p className="mt-1 text-sm text-white/70">{x.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70 bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/guidelines" className="hover:text-ink">Community guidelines</Link>
          </nav>
          <p>© {new Date().getFullYear()} SPARK</p>
        </div>
      </footer>
    </div>
  );
}
