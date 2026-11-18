import "server-only";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { COUNTRIES, SUBDIVISIONS } from "@/lib/geo";

/*
 * Address suggestions for the checkout's street field, from Geoapify.
 *
 * The browser never talks to Geoapify: it asks /api/address/suggest, which
 * calls this with the key from the store settings. That keeps the key private,
 * lets repeated searches come from a short cache, and caps how fast one visitor
 * can spend the shop's lookup allowance.
 */

export type AddressSuggestion = {
  id: string;
  /** The full address as shown in the dropdown. */
  label: string;
  line1: string;
  city: string;
  /** A code from the checkout's province/state list, or free text elsewhere. */
  region: string;
  postalCode: string;
  country: string;
};

export type AddressLookupConfig = { enabled: boolean; apiKey: string };

export const LOOKUP_MIN_CHARS = 3;
export const LOOKUP_MAX_CHARS = 120;
const RESULT_LIMIT = 5;
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

export async function getAddressLookupConfig(): Promise<AddressLookupConfig> {
  const s = await getSettings();
  const apiKey = (s[SETTING_KEYS.addressGeoapifyKey] ?? "").trim();
  return { enabled: s[SETTING_KEYS.addressLookupEnabled] === "1" && apiKey !== "", apiKey };
}

/** Geoapify's fields we read (format=json). */
type GeoapifyResult = {
  place_id?: string;
  formatted?: string;
  address_line1?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
  country_code?: string;
};

/** Match Geoapify's state to the checkout's list, by code first, then by name. */
export function regionFor(country: string, stateCode?: string, stateName?: string): string {
  const list = SUBDIVISIONS[country];
  const code = (stateCode ?? "").trim().toUpperCase();
  const name = (stateName ?? "").trim().toLowerCase();
  if (!list) return (stateCode || stateName || "").trim();
  return (
    list.find((r) => r.code.toUpperCase() === code)?.code ??
    list.find((r) => r.name.toLowerCase() === name)?.code ??
    ""
  );
}

/** Canadian postal codes in the form the checkout expects: "K1A 0B1". */
export function formatPostal(country: string, raw?: string): string {
  const value = (raw ?? "").trim().toUpperCase();
  if (country === "CA") {
    const compact = value.replace(/\s+/g, "");
    if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }
  return value;
}

/** One Geoapify result as a suggestion, or null when it isn't a street address. */
export function toSuggestion(r: GeoapifyResult, country: string): AddressSuggestion | null {
  if ((r.country_code ?? "").toUpperCase() !== country) return null;
  // A city or postcode on its own can't fill a shipping address.
  if (!r.street) return null;
  const line1 = [r.housenumber, r.street].filter(Boolean).join(" ").trim() || (r.address_line1 ?? "").trim();
  const city = (r.city || r.town || r.village || "").trim();
  if (!line1 || !city) return null;
  const label = (r.formatted ?? "").trim() || [line1, city, r.state_code || r.state, r.postcode].filter(Boolean).join(", ");
  return {
    id: r.place_id || label,
    label,
    line1,
    city,
    region: regionFor(country, r.state_code, r.state),
    postalCode: formatPostal(country, r.postcode),
    country,
  };
}

const cache = new Map<string, { at: number; results: AddressSuggestion[] }>();
const hits = new Map<string, number[]>();

/** Up to RATE_MAX lookups a minute per visitor; true when this one is allowed. */
export function allowLookup(visitor: string, now = Date.now()): boolean {
  const recent = (hits.get(visitor) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(visitor, recent);
    return false;
  }
  recent.push(now);
  hits.set(visitor, recent);
  // Forget idle visitors so the map can't grow without bound.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return true;
}

/** For tests: start from an empty cache and rate limiter. */
export function resetAddressLookupState(): void {
  cache.clear();
  hits.clear();
}

export type SuggestOutcome =
  | { ok: true; results: AddressSuggestion[]; cached: boolean }
  | { ok: false; error: "disabled" | "bad_request" | "upstream" };

export async function suggestAddresses(
  query: string,
  country: string,
  opts: { config?: AddressLookupConfig; fetchImpl?: typeof fetch; now?: number } = {},
): Promise<SuggestOutcome> {
  const config = opts.config ?? (await getAddressLookupConfig());
  if (!config.enabled || !config.apiKey) return { ok: false, error: "disabled" };

  const q = query.trim();
  const code = country.trim().toUpperCase();
  if (q.length < LOOKUP_MIN_CHARS || q.length > LOOKUP_MAX_CHARS) return { ok: false, error: "bad_request" };
  if (!COUNTRIES.some((c) => c.code === code)) return { ok: false, error: "bad_request" };

  const now = opts.now ?? Date.now();
  const cacheKey = `${code}|${q.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < CACHE_TTL_MS) return { ok: true, results: hit.results, cached: true };

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(RESULT_LIMIT * 2));
  url.searchParams.set("filter", `countrycode:${code.toLowerCase()}`);
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", config.apiKey);

  let body: { results?: GeoapifyResult[] };
  try {
    const res = await (opts.fetchImpl ?? fetch)(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      console.error(`[address] Geoapify answered HTTP ${res.status}`);
      return { ok: false, error: "upstream" };
    }
    body = (await res.json()) as { results?: GeoapifyResult[] };
  } catch (err) {
    console.error(`[address] Geoapify lookup failed: ${err instanceof Error ? err.name : "error"}`);
    return { ok: false, error: "upstream" };
  }

  const seen = new Set<string>();
  const results: AddressSuggestion[] = [];
  for (const r of Array.isArray(body.results) ? body.results : []) {
    const s = toSuggestion(r, code);
    if (!s || seen.has(s.label)) continue;
    seen.add(s.label);
    results.push(s);
    if (results.length === RESULT_LIMIT) break;
  }

  cache.set(cacheKey, { at: now, results });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return { ok: true, results, cached: false };
}

/** A real lookup with the given key, for the admin's "Save & test". */
export async function testGeoapifyKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", "100 Queen St W, Toronto");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("filter", "countrycode:ca");
  url.searchParams.set("apiKey", apiKey);
  try {
    const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Geoapify rejected the key." };
    if (!res.ok) return { ok: false, error: `Geoapify answered HTTP ${res.status}.` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Geoapify could not be reached." };
  }
}
