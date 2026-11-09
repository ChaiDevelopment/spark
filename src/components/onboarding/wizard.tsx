"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Progress } from "@/components/ui/primitives";
import { RangeSlider, Switch } from "@/components/ui/overlay";
import { AboutFields, GenderChips, InterestPicker, RegionSelect, type AboutValues } from "@/components/profile/fields";
import { PhotoManager, type ManagedPhoto } from "@/components/profile/photo-manager";
import { Chip } from "@/components/ui/primitives";
import { LOCATION_SCOPES } from "@/lib/constants";
import { basicsSchema, interestsSchema, locationSchema, preferencesSchema } from "@/lib/validation/schemas";
import {
  completeOnboardingAction,
  saveAboutAction,
  saveBasicsAction,
  saveInterestsAction,
  saveLocationAction,
  savePreferencesAction,
} from "@/server/actions/profile";
import type { InterestOption, OwnPreferences, OwnProfile } from "@/server/profile-data";

const STEPS = ["Basics", "Location", "Looking for", "About you", "Interests", "Photos"] as const;

type Errors = Record<string, string | undefined>;
const firstErrors = (fe: Record<string, string[] | undefined> | undefined): Errors =>
  Object.fromEntries(Object.entries(fe ?? {}).map(([k, v]) => [k, v?.[0]]));

