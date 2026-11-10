"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { translate, type Locale } from "@/lib/i18n/locale";
import type { MessageKey } from "@/lib/i18n/messages";

interface LocaleContextValue {
  locale: Locale;
  t: (key: MessageKey) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "id",
  t: (key) => translate("id", key),
});

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useCallback((key: MessageKey) => translate(locale, key), [locale]);
  const value = useMemo(() => ({ locale, t }), [locale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** `const t = useT(); t("nav.discover")` — the language comes from the cookie. */
export function useT() {
  return useContext(LocaleContext);
}
