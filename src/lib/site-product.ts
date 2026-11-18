import "server-only";
import { prisma } from "@/lib/prisma";
import { canSell, sellableQuantity } from "@/lib/stock";

/*
 * The one product the Br3thr site sells (seeded by
 * scripts/seed-br3thr-product.mjs). Variants are named "<Flavour> · <Size>",
 * so the page can offer flavour and size as two separate choices while the
 * admin keeps editing ordinary variants.
 */
export const SITE_PRODUCT_SLUG = "no-3-daily-blend";

export type SiteVariant = {
  id: string;
  flavour: string;
  size: string;
  priceCents: number;
  available: number; // how many can be sold right now (0 = sold out)
};

export type SiteProduct = {
  id: string;
  name: string;
  flavours: string[];
  sizes: string[];
  variants: SiteVariant[];
  defaultVariantId: string;
};

function splitName(name: string): [string, string] {
  const [flavour, size] = name.split("·").map((s) => s.trim());
  return [flavour || name, size || "One size"];
}

export async function getSiteProduct(): Promise<SiteProduct | null> {
  const product = await prisma.product.findUnique({
    where: { slug: SITE_PRODUCT_SLUG },
    include: { variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!product || product.status !== "PUBLISHED" || product.variants.length === 0) return null;

  const variants: SiteVariant[] = product.variants.map((v) => {
    const [flavour, size] = splitName(v.name);
    return {
      id: v.id,
      flavour,
      size,
      priceCents: v.priceCents,
      available: canSell(v) ? Math.min(sellableQuantity(v), 99) : 0,
    };
  });
  const unique = (xs: string[]) => [...new Set(xs)];
  return {
    id: product.id,
    name: product.name,
    flavours: unique(variants.map((v) => v.flavour)),
    sizes: unique(variants.map((v) => v.size)),
    variants,
    defaultVariantId: (product.variants.find((v) => v.isDefault) ?? product.variants[0]).id,
  };
}
