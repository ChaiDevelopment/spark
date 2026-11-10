"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/lib/i18n/actions";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/** ID / EN toggle. Placed inside each page header, so it never covers header icons. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(next: "id" | "en") {
    if (next === locale) return;
    start(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-full border border-line bg-white text-xs font-bold",
        pending && "opacity-60",
        className,
      )}
    >
      {(["id", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          aria-pressed={locale === code}
          className={cn(
            "px-3 py-1.5 transition",
            locale === code
              ? "bg-ink text-white"
              : "text-ink-soft hover:bg-cream hover:text-ink",
          )}
        >
          {t(code === "id" ? "lang.id" : "lang.en")}
        </button>
      ))}
    </div>
  );
}
