"use client";

import { useMemo } from "react";
import { Chip, Field, NativeSelect } from "@/components/ui/primitives";
import { COMMUNICATION_STYLES, DRINKING, EXERCISE, GENDERS, INDONESIAN_REGIONS, RELATIONSHIP_GOALS, SMOKING } from "@/lib/constants";
import type { InterestOption } from "@/server/profile-data";

export function GenderChips({
  value,
  onChange,
  multiple,
  labelledBy,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  multiple?: boolean;
  labelledBy: string;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {GENDERS.map((g) => {
        const on = value.includes(g.value);
        return (
          <Chip
            key={g.value}
            selected={on}
            onClick={() => onChange(multiple ? (on ? value.filter((x) => x !== g.value) : [...value, g.value]) : [g.value])}
          >
            {g.label}
          </Chip>
        );
      })}
    </div>
  );
}

export function InterestPicker({ options, value, onChange }: { options: InterestOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, InterestOption[]>();
    for (const o of options) m.set(o.category, [...(m.get(o.category) ?? []), o]);
    return [...m.entries()];
  }, [options]);
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else if (value.length < 12) onChange([...value, id]);
  };
  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-ink-soft" aria-live="polite">
        {value.length}/12 selected {value.length < 3 && "· pick at least 3"}
      </p>
      {groups.map(([category, items]) => (
        <fieldset key={category}>
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">{category}</legend>
          <div className="flex flex-wrap gap-2">
            {items.map((o) => (
              <Chip key={o.id} selected={value.includes(o.id)} onClick={() => toggle(o.id)} disabled={!value.includes(o.id) && value.length >= 12}>
                {o.emoji && <span aria-hidden>{o.emoji}</span>} {o.label}
              </Chip>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export interface AboutValues {
  bio: string;
  relationshipGoal: string;
  drinking: string;
  smoking: string;
  exercise: string;
  communicationStyle: string;
}

export function AboutFields({ value, onChange, errors }: { value: AboutValues; onChange: (v: AboutValues) => void; errors?: Partial<Record<keyof AboutValues, string>> }) {
  const set = <K extends keyof AboutValues>(k: K, v: AboutValues[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-5">
      <Field label="About you" htmlFor="bio" error={errors?.bio} hint={`${value.bio.length}/500 — what would make someone smile?`}>
        <textarea
          id="bio"
          maxLength={500}
          value={value.bio}
          onChange={(e) => set("bio", e.target.value)}
          placeholder="Weekend market hunter, terrible at karaoke, great at finding the best bakso in town…"
          className="flex min-h-32 w-full resize-none rounded-2xl border border-line bg-white px-4 py-3 text-[15px] placeholder:text-ink-faint focus-visible:border-coral focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-coral/15"
        />
      </Field>
      <div>
        <p id="goal-label" className="mb-2 text-sm font-semibold">Looking for</p>
        <div role="group" aria-labelledby="goal-label" className="flex flex-wrap gap-2">
          {RELATIONSHIP_GOALS.map((g) => (
            <Chip key={g.value} selected={value.relationshipGoal === g.value} onClick={() => set("relationshipGoal", value.relationshipGoal === g.value ? "" : g.value)}>
              <span aria-hidden>{g.emoji}</span> {g.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["drinking", "Drinking", DRINKING],
            ["smoking", "Smoking", SMOKING],
            ["exercise", "Exercise", EXERCISE],
            ["communicationStyle", "Communication", COMMUNICATION_STYLES],
          ] as const
        ).map(([key, label, list]) => (
          <Field key={key} label={label} htmlFor={key}>
            <NativeSelect id={key} value={value[key]} onChange={(e) => set(key, e.target.value)}>
              <option value="">Prefer not to say</option>
              {list.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ))}
      </div>
    </div>
  );
}

export function RegionSelect({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
      <option value="">Choose your province</option>
      {INDONESIAN_REGIONS.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </NativeSelect>
  );
}
