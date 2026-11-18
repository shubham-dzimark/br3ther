import "server-only";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/**
 * The band at the top of the shop page: title, strapline, category chips and
 * an optional background.
 *
 * All optional. With nothing set the page looks exactly as it did, so turning
 * this on is a choice rather than something a shop has to configure before the
 * page reads properly.
 */

export type ShopHero = {
  title: string;
  subtitle: string;
  /** Category slugs to show, in this order. Empty means every category. */
  categorySlugs: string[];
  showCounts: boolean;
  bg: string;
  text: string;
  image: string;
};

/** Only hex reaches a style attribute. */
function colour(v: string | undefined): string {
  const t = (v ?? "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t) ? t : "";
}

export async function getShopHero(): Promise<ShopHero> {
  const s = await getSettings();
  return {
    title: (s[SETTING_KEYS.shopHeroTitle] ?? "").trim(),
    subtitle: (s[SETTING_KEYS.shopHeroSubtitle] ?? "").trim(),
    categorySlugs: (s[SETTING_KEYS.shopHeroCategories] ?? "")
      .split(/[\n,]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
    showCounts: (s[SETTING_KEYS.shopHeroShowCounts] ?? "1") === "1",
    bg: colour(s[SETTING_KEYS.shopHeroBg]),
    text: colour(s[SETTING_KEYS.shopHeroText]),
    image: (s[SETTING_KEYS.shopHeroImage] ?? "").trim(),
  };
}

/**
 * Put the chosen categories in the order they were listed, and drop any that
 * no longer exist - a renamed or deleted category should quietly disappear
 * from the strip rather than leave a dead chip.
 */
export function orderCategories<T extends { slug: string }>(
  all: T[],
  chosen: string[],
): T[] {
  if (chosen.length === 0) return all;
  return chosen
    .map((slug) => all.find((c) => c.slug === slug))
    .filter((c): c is T => Boolean(c));
}
