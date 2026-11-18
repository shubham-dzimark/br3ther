import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getMoneyFormatter } from "@/lib/currency";
import { requireCapability } from "@/lib/permissions";
import { PrintButton } from "@/components/admin/PrintButton";
import { InvoiceSheet, SlipSheet, storeInfo } from "@/components/admin/OrderDocuments";
import { getBarcodeConfig } from "@/lib/barcode";
import { getTimeZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Print orders", robots: { index: false } };

/** More than a print run anyone does by hand, and keeps the URL sane. */
const MAX_ORDERS = 200;

/**
 * Bulk print: the packing slip or invoice for every order ticked on the orders
 * list, one per sheet of paper, in a single print job.
 *
 * Opened from the selection bar with `?doc=slip|invoice&ids=a,b,c`. Orders
 * come out in the order they were listed, so the stack of paper matches the
 * screen it was printed from.
 */
export default async function BulkPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; ids?: string }>;
}) {
  await requireCapability("orders");
  const sp = await searchParams;
  const doc = sp.doc === "invoice" ? "invoice" : "slip";
  const ids = Array.from(
    new Set((sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
  ).slice(0, MAX_ORDERS);

  const [found, settings, money, barcodeConfig, tz] = await Promise.all([
    ids.length
      ? prisma.order.findMany({ where: { id: { in: ids } }, include: { items: true } })
      : Promise.resolve([]),
    getSettings(),
    getMoneyFormatter(),
    getBarcodeConfig(),
    getTimeZone(),
  ]);
  const byId = new Map(found.map((o) => [o.id, o]));
  const orders = ids.map((id) => byId.get(id)).filter((o) => o !== undefined);
  const store = storeInfo(settings);

  const idsParam = encodeURIComponent(orders.map((o) => o.id).join(","));
  const noun = doc === "invoice" ? "invoice" : "packing slip";
  const plural = orders.length === 1 ? noun : `${noun}s`;

  return (
    <div className="print-document print-batch mx-auto max-w-[860px] py-8 text-[13px] leading-relaxed text-slate-800">
      <div className="print-hide mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to orders
          </Link>
          {/* Switch documents without going back to re-tick the same orders. */}
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 text-sm font-medium">
            {(
              [
                ["slip", "Packing slips"],
                ["invoice", "Invoices"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={`/admin/orders/print?doc=${value}&ids=${idsParam}`}
                className={`rounded-full px-4 py-1.5 transition ${
                  doc === value
                    ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]"
                    : "text-slate-600 hover:text-[var(--admin-accent)]"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          <p className="text-sm text-slate-500">
            {orders.length} {plural}, one per page.
          </p>
        </div>
        {orders.length ? (
          <PrintButton label={`Print ${orders.length} ${plural}`} />
        ) : null}
      </div>

      {orders.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">
          No orders selected. Go back, tick the orders you want, then choose
          print.
        </p>
      ) : (
        orders.map((order) => (
          <div
            key={order.id}
            className="print-sheet mb-8 flex flex-col bg-white p-10 shadow-sm ring-1 ring-slate-200"
          >
            {doc === "invoice" ? (
              <InvoiceSheet
                order={order}
                store={store}
                money={money}
                barcodeConfig={barcodeConfig}
                tz={tz}
              />
            ) : (
              <SlipSheet order={order} store={store} barcodeConfig={barcodeConfig} tz={tz} />
            )}
          </div>
        ))
      )}
    </div>
  );
}
