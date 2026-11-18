import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { getCatalogueRules } from "@/lib/ai-catalogue";
import { mediaSrc } from "@/lib/media-src";
import { canSell } from "@/lib/stock";

export const dynamic = "force-dynamic";

/**
 * The card shown under a product link in the chat window.
 *
 * Public on purpose - it returns strictly less than the product page a visitor
 * can already open, and only ever for a PUBLISHED product. It is a rendering
 * helper, not a data source: it takes a slug and answers with the same handful
 * of fields the shop puts on a product tile.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const slug = new URL(request.url).searchParams.get("slug")?.trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "no slug" }, { status: 400 });

  const rules = await getCatalogueRules();
  if (!rules.shareProducts) return NextResponse.json({ error: "off" }, { status: 404 });

  const product = await prisma.product.findFirst({
    where: { slug, status: "PUBLISHED", isGiftOnly: false },
    select: {
      name: true,
      slug: true,
      coverImageUrl: true,
      minPriceCents: true,
      onSale: true,
      discountPercent: true,
      ratingAverage: true,
      ratingCount: true,
      variants: {
        where: { isActive: true },
        select: { priceCents: true, stock: true, stockStatus: true, manageStock: true, backorders: true },
      },
    },
  });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });

  const money = await getMoneyFormatter();
  const cheapest = product.variants.length
    ? Math.min(...product.variants.map((v) => v.priceCents))
    : product.minPriceCents;
  // The stock rules, not the raw count: an untracked option sits at 0 and is
  // always in stock, and a backordered one can still be bought.
  const inStock = product.variants.some((v) => canSell(v));

  return NextResponse.json(
    {
      name: product.name,
      slug: product.slug,
      image: product.coverImageUrl ? mediaSrc(product.coverImageUrl) : null,
      price: money.format(cheapest),
      onSale: product.onSale,
      discountPercent: product.discountPercent || null,
      rating: product.ratingCount > 0 ? product.ratingAverage : null,
      ratingCount: product.ratingCount,
      // Hidden stock detail still allows "can they buy it" - that is on every
      // product tile in the shop already.
      inStock: rules.stockDetail === "hidden" ? true : inStock,
      url: `/products/${product.slug}`,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
