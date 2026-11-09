"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlay";
import { AboutFields, GenderChips, InterestPicker, RegionSelect, type AboutValues } from "@/components/profile/fields";
import { PhotoManager, type ManagedPhoto } from "@/components/profile/photo-manager";
import { profileEditSchema } from "@/lib/validation/schemas";
import { saveInterestsAction, updateProfileAction } from "@/server/actions/profile";
import type { InterestOption, OwnProfile } from "@/server/profile-data";

export function EditProfileForm(props: { profile: OwnProfile; interests: InterestOption[]; myInterestIds: string[]; photos: ManagedPhoto[]; dateOfBirth: string | null }) {
  const router = useRouter();
  const p = props.profile;
  const [basics, setBasics] = useState({ displayName: p.display_name, pronouns: p.pronouns ?? "", gender: p.gender ?? "", showGender: p.show_gender, city: p.city ?? "", region: p.region ?? "", countryCode: p.country_code });
  const [about, setAbout] = useState<AboutValues>({
    bio: p.bio,
    relationshipGoal: p.relationship_goal ?? "",
    drinking: p.drinking ?? "",
    smoking: p.smoking ?? "",
    exercise: p.exercise ?? "",
    communicationStyle: p.communication_style ?? "",
  });
  const [interestIds, setInterestIds] = useState(props.myInterestIds);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setErrors({});
    const parsed = profileEditSchema.safeParse({ ...basics, ...about });
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0]])));
      return void toast.error("Please fix the highlighted fields.");
    }
    if (interestIds.length < 3) return void toast.error("Pick at least 3 interests.");
    setSaving(true);
    const [a, b] = await Promise.all([updateProfileAction(parsed.data), saveInterestsAction({ interestIds })]);
    setSaving(false);
    if (!a.ok) return void toast.error(a.error);
    if (!b.ok) return void toast.error(b.error);
    toast.success("Profile saved");
    router.push("/me");
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-8">
      <Card>
        <h2 className="mb-4 font-display text-lg font-bold">Photos</h2>
        <PhotoManager initial={props.photos} />
      </Card>
      <Card className="space-y-5">
        <h2 className="font-display text-lg font-bold">Basics</h2>
        <Field label="First name" htmlFor="displayName" error={errors.displayName}>
          <Input id="displayName" value={basics.displayName} maxLength={40} onChange={(e) => setBasics({ ...basics, displayName: e.target.value })} />
        </Field>
        <Field label="Date of birth" htmlFor="dob" hint="Your birthday is never shown. To correct it, contact support.">
          <Input id="dob" type="date" value={props.dateOfBirth ?? ""} disabled />
        </Field>
        <div>
          <p id="edit-gender" className="mb-2 text-sm font-semibold">Gender</p>
          <GenderChips labelledBy="edit-gender" value={basics.gender ? [basics.gender] : []} onChange={(v) => setBasics({ ...basics, gender: v[0] ?? "" })} />
        </div>
        <label className="flex items-center justify-between gap-4 rounded-2xl bg-cream/60 p-4">
          <span className="text-sm font-medium">Show my gender on my profile</span>
          <Switch checked={basics.showGender} onCheckedChange={(v) => setBasics({ ...basics, showGender: v })} />
        </label>
        <Field label="Pronouns" htmlFor="pronouns">
          <Input id="pronouns" value={basics.pronouns} maxLength={24} onChange={(e) => setBasics({ ...basics, pronouns: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="city" error={errors.city}>
            <Input id="city" value={basics.city} onChange={(e) => setBasics({ ...basics, city: e.target.value })} />
          </Field>
          <Field label="Province" htmlFor="region" error={errors.region}>
            <RegionSelect id="region" value={basics.region} onChange={(region) => setBasics({ ...basics, region })} />
          </Field>
        </div>
      </Card>
      <Card>
        <h2 className="mb-4 font-display text-lg font-bold">About</h2>
        <AboutFields value={about} onChange={setAbout} errors={errors} />
      </Card>
      <Card>
        <h2 className="mb-4 font-display text-lg font-bold">Interests</h2>
        <InterestPicker options={props.interests} value={interestIds} onChange={setInterestIds} />
      </Card>
      <div className="sticky bottom-24 z-10 flex justify-end md:bottom-4">
        <Button size="lg" variant="spark" onClick={save} loading={saving} className="shadow-card">
          Save changes
        </Button>
      </div>
    </div>
  );
}
