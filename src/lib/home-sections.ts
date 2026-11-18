import { SETTING_KEYS } from "@/lib/settings";

/**
 * The homepage's movable sections, in the order they ship in.
 *
 * The hero is not here: it is always first, and a shop that could drag it
 * into the middle of the page would have no top to the page at all.
 */
export const HOME_SECTIONS = [
  { key: "usp", label: "Promise strip (USPs)" },
  { key: "categories", label: "Shop by category" },
  { key: "deals", label: "Daily discount" },
  { key: "best", label: "Best selling" },
  { key: "signup", label: "Join free / points" },
  { key: "selector", label: "Our products (category tabs)" },
  { key: "promo", label: "Promo banner" },
  { key: "new", label: "Newly launched" },
  { key: "flash", label: "Flash sale strip" },
  { key: "clearance", label: "Clearance strip" },
  { key: "reviews", label: "Customer reviews" },
] as const;

export type HomeSectionKey = (typeof HOME_SECTIONS)[number]["key"];

const DEFAULT_ORDER = HOME_SECTIONS.map((s) => s.key) as HomeSectionKey[];

/**
 * The saved order, cleaned up: unknown keys dropped, duplicates removed, and
 * anything the saved value never mentioned appended in its default position.
 * That last part matters - a section added to the code after someone saved an
 * order would otherwise vanish from every shop that had ever reordered.
 */
export function homeSectionOrder(settings: Record<string, string>): HomeSectionKey[] {
  const saved = (settings[SETTING_KEYS.homeSectionOrder] ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is HomeSectionKey => DEFAULT_ORDER.includes(k as HomeSectionKey));

  const seen = new Set(saved);
  return [...saved, ...DEFAULT_ORDER.filter((k) => !seen.has(k))];
}
