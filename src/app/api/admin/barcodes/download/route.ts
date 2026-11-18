import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildZip, safeFileName, type ZipEntry } from "@/lib/zip";
import {
  getBarcodeConfig,
  renderBarcodePng,
  renderBarcodeSvg,
  type BarcodeFormat,
} from "@/lib/barcode";

export const dynamic = "force-dynamic";

/**
 * Every barcode as an image, in one zip.
 *
 * The plugin this replaces did it in the browser with dom-to-image, which
 * screenshots the page - so the file was only as good as the screen. Drawing
 * server-side gives a clean PNG (or the SVG itself, for a print shop) named
 * after the SKU, and the same filters the label sheet uses.
 */
export async function GET(request: Request): Promise<Response> {
  const me = await getApiAdmin();
  if (!me || !can(me.role, "catalog")) {
    return new Response("Not allowed.", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const wantSvg = params.get("format") === "svg";
  const categorySlug = params.get("category") ?? "";
  const onlyIds = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const inStockOnly = params.get("stock") === "in";
  const sort = params.get("sort") ?? "name";
  const limit = Math.min(1000, Math.max(1, Number(params.get("limit")) || 500));

  const config = await getBarcodeConfig();
  if (!config.enabled) return new Response("Barcodes are switched off.", { status: 409 });

  const variants = await prisma.productVariant.findMany({
    where: {
      isActive: true,
      barcode: { not: null },
      ...(inStockOnly ? { stock: { gt: 0 } } : {}),
      ...(onlyIds.length ? { id: { in: onlyIds } } : {}),
      ...(categorySlug
        ? {
            product: {
              OR: [
                { category: { slug: categorySlug } },
                { categories: { some: { slug: categorySlug } } },
              ],
            },
          }
        : {}),
    },
    orderBy:
      sort === "sku"
        ? [{ sku: "asc" }]
        : sort === "newest"
          ? [{ createdAt: "desc" }]
          : [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    include: { product: { select: { name: true } } },
    take: limit,
  });

  if (variants.length === 0) {
    return new Response("Nothing to download - no products have a code yet.", { status: 404 });
  }

  const entries: ZipEntry[] = [];
  for (const v of variants) {
    const format = (v.barcodeFormat as BarcodeFormat) ?? config.format;
    const name = safeFileName(`${v.sku}-${v.barcode}`, v.id);

    if (wantSvg) {
      const svg = renderBarcodeSvg(v.barcode!, format, {
        barColor: config.labelBarColor,
        bgColor: config.labelBgColor,
      });
      if (svg) entries.push({ name: `${name}.svg`, data: Buffer.from(svg, "utf8") });
    } else {
      const png = await renderBarcodePng(v.barcode!, format, { height: 12, scale: 3 });
      if (png) entries.push({ name: `${name}.png`, data: png });
    }
  }

  if (entries.length === 0) {
    return new Response("None of those codes could be drawn.", { status: 422 });
  }

  const zip = buildZip(entries);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="barcodes-${stamp}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
