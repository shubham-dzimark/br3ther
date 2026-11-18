import type { Prisma } from "@/generated/prisma";
import type { getMoneyFormatter } from "@/lib/currency";
import type { getBarcodeConfig } from "@/lib/barcode";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { orderNo } from "@/lib/order-display";
import { renderBarcodeSvg } from "@/lib/barcode";

/*
 * The body of the packing slip and the invoice, shared by the single-order
 * pages and the bulk print page so a batch prints exactly what one order does.
 * Each returns the sheet's sections only; the caller supplies the
 * .print-document (or .print-sheet) wrapper that lays them out as a page.
 */

export type PrintableOrder = Prisma.OrderGetPayload<{ include: { items: true } }>;
type Money = Awaited<ReturnType<typeof getMoneyFormatter>>;
type BarcodeConfig = Awaited<ReturnType<typeof getBarcodeConfig>>;

export type StoreInfo = {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
};

export function storeInfo(settings: Awaited<ReturnType<typeof getSettings>>): StoreInfo {
  return {
    name: settings[SETTING_KEYS.storeName] || "Br3thr",
    address: settings[SETTING_KEYS.storeAddress]?.trim(),
    email: settings[SETTING_KEYS.contactEmail]?.trim(),
    phone: settings[SETTING_KEYS.contactPhone]?.trim(),
  };
}

function shipsTo(order: PrintableOrder) {
  return [
    order.shipLine1,
    order.shipLine2,
    [order.shipCity, order.shipRegion, order.shipPostalCode].filter(Boolean).join(" "),
    order.shipCountry,
  ].filter(Boolean);
}

/**
 * Packing slip. Deliberately a picking document, not an invoice: product and
 * quantity only, no prices or totals - whoever packs the box doesn't need them,
 * and leaving money off avoids a second, conflicting record of the order.
 */
