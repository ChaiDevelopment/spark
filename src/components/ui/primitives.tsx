import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-12 w-full rounded-2xl border border-line bg-white px-4 text-[15px] text-ink shadow-[inset_0_1px_2px_rgb(39_33_43/0.03)] transition placeholder:text-ink-faint focus-visible:border-coral focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-coral/15 disabled:opacity-60 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-28 w-full resize-none rounded-2xl border border-line bg-white px-4 py-3 text-[15px] text-ink transition placeholder:text-ink-faint focus-visible:border-coral focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-coral/15 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-12 w-full appearance-none rounded-2xl border border-line bg-white bg-[length:16px] bg-[right_1rem_center] bg-no-repeat px-4 pr-10 text-[15px] text-ink focus-visible:border-coral focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-coral/15",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235d5361%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-sm font-semibold text-ink", className)} {...props} />;
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-3xl border border-line/70 bg-white p-5 shadow-soft sm:p-6", className)} {...props} />;
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "coral" | "lavender" | "mint" | "peach" | "danger" }) {
  const tones = {
    neutral: "bg-cream text-ink-soft",
    coral: "bg-coral/12 text-coral-deep",
    lavender: "bg-lavender/15 text-lavender-deep",
    mint: "bg-mint/18 text-mint-deep",
    peach: "bg-peach/20 text-[#a3561a]",
    danger: "bg-danger/10 text-danger",
  } as const;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", tones[tone], className)}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-2xl bg-cream", className)} {...props} />;
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-cream", className)}
    >
      <div className="h-full rounded-full bg-spark transition-[width] duration-500 ease-out" style={{ width: `${v}%` }} />
    </div>
  );
}

/** Toggleable pill used for interests, genders and options. */
export function Chip({
  selected,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-95",
        selected ? "border-coral bg-coral/10 text-coral-deep shadow-[0_0_0_3px_rgb(255_100_130/0.12)]" : "border-line bg-white text-ink-soft hover:border-coral/40 hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
