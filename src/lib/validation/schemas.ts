import { z } from "zod";
import { ageFromDob } from "@/lib/utils";
import { ACCEPTED_IMAGE_TYPES, MAX_MESSAGE_LENGTH, MAX_UPLOAD_BYTES } from "@/lib/constants";

const gender = z.enum(["woman", "man", "non_binary", "other"]);
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(values).nullable());

// ---------------------------------------------------------------- Auth
export const emailSchema = z.email({ error: "Enter a valid email address" }).max(254);
export const passwordSchema = z
  .string()
  .min(8, { error: "Use at least 8 characters" })
  .max(72, { error: "Use at most 72 characters" })
  .regex(/[a-zA-Z]/, { error: "Include at least one letter" })
  .regex(/[0-9]/, { error: "Include at least one number" });

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: "Please accept the Terms and confirm you're 18 or older" }),
});
export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, { error: "Enter your password" }) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: "Passwords don't match", path: ["confirm"] });

// ---------------------------------------------------------------- Profile
export function isAdult(dob: string, today = new Date()): boolean {
  return ageFromDob(dob, today) >= 18;
}

export const dateOfBirthSchema = z.iso
  .date({ error: "Enter a valid date" })
  .refine((d) => isAdult(d), { error: "You must be at least 18 to use SPARK" })
  .refine((d) => ageFromDob(d) <= 100, { error: "Enter a valid date of birth" });

export const basicsSchema = z.object({
  displayName: z.string().trim().min(2, { error: "At least 2 characters" }).max(40),
  pronouns: z.string().trim().max(24).optional().or(z.literal("")),
  gender,
  showGender: z.boolean(),
  dateOfBirth: dateOfBirthSchema,
});

export const locationSchema = z.object({
  city: z.string().trim().min(2, { error: "Enter your city" }).max(60),
  region: z.string().trim().min(2, { error: "Choose your province" }).max(60),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
});

export const preferencesSchema = z
  .object({
    interestedIn: z.array(gender).min(1, { error: "Pick at least one" }),
    minAge: z.number().int().min(18).max(99),
    maxAge: z.number().int().min(18).max(99),
    locationScope: z.enum(["city", "region", "country", "anywhere"]),
  })
  .refine((v) => v.minAge <= v.maxAge, { error: "Minimum age must be below maximum", path: ["maxAge"] });

export const aboutSchema = z.object({
  bio: z.string().trim().max(500, { error: "Keep it under 500 characters" }),
  relationshipGoal: optionalEnum(["long_term", "long_term_open", "short_term_open", "new_friends", "figuring_out"]),
  drinking: optionalEnum(["never", "rarely", "socially", "often"]),
  smoking: optionalEnum(["never", "sometimes", "regularly"]),
  exercise: optionalEnum(["never", "sometimes", "often", "daily"]),
  communicationStyle: optionalEnum(["texter", "caller", "video", "in_person", "mix"]),
});

export const interestsSchema = z.object({
  interestIds: z.array(z.uuid()).min(3, { error: "Pick at least 3" }).max(12, { error: "Pick up to 12" }),
});

export const profileEditSchema = z.object({
  displayName: basicsSchema.shape.displayName,
  pronouns: basicsSchema.shape.pronouns,
  gender,
  showGender: z.boolean(),
  ...locationSchema.shape,
  ...aboutSchema.shape,
});

export const privacySchema = z.object({ isVisible: z.boolean(), showGender: z.boolean() });

export const notificationPrefsSchema = z.object({
  newLike: z.boolean(),
  newMatch: z.boolean(),
  newMessage: z.boolean(),
  moderation: z.boolean(),
});

// ---------------------------------------------------------------- Chemistry
export const chemistryAnswersSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.uuid(), optionKeys: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1).max(5) }))
    .max(100),
  skipped: z.array(z.uuid()).max(100).default([]),
});

// ---------------------------------------------------------------- Discovery / safety
export const targetSchema = z.object({ targetId: z.uuid() });
export const likeSchema = z.object({ targetId: z.uuid(), superLike: z.boolean() });
export const reportSchema = z.object({
  targetId: z.uuid(),
  category: z.enum(["fake_profile", "harassment", "inappropriate_content", "scam", "spam", "underage", "other"], {
    error: "Choose what happened",
  }),
  details: z.string().trim().max(1000),
  contextType: z.enum(["profile", "message", "photo"]),
  contextId: z.uuid().optional(),
  alsoBlock: z.boolean(),
});

// ---------------------------------------------------------------- Chat
export const messageSchema = z.object({
  conversationId: z.uuid(),
  body: z.string().trim().min(1, { error: "Write something first" }).max(MAX_MESSAGE_LENGTH),
  clientId: z.uuid(),
});

// ---------------------------------------------------------------- Photos
export const uploadRequestSchema = z.object({
  contentType: z.enum(ACCEPTED_IMAGE_TYPES, { error: "Use a JPEG, PNG, WebP or AVIF image" }),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, { error: "Images must be 10 MB or smaller" }),
});
export const photoIdSchema = z.object({ photoId: z.uuid() });
export const photoViewSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(60),
  variant: z.enum(["thumb", "main"]),
});
export const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(6) });

// ---------------------------------------------------------------- Admin
export const adminSuspendSchema = z.object({ userId: z.uuid(), suspend: z.boolean(), reason: z.string().trim().max(300).optional() });
export const adminReportSchema = z.object({
  reportId: z.uuid(),
  status: z.enum(["in_review", "actioned", "dismissed"]),
  notes: z.string().trim().max(1000).optional(),
});
export const adminPhotoSchema = z.object({ photoId: z.uuid(), approve: z.boolean(), reason: z.string().trim().max(300).optional() });
export const adminRoleSchema = z.object({ userId: z.uuid(), role: z.enum(["moderator", "admin"]).nullable() });

export const deleteAccountSchema = z.object({ confirm: z.literal("DELETE", { error: 'Type "DELETE" to confirm' }) });
