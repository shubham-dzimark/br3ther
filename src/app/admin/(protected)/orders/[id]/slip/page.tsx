import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { requireCapability } from "@/lib/permissions";
import { PrintButton } from "@/components/admin/PrintButton";
import { SlipSheet, storeInfo } from "@/components/admin/OrderDocuments";
import { getBarcodeConfig } from "@/lib/barcode";
import { getTimeZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Packing slip", robots: { index: false } };

/**
 * Packing slip for one order. The sheet itself lives in OrderDocuments so the
 * bulk print page renders the identical document.
 *
 * Its own route rather than a print stylesheet on the order page, so admin
 * chrome, forms and dialogs stay out of what goes in the box.
 */
export default async function OrderSlipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapability("orders");
  const { id } = await params;

  const [order, settings, barcodeConfig, tz] = await Promise.all([
    prisma.order.findUnique({ where: { id }, include: { items: true } }),
    getSettings(),
    getBarcodeConfig(),
    getTimeZone(),
  ]);
  if (!order) notFound();

  return (
    <div className="print-document mx-auto max-w-[820px] bg-white p-10 text-[13px] leading-relaxed text-slate-800">
      {/* Screen-only toolbar. Inside .print-hide so none of it reaches paper.
          A link rather than history.back(): the slip opens in a new tab, where
          there is no history to go back to. */}
      <div className="print-hide mb-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/orders/${order.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to order
          </Link>
          <p className="text-sm text-slate-500">
            Check it looks right, then print or save as PDF.
          </p>
        </div>
        <PrintButton label="Print packing slip" />
      </div>

      <SlipSheet order={order} store={storeInfo(settings)} barcodeConfig={barcodeConfig} tz={tz} />
    </div>
  );
}
