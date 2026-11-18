import type { Translator } from "@/lib/i18n";

export type FooterColumn = { label: string; links: { label: string; url: string }[] };

/**
 * The link columns the footer draws when no footer menu has been saved.
 *
 * Shared with Content -> Footer, which pre-fills its menu editor with these
 * same rows, so the shop owner edits exactly what is on the page and saving
 * takes over from this built-in set.
 */
export function defaultFooterColumns(
  t: Translator,
  pages: { slug: string; title: string }[],
  categories: { slug: string; name: string }[],
): FooterColumn[] {
  return [
    {
      label: t("footer.about"),
      links: [
        ...pages.slice(0, 4).map((pg) => ({ label: pg.title, url: `/pages/${pg.slug}` })),
        { label: "Blog", url: "/blog" },
        { label: t("footer.reviews"), url: "/reviews" },
      ],
    },
    {
      label: t("footer.categories"),
      links: [
        { label: t("footer.allProducts"), url: "/shop" },
        ...categories.slice(0, 4).map((c) => ({ label: c.name, url: `/shop?category=${c.slug}` })),
        { label: t("lab.title"), url: "/lab-results" },
      ],
    },
    {
      label: t("footer.myAccount"),
      links: [
        { label: t("account.title"), url: "/account" },
        { label: t("account.orderHistory"), url: "/account/orders" },
        { label: t("nav.wishlist"), url: "/account/wishlist" },
        { label: t("account.memberPoints"), url: "/account/points" },
        { label: t("track.title"), url: "/track-order" },
      ],
    },
  ];
}
