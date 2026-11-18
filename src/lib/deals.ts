import "server-only";
import { prisma } from "@/lib/prisma";
import { recomputeProductPricing } from "@/lib/product-pricing";

/**
 * Deals (flash sales, featured, clearance) used to exist only in the admin -
 * nothing on the storefront read them, so creating one changed no prices.
 *
 * Rather than teach every pricing surface about deals - which would risk the
 * shop showing a discount the checkout doesn't honour - a live deal is
 * projected onto the product's own discount fields. `effectivePrice()` already
 * drives the shop, product page, cart, checkout and totals from those, so one
 * write makes the deal real everywhere at once.
 *
 * `Product.discountDealId` records which deal owns a discount, so ending a
 * deal reverts exactly what it set and a hand-set discount is never touched.
 */

export type DealSyncResult = { applied: number; cleared: number };

export function dealIsLive(
  deal: { isActive: boolean; percentOff: number; startsAt: Date | null; endsAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!deal.isActive || deal.percentOff <= 0) return false;
  if (deal.startsAt && deal.startsAt > now) return false;
  if (deal.endsAt && deal.endsAt < now) return false;
  return true;
}

export async function syncDealPricing(now: Date = new Date()): Promise<DealSyncResult> {
  const deals = await prisma.deal.findMany({
    where: { isActive: true, percentOff: { gt: 0 } },
    include: { products: { select: { productId: true } } },
  });

  // productId -> the best live deal covering it.
  const winner = new Map<
    string,
    { dealId: string; percentOff: number; title: string; startsAt: Date | null; endsAt: Date | null }
  >();

  for (const deal of deals) {
    if (!dealIsLive(deal, now)) continue;
    for (const { productId } of deal.products) {
      const current = winner.get(productId);
      // Overlapping deals: the customer gets the biggest discount.
      if (!current || deal.percentOff > current.percentOff) {
        winner.set(productId, {
          dealId: deal.id,
          percentOff: deal.percentOff,
          title: deal.title,
          startsAt: deal.startsAt,
          endsAt: deal.endsAt,
        });
      }
    }
  }

  const touched = new Set<string>();
  let applied = 0;
  let cleared = 0;

  // 1. Revert products whose deal has ended, been paused, or no longer lists them.
  const previouslyDealt = await prisma.product.findMany({
    where: { discountDealId: { not: null } },
    select: { id: true, discountDealId: true, discountPercent: true },
  });

  for (const product of previouslyDealt) {
    const win = winner.get(product.id);
    if (win && win.dealId === product.discountDealId && win.percentOff === product.discountPercent) {
      continue; // already correct
    }
    if (!win) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          discountActive: false,
          discountPercent: 0,
          discountTitle: null,
          discountStartsAt: null,
          discountEndsAt: null,
          discountDealId: null,
        },
      });
      cleared += 1;
      touched.add(product.id);
    }
  }

  // 2. Apply live deals.
  for (const [productId, win] of winner) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { discountActive: true, discountDealId: true, discountPercent: true },
    });
    if (!product) continue;

    // A discount set by hand in the product editor wins - a deal must not
    // silently overwrite something a person deliberately configured.
    if (product.discountActive && product.discountDealId === null) continue;

    const unchanged =
      product.discountDealId === win.dealId &&
      product.discountPercent === win.percentOff &&
      product.discountActive;
    if (unchanged) continue;

    await prisma.product.update({
      where: { id: productId },
      data: {
        discountActive: true,
        discountPercent: win.percentOff,
        discountTitle: win.title,
        discountStartsAt: win.startsAt,
        discountEndsAt: win.endsAt,
        discountDealId: win.dealId,
      },
    });
    applied += 1;
    touched.add(productId);
  }

  // 3. Keep the denormalised shop fields honest.
  for (const productId of touched) {
    await recomputeProductPricing(productId);
  }

  return { applied, cleared };
}
