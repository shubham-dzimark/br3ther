/**
 * Client-safe locale constants. Kept out of i18n.ts because that module is
 * server-only (it reads cookies and headers), and the footer switcher is a
 * client component.
 */
export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "nl_lang";

/*
 * The flags are drawn by components/store/LocaleFlag.tsx - Canada for English,
 * Quebec for French. They used to be emoji here, but there is no Quebec flag
 * emoji and Windows draws no flag emoji at all.
 */
export const LOCALE_LABELS: Record<Locale, { label: string }> = {
  en: { label: "English" },
  fr: { label: "Français" },
};
