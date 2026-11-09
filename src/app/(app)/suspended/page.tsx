import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { requireViewer } from "@/server/auth";

export const metadata: Metadata = { title: "Account suspended" };

export default async function SuspendedPage() {
  const viewer = await requireViewer({ allowIncomplete: true, allowSuspended: true });
  if (viewer.profile.account_status === "active") redirect("/discover");
  return (
    <div className="bg-glow grid min-h-dvh place-items-center px-5">
      <div className="max-w-md text-center">
        <Logo className="mb-10" />
        <div className="mx-auto grid size-20 place-items-center rounded-[1.75rem] bg-danger/10">
          <ShieldAlert className="size-10 text-danger" aria-hidden />
        </div>
        <h1 className="mt-6 font-display text-3xl font-extrabold">Your account is suspended</h1>
        <p className="mt-3 text-ink-soft">
          Our moderation team found activity that goes against our{" "}
          <Link href="/guidelines" className="font-semibold underline">
            Community Guidelines
          </Link>
          . While suspended, your profile is hidden and you can&apos;t like or message anyone.
        </p>
        {viewer.profile.suspended_reason && <p className="mt-4 rounded-2xl bg-white p-4 text-sm shadow-soft">Reason: {viewer.profile.suspended_reason}</p>}
        <p className="mt-4 text-sm text-ink-faint">If you think this is a mistake, reply to the email associated with your account to appeal.</p>
        <form action="/auth/signout" method="post" className="mt-8">
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
