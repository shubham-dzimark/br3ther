import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { DEFAULT_LOCALE, type Locale } from "@/lib/locales";

/**
 * Translating content that lives in the database.
 *
 * The static UI dictionary in i18n.ts covers strings written in the code.
 * It cannot touch category names, nav labels, page bodies, product copy or
 * anything else the shop owner types in - which is most of what a visitor
 * actually reads. This is the other half: a translation memory keyed on the
 * source text, filled either by hand in the admin or by a machine provider.
 *
 * Nothing here ever throws or blocks a render: a missing translation falls
 * back to the original text, which is always better than an empty page.
 */

export type TranslateProvider = "none" | "libre" | "deepl" | "google";

export type TranslateConfig = {
  enabled: boolean;
  provider: TranslateProvider;
  endpoint: string;
  apiKey: string;
  /** Translate unseen strings on the fly, or only what the admin has filled. */
  autoOnRender: boolean;
};

export async function getTranslateConfig(): Promise<TranslateConfig> {
  const s = await getSettings();
  const raw = s[SETTING_KEYS.translateProvider];
  const provider: TranslateProvider = (
    ["none", "libre", "deepl", "google"] as string[]
  ).includes(raw ?? "")
    ? (raw as TranslateProvider)
    : "none";

  return {
    enabled: s[SETTING_KEYS.translateEnabled] === "1",
    provider,
    endpoint: (s[SETTING_KEYS.translateEndpoint] ?? "").trim(),
    apiKey: (process.env.TRANSLATE_API_KEY ?? s[SETTING_KEYS.translateApiKey] ?? "").trim(),
    autoOnRender: s[SETTING_KEYS.translateAutoOnRender] !== "0",
  };
}

export function hashSource(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 40);
}

/** Text that would be pointless or harmful to send to a translator. */
function skip(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 5000) return true;
  // No letters - prices, SKUs, order numbers, dates.
  if (!/\p{L}/u.test(t)) return true;
  // A bare URL or email.
  if (/^(https?:\/\/|mailto:|[^\s@]+@[^\s@]+\.[^\s@]+$)/i.test(t)) return true;
  return false;
}

/* ------------------------------------------------------------- providers */

async function callProvider(
  texts: string[],
  target: Locale,
  config: TranslateConfig,
): Promise<string[] | null> {
  if (config.provider === "none" || texts.length === 0) return null;

  try {
    if (config.provider === "libre") {
      const url = config.endpoint || "https://libretranslate.com/translate";
      const out: string[] = [];
      // LibreTranslate takes an array, but public instances vary; one at a
      // time is slower and far more predictable across deployments.
      for (const q of texts) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q,
            source: "en",
            target,
            format: "text",
            ...(config.apiKey ? { api_key: config.apiKey } : {}),
          }),
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { translatedText?: string };
        if (!data.translatedText) return null;
        out.push(data.translatedText);
      }
      return out;
    }

    if (config.provider === "deepl") {
      if (!config.apiKey) return null;
      const url =
        config.endpoint ||
        (config.apiKey.endsWith(":fx")
          ? "https://api-free.deepl.com/v2/translate"
          : "https://api.deepl.com/v2/translate");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: texts, target_lang: target.toUpperCase() }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { translations?: { text: string }[] };
      return data.translations?.map((t) => t.text) ?? null;
    }

    if (config.provider === "google") {
      if (!config.apiKey) return null;
      const url = `${config.endpoint || "https://translation.googleapis.com/language/translate/v2"}?key=${encodeURIComponent(config.apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: texts, source: "en", target, format: "text" }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        data?: { translations?: { translatedText: string }[] };
      };
      return data.data?.translations?.map((t) => t.translatedText) ?? null;
    }
  } catch {
    // A provider that is down, rate-limited or misconfigured must never take
    // the storefront with it. The caller falls back to the source text.
    return null;
  }
  return null;
}

/* ----------------------------------------------------------------- cache */

/**
 * Translate a batch.
 *
 * One query for everything already known, one provider call for the rest.
 * Returns a map from source text to translation, missing entries meaning
 * "use the original".
 */
export async function translateMany(
  texts: string[],
  locale: Locale,
  config?: TranslateConfig,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (locale === DEFAULT_LOCALE) return out;

  const c = config ?? (await getTranslateConfig());
  if (!c.enabled) return out;

  const unique = [...new Set(texts.map((t) => t?.trim()).filter((t): t is string => Boolean(t)))]
    .filter((t) => !skip(t));
  if (unique.length === 0) return out;

  const byHash = new Map(unique.map((t) => [hashSource(t), t]));

  const known = await prisma.translation.findMany({
    where: { locale, sourceHash: { in: [...byHash.keys()] } },
  });
  for (const row of known) out.set(row.source, row.value);

  const missing = unique.filter((t) => !out.has(t));
  if (missing.length === 0 || !c.autoOnRender || c.provider === "none") return out;

  const translated = await callProvider(missing, locale, c);
  if (!translated || translated.length !== missing.length) return out;

  // Store what came back so the next render is a cache hit.
  await prisma.translation.createMany({
    data: missing.map((source, i) => ({
      locale,
      sourceHash: hashSource(source),
      source,
      value: translated[i],
      isAuto: true,
    })),
    skipDuplicates: true,
  });

  missing.forEach((source, i) => out.set(source, translated[i]));
  return out;
}

/** One string. Prefer translateMany where several are needed at once. */
export async function translate(text: string, locale: Locale): Promise<string> {
  if (!text || locale === DEFAULT_LOCALE) return text;
  const map = await translateMany([text], locale);
  return map.get(text.trim()) ?? text;
}

/**
 * A reusable translator for a page: pass every string the page will render,
 * then look them up synchronously while building the markup.
 */
export type ContentTranslator = (text: string | null | undefined) => string;

export async function contentTranslator(
  texts: string[],
  locale: Locale,
): Promise<ContentTranslator> {
  const map = await translateMany(texts, locale);
  return (text) => (text ? (map.get(text.trim()) ?? text) : (text ?? ""));
}