export function SlipSheet({
  order,
  store,
  barcodeConfig,
  tz,
}: {
  order: PrintableOrder;
  store: StoreInfo;
  barcodeConfig: BarcodeConfig;
  tz: string;
}) {
  const orderDate = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(order.createdAt);

  const shippingMethod = order.shippingCents > 0 ? "Standard shipping" : "Free shipping";
  const totalUnits = order.items.reduce((n, i) => n + i.quantity, 0);

  /*
   * The order number as a scannable code at the top, so the whole job can be
   * scanned. No printed digits under the bars: the order number is already set
   * in large type beside it, and the caption only repeated it.
   */
  const showBarcodes = barcodeConfig.enabled && barcodeConfig.onSlip;
  const orderBarcode = showBarcodes
    ? renderBarcodeSvg(order.orderNumber, "code128", {
        height: 10,
        scale: 2,
        includeText: false,
      })
    : null;

  /*
   * Optional QR beside the linear code. A QR can hold a whole URL, so a phone
   * camera opens the order itself rather than just reading out a number that
   * still has to be typed somewhere.
   */
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/$/, "");
  /*
   * The customer-facing QR points at this order's receipt page.
   *
   * It carries no token: only the hash is stored, so the slip cannot rebuild
   * the customer's link, and minting a fresh one here would silently revoke
   * the link already sitting in their inbox. Opening it therefore lands on the
   * recovery form, which emails them a working link once they confirm the
   * address on the order - useful, and it grants nothing to whoever finds the
   * box. An order number alone opened nothing at all.
   */
  const slipReceiptUrl = `${base}/checkout/received/${encodeURIComponent(order.orderNumber)}`;
  /*
   * "track" previously pointed at /account/orders/{id}, which is not a route -
   * the account area has a list, not a per-order page.
   */
  const qrPayload =
    barcodeConfig.slipQrTarget === "order"
      ? order.orderNumber
      : barcodeConfig.slipQrTarget === "track"
        ? slipReceiptUrl ?? order.orderNumber
        : `${base}/admin/orders/${order.id}`;
  const orderQr =
    barcodeConfig.enabled && barcodeConfig.slipQr
      ? renderBarcodeSvg(qrPayload, "qrcode", { scale: 3 })
      : null;

  return (
    <>
      {/* Same masthead as the invoice, so the two read as one set of paper. */}
      <header className="flex items-start justify-between gap-8 border-b-2 border-slate-900 pb-6">
        <div>
          <div>
            <p className="text-[17px] font-bold tracking-tight text-slate-900">
              {store.name}
            </p>
            {store.address ? (
              <p className="mt-1 whitespace-pre-line text-slate-600">{store.address}</p>
            ) : null}
            {store.email ? <p className="text-slate-600">{store.email}</p> : null}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <h1 className="text-[30px] font-bold uppercase leading-none tracking-[0.06em] text-slate-900">
            Packing slip
          </h1>
          <p className="mt-2 text-[15px] font-semibold text-slate-700">
            {orderNo(order.orderNumber)}
          </p>
          {orderBarcode || orderQr ? (
            <span className="mt-3 flex items-end justify-end gap-3">
              {orderBarcode ? (
                <span
                  className="block [&>svg]:h-auto [&>svg]:w-[170px]"
                  dangerouslySetInnerHTML={{ __html: orderBarcode }}
                />
              ) : null}
              {orderQr ? (
                <span
                  className="block [&>svg]:h-auto [&>svg]:w-[76px]"
                  dangerouslySetInnerHTML={{ __html: orderQr }}
                />
              ) : null}
            </span>
          ) : null}
        </div>
      </header>

      <section className="mt-8 grid grid-cols-3 gap-8">
        <div className="col-span-2">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Ship to
          </p>
          <address className="not-italic">
            <p className="text-[15px] font-semibold text-slate-900">{order.shipName}</p>
            {shipsTo(order).map((line) => (
              <p key={line} className="text-slate-700">
                {line}
              </p>
            ))}
            {order.phone ? (
              <p className="mt-1 text-slate-500">{order.phone}</p>
            ) : null}
          </address>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 self-start">
          <dt className="text-slate-500">Order date</dt>
          <dd className="text-right font-medium text-slate-900">{orderDate}</dd>
          <dt className="text-slate-500">Shipping</dt>
          <dd className="text-right font-medium text-slate-900">{shippingMethod}</dd>
          <dt className="text-slate-500">Items</dt>
          <dd className="text-right font-medium text-slate-900">
            {totalUnits} unit{totalUnits === 1 ? "" : "s"}
          </dd>
        </dl>
      </section>

      {/*
        No prices anywhere on this sheet - it goes in the box, and a packing
        slip that shows what someone paid is how a gift recipient finds out.
      */}
      <table className="mt-9 w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-300">
            <th className="w-10 py-2.5 pr-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              &#10003;
            </th>
            <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Item
            </th>
            <th className="w-20 py-2.5 pl-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Qty
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="break-inside-avoid border-b border-slate-100">
              {/* A box to tick as each line is picked. */}
              <td className="py-3.5 pr-2 align-top">
                <span className="mt-0.5 block h-4 w-4 border border-slate-400" />
              </td>
              <td className="py-3.5 pr-4 align-top">
                <span className="text-[14px] font-medium text-slate-900">
                  {item.nameSnapshot}
                </span>
                {item.variantSnapshot && item.variantSnapshot !== "Default" ? (
                  <span className="block text-slate-600">{item.variantSnapshot}</span>
                ) : null}
                {item.skuSnapshot ? (
                  <span className="block font-mono text-[11px] text-slate-400">
                    {item.skuSnapshot}
                  </span>
                ) : null}
                {item.isGift ? (
                  <span className="mt-1 inline-block rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Free gift
                  </span>
                ) : null}
              </td>
              <td className="py-3.5 pl-2 text-right align-top text-[15px] font-bold tabular-nums text-slate-900">
                {item.quantity}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900">
            <td />
            <td className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Total units
            </td>
            <td className="py-2.5 pl-2 text-right text-[15px] font-bold tabular-nums text-slate-900">
              {totalUnits}
            </td>
          </tr>
        </tfoot>
      </table>

      {order.customerNote ? (
        <section className="mt-8 break-inside-avoid rounded-lg border border-slate-300 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Customer note
          </p>
          <p className="mt-1.5 text-slate-700">{order.customerNote}</p>
        </section>
      ) : null}

      <footer className="mt-auto flex items-end justify-between gap-8 border-t border-slate-200 pt-4">
        <p className="text-[11px] text-slate-500">
          Thank you for shopping with {store.name}.
          {store.email ? ` Questions? ${store.email}` : ""}
        </p>
        <div className="shrink-0 text-right text-[10px] uppercase tracking-[0.12em] text-slate-400">
          <span className="block border-t border-slate-400 pt-1" style={{ width: 150 }}>
            Packed by
          </span>
        </div>
      </footer>
    </>
  );
}

