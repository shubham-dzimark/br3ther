import Link from "next/link";
import { formatGiftCardCode, giftCardRecipientText, parseGiftCardDetails } from "@/lib/gift-card-core";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { mediaSrc } from "@/lib/media-src";
import { getMoneyFormatter } from "@/lib/currency";
import { StatusPill, ORDER_STATUS_LABEL } from "@/components/StatusPill";
import { SectionCard, Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { CarrierBadge } from "@/components/admin/CarrierBadge";
import { TrackingDialog } from "@/components/admin/TrackingDialog";
import { findCarrier, trackingUrl, getCarriers } from "@/lib/carriers";
import { btnPrimary } from "@/components/admin/ui";
import { IconImage } from "@/components/admin/Icons";
import { getBarcodeConfig, renderBarcodeSvg } from "@/lib/barcode";
import {
  confirmEmtPayment,
  saveOrderDetails,
  updateOrderStatus,
  clearTracking,
  addGiftItem,
  removeGiftItem,
} from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { requireCapability, can } from "@/lib/permissions";
import { orderNo } from "@/lib/order-display";
import { getTimeZone, ymd, ymdhm } from "@/lib/timezone";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

// WooCommerce's list, in WooCommerce's order.
const NEXT_STATUS = [
  "AWAITING_PAYMENT",
  "PROCESSING",
  "ON_HOLD",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
];

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; gift?: string }>;
}) {
  const admin = await requireCapability("orders");
  const tz = await getTimeZone();
  // Fulfilment roles ship from the address; they do not get contact details.
  const seePii = can(admin.role, "customer_pii");
  const [{ id }, { saved, error, gift }] = await Promise.all([params, searchParams]);

  const [order, money, carriers, giftVariants, barcodeConfig] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            // Snapshots stay authoritative for name and price; the relation is
            // only for the thumbnail and the link, and may be null if the
            // product was deleted after the order.
            product: { select: { slug: true, coverImageUrl: true } },
          },
        },
        giftCardsBought: { select: { id: true, code: true, status: true, purchaseOrderItemId: true } },
      },
    }),
    getMoneyFormatter(),
    getCarriers(false),
    /*
     * What can be given away. Published products with stock only - offering a
     * sold-out variant here would push it negative the moment it is chosen.
     */
    prisma.productVariant.findMany({
      where: { stock: { gt: 0 }, product: { status: "PUBLISHED" } },
      orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        stock: true,
        product: { select: { name: true } },
      },
    }),
    getBarcodeConfig(),
  ]);

  const giftableVariants = giftVariants.map((v) => ({
    id: v.id,
    label: `${v.product.name}${v.name && v.name !== "Default" ? ` \u2014 ${v.name}` : ""} (${v.stock} in stock)`,
  }));
  if (!order) notFound();
  // The card that paid toward this order, for its code on the totals line.
  const redeemedCard = order.giftCardRedeemedId
    ? await prisma.giftCard.findUnique({ where: { id: order.giftCardRedeemedId }, select: { id: true, code: true } })
    : null;

  /*
   * Code 128 rather than the shop's retail symbology: an order number is text,
   * and EAN-13 only holds thirteen digits. Null when barcodes are switched off.
   */
  const orderBarcodeSvg = barcodeConfig.enabled
    ? renderBarcodeSvg(order.orderNumber, "code128", { height: 14, scale: 2 })
    : null;

  const confirmedBy = order.paymentConfirmedBy
    ? await prisma.adminUser.findUnique({
        where: { id: order.paymentConfirmedBy },
        select: { name: true },
      })
    : null;

  const carrier = findCarrier(carriers, order.trackingCarrier);
  const trackUrl = trackingUrl(carriers, order.trackingCarrier, order.trackingCode);

  return (
    <div className="space-y-5">
      {/* ---------- Header: identity, status change and print, all reachable
           without scrolling ---------- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link
          href="/admin/orders"
          aria-label="Back to orders"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {orderNo(order.orderNumber)}
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Placed {ymdhm(order.createdAt, tz)}
            {" · "}
            {money.formatIn(order.totalCents, order.currency)}
          </p>
        </div>

        <StatusPill status={order.status} />

        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Status is the thing staff change most, so it lives up here rather
              than at the bottom of a card. */}
          <form action={updateOrderStatus} className="flex items-center gap-2">
            <input type="hidden" name="orderId" value={order.id} />
            <label htmlFor="status" className="sr-only">
              Change status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={order.status}
              className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[var(--admin-accent)]"
            >
              {NEXT_STATUS.map((st) => (
                <option key={st} value={st}>
                  {ORDER_STATUS_LABEL[st] ?? st}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-[var(--admin-btn)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)]"
            >
              Update
            </button>
          </form>

          <Link
            href={`/admin/orders/${order.id}/slip`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
            </svg>
            Packing slip
          </Link>

          <Link
            href={`/admin/orders/${order.id}/invoice`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
              <path d="M6 2h9l5 5v15H6z" />
              <path d="M14 2v6h6M9 13h6M9 17h4" />
            </svg>
            Invoice
          </Link>
        </div>
      </div>

      {gift === "added" ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Free gift added. Stock has been taken off and the order total is
          unchanged.
        </p>
      ) : null}
      {gift === "removed" ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Gift removed and the stock put back.
        </p>
      ) : null}
      {error === "gift" ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          That gift could not be added. Only a free gift line can be removed
          this way.
        </p>
      ) : null}

      {error === "already_confirmed" ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This order was already confirmed. Stock was not decremented a second time.
        </p>
      ) : null}

      {/* ---------- Two columns: what happened on the left, who and where on
           the right ---------- */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {order.status === "AWAITING_PAYMENT" || order.status === "ON_HOLD" ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
              <h2 className="text-lg font-semibold text-amber-900">
                {order.paymentMethodKey === "crypto"
                  ? "Awaiting crypto payment"
                  : "Awaiting Interac e-Transfer"}
              </h2>
              <p className="mb-6 mt-1 text-sm text-amber-800/80">
                {order.paymentMethodKey === "crypto" ? (
                  <>
                    The customer submits their transaction on the payment page and
                    the crypto pay portal confirms it automatically. Confirming here
                    instead marks the order paid and decrements stock.
                  </>
                ) : (
                  <>
                    Check the bank inbox for{" "}
                    {money.formatIn(order.totalCents, order.currency)}. Confirming marks
                    the order paid and decrements stock.
                  </>
                )}
              </p>
              <form action={confirmEmtPayment} className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2">
                <input type="hidden" name="orderId" value={order.id} />
                {seePii && order.paymentMethodKey !== "crypto" ? (
                  <>
                    <Field label="Sender email" htmlFor="emtSenderEmail">
                      <input
                        id="emtSenderEmail"
                        name="emtSenderEmail"
                        defaultValue={order.emtSenderEmail ?? ""}
                        placeholder="Optional"
                        className={fieldInput}
                      />
                    </Field>
                    <Field label="Reference number" htmlFor="emtReference">
                      <input
                        id="emtReference"
                        name="emtReference"
                        defaultValue={order.emtReference ?? ""}
                        placeholder="Optional"
                        className={fieldInput}
                      />
                    </Field>
                  </>
                ) : null}
                <div className="sm:col-span-2">
                  <button type="submit" className={btnPrimary}>
                    Confirm payment received
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <SectionCard title="Items">
            <div className="overflow-x-auto">
              <table className="w-full ">
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            {item.product?.coverImageUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={mediaSrc(item.product.coverImageUrl)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <IconImage className="h-4 w-4 text-slate-300" />
                            )}
                          </span>
                          <div className="min-w-0">
                            {item.product?.slug ? (
                              <Link
                                href={`/products/${item.product.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-slate-900 transition hover:text-[var(--admin-accent)] hover:underline"
                              >
                                {item.nameSnapshot}
                              </Link>
                            ) : (
                              <span className="text-sm text-slate-900">
                                {item.nameSnapshot}
                              </span>
                            )}
                            {item.variantSnapshot ? (
                              <span className="ml-2 text-xs text-slate-400">
                                {item.variantSnapshot}
                              </span>
                            ) : null}
                            {item.isGift ? (
                              <span className="ml-2 rounded-full bg-[#F5EDDA] px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                Free gift
                              </span>
                            ) : null}
                            {item.isGiftCard ? (
                              <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                                Gift card
                              </span>
                            ) : null}
                          </div>
                          {item.isGiftCard ? (() => {
                            const details = parseGiftCardDetails(item.giftCardDetails);
                            const card = order.giftCardsBought.find((c) => c.purchaseOrderItemId === item.id);
                            return (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {details ? giftCardRecipientText(details) : null}
                                {card ? (
                                  <>
                                    {" · "}
                                    <Link href={`/admin/promotions/gift-cards/${card.id}`} className="font-mono text-[var(--admin-accent)] hover:underline">
                                      {formatGiftCardCode(card.code)}
                                    </Link>{" "}
                                    ({card.status === "PENDING" ? "issued once paid" : card.status === "ACTIVE" ? "active" : "void"})
                                  </>
                                ) : null}
                              </p>
                            );
                          })() : null}
                        </div>
                      </td>
                      <td className="py-3 text-right text-sm tabular-nums text-slate-500">
                        {item.quantity} &times;{" "}
                        {money.formatIn(item.unitPriceCents, order.currency)}
                      </td>
                      <td className="py-3 text-right text-sm font-medium tabular-nums text-slate-900">
                        {item.isGift ? (
                          <span className="text-amber-700">Free</span>
                        ) : (
                          money.formatIn(item.lineTotalCents, order.currency)
                        )}
                      </td>
                      <td className="w-8 py-3 text-right">
                        {item.isGift ? (
                          <form action={removeGiftItem}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <ConfirmSubmit
                              message="Remove this free gift from the order?\n\nThe stock goes back and no totals change."
                              title="Remove gift"
                              className="text-slate-300 transition hover:text-red-600"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="h-4 w-4">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </ConfirmSubmit>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  {[
                    ["Subtotal", order.subtotalCents],
                    ["Gift cards", order.giftCardCents],
                    ["Discount", order.discountCents],
                    ["Shipping", order.shippingCents],
                    ["Tax", order.taxCents],
                    [redeemedCard ? `Paid by gift card ${formatGiftCardCode(redeemedCard.code)}` : "Paid by gift card", order.giftCardRedeemedCents],
                  ]
                    .filter(([label, cents]) => label === "Subtotal" || (cents as number) > 0)
                    .map(([label, cents]) => (
                      <tr key={label as string}>
                        <td className="py-2 text-sm text-slate-500" colSpan={2}>
                          {label}
                        </td>
                        <td className="py-2 text-right text-sm tabular-nums text-slate-600">
                          {label === "Discount" || String(label).startsWith("Paid by gift card") ? "−" : ""}
                          {money.formatIn(cents as number, order.currency)}
                        </td>
                      </tr>
                    ))}
                  <tr>
                    <td className="py-2.5 text-sm font-semibold text-slate-900" colSpan={2}>
                      Total
                    </td>
                    <td className="py-2.5 text-right text-base font-semibold tabular-nums text-[var(--admin-accent)]">
                      {money.formatIn(order.totalCents, order.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/*
              Gifts are added here rather than by editing the paid lines: a
              zero-priced isGift line is the same shape the automatic gift
              rules produce, so every document that prints this order already
              knows how to label it and no total moves.
            */}
            {giftableVariants.length > 0 ? (
              <form
                action={addGiftItem}
                className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5"
              >
                <input type="hidden" name="orderId" value={order.id} />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="giftVariant"
                    className="mb-1.5 block text-xs font-medium text-slate-500"
                  >
                    Add a free gift
                  </label>
                  <select
                    id="giftVariant"
                    name="variantId"
                    required
                    defaultValue=""
                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-accent)]"
                  >
                    <option value="" disabled>
                      Choose a product&hellip;
                    </option>
                    {giftableVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label
                    htmlFor="giftQty"
                    className="mb-1.5 block text-xs font-medium text-slate-500"
                  >
                    Qty
                  </label>
                  <input
                    id="giftQty"
                    name="quantity"
                    type="number"
                    min={1}
                    max={20}
                    defaultValue={1}
                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-accent)]"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-full border border-[var(--admin-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
                >
                  Add gift
                </button>
              </form>
            ) : null}
          </SectionCard>

          <SectionCard title="Shipment tracking">
            {carrier && order.trackingCode ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3">
                    <CarrierBadge carrier={carrier} />
                    <div>
                      <p className="font-mono text-sm font-semibold text-slate-900">
                        {order.trackingCode}
                      </p>
                      <p className="text-xs text-slate-400">
                        Shipped{" "}
                        {order.shippedAt
                          ? ymd(order.shippedAt, tz)
                          : "date not set"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {trackUrl ? (
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--admin-btn)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)]"
                      >
                        Track parcel
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">
                        No public tracker for this provider
                      </span>
                    )}
                    <form action={clearTracking}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </div>

                <TrackingDialog
                  timeZone={tz}
                  carriers={carriers}
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  isShipped={order.status === "SHIPPED"}
                  existing={{
                    number: order.trackingCode,
                    carrier: order.trackingCarrier ?? "",
                    shippedAt: order.shippedAt
                      ? ymd(order.shippedAt, tz)
                      : "",
                  }}
                />
              </div>
            ) : (
              <div className="text-center">
                <p className="mb-5 text-sm text-slate-500">
                  No tracking added yet. Add it and the customer will see the carrier
                  and number on their order.
                </p>
                <TrackingDialog
                  timeZone={tz}
                  carriers={carriers}
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  isShipped={order.status === "SHIPPED"}
                  existing={null}
                />
              </div>
            )}
          </SectionCard>
        </div>

        {/* ---------- Right rail ---------- */}
        <div className="space-y-5">
          <SectionCard title="Customer">
            <p className="text-sm font-medium text-slate-900">{order.shipName}</p>
            {seePii ? (
              <p className="mt-1 text-sm text-slate-600">{order.email}</p>
            ) : (
              <p className="mt-1 text-sm italic text-slate-400">Contact details hidden</p>
            )}
            {seePii && order.phone ? (
              <p className="text-sm text-slate-600">{order.phone}</p>
            ) : null}

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Ship to
            </p>
            <address className="mt-1.5 text-sm not-italic leading-relaxed text-slate-600">
              {order.shipLine1}
              <br />
              {order.shipLine2 ? (<>{order.shipLine2}<br /></>) : null}
              {order.shipCity}, {order.shipRegion} {order.shipPostalCode}
              <br />
              {order.shipCountry}
            </address>

            {order.customerNote ? (
              <>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Customer note
                </p>
                <p className="mt-1 text-sm text-slate-600">{order.customerNote}</p>
              </>
            ) : null}
          </SectionCard>

          <SectionCard title="Payment">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Method</dt>
                <dd className="text-slate-900">
                  {order.paymentMethodKey === "crypto" ? "Crypto Payment" : "Interac e-Transfer"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Confirmed</dt>
                <dd className="text-right text-slate-900">
                  {order.paymentConfirmedAt
                    ? ymdhm(order.paymentConfirmedAt, tz)
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Confirmed by</dt>
                <dd className="text-slate-900">{confirmedBy?.name ?? "—"}</dd>
              </div>
              {seePii && order.paymentMethodKey !== "crypto" ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Sender</dt>
                  <dd className="break-all text-right text-slate-900">
                    {order.emtSenderEmail ?? "—"}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Reference</dt>
                <dd className="break-all text-right text-slate-900">
                  {order.emtReference ?? "—"}
                </dd>
              </div>
            </dl>
          </SectionCard>

          {/*
            The order's own code, the same one printed on the packing slip, so
            staff can scan straight off the screen when a parcel comes back.
          */}
          {orderBarcodeSvg ? (
            <SectionCard title="Order barcode">
              <div className="rounded-2xl bg-white px-4 py-4 text-center">
                <div
                  className="[&>svg]:mx-auto [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-[260px]"
                  dangerouslySetInnerHTML={{ __html: orderBarcodeSvg }}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <a
                  href={`/api/barcode?code=${encodeURIComponent(order.orderNumber)}&format=code128&h=14&s=4`}
                  download={`order-${order.orderNumber}.png`}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                >
                  Download PNG
                </a>
                <Link
                  href={`/admin/orders/${order.id}/slip`}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                >
                  Packing slip
                </Link>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Internal note">
            <form action={saveOrderDetails} className="space-y-4">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="trackingCode" value={order.trackingCode ?? ""} />
              <label htmlFor="staffNote" className="sr-only">
                Internal note
              </label>
              <textarea
                id="staffNote"
                name="staffNote"
                rows={5}
                defaultValue={order.staffNote ?? ""}
                placeholder="Not shown to the customer"
                className={fieldTextarea}
              />
              <button type="submit" className={btnPrimary}>
                Save note
              </button>
            </form>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
