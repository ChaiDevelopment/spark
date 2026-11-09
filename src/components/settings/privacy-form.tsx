"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlay";
import { updatePrivacyAction } from "@/server/actions/profile";

export function PrivacyForm({ isVisible, showGender }: { isVisible: boolean; showGender: boolean }) {
  const [state, setState] = useState({ isVisible, showGender });

  async function update(next: typeof state) {
    const prev = state;
    setState(next);
    const res = await updatePrivacyAction(next);
    if (!res.ok) {
      setState(prev);
      toast.error(res.error);
    } else toast.success("Saved");
  }

  return (
    <Card className="divide-y divide-line p-0">
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <label htmlFor="visible" className="font-semibold">
            Show me in Discover
          </label>
          <p className="mt-1 text-sm text-ink-soft">Turn off to pause your profile. Your existing matches and chats stay open.</p>
        </div>
        <Switch id="visible" checked={state.isVisible} onCheckedChange={(v) => update({ ...state, isVisible: v })} />
      </div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <label htmlFor="gender" className="font-semibold">
            Show my gender
          </label>
          <p className="mt-1 text-sm text-ink-soft">Your gender is still used for matching preferences.</p>
        </div>
        <Switch id="gender" checked={state.showGender} onCheckedChange={(v) => update({ ...state, showGender: v })} />
      </div>
    </Card>
  );
}
