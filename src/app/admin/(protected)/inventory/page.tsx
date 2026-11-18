import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card, btnPrimary } from "@/components/admin/ui";
import { IconSearch } from "@/components/admin/Icons";
import { TH, Empty } from "@/components/admin/PageCard";
import { bulkUpdateStock, updateStock } from "./actions";
import { BulkSelectAll, InventoryBulkBar } from "@/components/admin/InventoryBulkBar";
import type { Prisma } from "@/generated/prisma";
import { requireCapability } from "@/lib/permissions";
import { InventoryRowCells } from "@/components/admin/InventoryRowCells";
import { managesStock, stockLabel } from "@/lib/stock";

export const metadata: Metadata = { title: "Manage inventory" };
export const dynamic = "force-dynamic";

const LOW_STOCK_AT = 5;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; saved?: string }>;
}) {
  await requireCapability("catalog");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filter = sp.filter ?? "";
  // Where the bulk bar comes back to, keeping the search and filter in place.
  const backParams = new URLSearchParams({ ...(q ? { q } : {}), ...(filter ? { filter } : {}) }).toString();
  const backHref = `/admin/inventory${backParams ? `?${backParams}` : ""}`;

  const where: Prisma.ProductVariantWhereInput = {
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" as const } },
            { product: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    /*
     * "Out" and "low" are about what can actually be sold, not about a number:
     * an option that does not count its stock sits at zero for ever and is not
     * out of anything, while one on backorder is orderable at zero.
     */
    ...(filter === "out"
      ? {
          OR: [
            { stockStatus: "OUT_OF_STOCK" as const },
            { manageStock: true, backorders: "NO" as const, stock: { lte: 0 } },
          ],
        }
      : {}),
    ...(filter === "low"
      ? { manageStock: true, stock: { gt: 0, lte: LOW_STOCK_AT } }
      : {}),
    ...(filter === "untracked" ? { manageStock: false } : {}),
  };

  const [variants, money] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      orderBy: [{ stock: "asc" }, { sku: "asc" }],
      take: 200,
      include: { product: { select: { id: true, name: true, status: true } } },
    }),
    getMoneyFormatter(),
  ]);

  // Only counted options have units to total; the rest have no number at all.
  const counted = variants.filter((v) => managesStock(v));
  const totalUnits = counted.reduce((n, v) => n + v.stock, 0);
  const stockValue = counted.reduce((n, v) => n + v.stock * v.priceCents, 0);

  const FILTERS = [
    { value: "", label: "All" },
    { value: "low", label: `Low stock (≤ ${LOW_STOCK_AT})` },
    { value: "out", label: "Out of stock" },
    { value: "untracked", label: "Not counted" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#E2EEEA] p-5">
          <p className="text-sm font-medium text-slate-700">Tracked variants</p>
          {/* Counted options only - it showed every listed option, so a shop
              counting nothing still read "Tracked variants 20". */}
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            {counted.length}
            <span className="ml-2 text-sm font-normal text-slate-500">of {variants.length}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-[#F5EDDA] p-5">
          <p className="text-sm font-medium text-slate-700">Units on hand</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            {totalUnits}
          </p>
        </div>
        <div className="rounded-2xl bg-[#E3EAF3] p-5">
          <p className="text-sm font-medium text-slate-700">Stock value at retail</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            <span title={money.format(stockValue)}>{money.compact(stockValue)}</span>
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
          <h1 className="text-xl font-semibold text-slate-900">Manage inventory</h1>
          {sp.saved ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              Stock updated
            </span>
          ) : null}
        </div>

        <form action="/admin/inventory" className="flex flex-wrap items-center gap-3 px-3 lg:px-5 py-5">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Product name or SKU"
              className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)]"
            />
          </div>
          <select
            name="filter"
            defaultValue={filter}
            className="appearance-none rounded-full border border-slate-200 bg-white py-2.5 pl-5 pr-10 text-sm text-slate-700 outline-none focus:border-[var(--admin-accent)]"
          >
            {FILTERS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Apply
          </button>
        </form>

        {variants.length === 0 ? (
          <Empty>No variants match those filters.</Empty>
        ) : (
          <>
          {/* Tick rows, then change them together. Its own form - the row boxes
              join it with form="inventory-bulk" - so it never posts the table. */}
          <InventoryBulkBar formId="inventory-bulk" action={bulkUpdateStock} back={backHref} />
          <form action={updateStock} className="group">
            {/*
              One tracking decision for everything listed, outside the table -
              a tick per row was a column of identical boxes. It starts ticked
              only when every listed option is already counted, so saving never
              starts counting (at zero, and so out of stock) by surprise.
            */}
            <div className="mx-3 mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 lg:mx-5">
              <label className="flex items-start gap-3">
                <input
                  id="track-all"
                  type="checkbox"
                  name="trackAll"
                  defaultChecked={variants.length > 0 && counted.length === variants.length}
                  className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                />
                <span className="text-sm text-slate-700">
                  Track quantity for every listed option
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Off means they are always in stock and no quantity limits the
                    cart. On shows a stock box on each row. Applies to the{" "}
                    {variants.length} option{variants.length === 1 ? "" : "s"} below when you save.
                    Backorders are set per option on the product.
                  </span>
                </span>
              </label>
              {counted.length > 0 && counted.length < variants.length ? (
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                  {counted.length} of {variants.length} counted now
                </span>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full ">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="w-10 py-3 pl-3 lg:pl-5">
                      <BulkSelectAll />
                    </th>
                    <TH>SKU</TH>
                    <TH>Product</TH>
                    <TH>Variant</TH>
                    <TH align="right">Price</TH>
                    <TH align="right">Stock</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">State</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {variants.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/60">
                      <td className="w-10 py-3 pl-3 lg:pl-5">
                        <input
                          type="checkbox"
                          name="ids"
                          value={v.id}
                          form="inventory-bulk"
                          data-bulk-row
                          aria-label={`Select ${v.product.name} ${v.name}`}
                          className="h-4 w-4 accent-[var(--admin-accent)]"
                        />
                      </td>
                      <td className="px-3 lg:px-5 py-3 text-sm text-slate-500">{v.sku}</td>
                      <td className="px-3 lg:px-5 py-3">
                        <Link
                          href={`/admin/products/${v.product.id}`}
                          className="text-sm font-medium text-slate-900 hover:text-[var(--admin-accent)]"
                        >
                          {v.product.name}
                        </Link>
                      </td>
                      <td className="px-3 lg:px-5 py-3 text-sm text-slate-600">{v.name}</td>
                      <td className="px-3 lg:px-5 py-3 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                        {money.format(v.priceCents)}
                      </td>
                      {/* Quantity (shown while tracking is ticked above) and status. */}
                      <InventoryRowCells
                        variantId={v.id}
                        label={`${v.product.name} ${v.name}`}
                        stock={v.stock}
                        stockStatus={v.stockStatus ?? "IN_STOCK"}
                      />
                      <td className="px-3 lg:px-5 py-3 text-right">
                        {(() => {
                          /* The badge follows the rules, so an option that is
                             not counted reads "In stock" rather than claiming a
                             shortage of something it never counted. */
                          const state = stockLabel(v);
                          const low = managesStock(v) && v.stock > 0 && v.stock <= (v.lowStockAmount ?? LOW_STOCK_AT);
                          const text =
                            state === "out"
                              ? "Out of stock"
                              : state === "backorder"
                                ? "On backorder"
                                : low
                                  ? "Low"
                                  : "In stock";
                          const tone =
                            state === "out"
                              ? "bg-rose-50 text-rose-700"
                              : state === "backorder" || low
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700";
                          return (
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
                              {text}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end px-3 lg:px-5 py-5">
              <button type="submit" className={btnPrimary}>
                Save stock levels
              </button>
            </div>
          </form>
          </>
        )}
      </Card>
    </div>
  );
}
