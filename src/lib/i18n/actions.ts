"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale } from "@/lib/i18n/locale";

/** Remember the language for a year. A cookie, so it works before sign-in too. */
export async function setLocaleAction(value: string): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, parseLocale(value), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
}
