export const GENDERS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non_binary", label: "Non-binary" },
  { value: "other", label: "Another identity" },
] as const;
export type Gender = (typeof GENDERS)[number]["value"];

export const RELATIONSHIP_GOALS = [
  { value: "long_term", label: "Long-term partner", emoji: "💞" },
  { value: "long_term_open", label: "Long-term, open to short", emoji: "🌱" },
  { value: "short_term_open", label: "Short-term, open to long", emoji: "✨" },
  { value: "new_friends", label: "New friends", emoji: "🤝" },
  { value: "figuring_out", label: "Still figuring it out", emoji: "🧭" },
] as const;

export const DRINKING = [
  { value: "never", label: "Don't drink" },
  { value: "rarely", label: "Rarely" },
  { value: "socially", label: "Socially" },
  { value: "often", label: "Regularly" },
] as const;
export const SMOKING = [
  { value: "never", label: "Non-smoker" },
  { value: "sometimes", label: "Sometimes" },
  { value: "regularly", label: "Smoker" },
] as const;
export const EXERCISE = [
  { value: "never", label: "Rarely" },
  { value: "sometimes", label: "Sometimes" },
  { value: "often", label: "Often" },
  { value: "daily", label: "Every day" },
] as const;
export const COMMUNICATION_STYLES = [
  { value: "texter", label: "Big texter" },
  { value: "caller", label: "Phone caller" },
  { value: "video", label: "Video chatter" },
  { value: "in_person", label: "Better in person" },
  { value: "mix", label: "A bit of everything" },
] as const;
export const LOCATION_SCOPES = [
  { value: "city", label: "My city" },
  { value: "region", label: "My province" },
  { value: "country", label: "My country" },
  { value: "anywhere", label: "Anywhere" },
] as const;

export const REPORT_CATEGORIES = [
  { value: "fake_profile", label: "Fake profile", hint: "Using someone else's photos or identity" },
  { value: "harassment", label: "Harassment", hint: "Threats, bullying or unwanted sexual messages" },
  { value: "inappropriate_content", label: "Inappropriate content", hint: "Nudity, violence or hate" },
  { value: "scam", label: "Scam", hint: "Asking for money, crypto or investments" },
  { value: "spam", label: "Spam", hint: "Ads, links or repeated messages" },
  { value: "underage", label: "Underage concern", hint: "This person may be under 18" },
  { value: "other", label: "Something else", hint: "Tell us what happened" },
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];

export const INDONESIAN_REGIONS = [
  "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau", "Jambi", "Sumatera Selatan",
  "Kepulauan Bangka Belitung", "Bengkulu", "Lampung", "DKI Jakarta", "Jawa Barat", "Banten", "Jawa Tengah",
  "DI Yogyakarta", "Jawa Timur", "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat",
  "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara", "Sulawesi Utara",
  "Gorontalo", "Sulawesi Tengah", "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tenggara", "Maluku",
  "Maluku Utara", "Papua", "Papua Barat", "Papua Selatan", "Papua Tengah", "Papua Pegunungan", "Papua Barat Daya",
] as const;

export const MAX_PHOTOS = 6;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const MESSAGE_PAGE_SIZE = 30;
export const MAX_MESSAGE_LENGTH = 2000;

export function labelFor<T extends readonly { value: string; label: string }[]>(list: T, value: string | null | undefined) {
  return list.find((x) => x.value === value)?.label ?? null;
}

export const PHOTO_REJECT_REASONS = [
  { value: "face_not_visible", label: "Face isn't clearly visible" },
  { value: "not_a_person", label: "Not a photo of a person" },
  { value: "inappropriate", label: "Nudity, violence or hateful content" },
  { value: "looks_underage", label: "Person may be under 18" },
  { value: "other", label: "Other (add a note)" },
] as const;
export type PhotoRejectReason = (typeof PHOTO_REJECT_REASONS)[number]["value"];

export const SUSPEND_DAY_OPTIONS = [1, 3, 7, 14, 30, 90] as const;
