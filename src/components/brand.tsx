import Link from "next/link";
import { cn } from "@/lib/utils";

/** SPARK wordmark: a four-point spark glyph + Plus Jakarta Sans wordmark. */
export function SparkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="spark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF6482" />
          <stop offset="0.55" stopColor="#FF8A73" />
          <stop offset="1" stopColor="#FFB36B" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill="url(#spark-g)" />
      <path d="M16 6.5c.9 4.6 3 6.7 9.5 9.5-6.5 2.8-8.6 4.9-9.5 9.5-.9-4.6-3-6.7-9.5-9.5 6.5-2.8 8.6-4.9 9.5-9.5Z" fill="#27212B" />
      <circle cx="24.5" cy="8" r="1.8" fill="#fff" opacity=".9" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-xl", className)} aria-label="SPARK home">
      <SparkMark />
      <span className="font-display text-xl font-extrabold tracking-tight">spark</span>
    </Link>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <div className="relative mb-6 grid size-24 place-items-center rounded-[2rem] bg-cream text-coral">
        <span className="absolute -right-1 -top-1 size-5 rounded-full bg-peach/70" aria-hidden />
        <span className="absolute -bottom-2 -left-2 size-4 rounded-full bg-lavender/60" aria-hidden />
        <span className="[&_svg]:size-10">{icon}</span>
      </div>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {children ? <div className="mt-2 max-w-sm text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-ink-soft">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Circular chemistry score. */
export function ChemistryRing({ score, size = 64, className }: { score: number; size?: number; className?: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF6482" />
            <stop offset="1" stopColor="#A88AF5" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#FFF0E7" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="url(#ring-g)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="relative font-display text-sm font-extrabold" aria-label={`Chemistry ${Math.round(pct)} percent`}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}
