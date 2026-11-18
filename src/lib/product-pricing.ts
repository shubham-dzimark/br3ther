import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Keeps Product.minPriceCents / onSale in step with its variants and any live
 * discount. The shop filters and sorts on these, so refresh them whenever
 * pricing moves - from the product editor or from a deal starting or ending.
 */
export async function recomputeProductPricing(productId: string): Promise<void> {
  const [agg, discounted, product] = await Promise.all([
    prisma.productVariant.aggregate({
      _min: { priceCents: true },
      where: { productId },
    }),
    prisma.productVariant.count({
      where: { productId, compareAtCents: { not: null } },
    }),
    prisma.product.findUnique({
      where: { id: productId },
      select: { discountActive: true, discountPercent: true },
    }),
  ]);

  await prisma.product.update({
    where: { id: productId },
    data: {
      minPriceCents: agg._min.priceCents ?? 0,
      onSale:
        discounted > 0 ||
        Boolean(product?.discountActive && product.discountPercent > 0),
    },
  });
}
