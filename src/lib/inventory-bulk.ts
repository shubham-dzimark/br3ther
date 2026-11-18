import { prisma } from "@/lib/prisma";
import type { StockStatus } from "@/generated/prisma";

export type BulkStockMode = "set" | "add" | "remove";

export type BulkStockChange = {
  /** Turn counting on or off; null leaves it as it is. */
  track?: "on" | "off" | null;
  /** New stock status; null leaves it as it is. */
  status?: StockStatus | null;
  /** How `amount` applies to the count: replace it, add to it or take from it. */
  mode?: BulkStockMode;
  /** A whole number from 0; null leaves the count as it is. */
  amount?: number | null;
};

/**
 * One change applied to every selected option on Manage inventory.
 *
 * Adding and removing are increments in the database, not "read, work out,
 * write", so a sale landing at the same moment is not overwritten. Removing
 * more than there is stops at 0. Setting or changing a quantity also turns
 * counting on - a count only limits the cart while it is tracked - unless the
 * same change explicitly turns counting off. Backorders are never touched.
 *
 * Returns how many options were updated; 0 when nothing was chosen.
 */
export async function applyBulkStock(ids: string[], change: BulkStockChange): Promise<number> {
  const unique = [...new Set(ids)].filter(Boolean);
  const amount =
    change.amount != null && Number.isFinite(change.amount) && change.amount >= 0
      ? Math.floor(change.amount)
      : null;
  const mode = change.mode ?? "set";
  const manageStock = change.track ? change.track === "on" : amount !== null ? true : undefined;

  if (unique.length === 0 || (manageStock === undefined && !change.status && amount === null)) {
    return 0;
  }

  const where = { id: { in: unique } };
  return prisma.$transaction(async (tx) => {
    const result = await tx.productVariant.updateMany({
      where,
      data: {
        ...(manageStock !== undefined ? { manageStock } : {}),
        ...(change.status ? { stockStatus: change.status } : {}),
        ...(amount !== null
          ? {
              stock:
                mode === "add"
                  ? { increment: amount }
                  : mode === "remove"
                    ? { decrement: amount }
                    : amount,
            }
          : {}),
      },
    });
    if (amount !== null && mode === "remove") {
      await tx.productVariant.updateMany({ where: { ...where, stock: { lt: 0 } }, data: { stock: 0 } });
    }
    return result.count;
  });
}
