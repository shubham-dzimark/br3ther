import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { effectivePrice } from "@/lib/pricing";
import { mediaSrc } from "@/lib/media-src";

export const dynamic = "force-dynamic";

/** Below this the matches are noise; the popup asks for more letters. */
const MIN_LENGTH = 3;
const LIMIT = 8;

/**
 * Live product search for the header's search popup.
 *
 *   GET /api/search?q=<at least 3 letters>
 *
 * Published products only, matched on name, short description or an option's
 * SKU - the same fields /shop?q= searches, plus SKU so a code typed off a
 * label finds its product. Prices are worked out here with the live discount
 * so the popup shows what the product page will.
 */
export async function GET(request: Request): Promise<Response> {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const headers = { "Cache-Control": "no-store" };

  if (q.length < MIN_LENGTH) {
    return Response.json({ query: q, total: 0, results: [] }, { headers });
  }

  const where = {
    status: "PUBLISHED" as const,
    // Gift-only products never come up in search.
    isGiftOnly: false, type: { not: "GIFT_CARD" as const },
    OR: [
      { name: { contains: q, mode: "insensitive" as const } },
      { shortDescription: { contains: q, mode: "insensitive" as const } },
      { variants: { some: { isActive: true, sku: { contains: q, mode: "insensitive" as const } } } },
    ],
  };

  const [products, total, money] = await Promise.all([
    prisma.product.findMany({
      where,
      // Names that start with the query first reads as "closest match".
      orderBy: [{ ratingCount: "desc" }, { name: "asc" }],
      take: 40,
      select: {
        slug: true,
        name: true,
        coverImageUrl: true,
        discountActive: true,
        discountPercent: true,
        discountStartsAt: true,
        discountEndsAt: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        category: { select: { name: true } },
        variants: {
          where: { isActive: true },
          select: { priceCents: true, compareAtCents: true },
        },
      },
    }),
    prisma.product.count({ where }),
    getMoneyFormatter(),
  ]);

  const needle = q.toLowerCase();
  const ranked = [...products]
    .sort((a, b) => {
      const as = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return as - bs;
    })
    .slice(0, LIMIT);

  const results = ranked.map((p) => {
    const prices = p.variants.map((v) => effectivePrice(v, p));
    const low = prices.reduce<(typeof prices)[number] | null>(
      (best, price) => (!best || price.priceCents < best.priceCents ? price : best),
      null,
    );
    const highCents = prices.reduce((max, price) => Math.max(max, price.priceCents), 0);
    const image = p.coverImageUrl ?? p.images[0]?.url ?? null;

    return {
      slug: p.slug,
      name: p.name,
      category: p.category?.name ?? null,
      image: image ? mediaSrc(image) : null,
      price: low
        ? low.priceCents === highCents
          ? money.format(low.priceCents)
          : `${money.format(low.priceCents)} – ${money.format(highCents)}`
        : null,
      compareAt: low?.compareAtCents ? money.format(low.compareAtCents) : null,
    };
  });

  return Response.json({ query: q, total, results }, { headers });
}
