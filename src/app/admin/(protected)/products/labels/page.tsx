import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { PrintButton } from "@/components/admin/PrintButton";
import {
  getBarcodeConfig,
  renderBarcodeSvg,
  isTwoD,
  LABEL_PAPERS,
  type BarcodeFormat,
} from "@/lib/barcode";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Barcode labels", robots: { index: false } };

/**
 * A printable sheet of barcode labels.
 *
 * Its own route rather than a print stylesheet over the products table, so
 * admin chrome never reaches the paper. Paper size, label size, spacing,
 * colours and what each label carries all come from Settings > Barcodes, so
 * the sheet matches whatever label stock the shop actually buys - including a
 * thermal roll, where the page is a single label.
 */
export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    copies?: string;
    ids?: string;
    sort?: string;
    stock?: string;
    limit?: string;
  }>;
}) {
  await requireCapability("catalog");
  const [sp, config, money, settings, categories] = await Promise.all([
    searchParams,
    getBarcodeConfig(),
    getMoneyFormatter(),
    getSettings(),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } }),
  ]);

  const copies = Math.min(100, Math.max(1, Number(sp.copies) || config.labelCopies));
  const limit = Math.min(1000, Math.max(1, Number(sp.limit) || 500));
  const categorySlug = sp.category ?? "";
  const onlyIds = (sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const sort = (["name", "sku", "newest"] as const).includes(sp.sort as "name")
    ? (sp.sort as "name" | "sku" | "newest")
    : config.labelSort;
  const inStockOnly = sp.stock === "in";

  const orderBy =
    sort === "sku"
      ? [{ sku: "asc" as const }]
      : sort === "newest"
        ? [{ createdAt: "desc" as const }]
        : [{ product: { name: "asc" as const } }, { sortOrder: "asc" as const }];

  const variants = config.enabled
    ? await prisma.productVariant.findMany({
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
        orderBy,
        include: { product: { select: { name: true } } },
        take: limit,
      })
    : [];

  // One entry per label to print, so the grid is a straight map.
  const labels = variants.flatMap((v) => Array.from({ length: copies }, () => v));

  // Filters carried over to the image download, so both show the same set.
  const downloadQuery = new URLSearchParams({
    ...(categorySlug ? { category: categorySlug } : {}),
    ...(onlyIds.length ? { ids: onlyIds.join(",") } : {}),
    ...(inStockOnly ? { stock: "in" } : {}),
    sort,
    limit: String(limit),
  }).toString();

  const paper = LABEL_PAPERS.find((p) => p.value === config.labelPaper) ?? LABEL_PAPERS[0];
  const onRoll = config.labelPaper === "roll";
  const storeName = settings[SETTING_KEYS.storeName] || "";

  /*
   * globals.css zeroes @page for the invoice and slip; this rule comes later
   * in the document, so the sheet gets the paper and margin chosen in
   * settings. On a roll the page is exactly one label, with no margin.
   */
  /*
   * The page margin stays 0, so the browser prints no date or URL, and the sheet
   * pads itself by the configured margin instead. The shared print rule pads
   * every document by 14 mm; stacked on an @page margin that ate 44 mm of an A4
   * sheet and pushed the last column of labels off the right edge.
   */
  const marginMm = onRoll ? 0 : config.labelMarginMm;
  const pageCss =
    (onRoll
      ? `@page { size: ${config.labelWidthMm}mm ${config.labelHeightMm}mm; margin: 0; }`
      : `@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }`) +
    `@media print { .print-document.label-sheet { padding: ${marginMm}mm !important; min-height: 0 !important; display: block !important; } }`;

  // No more columns than actually fit across the paper, so nothing prints off the edge.
  const printableMm = onRoll ? config.labelWidthMm : paper.width - 2 * marginMm;
  const fitColumns = Math.max(
    1,
    Math.floor((printableMm + config.labelGapMm) / (config.labelWidthMm + config.labelGapMm)),
  );
  const columns = onRoll ? 1 : Math.min(config.labelColumns, fitColumns);

  const titleTransform =
    config.labelTitleCase === "upper"
      ? "uppercase"
      : config.labelTitleCase === "capitalize"
        ? "capitalize"
        : "none";

  /*
   * Bar height tracks the label, kept short: the bars used to be stretched to
   * the label's full width, which made a short 6-digit code very tall, so the
   * name above and the number below were cut off. The barcode now shrinks to
   * the space the text leaves (see the flex-1 area below).
   */
  const barHeight = Math.max(4, Math.round(config.labelHeightMm * (config.labelMinimal ? 0.3 : 0.2)));

  // The number under the bars, as small text rather than the barcode's own
  // caption, so it stays readable and never scales up with the bars.
  const codeLine = (code: string, format: BarcodeFormat) =>
    isTwoD(format) ? null : (
      <p className="shrink-0 pt-[0.8mm] text-center font-mono leading-none tracking-[0.15em]" style={{ fontSize: "0.8em" }}>
        {code}
      </p>
    );

  /*
   * The bars, pinned inside their own box. Printing sized a percentage-height
   * SVG taller than its flex slot, so the bars ran down into the number on the
   * PDF (the screen was fine); absolutely positioned, they cannot leave it.
   */
  const barsBox = (svg: string) => (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="absolute inset-0 flex items-center justify-center [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );

  return (
    <div className="print-document label-sheet mx-auto max-w-[900px] bg-white p-8 text-black">
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />

      <div className="print-hide mb-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/products"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to products
            </Link>
            <p className="text-sm text-slate-500">
              {labels.length} label{labels.length === 1 ? "" : "s"} &middot;{" "}
              {config.labelWidthMm}&times;{config.labelHeightMm} mm on{" "}
              {onRoll ? "a roll" : paper.label.split(" (")[0]}.{" "}
              <Link href="/admin/settings/barcodes" className="font-medium text-[var(--admin-accent)] hover:underline">
                Change the design
              </Link>
              {!onRoll && columns < config.labelColumns ? (
                <span className="ml-1 text-amber-700">
                  Only {columns} of the {config.labelColumns} columns fit across the paper, so {columns} are printed.
                </span>
              ) : null}
            </p>
          </div>
          {labels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* The same filters as the sheet, so what downloads is what is shown. */}
              <a
                href={`/api/admin/barcodes/download?${downloadQuery}&format=png`}
                className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
              >
                Download PNGs
              </a>
              <a
                href={`/api/admin/barcodes/download?${downloadQuery}&format=svg`}
                className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
              >
                Download SVGs
              </a>
              <PrintButton label="Print labels" />
            </div>
          ) : null}
        </div>

        <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 p-4">
          {onlyIds.length ? <input type="hidden" name="ids" value={onlyIds.join(",")} /> : null}
          <div>
            <label htmlFor="category" className="mb-1.5 block text-xs font-medium text-slate-600">
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue={categorySlug}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm"
            >
              <option value="">Everything</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="mb-1.5 block text-xs font-medium text-slate-600">
              Order
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm"
            >
              <option value="name">Product name</option>
              <option value="sku">SKU</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
          <div>
            <label htmlFor="stock" className="mb-1.5 block text-xs font-medium text-slate-600">
              Stock
            </label>
            <select
              id="stock"
              name="stock"
              defaultValue={inStockOnly ? "in" : "all"}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm"
            >
              <option value="all">Everything with a code</option>
              <option value="in">In stock only</option>
            </select>
          </div>
          <div>
            <label htmlFor="copies" className="mb-1.5 block text-xs font-medium text-slate-600">
              Copies of each
            </label>
            <input
              id="copies"
              name="copies"
              type="number"
              min="1"
              max="100"
              defaultValue={copies}
              className="w-24 rounded-full border border-slate-200 px-4 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="limit" className="mb-1.5 block text-xs font-medium text-slate-600">
              Products at most
            </label>
            <input
              id="limit"
              name="limit"
              type="number"
              min="1"
              max="1000"
              defaultValue={limit}
              className="w-24 rounded-full border border-slate-200 px-4 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-[var(--admin-btn)] px-5 py-2 text-sm font-semibold text-[var(--admin-btn-ink)]"
          >
            Update sheet
          </button>
        </form>

        {!config.enabled ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Barcodes are switched off.{" "}
            <Link href="/admin/settings/barcodes" className="font-semibold underline">
              Turn them on
            </Link>{" "}
            and generate codes first.
          </p>
        ) : labels.length === 0 ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Nothing to print. Products need a code &mdash;{" "}
            <Link href="/admin/settings/barcodes" className="font-semibold underline">
              generate the missing ones
            </Link>
            .
          </p>
        ) : null}
      </div>

      {/* Centred, so the left and right margins on the paper match. */}
      <div
        className="grid content-start justify-center"
        style={{
          gridTemplateColumns: `repeat(${columns}, ${config.labelWidthMm}mm)`,
          gap: `${config.labelGapMm}mm`,
        }}
      >
        {labels.map((v, i) => {
          const format = (v.barcodeFormat as BarcodeFormat) ?? config.format;
          const svg = renderBarcodeSvg(v.barcode!, format, {
            height: barHeight,
            scale: 2,
            includeText: false,
            barColor: config.labelBarColor,
            bgColor: config.labelBgColor,
          });

          return (
            <div
              key={`${v.id}-${i}`}
              className="flex break-inside-avoid flex-col overflow-hidden px-2 py-1.5"
              style={{
                width: `${config.labelWidthMm}mm`,
                height: `${config.labelHeightMm}mm`,
                backgroundColor: config.labelBgColor,
                border: config.labelBorder ? "1px solid #94a3b8" : "none",
                borderRadius: `${config.labelRadiusMm}mm`,
                fontSize: `${config.labelFontPt}pt`,
                // Roll labels print one per page.
                breakAfter: onRoll ? "page" : undefined,
              }}
            >
              {/*
                Minimal mode is for stickers too small for anything but the
                code itself - the number stays, since a smudged barcode can
                still be typed in.
              */}
              {config.labelMinimal ? (
                <>
                  {svg ? barsBox(svg) : null}
                  {svg ? codeLine(v.barcode!, format) : <p className="text-center font-mono">{v.barcode}</p>}
                </>
              ) : (
                <>
                  {config.labelShowStore && storeName ? (
                    <p className="shrink-0 truncate text-center leading-none opacity-70" style={{ fontSize: "0.8em" }}>
                      {storeName}
                    </p>
                  ) : null}

                  {/*
                    "split" is the shelf-label arrangement: name on the left,
                    price on the right, code beneath. "centered" stacks
                    everything, which suits a narrow label better.
                  */}
                  {config.labelLayout === "split" ? (
                    /*
                     * Always exactly two lines tall - name, then option (blank
                     * when there is none) - so every label leaves the barcode
                     * the same space and all bars print the same size. A label
                     * without an option line used to get taller, wider bars.
                     */
                    <div
                      className="mb-0.5 flex shrink-0 items-start justify-between gap-2 overflow-hidden leading-tight"
                      style={{ height: "2.5em" }}
                    >
                      <p className="min-w-0 font-semibold" style={{ textTransform: titleTransform }}>
                        {config.labelShowVariant ? (
                          <>
                            <span className="block truncate">{v.product.name}</span>
                            <span className="block truncate font-normal opacity-75">
                              {v.name && v.name !== "Default" ? v.name : " "}
                            </span>
                          </>
                        ) : (
                          <span className="line-clamp-2">{v.product.name}</span>
                        )}
                      </p>
                      {config.labelShowPrice ? (
                        <span className="shrink-0 font-bold">
                          {config.labelPricePrefix ? `${config.labelPricePrefix} ` : ""}
                          {money.format(v.priceCents)}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    // Same fixed two-line height as the split layout, for the same reason.
                    <div className="mb-0.5 shrink-0 overflow-hidden text-center leading-tight" style={{ height: "2.5em" }}>
                      {config.labelShowVariant ? (
                        <>
                          <p className="truncate font-semibold" style={{ textTransform: titleTransform }}>
                            {v.product.name}
                          </p>
                          <p className="truncate opacity-75" style={{ fontSize: "0.9em" }}>
                            {v.name && v.name !== "Default" ? v.name : " "}
                          </p>
                        </>
                      ) : (
                        <p className="line-clamp-2 font-semibold" style={{ textTransform: titleTransform }}>
                          {v.product.name}
                        </p>
                      )}
                    </div>
                  )}

                  {/* The barcode takes whatever height the text leaves, so nothing is ever cut off. */}
                  {svg ? barsBox(svg) : null}
                  {svg ? codeLine(v.barcode!, format) : <p className="text-center font-mono">{v.barcode}</p>}

                  <div className="mt-0.5 flex w-full shrink-0 items-center justify-between gap-2 px-0.5" style={{ fontSize: "0.9em" }}>
                    {config.labelShowSku ? <span className="truncate">{v.sku}</span> : <span />}
                    {config.labelLayout === "centered" && config.labelShowPrice ? (
                      <span className="shrink-0 font-bold">
                        {config.labelPricePrefix ? `${config.labelPricePrefix} ` : ""}
                        {money.format(v.priceCents)}
                      </span>
                    ) : null}
                  </div>

                  {config.labelCustomText ? (
                    <p className="shrink-0 truncate text-center leading-none opacity-70" style={{ fontSize: "0.8em" }}>
                      {config.labelCustomText}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
