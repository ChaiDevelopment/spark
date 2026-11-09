import { WifiOff } from "lucide-react";
import { Logo } from "@/components/brand";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="bg-glow grid min-h-dvh place-items-center px-5 text-center">
      <div className="max-w-sm">
        <Logo className="mb-10" />
        <div className="mx-auto grid size-20 place-items-center rounded-[1.75rem] bg-cream">
          <WifiOff className="size-10 text-coral" aria-hidden />
        </div>
        <h1 className="mt-6 font-display text-3xl font-extrabold">You&apos;re offline</h1>
        <p className="mt-3 text-ink-soft">SPARK needs a connection to show profiles and messages. We&apos;ll be right here when you&apos;re back online.</p>
        <a href="/discover" className="mt-8 inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">
          Try again
        </a>
      </div>
    </div>
  );
}
