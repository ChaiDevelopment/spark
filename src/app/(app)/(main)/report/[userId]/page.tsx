import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ReportForm } from "@/components/safety/safety-actions";
import { Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export const metadata: Metadata = { title: "Report" };

/**
 * Standalone report flow (deep-linkable from chat messages and notifications).
 * Works even if the reported user is no longer visible to the reporter.
 */
export default async function ReportPage({ params, searchParams }: PageProps<"/report/[userId]">) {
  const viewer = await requireViewer();
  const { userId } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(userId).success || userId === viewer.userId) notFound();
  const messageId = typeof sp.message === "string" && z.uuid().safeParse(sp.message).success ? sp.message : undefined;

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  const name = (data?.display_name as string | undefined) ?? "this person";

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/chat" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Report {name}</h1>
      <p className="mt-2 flex items-start gap-2 text-ink-soft">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-mint-deep" aria-hidden />
        Reports are confidential and reviewed by our moderation team.
      </p>
      <Card className="mt-6">
        <ReportForm userId={userId} name={name} contextType={messageId ? "message" : "profile"} contextId={messageId} />
      </Card>
    </div>
  );
}
