/**
 * One place that decides what a variant actually costs, so the shop, product
 * page, cart and checkout can never disagree with each other.
 */

export type PricedVariant = {
  priceCents: number;
  compareAtCents: number | null;
};

export type DiscountingProduct = {
  discountActive: boolean;
  discountPercent: number;
  discountStartsAt: Date | null;
  discountEndsAt: Date | null;
};

export type EffectivePrice = {
  /** What the customer pays. */
  priceCents: number;
  /** Struck-through price, or null when the item isn't reduced. */
  compareAtCents: number | null;
  /** Whole-percent saving, 0 when not on sale. */
  percentOff: number;
};

/** Is the product's scheduled discount live right now? */
export function discountIsLive(
  product: DiscountingProduct,
  now: Date = new Date(),
): boolean {
  if (!product.discountActive || product.discountPercent <= 0) return false;
  if (product.discountStartsAt && product.discountStartsAt > now) return false;
  if (product.discountEndsAt && product.discountEndsAt < now) return false;
  return true;
}

/**
 * Combines the variant's own compare-at pricing with any live product-level
 * discount (a hand-set discount or a flash/clearance deal).
 *
 * Offers never stack: the product discount is taken off the original "was"
 * price, and the customer pays whichever is lower - the variant's own sale
 * price or the discounted original. A $300 item already at $275 (8% off)
 * under a 35% deal costs $195, not 35% off $275.
 */
export function effectivePrice(
  variant: PricedVariant,
  product: DiscountingProduct,
  now: Date = new Date(),
): EffectivePrice {
  let price = variant.priceCents;
  let compareAt = variant.compareAtCents;

  if (discountIsLive(product, now)) {
    const original = Math.max(compareAt ?? 0, variant.priceCents);
    const discounted = Math.round(original * (1 - product.discountPercent / 100));
    price = Math.min(variant.priceCents, discounted);
    compareAt = original;
  }

  const was = compareAt != null && compareAt > price ? compareAt : null;
  return {
    priceCents: price,
    compareAtCents: was,
    percentOff: was ? Math.round(((was - price) / was) * 100) : 0,
  };
}

/** Cheapest effective price across a product's variants, for listing cards. */
export function priceRange(
  variants: PricedVariant[],
  product: DiscountingProduct,
  now: Date = new Date(),
): { low: EffectivePrice; high: EffectivePrice } | null {
  if (variants.length === 0) return null;
  const priced = variants.map((v) => effectivePrice(v, product, now));
  const sorted = [...priced].sort((a, b) => a.priceCents - b.priceCents);
  return { low: sorted[0], high: sorted[sorted.length - 1] };
}
