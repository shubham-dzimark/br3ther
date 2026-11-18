import { effectivePrice } from "@/lib/pricing";
import { canSell, sellableQuantity } from "@/lib/stock";

/*
 * What "Buy again" puts back in the basket.
 *
 * Kept apart from the action that writes the rows so the rules can be tested
 * on their own: what is still sellable, how much of it, and at what price.
 * Nothing here reads the database or the request.
 */

export type BuyAgainItem = {
  variantId: string | null;
  quantity: number;
  isGift: boolean;
};

export type BuyAgainVariant = Parameters<typeof effectivePrice>[0] &
  Parameters<typeof canSell>[0] & {
    id: string;
    name: string | null;
    product: Parameters<typeof effectivePrice>[1] & {
      name: string;
      status: string;
      isGiftOnly: boolean;
      type: string;
      soldIndividually: boolean;
    };
  };

export type BuyAgainLine = {
  variantId: string;
  name: string;
  variantName: string | null;
  quantity: number;
  unitPriceCents: number;
};

export type BuyAgainPlan = {
  lines: BuyAgainLine[];
  /** Items from the order that could not go back in the basket. */
  skipped: number;
};

/**
 * @param items    the order's lines
 * @param variants what those lines point at, as the shop sells them today
 * @param inBasket how many of each variant the basket already holds
 */
export function planBuyAgain(
  items: BuyAgainItem[],
  variants: BuyAgainVariant[],
  inBasket: Map<string, number> = new Map(),
): BuyAgainPlan {
  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines: BuyAgainLine[] = [];
  let skipped = 0;

  for (const item of items) {
    // A free gift is granted by the gift engine, never re-bought.
    if (item.isGift || !item.variantId) continue;

    const v = byId.get(item.variantId);
    if (
      !v ||
      v.product.status !== "PUBLISHED" ||
      v.product.isGiftOnly ||
      v.product.type === "EXTERNAL" ||
      // A gift card needs to know who it is for; only its own page asks.
      v.product.type === "GIFT_CARD" ||
      !canSell(v)
    ) {
      skipped += 1;
      continue;
    }

    // The same ceiling a normal add obeys, less whatever is in the basket.
    const ceiling = v.product.soldIndividually ? 1 : sellableQuantity(v);
    const already = inBasket.get(v.id) ?? 0;
    const room = Math.max(0, ceiling - already);
    const want = Math.max(1, item.quantity);
    const take = Math.min(room, want);
    if (take < 1) {
      skipped += 1;
      continue;
    }

    lines.push({
      variantId: v.id,
      name: v.product.name,
      variantName: v.name,
      quantity: take,
      // Today's price, not the one on the old order.
      unitPriceCents: effectivePrice(v, v.product).priceCents,
    });
  }

  return { lines, skipped };
}
