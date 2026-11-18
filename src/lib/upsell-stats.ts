import "server-only";
import { prisma } from "@/lib/prisma";

/*
 * What the checkout upsell block has actually sold.
 *
 * Counted from order lines marked `fromUpsell` when the order was placed, so a
 * product bought the ordinary way is never counted here. `upsellOfferId` says
 * which offer showed it; null means it came from a product's own companions
 * (set on the product screen under "Checkout Upsell Product").
 *
 * Confirmed payments only, matching every other money figure in the admin.
 */

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
/** A ceiling so one report can never sweep an unbounded table. */
const MAX_ROWS = 20000;

export type UpsellTotals = { units: number; revenueCents: number; orders: number };

export type UpsellReport = {
  total: UpsellTotals;
  /** Key: offer id, or null for a product's own companions. */
  byOffer: Map<string | null, UpsellTotals>;
  topProducts: { name: string; units: number; revenueCents: number }[];
};

const empty = (): UpsellTotals => ({ units: 0, revenueCents: 0, orders: 0 });

export async function upsellReport(since: Date | null = null): Promise<UpsellReport> {
  const items = await prisma.orderItem.findMany({
    where: {
      fromUpsell: true,
      order: {
        status: { in: [...PAID] },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
    },
    select: {
      orderId: true,
      upsellOfferId: true,
      quantity: true,
      lineTotalCents: true,
      nameSnapshot: true,
    },
    take: MAX_ROWS,
  });

  const total = empty();
  const totalOrders = new Set<string>();
  const byOffer = new Map<string | null, UpsellTotals>();
  const offerOrders = new Map<string | null, Set<string>>();
  const byProduct = new Map<string, { units: number; revenueCents: number }>();

  for (const i of items) {
    total.units += i.quantity;
    total.revenueCents += i.lineTotalCents;
    totalOrders.add(i.orderId);

    const key = i.upsellOfferId;
    const row = byOffer.get(key) ?? empty();
    row.units += i.quantity;
    row.revenueCents += i.lineTotalCents;
    byOffer.set(key, row);
    const seen = offerOrders.get(key) ?? new Set<string>();
    seen.add(i.orderId);
    offerOrders.set(key, seen);

    const p = byProduct.get(i.nameSnapshot) ?? { units: 0, revenueCents: 0 };
    p.units += i.quantity;
    p.revenueCents += i.lineTotalCents;
    byProduct.set(i.nameSnapshot, p);
  }

  total.orders = totalOrders.size;
  for (const [key, row] of byOffer) row.orders = offerOrders.get(key)?.size ?? 0;

  const topProducts = [...byProduct.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 10);

  return { total, byOffer, topProducts };
}
