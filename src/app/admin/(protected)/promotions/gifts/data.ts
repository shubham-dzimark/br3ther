import "server-only";
import { prisma } from "@/lib/prisma";

/** Everything the gift-rule form needs to offer as choices. */
export async function giftFormData() {
  const [variants, products, categories] = await Promise.all([
    prisma.productVariant.findMany({
      where: { isActive: true, product: { status: { not: "ARCHIVED" } } },
      orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        product: { select: { name: true, status: true, isGiftOnly: true } },
      },
      take: 500,
    }),
    // What can trigger an offer: products a shopper can actually buy.
    prisma.product.findMany({
      where: { status: "PUBLISHED", isGiftOnly: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 1000,
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return {
    // "Product — Variant", so two variants of one product are tellable apart.
    variants: variants.map((v) => ({
      id: v.id,
      name: `${v.product.name} — ${v.name}`,
      // Already the gift in an offer, or a normal product that is not live.
      note: v.product.isGiftOnly ? "Gift" : v.product.status === "PUBLISHED" ? null : "Draft",
    })),
    products,
    categories,
  };
}

/** Why a gift offer was not saved (?error= from the gift actions). */
export const GIFT_RULE_ERRORS: Record<string, string> = {
  spend: "Set the amount the cart has to reach - an offer with no amount would never apply.",
  code: "Enter the code that unlocks this offer: 3-40 letters, numbers, - or _.",
  products: "Pick at least one product, or choose All products.",
  categories: "Pick at least one category, or choose All products.",
  gifts: "Pick the gift product, otherwise there is nothing to give.",
  cheapest:
    "“Cheapest item free” on a Buy X offer needs a quantity of 2 or more, so at least one item stays paid.",
};
