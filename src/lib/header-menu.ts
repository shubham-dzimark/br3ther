import type { Translator } from "@/lib/i18n";

export type HeaderMenuItem = { label: string; url: string; children: { label: string; url: string }[] };

/**
 * The header menu used when none has been saved: Shop with the categories
 * under it, then the store's other main pages.
 *
 * One tree for desktop and the phone drawer, so the two can't disagree, and
 * shared with Content -> Header, which pre-fills its menu editor with these
 * rows so the shop owner edits exactly what is on screen.
 */
export function defaultHeaderMenu(
  t: Translator,
  categories: { slug: string; name: string }[],
): HeaderMenuItem[] {
  return [
    {
      label: t("nav.shop"),
      url: "/shop",
      children: categories.map((c) => ({ label: c.name, url: `/shop?category=${c.slug}` })),
    },
    { label: t("nav.onSale"), url: "/shop?sale=1", children: [] },
    { label: t("footer.reviews"), url: "/reviews", children: [] },
    { label: t("account.referFriend"), url: "/referral", children: [] },
    { label: t("lab.title"), url: "/lab-results", children: [] },
  ];
}
