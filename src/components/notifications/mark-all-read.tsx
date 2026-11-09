"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "@/server/actions/safety";

export function MarkAllRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await markNotificationsReadAction({ ids: null });
          if (!res.ok) return void toast.error(res.error);
          router.refresh();
        })
      }
    >
      <CheckCheck /> Mark all read
    </Button>
  );
}
