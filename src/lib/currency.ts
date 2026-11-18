import "server-only";
import { cache } from "react";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { formatMoney } from "@/lib/money";

/** Currencies offered in Settings. code + label + the locale used to format it. */
export const CURRENCIES = [
  { code: "CAD", label: "Canadian dollar (CAD)", locale: "en-CA" },
  { code: "USD", label: "US dollar (USD)", locale: "en-US" },
  { code: "EUR", label: "Euro (EUR)", locale: "de-DE" },
  { code: "GBP", label: "British pound (GBP)", locale: "en-GB" },
  { code: "AUD", label: "Australian dollar (AUD)", locale: "en-AU" },
  { code: "NZD", label: "New Zealand dollar (NZD)", locale: "en-NZ" },
  { code: "INR", label: "Indian rupee (INR)", locale: "en-IN" },
  { code: "AED", label: "UAE dirham (AED)", locale: "en-AE" },
  { code: "SGD", label: "Singapore dollar (SGD)", locale: "en-SG" },
  { code: "JPY", label: "Japanese yen (JPY)", locale: "ja-JP" },
  { code: "CHF", label: "Swiss franc (CHF)", locale: "de-CH" },
  { code: "SEK", label: "Swedish krona (SEK)", locale: "sv-SE" },
  { code: "ZAR", label: "South African rand (ZAR)", locale: "en-ZA" },
  { code: "MXN", label: "Mexican peso (MXN)", locale: "es-MX" },
  { code: "BRL", label: "Brazilian real (BRL)", locale: "pt-BR" },
] as const;

export const LOCALES = [
  { code: "en-CA", label: "English (Canada)" },
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "fr-CA", label: "Français (Canada)" },
  { code: "fr-FR", label: "Français (France)" },
  { code: "de-DE", label: "Deutsch" },
  { code: "es-ES", label: "Español" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "it-IT", label: "Italiano" },
  { code: "nl-NL", label: "Nederlands" },
  { code: "sv-SE", label: "Svenska" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ar-AE", label: "العربية" },
  { code: "ja-JP", label: "日本語" },
  { code: "zh-CN", label: "中文 (简体)" },
] as const;

/**
 * A money total shortened for a summary tile: exact below 1,000, then
 * "$1.9k CAD", "$2.4M CAD". It starts from the normal formatted amount and
 * only swaps the number, so the symbol, where it sits and the currency code
 * match every other price on the site in any locale.
 */
export function formatMoneyCompact(cents: number, currency = "CAD", locale = "en-CA"): string {
  const exact = formatMoney(cents, currency, locale);
  const amount = Math.abs(cents) / 100;
  if (amount < 1000) return exact;

  let value = amount / 1000;
  let suffix = "k";
  // 999,950 rounds to "1,000k"; say "1M" instead.
  if (Math.round(value * 10) / 10 >= 1000) {
    value = amount / 1_000_000;
    suffix = "M";
  }
  const short = `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.round(value * 10) / 10)}${suffix}`;
  return exact.replace(/\d[\d.,\s  ']*\d|\d/, short);
}

export type MoneyFormatter = {
  currency: string;
  locale: string;
  /** Format cents in the store's own currency. */
  format: (cents: number) => string;
  /** Format cents in whatever currency that record was captured in. */
  formatIn: (cents: number, currency?: string | null) => string;
  /** A tile total: exact below 1,000, then "$1.9k CAD". Not for line items. */
  compact: (cents: number) => string;
};

/**
 * Reads the store currency/locale once and returns a formatter. Call this once
 * per page rather than formatting ad hoc, so one setting drives every screen.
 */
export const getMoneyFormatter = cache(async (): Promise<MoneyFormatter> => {
  const s = await getSettings();
  const currency = s[SETTING_KEYS.storeCurrency] || "CAD";
  const locale = s[SETTING_KEYS.storeLocale] || "en-CA";

  // Formatting itself lives in money.ts, so the storefront, the admin and the
  // printed invoice all render a price the same way.
  return {
    currency,
    locale,
    format: (cents: number) => formatMoney(cents, currency, locale),
    compact: (cents: number) => formatMoneyCompact(cents, currency, locale),
    formatIn: (cents: number, c?: string | null) =>
      formatMoney(cents, c || currency, locale),
  };
});
