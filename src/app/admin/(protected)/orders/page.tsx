import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/admin/ui";
import {
  IconSearch,
  IconOrders,
  IconClock,
  IconBoxes,
  IconTruck,
  IconCheck,
  IconBan,
  IconRefund,
} from "@/components/admin/Icons";
import type { OrderStatus, Prisma } from "@/generated/prisma";
import { requireCapability, can } from "@/lib/permissions";
import { BulkBar, BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import {
  bulkCancelOrders,
  bulkDeleteOrders,
  bulkMarkDelivered,
  bulkMarkProcessing,
  bulkMarkShipped,
  setOrderStatusInline,
} from "./actions";
import { OrderRowActions } from "@/components/admin/OrderRowActions";
import { findCarrier, trackingUrl, getCarriers } from "@/lib/carriers";
import { relativeDate, orderNo } from "@/lib/order-display";
import { getTimeZone, ymd, ymdhm, tzLabel } from "@/lib/timezone";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "All" },
  { value: "AWAITING_PAYMENT", label: "Pending payment" },
  { value: "PROCESSING", label: "Processing" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "FAILED", label: "Failed" },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const admin = await requireCapability("orders");
  const tz = await getTimeZone();
  const seePii = can(admin.role, "customer_pii");
  const { status, q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  const valid = FILTERS.some((f) => f.value === status && f.value !== "");

  /*
   * The filter and search the staff member is looking at, handed to the row
   * buttons so a status change returns to this exact view. Without it, working
   * through "Awaiting payment" would bounce back to All after every click.
   */
  const backParams = new URLSearchParams();
  if (valid && status) backParams.set("status", status);
  if (q) backParams.set("q", q);
  const back = backParams.size ? `?${backParams}` : "";

  const where: Prisma.OrderWhereInput = {
    ...(valid ? { status: status as OrderStatus } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { shipName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  /*
   * The tiles count against the search but not the status tab: filtering them
   * by the selected status would zero out every tile except the one you just
   * clicked, which is the opposite of what a summary row is for.
   */
  const tileWhere: Prisma.OrderWhereInput = { ...where };
  delete tileWhere.status;

  const [orders, money, carriers, statusGroups, tileTotal] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getMoneyFormatter(),
    getCarriers(false),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: tileWhere,
    }),
    prisma.order.count({ where: tileWhere }),
  ]);

  const countFor = new Map(
    statusGroups.map((g) => [g.status as string, g._count._all]),
  );
  const tiles = [
    { label: "Total orders", value: tileTotal, tone: "bg-[#E3EAF3]", Icon: IconOrders },
    { label: "Pending payment", value: countFor.get("AWAITING_PAYMENT") ?? 0, tone: "bg-[#F5EDDA]", Icon: IconClock },
    { label: "Processing", value: countFor.get("PROCESSING") ?? 0, tone: "bg-[#F6E6DB]", Icon: IconBoxes },
    { label: "On hold", value: countFor.get("ON_HOLD") ?? 0, tone: "bg-[#FDE2C4]", Icon: IconClock },
    { label: "Shipped", value: countFor.get("SHIPPED") ?? 0, tone: "bg-[#DEEAF4]", Icon: IconTruck },
    { label: "Completed", value: countFor.get("DELIVERED") ?? 0, tone: "bg-[#E4EEDE]", Icon: IconCheck },
    { label: "Cancelled", value: countFor.get("CANCELLED") ?? 0, tone: "bg-[#F4E2E8]", Icon: IconBan },
    { label: "Refunded", value: countFor.get("REFUNDED") ?? 0, tone: "bg-[#F2E4CC]", Icon: IconRefund },
    { label: "Failed", value: countFor.get("FAILED") ?? 0, tone: "bg-[#FBD5D5]", Icon: IconBan },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <h1 className="text-xl font-semibold text-slate-900">Total Orders</h1>
        {/* Exports whatever the current tab and search show, so the file and
            the screen always agree. */}
        <a
          href={`/api/admin/export/orders${back}`}
          className="rounded-full border border-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
        >
          Export CSV
        </a>
      </div>

      {/* Status summary. Read-only: the filter pills below the search box are
          how you narrow the list, so these stay a plain record of where the
          orders stand. */}
      <div className="grid grid-cols-1 gap-4 px-6 pt-5 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={`flex items-center gap-4 rounded-2xl p-4 ${t.tone}`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/85 text-slate-700">
              <t.Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-700">
                {t.label}
              </span>
              <span className="adm-display block text-2xl font-semibold leading-tight text-slate-900">
                {t.value}
              </span>
            </span>
          </div>
        ))}
      </div>

      <form action="/admin/orders" className="flex flex-wrap items-center gap-3 px-3 lg:px-5 py-5">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Order number, name or email"
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)]"
          />
        </div>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <button
          type="submit"
          className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2 px-6 pb-5">
        {FILTERS.map((f) => {
          const active = (status ?? "") === f.value;
          const href = f.value
            ? `/admin/orders?status=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`
            : `/admin/orders${q ? `?q=${encodeURIComponent(q)}` : ""}`;
          return (
            <Link
              key={f.label}
              href={href}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <p className="px-6 pb-12 text-center text-sm text-slate-500">
          No orders here yet.
        </p>
      ) : (
        <>
        <form id="bulk-orders" className="px-6">
          <BulkBar
            formId="bulk-orders"
            noun="order"
            actions={[
              { label: "Print slips", open: "/admin/orders/print?doc=slip" },
              { label: "Print invoices", open: "/admin/orders/print?doc=invoice" },
              { label: "Mark processing", action: bulkMarkProcessing },
              { label: "Mark shipped", action: bulkMarkShipped },
              { label: "Mark delivered", action: bulkMarkDelivered },
              { label: "Cancel", action: bulkCancelOrders, confirm: "Cancel the selected orders?" },
              {
                label: "Delete",
                action: bulkDeleteOrders,
                danger: true,
                confirm:
                  "Delete the selected orders permanently?\n\nThis does NOT reverse anything a paid order already did — points stay awarded, referral rewards stay paid, and stock stays decremented.",
              },
            ]}
          />
        </form>

        <div className="overflow-x-auto">
          <table className="w-full ">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="w-10 px-3 lg:px-5 py-3.5 text-left">
                  <BulkMaster formId="bulk-orders" label="Select all orders" />
                </th>
                {["Order", "Customer", "Status", "Shipment tracking", "Total", "Placed", "Action"].map(
                  (h) => (
                    <th
                      key={h}
                      className={`px-3 lg:px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                        ["Total", "Placed", "Action"].includes(h)
                          ? "text-right"
                          : "text-left"
                      } ${
                        /* Tracking is usually a dash. Dropping it on smaller
                           screens is better than scrolling the table for it. */
                        h === "Shipment tracking" ? "hidden xl:table-cell" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="px-3 lg:px-5 py-4">
                    <BulkCheckbox formId="bulk-orders" id={o.id} label={orderNo(o.orderNumber)} />
                  </td>
                  <td className="px-3 lg:px-5 py-4">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      title={orderNo(o.orderNumber)}
                      className="text-sm font-semibold text-[var(--admin-accent)] hover:underline"
                    >
                      {orderNo(o.orderNumber)}
                    </Link>
                  </td>
                  <td className="px-3 lg:px-5 py-4">
                    <span className="block text-sm text-slate-700">{o.shipName}</span>
                    {seePii ? (
                      <span className="block text-xs text-slate-400">{o.email}</span>
                    ) : null}
                  </td>
                  <td className="px-3 lg:px-5 py-4">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="hidden px-3 py-4 lg:px-5 xl:table-cell">
                    {o.trackingCode ? (
                      <div className="text-xs">
                        <span className="block font-medium text-slate-700">
                          {findCarrier(carriers, o.trackingCarrier)?.name ?? "Tracking"}
                        </span>
                        {trackingUrl(carriers, o.trackingCarrier, o.trackingCode) ? (
                          <a
                            href={trackingUrl(carriers, o.trackingCarrier, o.trackingCode)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block font-mono text-[var(--admin-accent)] hover:underline"
                          >
                            {o.trackingCode}
                          </a>
                        ) : (
                          <span className="block font-mono text-slate-600">
                            {o.trackingCode}
                          </span>
                        )}
                        <span className="mt-0.5 block italic text-slate-400">
                          {o.shippedAt
                            ? `Shipped ${ymd(o.shippedAt, tz)}`
                            : "Not marked shipped"}
                          {o.trackingAddedBy ? ` by ${o.trackingAddedBy}` : ""}
                          {o.trackingSource === "csv" ? " (via csv)" : ""}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">&mdash;</span>
                    )}
                  </td>
                  <td className="px-3 lg:px-5 py-4 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                    {money.formatIn(o.totalCents, o.currency)}
                  </td>
                  <td className="px-3 lg:px-5 py-4 text-right text-sm text-slate-500">
                    <span title={`${ymdhm(o.createdAt, tz)} ${tzLabel(o.createdAt, tz)}`}>
                      {relativeDate(o.createdAt, new Date(), tz)}
                    </span>
                  </td>
                  <td className="px-3 lg:px-5 py-4">
                    <OrderRowActions
                      action={setOrderStatusInline}
                      orderId={o.id}
                      orderLabel={orderNo(o.orderNumber)}
                      status={o.status}
                      back={back}
                      email={seePii ? o.email : null}
                      trackingHref={trackingUrl(
                        carriers,
                        o.trackingCarrier,
                        o.trackingCode,
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Card>
  );
}
