"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input } from "@/components/ui/primitives";
import { ConfirmDialog, RangeSlider, Switch } from "@/components/ui/overlay";
import { GenderChips } from "@/components/profile/fields";
import { LOCATION_SCOPES } from "@/lib/constants";
import { updateNotificationPrefsAction, savePreferencesAction } from "@/server/actions/profile";

type Prefs = { interestedIn: string[]; minAge: number; maxAge: number; locationScope: "city" | "region" | "country" | "anywhere" };
type Notifs = { newLike: boolean; newMatch: boolean; newMessage: boolean; moderation: boolean };

export function SettingsForms({ preferences, notifications }: { preferences: Prefs; notifications: Notifs }) {
  const [prefs, setPrefs] = useState(preferences);
  const [notifs, setNotifs] = useState(notifications);
  const [saving, setSaving] = useState(false);

  async function savePrefs() {
    setSaving(true);
    const res = await savePreferencesAction(prefs);
    setSaving(false);
    if (res.ok) toast.success("Discovery preferences saved");
    else toast.error(res.error);
  }

  async function toggle(key: keyof Notifs, value: boolean) {
    const next = { ...notifs, [key]: value };
    setNotifs(next);
    const res = await updateNotificationPrefsAction(next);
    if (!res.ok) {
      setNotifs(notifs);
      toast.error(res.error);
    }
  }

  return (
    <>
      <Card className="space-y-5">
        <h2 className="font-display text-lg font-bold">Discovery</h2>
        <div>
          <p id="show-me" className="mb-2 text-sm font-semibold">Show me</p>
          <GenderChips multiple labelledBy="show-me" value={prefs.interestedIn} onChange={(v) => setPrefs({ ...prefs, interestedIn: v })} />
        </div>
        <div>
          <div className="mb-3 flex justify-between text-sm font-semibold">
            <span>Age range</span>
            <span className="text-coral-deep">
              {prefs.minAge} – {prefs.maxAge}
            </span>
          </div>
          <RangeSlider min={18} max={99} minStepsBetweenThumbs={1} value={[prefs.minAge, prefs.maxAge]} onValueChange={([a, b]) => setPrefs({ ...prefs, minAge: a, maxAge: b })} />
        </div>
        <div>
          <p id="distance" className="mb-2 text-sm font-semibold">Distance</p>
          <div role="group" aria-labelledby="distance" className="flex flex-wrap gap-2">
            {LOCATION_SCOPES.map((s) => (
              <Chip key={s.value} selected={prefs.locationScope === s.value} onClick={() => setPrefs({ ...prefs, locationScope: s.value })}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
        <Button onClick={savePrefs} loading={saving} disabled={prefs.interestedIn.length === 0}>
          Save preferences
        </Button>
      </Card>

      <Card>
        <h2 className="mb-2 font-display text-lg font-bold">In-app notifications</h2>
        <ul className="divide-y divide-line">
          {(
            [
              ["newMatch", "New matches"],
              ["newMessage", "New messages"],
              ["newLike", "New likes"],
              ["moderation", "Profile & photo review updates"],
            ] as const
          ).map(([key, label]) => (
            <li key={key} className="flex items-center justify-between py-3">
              <label htmlFor={`n-${key}`} className="font-medium">
                {label}
              </label>
              <Switch id={`n-${key}`} checked={notifs[key]} onCheckedChange={(v) => toggle(key, v)} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-faint">Safety notices are always delivered. Push notifications are coming soon.</p>
      </Card>
    </>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return void toast.error(body.error ?? "Couldn't delete your account.");
    }
    toast.success("Your account has been deleted. Take care 💛");
    router.replace("/");
    router.refresh();
  }

  return (
    <Card className="border-danger/20">
      <h2 className="font-display text-lg font-bold text-danger">Delete account</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Permanently deletes your profile, photos, answers, matches and messages. Safety reports about your account are kept in anonymised form. This
        can&apos;t be undone.
      </p>
      <Button variant="destructive" className="mt-4" onClick={() => setOpen(true)}>
        <Trash2 /> Delete my account
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setConfirm("");
        }}
        title="Delete your account?"
        description='This is permanent. Type "DELETE" to confirm.'
        confirmLabel="Delete forever"
        destructive
        loading={busy}
        onConfirm={() => (confirm === "DELETE" ? remove() : toast.error('Type "DELETE" to confirm.'))}
      >
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" aria-label='Type "DELETE" to confirm' autoComplete="off" />
      </ConfirmDialog>
    </Card>
  );
}
