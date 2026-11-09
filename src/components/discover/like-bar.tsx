"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { likeAction, passAction } from "@/server/actions/discovery";

export function LikeBar({ targetId, name }: { targetId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"like" | "pass" | null>(null);

  async function like() {
    setBusy("like");
    const res = await likeAction({ targetId, superLike: false });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    if (res.data.matched && res.data.conversationId) {
      toast.success(`It's a spark with ${name}! ✨`);
      router.push(`/chat/${res.data.conversationId}`);
    } else {
      toast.success(`You liked ${name}`);
      router.refresh();
    }
  }
  async function pass() {
    setBusy("pass");
    const res = await passAction({ targetId });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    router.push("/discover");
  }

  return (
    <div className="flex gap-3 rounded-full bg-white/90 p-2 shadow-card backdrop-blur">
      <Button variant="outline" size="lg" onClick={pass} loading={busy === "pass"} disabled={busy !== null}>
        <X /> Pass
      </Button>
      <Button variant="spark" size="lg" onClick={like} loading={busy === "like"} disabled={busy !== null}>
        <Heart className="fill-ink" /> Like
      </Button>
    </div>
  );
}
