import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card, btnPrimary } from "@/components/admin/ui";
import {
  IconChevronLeft,
  IconChevronRight,
  IconImage,
  IconPencil,
  IconSearch,
  IconTrash,
} from "@/components/admin/Icons";
import { bulkBundleSave, bulkChangePrices, deleteProduct, duplicateProduct } from "./actions";
import type { Prisma, ProductStatus } from "@/generated/prisma";
import { requireCapability } from "@/lib/permissions";
import { BulkBar, BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import {
  bulkDeleteProducts,
  bulkDraftProducts,
  bulkPublishProducts,
} from "./actions";
import { SeoDot } from "@/components/admin/SeoDot";
import { seoHealth, templatePresence } from "@/lib/seo-templates";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

const PER_PAGE = 10;
const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    category?: string;
    stock?: string;
    page?: string;
  }>;
}) {
  await requireCapability("catalog");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = STATUSES.includes(sp.status ?? "") ? sp.status : undefined;
  const category = sp.category || undefined;
  const stock = sp.stock === "low" ? "low" : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

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
    // "Stock products" in the sidebar - anything at or below the low-stock mark.
    ...(stock === "low" ? { variants: { some: { stock: { lte: 5 } } } } : {}),
  };

  const [products, total, categories, money, seoTpl] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        category: { select: { name: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        variants: { select: { priceCents: true, compareAtCents: true, stock: true } },
      },
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getMoneyFormatter(),
    templatePresence("product"),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  const linkTo = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q, status, category, stock, page: String(page), ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "page" && v === "1")) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
  };

  const selectCls =
    "appearance-none rounded-full border border-slate-200 bg-white py-2.5 pl-5 pr-10 text-sm text-slate-700 outline-none transition focus:border-[var(--admin-accent)]";
  const toolCls =
    "rounded-full border border-[var(--admin-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5";

  /*
   * Export carries the filters the list is showing, so the file and the screen
   * always agree - narrow to one category, export, and that is what you get.
   */
  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, status, category, stock })) {
    if (v) exportParams.set(k, v);
  }
  const exportHref = `/api/admin/export/products${
    exportParams.toString() ? `?${exportParams.toString()}` : ""
  }`;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <h1 className="text-xl font-semibold text-slate-900">Product list</h1>
        <Link href="/admin/products/new" className={btnPrimary}>
          Create product
        </Link>
      </div>

      <form
        className="flex flex-wrap items-center gap-3 px-3 lg:px-5 py-5"
        action="/admin/products"
      >
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search..."
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)]"
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* The pair is a round trip: export what you are looking at, change
              it in a spreadsheet, send the same file back. */}
          <a href={exportHref} className={toolCls}>
            Export
          </a>
          <Link href="/admin/products/import" className={toolCls}>
            Import
          </Link>

          <select name="category" defaultValue={category ?? ""} className={selectCls}>
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select name="status" defaultValue={status ?? ""} className={selectCls}>
            <option value="">Status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Apply
          </button>
        </div>
      </form>

      {products.length === 0 ? (
        <div className="px-6 pb-12 pt-6 text-center">
          <p className="text-sm text-slate-500">
            {q || status || category
              ? "No products match those filters."
              : "No products yet."}
          </p>
          <Link
            href="/admin/products/new"
            className="mt-3 inline-block text-sm font-medium text-[var(--admin-accent)] hover:underline"
          >
            Add your first product
          </Link>
        </div>
      ) : (
        <>
          {/* The table *is* the form: row checkboxes post as `ids`. */}
          <form id="bulk-products" className="px-6">
            <BulkBar
              formId="bulk-products"
              noun="product"
              actions={[
                { label: "Change prices", action: bulkChangePrices },
                { label: "Bundle & Save", action: bulkBundleSave },
                { label: "Publish", action: bulkPublishProducts },
                { label: "Move to draft", action: bulkDraftProducts },
                { label: "Delete", action: bulkDeleteProducts, danger: true },
              ]}
            />
          </form>

          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="w-10 px-3 lg:px-5 py-3.5 text-left">
                    <BulkMaster formId="bulk-products" label="Select all products" />
                  </th>
                  {["ID", "Product", "Category", "Price", "Stock", "SEO", "Status", "Action"].map(
                    (h) => (
                      <th
                        key={h}
                        className={`px-3 lg:px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                          h === "Action" ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const prices = p.variants.map((v) => v.priceCents);
                  const low = prices.length ? Math.min(...prices) : 0;
                  const high = prices.length ? Math.max(...prices) : 0;
                  // On sale when any variant has a higher struck-through price.
                  const onSale = p.variants.some(
                    (v) => v.compareAtCents != null && v.compareAtCents > v.priceCents,
                  );
                  const wasLow = onSale
                    ? Math.min(
                        ...p.variants
                          .filter((v) => v.compareAtCents != null)
                          .map((v) => v.compareAtCents as number),
                      )
                    : 0;
                  const stock = p.variants.reduce((n, v) => n + v.stock, 0);
                  // The cover is what the storefront leads with, so the list
                  // should show the same picture rather than whichever gallery
                  // image happens to sort first.
                  const img = p.coverImageUrl
                    ? { url: p.coverImageUrl, alt: p.name }
                    : p.images[0];

                  return (
                    <tr
                      key={p.id}
                      // A Free Gift offer's gift product: tinted so it stands out.
                      className={p.isGiftOnly ? "bg-amber-50/70 hover:bg-amber-50" : "hover:bg-slate-50/60"}
                    >
                      <td className="px-3 lg:px-5 py-4">
                        <BulkCheckbox formId="bulk-products" id={p.id} label={p.name} />
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-sm text-slate-500">
                        #{p.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="px-3 lg:px-5 py-4">
                        <div className="flex items-center gap-3">
                          {img ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={img.url}
                              alt={img.alt ?? ""}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                              <IconImage />
                            </span>
                          )}
                          <div className="min-w-0">
                            <Link
                              href={`/admin/products/${p.id}`}
                              className="block truncate text-sm font-medium text-slate-900 hover:text-[var(--admin-accent)]"
                            >
                              {p.name}
                            </Link>
                            <span className="block truncate text-xs text-slate-400">
                              /{p.slug}
                            </span>
                            {p.isGiftOnly ? (
                              <span
                                title="The gift in a Free Gift offer: hidden from the storefront"
                                className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                              >
                                🎁 Free gift
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-sm text-slate-600">
                        {p.category?.name ?? "—"}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-sm tabular-nums">
                        <span className="font-semibold text-[var(--admin-accent)]">
                          {low === high
                            ? money.format(low)
                            : `${money.format(low)} – ${money.format(high)}`}
                        </span>
                        {onSale ? (
                          <span className="ml-2 text-xs text-slate-400 line-through">
                            {money.format(wasLow)}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`px-3 lg:px-5 py-4 text-sm tabular-nums ${
                          stock === 0 ? "font-medium text-amber-600" : "text-slate-600"
                        }`}
                      >
                        {stock}
                      </td>
                      <td className="px-3 py-4 lg:px-5">
                        <SeoDot health={seoHealth(p, seoTpl)} />
                      </td>
                      <td className="px-3 lg:px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                            p.status === "PUBLISHED"
                              ? "bg-emerald-50 text-emerald-700"
                              : p.status === "DRAFT"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {p.status === "PUBLISHED"
                            ? "Publish"
                            : p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/products/${p.id}`}
                            title="Edit"
                            aria-label={`Edit ${p.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          >
                            <IconPencil className="h-[17px] w-[17px]" />
                          </Link>
                          <form action={duplicateProduct}>
                            <input type="hidden" name="id" value={p.id} />
                            <button
                              type="submit"
                              title="Duplicate"
                              aria-label={`Duplicate ${p.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-[var(--admin-accent)]/10 hover:text-[var(--admin-accent)]"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
                                <rect x="9" y="9" width="12" height="12" rx="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            </button>
                          </form>
                          <form action={deleteProduct}>
                            <input type="hidden" name="id" value={p.id} />
                            <button
                              type="submit"
                              title="Delete"
                              aria-label={`Delete ${p.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <IconTrash className="h-[17px] w-[17px]" />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 px-3 lg:px-5 py-4">
            <p className="text-sm text-slate-500">
              {(page - 1) * PER_PAGE + 1}&ndash;
              {Math.min(page * PER_PAGE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Link
                href={linkTo({ page: String(Math.max(1, page - 1)) })}
                aria-disabled={page === 1}
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  page === 1
                    ? "pointer-events-none text-slate-300"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <IconChevronLeft className="h-4 w-4" />
              </Link>
              {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => i + 1).map(
                (n) => (
                  <Link
                    key={n}
                    href={linkTo({ page: String(n) })}
                    className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm ${
                      n === page
                        ? "bg-[#E2EEEA] font-semibold text-[var(--admin-accent)]"
                        : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {n}
                  </Link>
                ),
              )}
              <Link
                href={linkTo({ page: String(Math.min(pageCount, page + 1)) })}
                aria-disabled={page === pageCount}
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  page === pageCount
                    ? "pointer-events-none text-slate-300"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <IconChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
