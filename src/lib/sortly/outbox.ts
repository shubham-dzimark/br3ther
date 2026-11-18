import "server-only";
import type { Prisma } from "@/generated/prisma";

/**
 * Stock movements the site makes (a paid order, a cancellation, a gift line)
 * are written here in the same transaction as the stock change itself, so a
 * sale can never be decremented on the site without also being queued for
 * Sortly. The sync sends them as changes and marks them applied.
 *
 * Only options linked to a Sortly item and counting their stock are recorded.
 */
export async function recordSortlyChanges(
  tx: Prisma.TransactionClient,
  changes: Map<string, number>,
  reason: string,
  orderId?: string | null,
): Promise<string[]> {
  const ids = [...changes.keys()].filter((id) => (changes.get(id) ?? 0) !== 0);
  if (ids.length === 0) return [];

  const linked = await tx.productVariant.findMany({
    where: { id: { in: ids }, sortlyItemId: { not: null }, manageStock: true },
    select: { id: true },
  });
  if (linked.length === 0) return [];

  await tx.sortlyStockChange.createMany({
    data: linked.map((v) => ({
      variantId: v.id,
      delta: changes.get(v.id) ?? 0,
      reason,
      orderId: orderId ?? null,
    })),
  });
  return linked.map((v) => v.id);
}

/**
 * Sends queued changes shortly after the request that made them, without
 * holding it up. The 5-minute scheduled run catches anything this misses.
 */
export function kickSortlySync(variantIds: string[]): void {
  if (variantIds.length === 0) return;
  void import("@/lib/sortly/sync")
    .then((m) => m.syncVariantsSoon(variantIds))
    .catch(() => undefined);
}

/** A product was saved: link or create its new options in Sortly straight away. */
export function kickSortlyProduct(productId: string): void {
  if (!productId) return;
  void import("@/lib/sortly/sync")
    .then((m) => m.linkOrCreateForProduct(productId))
    .catch(() => undefined);
}

/** Barcodes changed on the site: put the new codes on the linked Sortly labels. */
export function kickSortlyLabels(variantIds: string[]): void {
  if (variantIds.length === 0) return;
  void import("@/lib/sortly/sync")
    .then((m) => m.pushSortlyLabels(variantIds))
    .catch(() => undefined);
}
