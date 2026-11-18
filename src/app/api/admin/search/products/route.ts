import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";

export const dynamic = "force-dynamic";

/** Below this the result set is too broad to be a suggestion. */
const MIN_CHARS = 3;
const LIMIT = 8;

/**
 * Typeahead for the admin search box.
 *
 * Matches on name, slug and variant SKU, so scanning a barcode or pasting a
 * SKU finds the product just as typing its name does.
 */
export async function GET(request: Request): Promise<NextResponse> {
  await requireCapability("catalog");

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < MIN_CHARS) return NextResponse.json({ items: [] });

  const [products, money] = await Promise.all([
    prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
          { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
        ],
      },
      // Published first, then most recently touched - a draft is rarely what
      // you are hunting for mid-task.
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: LIMIT,
      select: {
        id: true,
        name: true,
        status: true,
        images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
        variants: {
          select: { sku: true, priceCents: true, stock: true },
          orderBy: { priceCents: "asc" },
          take: 1,
        },
      },
    }),
    getMoneyFormatter(),
  ]);

  return NextResponse.json({
    items: products.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      image: p.images[0]?.url ?? null,
      sku: p.variants[0]?.sku ?? null,
      price: p.variants[0] ? money.format(p.variants[0].priceCents) : null,
      stock: p.variants[0]?.stock ?? null,
    })),
  });
}