export function OnboardingWizard(props: {
  profile: OwnProfile;
  dateOfBirth: string | null;
  preferences: OwnPreferences;
  interests: InterestOption[];
  myInterestIds: string[];
  photos: ManagedPhoto[];
}) {
  const router = useRouter();
  const { profile } = props;
  const firstIncomplete = (() => {
    if (!props.dateOfBirth || !profile.gender || profile.display_name.length < 2) return 0;
    if (!profile.city) return 1;
    if (!props.preferences.interested_in.length) return 2;
    if (props.myInterestIds.length < 3) return 4;
    if (!props.photos.some((p) => p.status !== "rejected")) return 5;
    return 5;
  })();
  const [step, setStep] = useState(firstIncomplete);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const [basics, setBasics] = useState({
    displayName: profile.display_name,
    pronouns: profile.pronouns ?? "",
    gender: profile.gender ?? "",
    showGender: profile.show_gender,
    dateOfBirth: props.dateOfBirth ?? "",
  });
  const [location, setLocation] = useState({ city: profile.city ?? "", region: profile.region ?? "", countryCode: profile.country_code || "ID" });
  const [prefs, setPrefs] = useState({
    interestedIn: props.preferences.interested_in,
    minAge: props.preferences.min_age,
    maxAge: props.preferences.max_age,
    locationScope: props.preferences.location_scope,
  });
  const [about, setAbout] = useState<AboutValues>({
    bio: profile.bio,
    relationshipGoal: profile.relationship_goal ?? "",
    drinking: profile.drinking ?? "",
    smoking: profile.smoking ?? "",
    exercise: profile.exercise ?? "",
    communicationStyle: profile.communication_style ?? "",
  });
  const [interestIds, setInterestIds] = useState(props.myInterestIds);
  const [photos, setPhotos] = useState(props.photos);

  async function next() {
    setErrors({});
    setBusy(true);
    try {
      let res: { ok: boolean; error?: string; fieldErrors?: Record<string, string[] | undefined> } = { ok: true };
      if (step === 0) {
        const parsed = basicsSchema.safeParse(basics);
        if (!parsed.success) return setErrors(firstErrors(parsed.error.flatten().fieldErrors));
        res = await saveBasicsAction(parsed.data);
      } else if (step === 1) {
        const parsed = locationSchema.safeParse(location);
        if (!parsed.success) return setErrors(firstErrors(parsed.error.flatten().fieldErrors));
        res = await saveLocationAction(parsed.data);
      } else if (step === 2) {
        const parsed = preferencesSchema.safeParse(prefs);
        if (!parsed.success) return setErrors(firstErrors(parsed.error.flatten().fieldErrors));
        res = await savePreferencesAction(parsed.data);
      } else if (step === 3) {
        res = await saveAboutAction(about);
      } else if (step === 4) {
        const parsed = interestsSchema.safeParse({ interestIds });
        if (!parsed.success) return setErrors({ interestIds: parsed.error.issues[0]?.message });
        res = await saveInterestsAction(parsed.data);
      } else if (step === 5) {
        if (!photos.some((p) => p.status !== "rejected")) return setErrors({ photos: "Add at least one photo." });
        const done = await completeOnboardingAction();
        if (!done.ok) {
          const missing = (done.fieldErrors?.missing ?? []) as string[];
          toast.error(missing.length ? `Still missing: ${missing.join(", ").replaceAll("_", " ")}` : done.error);
          return;
        }
        toast.success("You're all set! Let's learn what makes you tick.");
        router.replace("/chemistry?welcome=1");
        router.refresh();
        return;
      }
      if (!res.ok) {
        setErrors(firstErrors(res.fieldErrors));
        toast.error(res.error ?? "Something went wrong");
        return;
      }
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  }

  const today = new Date();
  const maxDob = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span className="text-coral-deep">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="text-ink-faint">{STEPS[step]}</span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} label="Onboarding progress" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
          <Card className="p-6 sm:p-8">
            {step === 0 && (
              <div className="space-y-5">
                <StepTitle title="Let's start with you" sub="Your name and age appear on your profile. Your birthday never does." />
                <Field label="First name" htmlFor="displayName" error={errors.displayName}>
                  <Input id="displayName" autoComplete="given-name" value={basics.displayName} maxLength={40} onChange={(e) => setBasics({ ...basics, displayName: e.target.value })} aria-invalid={!!errors.displayName} />
                </Field>
                <Field
                  label="Date of birth"
                  htmlFor="dob"
                  error={errors.dateOfBirth}
                  hint={props.dateOfBirth ? "Already verified. Contact support to correct it." : "You must be 18 or older. This can't be changed later."}
                >
                  <Input
                    id="dob"
                    type="date"
                    max={maxDob}
                    value={basics.dateOfBirth}
                    disabled={Boolean(props.dateOfBirth)}
                    onChange={(e) => setBasics({ ...basics, dateOfBirth: e.target.value })}
                    aria-invalid={!!errors.dateOfBirth}
                  />
                </Field>
                <div>
                  <p id="gender-label" className="mb-2 text-sm font-semibold">I am a…</p>
                  <GenderChips labelledBy="gender-label" value={basics.gender ? [basics.gender] : []} onChange={(v) => setBasics({ ...basics, gender: v[0] ?? "" })} />
                  {errors.gender && <p className="mt-2 text-sm font-medium text-danger">Choose the option that fits you best.</p>}
                </div>
                <Field label="Pronouns (optional)" htmlFor="pronouns">
                  <Input id="pronouns" value={basics.pronouns} maxLength={24} placeholder="e.g. she/her" onChange={(e) => setBasics({ ...basics, pronouns: e.target.value })} />
                </Field>
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-cream/60 p-4">
                  <span className="text-sm font-medium">Show my gender on my profile</span>
                  <Switch checked={basics.showGender} onCheckedChange={(v) => setBasics({ ...basics, showGender: v })} />
                </label>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <StepTitle title="Where are you based?" sub="We only ever show your city — never your exact location." />
                <Field label="City" htmlFor="city" error={errors.city}>
                  <Input id="city" autoComplete="address-level2" value={location.city} placeholder="e.g. Bandung" onChange={(e) => setLocation({ ...location, city: e.target.value })} aria-invalid={!!errors.city} />
                </Field>
                <Field label="Province" htmlFor="region" error={errors.region}>
                  <RegionSelect id="region" value={location.region} onChange={(region) => setLocation({ ...location, region })} invalid={!!errors.region} />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <StepTitle title="Who would you like to meet?" sub="Pick everyone you're open to. You can change this any time." />
                <div>
                  <p id="interested-label" className="mb-2 text-sm font-semibold">Show me</p>
                  <GenderChips multiple labelledBy="interested-label" value={prefs.interestedIn} onChange={(v) => setPrefs({ ...prefs, interestedIn: v as typeof prefs.interestedIn })} />
                  {errors.interestedIn && <p className="mt-2 text-sm font-medium text-danger">{errors.interestedIn}</p>}
                </div>
                <div>
                  <div className="mb-3 flex justify-between text-sm font-semibold">
                    <span>Age range</span>
                    <span className="text-coral-deep">
                      {prefs.minAge} – {prefs.maxAge}
                    </span>
                  </div>
                  <RangeSlider min={18} max={99} step={1} minStepsBetweenThumbs={1} value={[prefs.minAge, prefs.maxAge]} onValueChange={([a, b]) => setPrefs({ ...prefs, minAge: a, maxAge: b })} />
                </div>
                <div>
                  <p id="scope-label" className="mb-2 text-sm font-semibold">Distance</p>
                  <div role="group" aria-labelledby="scope-label" className="flex flex-wrap gap-2">
                    {LOCATION_SCOPES.map((s) => (
                      <Chip key={s.value} selected={prefs.locationScope === s.value} onClick={() => setPrefs({ ...prefs, locationScope: s.value })}>
                        {s.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <StepTitle title="A little about you" sub="All optional — but profiles with a bio get far more meaningful conversations." />
                <AboutFields value={about} onChange={setAbout} errors={errors} />
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <StepTitle title="What are you into?" sub="Shared interests boost your chemistry and make great openers." />
                {errors.interestIds && <p className="text-sm font-medium text-danger">{errors.interestIds}</p>}
                <InterestPicker options={props.interests} value={interestIds} onChange={setInterestIds} />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-5">
                <StepTitle title="Add your photos" sub="Clear, recent photos of you. At least one is required; three or more is ideal." />
                <PhotoManager initial={photos} onChange={setPhotos} />
                {errors.photos && <p className="text-sm font-medium text-danger">{errors.photos}</p>}
              </div>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
          <ArrowLeft /> Back
        </Button>
        <Button variant={step === STEPS.length - 1 ? "spark" : "default"} size="lg" onClick={next} loading={busy}>
          {step === STEPS.length - 1 ? (
            <>
              <PartyPopper /> Finish
            </>
          ) : (
            <>
              Continue <ArrowRight />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function StepTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-2">
      <h1 className="font-display text-2xl font-extrabold">{title}</h1>
      <p className="mt-1 text-ink-soft">{sub}</p>
    </div>
  );
}
