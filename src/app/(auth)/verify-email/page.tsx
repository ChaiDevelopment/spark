import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { email } = await searchParams;
  return (
    <div className="text-center">
      <div className="mx-auto grid size-20 place-items-center rounded-[1.75rem] bg-mint/20">
        <MailCheck className="size-10 text-mint-deep" aria-hidden />
      </div>
      <h1 className="mt-6 font-display text-3xl font-extrabold">Confirm your email</h1>
      <p className="mt-3 text-ink-soft">
        We sent a confirmation link to{" "}
        <strong className="text-ink">{typeof email === "string" ? email : "your inbox"}</strong>. Open it on this device to continue
        setting up your profile.
      </p>
      <ul className="mt-6 space-y-2 rounded-2xl bg-white p-5 text-left text-sm text-ink-soft shadow-soft">
        <li>• Can&apos;t find it? Check spam or promotions.</li>
        <li>• Links expire after 24 hours.</li>
        <li>• Already confirmed? Just log in.</li>
      </ul>
      <Button asChild className="mt-8" variant="outline">
        <Link href="/login">Go to log in</Link>
      </Button>
    </div>
  );
}
