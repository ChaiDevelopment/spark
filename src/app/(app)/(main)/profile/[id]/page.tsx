import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { ProfileDetails } from "@/components/discover/profile-details";
import { LikeBar } from "@/components/discover/like-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { requireViewer } from "@/server/auth";
import { loadProfileCard } from "@/server/profile-card";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ params }: PageProps<"/profile/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  if (id === viewer.userId) redirect("/me");
  const result = await loadProfileCard(viewer.userId, id);
  if (!result) notFound();
  const { card, matchId, conversationId, likedByMe } = result;

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/discover" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="mb-4 font-display text-3xl font-extrabold">
        {card.displayName}, <span className="font-semibold">{card.age}</span>
      </h1>
      <Card className="p-4 sm:p-6">
        <ProfileDetails card={card} matchId={matchId} />
      </Card>
      <div className="sticky bottom-24 mt-4 flex justify-center md:bottom-6">
        {conversationId ? (
          <Button variant="spark" size="lg" asChild>
            <Link href={`/chat/${conversationId}`}>
              <MessageCircle /> Message {card.displayName}
            </Link>
          </Button>
        ) : likedByMe ? (
          <p className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-soft shadow-soft">You liked {card.displayName} 💛</p>
        ) : (
          <LikeBar targetId={card.id} name={card.displayName} />
        )}
      </div>
    </div>
  );
}
