import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { csvRow } from "@/lib/tracking-csv";
import { getTimeZone, ymd } from "@/lib/timezone";
import {
  PRODUCT_CSV_HEADERS,
  PRODUCT_CSV_SAMPLE,
  boolCell,
  centsToMoney,
  listCell,
} from "@/lib/product-csv";
import type { Prisma, ProductStatus } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

/**
 * The catalogue as a spreadsheet, and the blank one to fill in.
 *
 * `?sample=1` returns the same columns with three example rows and no real
 * data, so a shop that has nothing to export yet still has something to work
 * from. Everything else exports what the product list is currently showing -
 * the same search, category and status the screen is filtered by - so the file
 * and the screen never disagree about what "the products" means.
 *
 * One row per sellable option, so a variable product writes one row per
 * option with its product columns repeated. See lib/product-csv.ts.
 */
export async function GET(request: Request): Promise<Response> {
  await requireCapability("catalog");
  const tz = await getTimeZone();
  const url = new URL(request.url);

  const header = PRODUCT_CSV_HEADERS.join(",");
  const stamp = ymd(new Date(), tz);

  if (url.searchParams.get("sample") === "1") {
    const body = [header, ...PRODUCT_CSV_SAMPLE.map((cells) => csvRow(cells))].join("\n");
    return csvResponse(body, "products-sample.csv");
  }

  const q = (url.searchParams.get("q") ?? "").trim();
  const statusParam = url.searchParams.get("status") ?? "";
  const status = STATUSES.includes(statusParam) ? statusParam : undefined;
  const category = url.searchParams.get("category") || undefined;
  const stock = url.searchParams.get("stock") === "low" ? "low" : undefined;

  // Mirrors the product list's own filter, so "export" means "export what I am
  // looking at".
  const where: Prisma.ProductWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(status ? { status: status as ProductStatus } : {}),
    ...(category ? { categoryId: category } : {}),
    ...(stock === "low" ? { variants: { some: { stock: { lte: 5 } } } } : {}),
  };

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      category: { select: { name: true } },
      categories: { select: { name: true }, orderBy: { name: "asc" } },
      shippingClass: { select: { name: true } },
      images: { orderBy: { sortOrder: "asc" }, select: { url: true } },
      variants: { orderBy: { sortOrder: "asc" } },
    },
  });

  const lines: string[] = [header];

  for (const p of products) {
    const productCells = {
      slug: p.slug,
      name: p.name,
      type: p.type,
      status: p.status,
      featured: boolCell(p.featured),
      category: p.category?.name ?? "",
      categories: listCell(p.categories.map((c) => c.name)),
      soldIndividually: boolCell(p.soldIndividually),
      shippingClass: p.shippingClass?.name ?? "",
      shortDescription: p.shortDescription ?? "",
      description: p.description ?? "",
      seoTitle: p.seoTitle ?? "",
      seoDescription: p.seoDescription ?? "",
      coverImageUrl: p.coverImageUrl ?? "",
      images: listCell(p.images.map((i) => i.url)),
      externalUrl: p.externalUrl ?? "",
      externalLabel: p.externalLabel ?? "",
    };

    /*
     * A product with no options still gets a row - it exists, it can be
     * edited, and leaving it out of the file would quietly drop it from any
     * round trip through a spreadsheet.
     */
    const variants = p.variants.length > 0 ? p.variants : [null];

    for (const v of variants) {
      lines.push(
        csvRow([
          productCells.slug,
          productCells.name,
          productCells.type,
          productCells.status,
          productCells.featured,
          productCells.category,
          productCells.categories,
          v?.name ?? "",
          v?.sku ?? p.sku ?? "",
          v?.barcode ?? "",
          centsToMoney(v?.priceCents),
          centsToMoney(v?.compareAtCents),
          v ? String(v.stock) : p.stock === null ? "" : String(p.stock),
          boolCell(v ? v.manageStock : p.manageStock),
          v?.stockStatus ?? p.stockStatus,
          v?.weightGrams === null || v?.weightGrams === undefined
            ? ""
            : String(v.weightGrams),
          productCells.soldIndividually,
          productCells.shippingClass,
          productCells.shortDescription,
          productCells.description,
          productCells.seoTitle,
          productCells.seoDescription,
          productCells.coverImageUrl,
          productCells.images,
          productCells.externalUrl,
          productCells.externalLabel,
        ]),
      );
    }
  }

  return csvResponse(lines.join("\n"), `products-${stamp}.csv`);
}

function csvResponse(body: string, filename: string): Response {
  return new Response(`﻿${body}`, {
    headers: {
      // The BOM makes Excel read it as UTF-8; without it accented names break.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
