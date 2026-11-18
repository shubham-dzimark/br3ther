import Link from "next/link";
import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { lookupBarcode, getBarcodeConfig } from "@/lib/barcode";
import { SectionCard } from "@/components/admin/Field";
import { orderNo } from "@/lib/order-display";

export const metadata: Metadata = { title: "Scan lookup" };
export const dynamic = "force-dynamic";

/**
 * Scan a barcode and see what it is.
 *
 * A plain GET form on purpose: a USB barcode scanner types the code and
 * presses Enter, so this works with no JavaScript, no pairing and no driver -
 * and the result is a normal page that can be bookmarked or re-run.
 *
 * It resolves product codes and SKUs, and the order numbers printed on
 * packing slips, so the same screen serves picking and the stockroom.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  await requireCapability("catalog");
  const [{ code = "" }, config, money] = await Promise.all([
    searchParams,
    getBarcodeConfig(),
    getMoneyFormatter(),
  ]);

  const query = code.trim();
  const hit = query ? await lookupBarcode(query) : null;

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Scan lookup</h1>
      <p className="-mt-2 text-sm text-slate-500">
        Scan a product label or a packing slip. A handheld scanner just types
        the number and presses Enter.
      </p>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="code" className="mb-1.5 block text-xs font-medium text-slate-600">
            Barcode, SKU or order number
          </label>
          <input
            id="code"
            name="code"
            defaultValue={query}
            autoFocus
            autoComplete="off"
            placeholder="Scan or type, then press Enter"
            className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm"
          />
        </div>
        <button type="submit" className="rounded-full bg-[var(--admin-btn)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)]">
          Look up
        </button>
      </form>

      {!config.enabled ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Barcodes are switched off, so only SKUs and order numbers will match.{" "}
          <Link href="/admin/settings/barcodes" className="font-semibold underline">
            Barcode settings
          </Link>
        </p>
      ) : null}

      {query && !hit ? (
        <p role="status" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
          Nothing matches <span className="font-mono font-semibold">{query}</span>. It may be
          another shop&rsquo;s code, or the item has no code yet.
        </p>
      ) : null}

      {hit?.kind === "variant" ? (
        <SectionCard title="Product">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-slate-900">{hit.variant.product.name}</p>
              <p className="mt-0.5 text-sm text-slate-500">
                {hit.variant.name}
                {hit.variant.isActive ? "" : " - not for sale"}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-slate-500">SKU</dt>
                <dd className="font-mono text-slate-900">{hit.variant.sku}</dd>
                <dt className="text-slate-500">Barcode</dt>
                <dd className="font-mono text-slate-900">{hit.variant.barcode ?? "none yet"}</dd>
                {hit.variant.sortlyItemId !== null ? (
                  <>
                    <dt className="text-slate-500">Sortly</dt>
                    <dd className="font-mono text-slate-900">
                      {hit.variant.sortlySid ?? `#${hit.variant.sortlyItemId}`}
                      {hit.variant.sortlyLabelCodes.length > 0 ? (
                        <span className="block text-xs text-slate-500">label {hit.variant.sortlyLabelCodes.join(", ")}</span>
                      ) : null}
                    </dd>
                  </>
                ) : null}
                <dt className="text-slate-500">Price</dt>
                <dd className="font-semibold text-slate-900">{money.format(hit.variant.priceCents)}</dd>
                <dt className="text-slate-500">In stock</dt>
                <dd
                  className={`font-semibold ${
                    hit.variant.stock > 0 ? "text-slate-900" : "text-red-600"
                  }`}
                >
                  {hit.variant.stock}
                </dd>
              </dl>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Link
                href={`/admin/products/${hit.variant.product.id}`}
                className="rounded-full bg-[var(--admin-btn)] px-5 py-2.5 text-center text-sm font-semibold text-[var(--admin-btn-ink)]"
              >
                Open product
              </Link>
              <Link
                href={`/admin/products/labels?ids=${hit.variant.id}`}
                className="rounded-full border border-slate-200 px-5 py-2.5 text-center text-sm font-medium text-slate-700 hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
              >
                Print its label
              </Link>
              <Link
                href={`/products/${hit.variant.product.slug}`}
                target="_blank"
                className="rounded-full border border-slate-200 px-5 py-2.5 text-center text-sm font-medium text-slate-700 hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
              >
                View in shop
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {hit?.kind === "order" ? (
        <SectionCard title="Order">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {orderNo(hit.order.orderNumber)}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">Status: {hit.order.status}</p>
            </div>
            <Link
              href={`/admin/orders/${hit.order.id}`}
              className="rounded-full bg-[var(--admin-btn)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)]"
            >
              Open order
            </Link>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
