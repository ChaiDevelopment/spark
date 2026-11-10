import { LanguageSwitch } from "@/components/language-switch";
import Link from "next/link";
import { Logo } from "@/components/brand";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <Logo />
        <div className="flex items-center gap-4">
        <LanguageSwitch />
        <nav className="flex gap-4 text-sm font-semibold text-ink-soft">
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/guidelines" className="hover:text-ink">Guidelines</Link>
        </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-20">
        <article className="rounded-[2rem] bg-white p-6 shadow-soft sm:p-10 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-extrabold [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_li]:mt-1 [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-ink-soft [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-ink-soft">
          {children}
        </article>
        <p className="mt-6 text-center text-xs text-ink-faint">
          This document is a product template prepared for MVP testing and must be reviewed by qualified Indonesian legal counsel before public launch.
        </p>
      </main>
    </div>
  );
}
