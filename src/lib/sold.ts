import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Units sold per product, counted from confirmed orders only.
 *
 * The card's stock bar claims real scarcity, so it must be backed by real
 * numbers - an unpaid order isn't a sale. One query per page keyed on the
 * products actually being shown.
 */
export async function getSoldCounts(
  productIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: ids },
      order: {
        status: { in: ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] },
      },
    },
    _sum: { quantity: true },
  });

  return Object.fromEntries(
    rows.map((r) => [r.productId as string, r._sum.quantity ?? 0]),
  );
}

/** The same count, per variant - the card's stock bar follows the selected one. */
export async function getSoldByVariant(
  variantIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(variantIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const rows = await prisma.orderItem.groupBy({
    by: ["variantId"],
    where: {
      variantId: { in: ids },
      order: {
        status: { in: ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] },
      },
    },
    _sum: { quantity: true },
  });

  return Object.fromEntries(
    rows.map((r) => [r.variantId as string, r._sum.quantity ?? 0]),
  );
}
