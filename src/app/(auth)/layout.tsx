import Link from "next/link";
import { Logo } from "@/components/brand";
import { isSupabaseConfigured } from "@/lib/env";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-glow flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-md px-5 pt-6">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        {!isSupabaseConfigured() && (
          <div role="alert" className="mb-6 rounded-2xl border border-peach bg-peach/15 p-4 text-sm text-ink">
            <strong>Setup needed:</strong> Supabase environment variables are missing, so sign-in is disabled. See SUPABASE_SETUP.md.
          </div>
        )}
        {children}
      </main>
      <footer className="px-5 pb-6 text-center text-xs text-ink-faint">
        By continuing you agree to our <Link href="/terms" className="underline">Terms</Link> and{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </footer>
    </div>
  );
}
