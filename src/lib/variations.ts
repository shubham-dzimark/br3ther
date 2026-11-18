import { prisma } from "@/lib/prisma";

/**
 * Bring a product's options back in line with the attribute values it is
 * ticked for.
 *
 * Unticking Size used to leave every option still carrying "Size: L", so the
 * variants table offered a choice the product no longer had and the storefront
 * asked shoppers to make it. This drops the links to values the product no
 * longer comes in, rebuilds each option's name from what is left, and parks
 * options that have become exact duplicates of one another - unticking an
 * attribute collapses "1G / L" and "1G / M" onto the same "1G", and two
 * identical things to buy is worse than one.
 *
 * Parked options are deactivated, never deleted: their stock, price and place
 * in past orders are still theirs, and re-ticking the attribute can tell them
 * apart again.
 *
 * Returns what it changed, so a caller (or a test) can see the work.
 */
export async function pruneVariationsToAttributes(
  productId: string,
  valueIds: string[],
): Promise<{ linksRemoved: number; renamed: number; parked: number }> {
  const removed = await prisma.productVariantValue.deleteMany({
    where: {
      variant: { productId },
      // An empty tick list means no value belongs on any option any more.
      ...(valueIds.length ? { attributeValueId: { notIn: valueIds } } : {}),
    },
  });

  const variants = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
    include: { values: { include: { attributeValue: { select: { id: true, value: true } } } } },
  });

  const kept = new Set<string>();
  let renamed = 0;
  let parked = 0;

  for (const variant of variants) {
    const parts = variant.values.map((v) => v.attributeValue.value);
    const key = variant.values.map((v) => v.attributeValue.id).sort().join("|");
    const duplicate = kept.has(key);
    if (!duplicate) kept.add(key);

    const name = parts.length > 0 ? parts.join(" / ") : "Default";
    const isActive = variant.isActive && !duplicate;

    if (variant.name !== name || variant.isActive !== isActive) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { name, isActive },
      });
      if (variant.name !== name) renamed += 1;
      if (variant.isActive !== isActive) parked += 1;
    }
  }

  return { linksRemoved: removed.count, renamed, parked };
}
