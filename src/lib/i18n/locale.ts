import { en, id, type MessageKey } from "@/lib/i18n/messages";

export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_COOKIE = "spark_lang";

export function parseLocale(value: string | null | undefined): Locale {
  return value === "en" || value === "id" ? value : DEFAULT_LOCALE;
}

export function translate(locale: Locale, key: MessageKey): string {
  return (locale === "en" ? en : id)[key];
}
