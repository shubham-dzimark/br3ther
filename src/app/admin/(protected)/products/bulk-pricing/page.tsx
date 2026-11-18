import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, SectionCard, fieldInput, fieldSelect } from "@/components/admin/Field";
import { TH } from "@/components/admin/PageCard";
import {
  countRestorable,
  parsePriceChange,
  parseScope,
  previewPriceChange,
  type PriceScope,
} from "@/lib/bulk-pricing";
import { applyBulkPrices, restoreBulkPrices } from "./actions";

export const metadata: Metadata = { title: "Bulk pricing" };
export const dynamic = "force-dynamic";

const PAGE = "/admin/products/bulk-pricing";

type Search = {
  scope?: string;
  category?: string;
  ids?: string;
  direction?: string;
  mode?: string;
  value?: string;
  rounding?: string;
  preview?: string;
  error?: string;
  done?: string;
  n?: string;
  p?: string;
  skipped?: string;
  restored?: string;
};

/**
 * Bulk price changes: preview first, then apply; and a one-click restore to
 * the prices from before the first bulk change.
 */
export default async function BulkPricingPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireCapability("catalog");
  const sp = await searchParams;
  const get = (field: string) => String((sp as Record<string, string | undefined>)[field] ?? "").trim();

  const scope: PriceScope = parseScope(get);
  const [categories, money, restorable, restorableAll, selectedProducts] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getMoneyFormatter(),
    countRestorable(scope),
    countRestorable({ kind: "all" }),
    scope.kind === "products"
      ? prisma.product.findMany({ where: { id: { in: scope.productIds } }, select: { name: true } })
      : Promise.resolve([] as { name: string }[]),
  ]);

  const parsed = sp.preview ? parsePriceChange(get) : null;
  const previewError = parsed && "error" in parsed ? parsed.error : null;
  const summary = parsed && "change" in parsed ? await previewPriceChange(scope, parsed.change) : null;

  const scopeLabel =
    scope.kind === "all"
      ? "every product in the store"
      : scope.kind === "category"
        ? `products in ${categories.find((c) => c.id === scope.categoryId)?.name ?? "that category"}`
        : `the ${selectedProducts.length} selected product${selectedProducts.length === 1 ? "" : "s"}`;

  const changeLabel =
    parsed && "change" in parsed
      ? `${parsed.change.direction === "increase" ? "Raise" : "Lower"} by ${
          parsed.change.mode === "percent" ? `${parsed.change.value}%` : money.format(parsed.change.value)
        }${parsed.change.rounding === "99" ? ", rounded to .99" : parsed.change.rounding === "dollar" ? ", rounded to whole dollars" : ""}`
      : "";

  const hidden = (
    <>
      <input type="hidden" name="scope" value={scope.kind} />
      {scope.kind === "category" ? <input type="hidden" name="category" value={scope.categoryId} /> : null}
      {scope.kind === "products" ? <input type="hidden" name="ids" value={scope.productIds.join(",")} /> : null}
    </>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bulk pricing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Raise or lower selling prices across the store, a category or selected products, and put
          them back with one click. &ldquo;Was&rdquo; prices are never changed.
        </p>
      </div>

      {sp.done ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Updated {sp.n} option{sp.n === "1" ? "" : "s"} across {sp.p} product{sp.p === "1" ? "" : "s"}.
          {sp.skipped && sp.skipped !== "0" ? ` ${sp.skipped} left unchanged because the decrease would take them to $0.` : ""}{" "}
          Use &ldquo;Restore original prices&rdquo; below to undo.
        </p>
      ) : null}
      {sp.restored ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Restored {sp.restored} option{sp.restored === "1" ? "" : "s"} to their original prices.
        </p>
      ) : null}
      {sp.error || previewError ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {sp.error || previewError}
        </p>
      ) : null}

      <SectionCard title="Change prices">
        <form action={PAGE} className="space-y-7">
          <input type="hidden" name="preview" value="1" />
          {scope.kind === "products" ? <input type="hidden" name="ids" value={scope.productIds.join(",")} /> : null}

          <fieldset>
            <legend className="mb-3 text-sm font-medium text-slate-700">Which products</legend>
            <div className="space-y-2.5 text-sm text-slate-700">
              <label className="flex items-center gap-3">
                <input type="radio" name="scope" value="all" defaultChecked={scope.kind === "all"} className="h-4 w-4 accent-[var(--admin-accent)]" />
                Every product in the store
              </label>
              <label className="flex flex-wrap items-center gap-3">
                <input type="radio" name="scope" value="category" defaultChecked={scope.kind === "category"} className="h-4 w-4 accent-[var(--admin-accent)]" />
                Products in category
                <select
                  name="category"
                  defaultValue={scope.kind === "category" ? scope.categoryId : ""}
                  aria-label="Category"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm"
                >
                  <option value="">Choose…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {scope.kind === "products" ? (
                <label className="flex items-start gap-3">
                  <input type="radio" name="scope" value="products" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
                  <span>
                    The {selectedProducts.length} product{selectedProducts.length === 1 ? "" : "s"} selected on the Products list
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {selectedProducts.slice(0, 6).map((p) => p.name).join(", ")}
                      {selectedProducts.length > 6 ? `, and ${selectedProducts.length - 6} more` : ""}
                    </span>
                  </span>
                </label>
              ) : (
                <p className="px-7 text-xs text-slate-400">
                  To change only some products, tick them on the{" "}
                  <Link href="/admin/products" className="font-medium text-[var(--admin-accent)] hover:underline">
                    Products list
                  </Link>{" "}
                  and choose &ldquo;Change prices&rdquo;.
                </p>
              )}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-4">
            <Field label="Change" htmlFor="direction">
              <select id="direction" name="direction" defaultValue={sp.direction === "decrease" ? "decrease" : "increase"} className={fieldSelect}>
                <option value="increase">Raise prices</option>
                <option value="decrease">Lower prices</option>
              </select>
            </Field>
            <Field label="By" htmlFor="mode">
              <select id="mode" name="mode" defaultValue={sp.mode === "percent" ? "percent" : "amount"} className={fieldSelect}>
                <option value="amount">Amount ($)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </Field>
            <Field label="Value" htmlFor="value">
              <input id="value" name="value" required inputMode="decimal" defaultValue={sp.value ?? ""} placeholder="20" className={fieldInput} />
            </Field>
            <Field label="Rounding" htmlFor="rounding">
              <select id="rounding" name="rounding" defaultValue={sp.rounding === "none" ? "none" : sp.rounding === "dollar" ? "dollar" : "99"} className={fieldSelect}>
                <option value="99">Nearest .99</option>
                <option value="dollar">Whole dollars</option>
                <option value="none">No rounding</option>
              </select>
            </Field>
          </div>

          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>
              Preview changes
            </button>
          </div>
        </form>
      </SectionCard>

      {summary && parsed && "change" in parsed ? (
        <Card className="overflow-hidden">
          <div className="space-y-2 px-6 pt-6">
            <h2 className="text-lg font-semibold text-slate-900">Preview: {changeLabel}</h2>
            <p className="text-sm text-slate-600">
              {summary.variants} option{summary.variants === 1 ? "" : "s"} in {summary.products} product
              {summary.products === 1 ? "" : "s"} ({scopeLabel}). Nothing is saved until you apply.
            </p>
            {summary.skipped > 0 ? (
              <p className="text-sm text-amber-700">
                {summary.skipped} option{summary.skipped === 1 ? "" : "s"} would drop to $0 or less and will be left unchanged.
              </p>
            ) : null}
            {summary.wasHidden > 0 ? (
              <p className="text-sm text-amber-700">
                {summary.wasHidden} option{summary.wasHidden === 1 ? " has a" : "s have a"} &ldquo;was&rdquo; price that will stop
                showing, because the new price reaches it.
              </p>
            ) : null}
            {parsed.change.direction === "increase" ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Heads-up: advertising a sale as a discount off prices that were raised just before it can be treated as
                misleading under Canada&rsquo;s Competition Act. Keep price rises and promotions separate.
              </p>
            ) : null}
          </div>

          {summary.rows.length > 0 ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/80">
                  <tr>
                    <TH>Product</TH>
                    <TH>Option</TH>
                    <TH align="right">Now</TH>
                    <TH align="right">New price</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.rows.map((r, i) => (
                    <tr key={`${r.productName}-${r.variantName}-${i}`}>
                      <td className="px-3 py-3 text-sm text-slate-900 lg:px-5">{r.productName}</td>
                      <td className="px-3 py-3 text-sm text-slate-500 lg:px-5">{r.variantName}</td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-500 lg:px-5">{money.format(r.oldCents)}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)] lg:px-5">
                        {r.newCents === null ? <span className="font-normal text-slate-400">unchanged</span> : money.format(r.newCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.variants > summary.rows.length ? (
                <p className="px-6 py-3 text-xs text-slate-400">
                  Showing the first {summary.rows.length} of {summary.variants}.
                </p>
              ) : null}
            </div>
          ) : null}

          <form action={applyBulkPrices} className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
            {hidden}
            <input type="hidden" name="direction" value={parsed.change.direction} />
            <input type="hidden" name="mode" value={parsed.change.mode} />
            <input
              type="hidden"
              name="value"
              value={parsed.change.mode === "percent" ? String(parsed.change.value) : (parsed.change.value / 100).toFixed(2)}
            />
            <input type="hidden" name="rounding" value={parsed.change.rounding} />
            <Link href={PAGE} className="text-sm font-medium text-slate-500 hover:text-slate-800">
              Cancel
            </Link>
            <button type="submit" className={btnPrimary} disabled={summary.variants - summary.skipped === 0}>
              Apply to {summary.variants - summary.skipped} option{summary.variants - summary.skipped === 1 ? "" : "s"}
            </button>
          </form>
        </Card>
      ) : null}

      <SectionCard title="Restore original prices">
        <p className="mb-5 text-sm text-slate-600">
          Puts options back to their price from before the first bulk change, however many changes were made since.
          A price you edit by hand on a product becomes its new original.
        </p>
        <p className="mb-5 text-sm text-slate-700">
          {restorableAll === 0
            ? "No options have a saved original price right now."
            : `${restorableAll} option${restorableAll === 1 ? "" : "s"} in the store can be restored${
                scope.kind === "all" ? "" : `; ${restorable} of them in ${scopeLabel}`
              }.`}
        </p>
        <form action={restoreBulkPrices} className="flex justify-end">
          {hidden}
          <button type="submit" className={btnPrimary} disabled={restorable === 0}>
            Restore {restorable} option{restorable === 1 ? "" : "s"}
            {scope.kind === "all" ? "" : ` (${scopeLabel})`}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
