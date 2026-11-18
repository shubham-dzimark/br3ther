import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { matchingUpsellOffers, parseUpsellDiscount, PLACEMENTS, type Placement } from "@/lib/checkout-upsell";

/*
 * Upsell campaigns beyond the product placements: personal next-order coupons,
 * and the per-campaign numbers for Promotions -> Campaigns.
 *
 * A next-order coupon is an ordinary Coupon row (one use, one customer,
 * expiring), tagged with the campaign and the order that earned it. It is
 * issued when the order is placed, so the thank-you page and the order email
 * can show it, but stays inactive until that order's payment is confirmed:
 * an order that is never paid never unlocks a discount.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

function couponCode(): string {
  const bytes = randomBytes(8);
  let body = "";
  for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  return `NEXT-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * Issue the best matching next-order coupon for a newly placed order. At most
 * one per order; returns the code, or null when no campaign applies. Never
 * throws - an order must not fail because of a reward.
 */
export async function issueNextOrderCoupon(orderId: string): Promise<string | null> {
  try {
    const existing = await prisma.coupon.findFirst({ where: { sourceOrderId: orderId }, select: { code: true } });
    if (existing) return existing.code;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { subtotalCents: true, items: { select: { productId: true, isGift: true } } },
    });
    if (!order) return null;
    const productIds = [...new Set(order.items.filter((i) => !i.isGift && i.productId).map((i) => i.productId as string))];
    const [campaign] = await matchingUpsellOffers(productIds, order.subtotalCents, new Date(), ["NEXT_ORDER"]);
    if (!campaign) return null;

    const discount = parseUpsellDiscount(campaign.discountRule);
    if (!discount) return null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = couponCode();
      try {
        await prisma.coupon.create({
          data: {
            code,
            description: `Next-order reward from "${campaign.name}"`,
            type: discount.kind === "percent" ? "PERCENT" : "FIXED",
            value: discount.value,
            minSubtotalCents: Math.max(0, campaign.couponMinSpendCents),
            maxRedemptions: 1,
            maxPerCustomer: 1,
            endsAt: new Date(Date.now() + Math.max(1, campaign.couponValidDays) * 86400000),
            // Switched on by activateNextOrderCoupon once the order is paid.
            isActive: false,
            upsellOfferId: campaign.id,
            sourceOrderId: orderId,
          },
        });
        await prisma.checkoutUpsellOffer.update({ where: { id: campaign.id }, data: { views: { increment: 1 } } });
        return code;
      } catch (err) {
        // A clash on the unique code: try another. Anything else is real.
        if (!String((err as { code?: string })?.code).includes("P2002")) throw err;
      }
    }
    return null;
  } catch (err) {
    console.error(`[next-order-coupon] order ${orderId}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Unlock the order's next-order coupon now that it is paid; its clock starts today. */
export async function activateNextOrderCoupon(orderId: string): Promise<void> {
  try {
    const coupon = await prisma.coupon.findFirst({
      where: { sourceOrderId: orderId, isActive: false, timesRedeemed: 0 },
      select: { id: true, upsellOffer: { select: { couponValidDays: true } } },
    });
    if (!coupon) return;
    const days = Math.max(1, coupon.upsellOffer?.couponValidDays ?? 30);
    await prisma.coupon.update({
      where: { id: coupon.id },
      data: { isActive: true, startsAt: new Date(), endsAt: new Date(Date.now() + days * 86400000) },
    });
  } catch (err) {
    console.error(`[next-order-coupon] activate ${orderId}: ${err instanceof Error ? err.message : err}`);
  }
}

/** The coupon an order earned, for the thank-you page and emails. */
export async function nextOrderCouponFor(orderId: string) {
  return prisma.coupon.findFirst({
    where: { sourceOrderId: orderId },
    select: { code: true, type: true, value: true, minSubtotalCents: true, endsAt: true, isActive: true, upsellOffer: { select: { couponValidDays: true } } },
  });
}

export type CampaignStats = { views: number; units: number; orders: number; revenueCents: number };

/**
 * Revenue per campaign. Product placements count paid order lines attributed
 * to the campaign; next-order campaigns count paid orders that used one of
 * their coupons. Confirmed payments only, like every money figure in the admin.
 */
export async function campaignStats(): Promise<Map<string, CampaignStats>> {
  const campaigns = await prisma.checkoutUpsellOffer.findMany({ select: { id: true, placement: true, views: true } });
  const stats = new Map<string, CampaignStats>(campaigns.map((c) => [c.id, { views: c.views, units: 0, orders: 0, revenueCents: 0 }]));

  const lines = await prisma.orderItem.findMany({
    where: { upsellOfferId: { not: null }, order: { status: { in: [...PAID] } } },
    select: { upsellOfferId: true, quantity: true, lineTotalCents: true, orderId: true },
    take: 20000,
  });
  const seen = new Map<string, Set<string>>();
  for (const l of lines) {
    const s = stats.get(l.upsellOfferId as string);
    if (!s) continue;
    s.units += l.quantity;
    s.revenueCents += l.lineTotalCents;
    const orders = seen.get(l.upsellOfferId as string) ?? new Set<string>();
    orders.add(l.orderId);
    seen.set(l.upsellOfferId as string, orders);
  }
  for (const [id, orders] of seen) stats.get(id)!.orders = orders.size;

  const coupons = await prisma.coupon.findMany({
    where: { upsellOfferId: { not: null }, timesRedeemed: { gt: 0 } },
    select: { code: true, upsellOfferId: true },
  });
  if (coupons.length) {
    const byCode = new Map(coupons.map((c) => [c.code, c.upsellOfferId as string]));
    const orders = await prisma.order.findMany({
      where: { couponCode: { in: [...byCode.keys()] }, status: { in: [...PAID] } },
      select: { couponCode: true, totalCents: true },
    });
    for (const o of orders) {
      const s = stats.get(byCode.get(o.couponCode as string) ?? "");
      if (!s) continue;
      s.orders += 1;
      s.units += 1;
      s.revenueCents += o.totalCents;
    }
  }
  return stats;
}

export { PLACEMENTS, type Placement };
