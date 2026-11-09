"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { unblockUserAction } from "@/server/actions/safety";

export function UnblockButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Unblock
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Unblock ${name || "this person"}?`}
        description="You may see each other in Discover again."
        confirmLabel="Unblock"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          const res = await unblockUserAction({ targetId: userId });
          setBusy(false);
          setOpen(false);
          if (!res.ok) return void toast.error(res.error);
          router.refresh();
        }}
      />
    </>
  );
}
