import "server-only";
import { prisma } from "@/lib/prisma";
import { PAID_STATUSES } from "@/lib/order-payment";

/*
 * "N+ shoppers have bought this" on the slide cart.
 *
 * N = the product's starting number, set by staff on the product page (sales
 * made before this store, e.g. the Shopify history) plus every paid order for
 * that product since. An unpaid or cancelled order does not count; a product
 * with a starting number of 0 and no paid orders shows nothing.
 */

/** Most a starting number can be, to catch a typo. */
export const MAX_SHOPPERS_BASE = 10_000_000;

export function parseShoppersBase(raw: FormDataEntryValue | null): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(MAX_SHOPPERS_BASE, Math.max(0, n)) : 0;
}

/** Paid orders containing the product, counted once per order. */
export async function paidOrderCount(productId: string): Promise<number> {
  return prisma.order.count({
    where: {
      status: { in: [...PAID_STATUSES] },
      items: { some: { productId } },
    },
  });
}

/** Starting number + paid orders, per product id. Products at 0 are left out. */
export async function shopperCounts(productIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, shoppersBase: true },
  });

  // One small count per product: a cart holds a handful of lines.
  const orders = await Promise.all(products.map((p) => paidOrderCount(p.id)));
  products.forEach((p, i) => {
    const total = p.shoppersBase + orders[i];
    if (total > 0) counts.set(p.id, total);
  });
  return counts;
}