/**
 * Invoice. The money counterpart to the packing slip: same paper size and
 * layout so the two read as one set, but this one carries prices, the
 * discount and shipping lines, and the total actually charged.
 *
 * It is deliberately generated from the stored order figures rather than
 * recomputed - an invoice has to say what the customer was charged, even if
 * prices, tax rates or shipping rules have changed since.
 */
export function InvoiceSheet({
  order,
  store,
  money,
  barcodeConfig,
  tz,
}: {
  order: PrintableOrder;
  store: StoreInfo;
  money: Money;
  barcodeConfig: BarcodeConfig;
  tz: string;
}) {
  const cash = (cents: number) => money.formatIn(cents, order.currency);

  // The order number as a scannable code, so an invoice can be pulled up at
  // the desk without typing it.
  const orderBarcode =
    barcodeConfig.enabled && barcodeConfig.onInvoice
      ? renderBarcodeSvg(order.orderNumber, "code128", {
          height: 10,
          scale: 2,
          // Bars only: the invoice already prints the order number above.
          includeText: false,
        })
      : null;

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);

  const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"];
  const isPaid = PAID.includes(order.status);
  const isRefunded = order.status === "REFUNDED";
  const isCancelled = order.status === "CANCELLED";
  const stamp = isRefunded
    ? { label: "Refunded", tone: "border-slate-400 text-slate-500" }
    : isCancelled
      ? { label: "Cancelled", tone: "border-slate-400 text-slate-500" }
      : isPaid
        ? { label: "Paid", tone: "border-emerald-600 text-emerald-700" }
        : { label: "Unpaid", tone: "border-amber-600 text-amber-700" };

  return (
    <>
      {/* ---------- Masthead ---------- */}
      <header className="flex items-start justify-between gap-8 border-b-2 border-slate-900 pb-6">
        <div>
          <div>
            <p className="text-[17px] font-bold tracking-tight text-slate-900">
              {store.name}
            </p>
            {store.address ? (
              <p className="mt-1 whitespace-pre-line text-slate-600">{store.address}</p>
            ) : null}
            {store.email ? <p className="text-slate-600">{store.email}</p> : null}
            {store.phone ? <p className="text-slate-600">{store.phone}</p> : null}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <h1 className="text-[34px] font-bold uppercase leading-none tracking-[0.06em] text-slate-900">
            Invoice
          </h1>
          <p className="mt-2 text-[15px] font-semibold text-slate-700">
            {orderNo(order.orderNumber)}
          </p>
          {/* A stamp, not a sentence: whoever picks the paper up needs to know
              in one glance whether this has been paid. */}
          <span
            className={`mt-3 inline-block -rotate-2 rounded-md border-2 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${stamp.tone}`}
          >
            {stamp.label}
          </span>
        </div>
      </header>

      {/* ---------- Parties and dates ---------- */}
      <section className="mt-8 grid grid-cols-3 gap-8">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Billed to
          </p>
          <address className="not-italic">
            <p className="font-semibold text-slate-900">{order.shipName}</p>
            <p className="mt-0.5 text-slate-600">{order.email}</p>
          </address>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Ship to
          </p>
          <address className="not-italic text-slate-600">
            {shipsTo(order).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </address>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 self-start">
          <dt className="text-slate-500">Order date</dt>
          <dd className="text-right font-medium text-slate-900">
            {fmtDate(order.createdAt)}
          </dd>
          {order.paymentConfirmedAt ? (
            <>
              <dt className="text-slate-500">Paid</dt>
              <dd className="text-right font-medium text-slate-900">
                {fmtDate(order.paymentConfirmedAt)}
              </dd>
            </>
          ) : null}
          <dt className="text-slate-500">Payment</dt>
          <dd className="text-right font-medium text-slate-900">Interac e-Transfer</dd>
          {order.emtReference ? (
            <>
              <dt className="text-slate-500">Reference</dt>
              <dd className="text-right font-mono text-[12px] font-medium text-slate-900">
                {order.emtReference}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      {/* ---------- Lines ---------- */}
      <table className="mt-9 w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-300">
            <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Description
            </th>
            <th className="w-16 py-2.5 px-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Qty
            </th>
            <th className="w-28 py-2.5 px-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Unit price
            </th>
            <th className="w-28 py-2.5 pl-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            /* Rows must not be split across a page break - half a line item on
               each sheet is unreadable and looks like a mistake. */
            <tr key={item.id} className="break-inside-avoid border-b border-slate-100">
              <td className="py-3 pr-4 align-top">
                <span className="font-medium text-slate-900">{item.nameSnapshot}</span>
                {item.variantSnapshot && item.variantSnapshot !== "Default" ? (
                  <span className="block text-slate-500">{item.variantSnapshot}</span>
                ) : null}
                {item.skuSnapshot ? (
                  <span className="block font-mono text-[11px] text-slate-400">
                    {item.skuSnapshot}
                  </span>
                ) : null}
                {item.isGift ? (
                  <span className="mt-1 inline-block rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Free gift
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-3 text-right align-top tabular-nums">
                {item.quantity}
              </td>
              <td className="px-2 py-3 text-right align-top tabular-nums text-slate-600">
                {item.isGift ? "—" : cash(item.unitPriceCents)}
              </td>
              <td className="py-3 pl-2 text-right align-top font-medium tabular-nums text-slate-900">
                {item.isGift ? "Free" : cash(item.lineTotalCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------- Payment details and totals ---------- */}
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)_260px] items-start gap-8">
        <div className="min-w-0">
          {!isPaid && !isCancelled && !isRefunded ? (
            <div className="rounded-lg border border-slate-300 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                How to pay
              </p>
              <p className="mt-2 text-slate-700">
                Send an Interac e-Transfer for{" "}
                <span className="font-semibold">{cash(order.totalCents)}</span>
                {store.email ? (
                  <>
                    {" "}
                    to <span className="font-semibold">{store.email}</span>
                  </>
                ) : null}
                , quoting <span className="font-semibold">{orderNo(order.orderNumber)}</span>{" "}
                as the message.
              </p>
            </div>
          ) : null}

          {orderBarcode ? (
            <div className="mt-4">
              <span
                className="block [&>svg]:h-auto [&>svg]:w-[190px]"
                dangerouslySetInnerHTML={{ __html: orderBarcode }}
              />
            </div>
          ) : null}
        </div>

        {/* Discount and tax appear only when non-zero, so a plain order is not
            padded with a column of "$0.00" lines. */}
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-slate-500">Subtotal</dt>
            <dd className="tabular-nums">{cash(order.subtotalCents)}</dd>
          </div>
          {order.discountCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-slate-500">
                Discount
                {order.couponCode ? (
                  <span className="ml-1 font-mono text-[11px] text-slate-400">
                    {order.couponCode}
                  </span>
                ) : null}
              </dt>
              <dd className="tabular-nums">&minus;{cash(order.discountCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-slate-500">Shipping</dt>
            <dd className="tabular-nums">
              {order.shippingCents > 0 ? cash(order.shippingCents) : "Free"}
            </dd>
          </div>
          {order.taxCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-slate-500">Tax</dt>
              <dd className="tabular-nums">{cash(order.taxCents)}</dd>
            </div>
          ) : null}
          <div className="mt-1 flex items-baseline justify-between border-t-2 border-slate-900 pt-2.5">
            <dt className="text-[15px] font-bold text-slate-900">Total</dt>
            <dd className="text-[18px] font-bold tabular-nums text-slate-900">
              {cash(order.totalCents)}
            </dd>
          </div>
          <p className="pt-1 text-right text-[11px] text-slate-400">
            All amounts in {order.currency}
          </p>
        </dl>
      </div>

      {order.customerNote ? (
        <section className="mt-9 break-inside-avoid rounded-lg bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Customer note
          </p>
          <p className="mt-1.5 text-slate-700">{order.customerNote}</p>
        </section>
      ) : null}

      <footer className="mt-auto border-t border-slate-200 pt-4 text-center text-[11px] text-slate-400">
        <p className="text-slate-500">Thank you for shopping with {store.name}.</p>
        {store.email ? (
          <p className="mt-1">Questions about this invoice? {store.email}</p>
        ) : null}
      </footer>
    </>
  );
}
