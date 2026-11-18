import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { can, landingFor } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { Card, StatCard } from "@/components/admin/ui";
import { MonthlyBars, StatusBars, type MonthPoint } from "@/components/admin/RevenueChart";
import { Donut } from "@/components/admin/Donut";
import {
  TopProductsBars,
  type TopProductRow,
} from "@/components/admin/TopProductsBars";
import { orderNo } from "@/lib/order-display";
import {
  getTimeZone,
  ymd,
  startOfDay,
  startOfYear,
  monthIndex,
  tzLabel,
} from "@/lib/timezone";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

/** Percent change, or null when there's no baseline to compare against. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const STATUS_META = [
  { key: "AWAITING_PAYMENT", label: "Pending payment", color: "#B4802A" },
  { key: "PROCESSING", label: "Processing", color: "#3B82F6" },
  { key: "ON_HOLD", label: "On hold", color: "#F97316" },
  { key: "SHIPPED", label: "Shipped", color: "#0EA5E9" },
  { key: "DELIVERED", label: "Completed", color: "#1A6FB5" },
  { key: "CANCELLED", label: "Cancelled", color: "#F43F5E" },
  { key: "REFUNDED", label: "Refunded", color: "#A855F7" },
  { key: "FAILED", label: "Failed", color: "#DC2626" },
] as const;

export default async function DashboardPage() {
  /*
   * The dashboard is revenue, customer totals and business health. A role
   * without "reports" has no business seeing it, so send it somewhere it can
   * actually work rather than rendering a page full of blanked-out figures.
   */
  const admin = await requireAdmin();
  const tz = await getTimeZone();
  /*
   * The dashboard is a reports screen. A role without "reports" is sent to the
   * first page its own capabilities allow - hardcoding /admin/orders here is
   * what created the redirect loop for Editors, who have neither capability.
   */
  if (!can(admin.role, "reports")) redirect(landingFor(admin.role));

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 864e5);
  const d60 = new Date(now.getTime() - 60 * 864e5);

  /*
   * Day and year boundaries are the store's own, not the server's. Computed in
   * UTC, "today" rolled over at 5pm local and an evening order counted against
   * tomorrow - the figures were right for a shop in London, not one in BC.
   */
  const todayStart = startOfDay(now, tz);
  const yesterdayStart = new Date(todayStart.getTime() - 864e5);
  const yearStart = startOfYear(now, tz);
  const lastYearStart = startOfYear(now, tz, 1);
  // Same point in the calendar a year ago, so the comparison is like-for-like
  // rather than a full year against a partial one.
  const lastYearToDate = new Date(now);
  lastYearToDate.setUTCFullYear(now.getUTCFullYear() - 1);

  const [
    salesNow,
    salesPrev,
    ordersNow,
    ordersPrev,
    customerCount,
    awaitingCount,
    lowStock,
    publishedCount,
    statusGroups,
    recentOrders,
    topItems,
    categoryItems,
    salesToday,
    salesYesterday,
    ordersToday,
    ordersYesterday,
    customersToday,
    unitsToday,
    yearRows,
    lastYearSales,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: { in: [...PAID] }, createdAt: { gte: d30 } },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: { in: [...PAID] }, createdAt: { gte: d60, lt: d30 } },
    }),
    prisma.order.count({ where: { createdAt: { gte: d30 } } }),
    prisma.order.count({ where: { createdAt: { gte: d60, lt: d30 } } }),
    prisma.customer.count({ where: { passwordHash: { not: null } } }),
    prisma.order.count({ where: { status: "AWAITING_PAYMENT" } }),
    prisma.productVariant.count({ where: { stock: { lte: 5 } } }),
    prisma.product.count({ where: { status: "PUBLISHED" } }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        shipName: true,
        email: true,
        status: true,
        totalCents: true,
        currency: true,
        createdAt: true,
      },
    }),
    /*
     * Best sellers by revenue, not by units - ten $5 items outselling one $200
     * item is not the same business fact, and revenue is what the tile above
     * is measuring.
     */
    prisma.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, lineTotalCents: true },
      where: {
        order: { status: { in: [...PAID] }, createdAt: { gte: d30 } },
      },
      orderBy: { _sum: { lineTotalCents: "desc" } },
      take: 6,
    }),
    /*
     * Revenue by category has to be aggregated in JS: the grouping key lives
     * on a relation two hops away, which groupBy cannot reach. Scoped to 30
     * days so the row count stays small.
     */
    prisma.orderItem.findMany({
      where: {
        order: { status: { in: [...PAID] }, createdAt: { gte: d30 } },
      },
      select: {
        lineTotalCents: true,
        product: {
          select: { category: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: { in: [...PAID] }, createdAt: { gte: todayStart } },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: {
        status: { in: [...PAID] },
        createdAt: { gte: yesterdayStart, lt: todayStart },
      },
    }),
    prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.order.count({
      where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
    }),
    prisma.customer.count({ where: { createdAt: { gte: todayStart }, passwordHash: { not: null } } }),
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: { order: { createdAt: { gte: todayStart } } },
    }),
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, createdAt: { gte: yearStart } },
      select: { createdAt: true, totalCents: true },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: {
        status: { in: [...PAID] },
        createdAt: { gte: lastYearStart, lt: lastYearToDate },
      },
    }),
  ]);

  const money = await getMoneyFormatter();

  const salesNowCents = salesNow._sum.totalCents ?? 0;
  const salesPrevCents = salesPrev._sum.totalCents ?? 0;

  const countByStatus = new Map(
    statusGroups.map((g) => [g.status as string, g._count._all]),
  );
  const slices = STATUS_META.map((m) => ({
    label: m.label,
    value: countByStatus.get(m.key) ?? 0,
    color: m.color,
  }));
  const totalOrders = slices.reduce((n, s) => n + s.value, 0);

  // Twelve months of the current calendar year, zero-filled.
  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthTotals = new Array(12).fill(0) as number[];
  for (const row of yearRows) {
    monthTotals[monthIndex(row.createdAt, tz)] += row.totalCents;
  }
  const months: MonthPoint[] = monthTotals.map((cents, i) => ({
    label: MONTH_NAMES[i],
    cents,
    formatted: money.format(cents),
  }));
  const yearToDateCents = monthTotals.reduce((n, c) => n + c, 0);
  const lastYearCents = lastYearSales._sum.totalCents ?? 0;
  const yearDelta = pctChange(yearToDateCents, lastYearCents);

  // Fulfilment stages, which is a different question from the raw status
  // split in the donut: where is the work, not what is every order labelled.
  const countOf = (k: string) => countByStatus.get(k) ?? 0;
  const fulfilment = [
    { label: "Awaiting e-Transfer", count: countOf("AWAITING_PAYMENT") + countOf("ON_HOLD"), color: "#B4802A" },
    {
      label: "Pending shipment",
      count: countOf("PAYMENT_RECEIVED") + countOf("PROCESSING"),
      color: "#3B82F6",
    },
    { label: "Shipped", count: countOf("SHIPPED"), color: "#0EA5E9" },
    { label: "Completed", count: countOf("DELIVERED"), color: "#1A6FB5" },
    {
      label: "Cancelled / refunded",
      count: countOf("CANCELLED") + countOf("REFUNDED"),
      color: "#F43F5E",
    },
  ];

  // Best sellers - names come from the product where it still exists.
  const topIds = topItems
    .map((t) => t.productId)
    .filter((id): id is string => Boolean(id));
  const topProducts = topIds.length
    ? await prisma.product.findMany({
        where: { id: { in: topIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const byId = new Map(topProducts.map((p) => [p.id, p]));
  const topRows: TopProductRow[] = topItems.map((t, i) => {
    const p = t.productId ? byId.get(t.productId) : undefined;
    const cents = t._sum.lineTotalCents ?? 0;
    return {
      id: t.productId ?? `deleted-${i}`,
      name: p?.name ?? "Deleted product",
      href: p ? `/admin/products/${p.id}` : null,
      units: t._sum.quantity ?? 0,
      cents,
      revenue: money.compact(cents),
      exact: money.format(cents),
    };
  });

  /*
   * Revenue is attributed to the product's primary category only. Products
   * also appear under secondary categories, and counting those too would make
   * the slices sum to more than the revenue actually taken.
   */
  const CATEGORY_COLORS = [
    "#1A6FB5", "#B4802A", "#3B82F6", "#F43F5E",
    "#A855F7", "#0EA5E9", "#2DD4A7", "#FB923C",
  ];
  const catTotals = new Map<string, { name: string; cents: number }>();
  for (const item of categoryItems) {
    const cat = item.product?.category;
    const key = cat?.id ?? "__none";
    const name = cat?.name ?? "Uncategorised";
    const row = catTotals.get(key) ?? { name, cents: 0 };
    row.cents += item.lineTotalCents;
    catTotals.set(key, row);
  }
  const catSlices = [...catTotals.values()]
    .sort((a, b) => b.cents - a.cents)
    .map((c, i) => ({
      label: c.name,
      value: c.cents,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      display: money.compact(c.cents),
      exact: money.format(c.cents),
    }));
  const catTotalCents = catSlices.reduce((n, c) => n + c.value, 0);

  const salesTodayCents = salesToday._sum.totalCents ?? 0;
  const salesYesterdayCents = salesYesterday._sum.totalCents ?? 0;
  const today = [
    {
      label: "Sales today",
      value: money.compact(salesTodayCents),
      exact: money.format(salesTodayCents),
      delta: pctChange(salesTodayCents, salesYesterdayCents),
      href: "/admin/orders",
    },
    {
      label: "Orders today",
      value: String(ordersToday),
      delta: pctChange(ordersToday, ordersYesterday),
      href: "/admin/orders",
    },
    {
      label: "Items sold today",
      value: String(unitsToday._sum.quantity ?? 0),
      delta: null,
      href: "/admin/orders",
    },
    {
      label: "New customers today",
      value: String(customersToday),
      delta: null,
      href: "/admin/customers",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Daily record - today's trading at a glance, above the running totals. */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-3 lg:px-5 py-3.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Today
          </h2>
          <span className="text-xs text-slate-400">
            {ymd(todayStart, tz)} &middot; {tzLabel(now, tz)} &middot; compared
            with yesterday
          </span>
        </div>
        <div className="grid grid-cols-2 divide-slate-100 sm:divide-x lg:grid-cols-4">
          {today.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="border-b border-slate-100 px-3 lg:px-5 py-4 transition hover:bg-slate-50/70 lg:border-b-0"
            >
              <p className="text-sm text-slate-500">{t.label}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <p
                  className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900"
                  title={"exact" in t ? t.exact : undefined}
                >
                  {t.value}
                </p>
                {t.delta != null ? (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.delta >= 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {t.delta >= 0 ? "+" : "-"}
                    {Math.abs(t.delta).toFixed(0)}%
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="mint"
          label="Total sales"
          value={money.compact(salesNowCents)}
          exactValue={money.format(salesNowCents)}
          delta={pctChange(salesNowCents, salesPrevCents)}
          href="/admin/orders"
        />
        <StatCard
          tone="yellow"
          label="Total orders"
          value={String(ordersNow)}
          delta={pctChange(ordersNow, ordersPrev)}
          href="/admin/orders"
        />
        <StatCard
          tone="peach"
          label="Total customers"
          value={String(customerCount)}
          href="/admin/customers"
        />
        <StatCard
          tone="pink"
          label="Awaiting e-Transfer"
          value={String(awaitingCount)}
          href="/admin/orders?status=AWAITING_PAYMENT"
        />
        <StatCard
          tone="lavender"
          label="Published products"
          value={String(publishedCount)}
          href="/admin/products?status=PUBLISHED"
        />
        <StatCard
          tone="orange"
          label="Low stock variants"
          value={String(lowStock)}
          href="/admin/products"
        />
        <StatCard
          tone="green"
          label="Completed"
          value={String(countByStatus.get("DELIVERED") ?? 0)}
          href="/admin/orders?status=DELIVERED"
        />
        <StatCard
          tone="blue"
          label="Cancelled / refunded"
          value={String(
            (countByStatus.get("CANCELLED") ?? 0) +
              (countByStatus.get("REFUNDED") ?? 0),
          )}
          href="/admin/orders?status=CANCELLED"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Revenue by month
          </h2>
          <p className="mb-5 text-sm text-slate-500">
            {yearDelta == null ? (
              <>No revenue last year to compare against</>
            ) : (
              <>
                <span
                  className={
                    yearDelta >= 0
                      ? "font-medium text-emerald-600"
                      : "font-medium text-red-600"
                  }
                >
                  ({yearDelta >= 0 ? "+" : "-"}
                  {Math.abs(yearDelta).toFixed(0)}%)
                </span>{" "}
                than the same point last year
              </>
            )}
          </p>
          <MonthlyBars months={months} />
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Order fulfillment status
          </h2>
          <p className="mb-5 text-sm text-slate-500">
            {totalOrders} order{totalOrders === 1 ? "" : "s"} across all time
          </p>
          <StatusBars rows={fulfilment} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Best sellers
            </h2>
            <Link
              href="/admin/reports/products"
              className="text-sm font-medium text-[var(--admin-accent)] hover:underline"
            >
              Full report
            </Link>
          </div>
          <p className="mb-5 text-sm text-slate-500">
            Ranked by revenue over the last 30 days.
          </p>
          <TopProductsBars rows={topRows} />
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Revenue by category
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Last 30 days, by each product&rsquo;s primary category.
          </p>

          {catTotalCents === 0 ? (
            <p className="py-14 text-center text-sm text-slate-400">
              No sales in this period yet.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-5">
              <Donut
                slices={catSlices}
                size={190}
                thickness={30}
                centreValue={money.compact(catTotalCents)}
                centreLabel="last 30 days"
              />
              <ul className="w-full space-y-2">
                {catSlices.map((c) => (
                  <li
                    key={c.label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="truncate text-slate-600">{c.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-slate-900" title={c.exact}>
                      {c.display}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 lg:px-5 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent orders
          </h2>
          <Link
            href="/admin/orders"
            className="text-sm font-medium text-[var(--admin-accent)] hover:underline"
          >
            View all
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <p className="px-6 pb-10 pt-4 text-center text-sm text-slate-400">
            No orders yet. They will appear here as customers check out.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-3 lg:px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order
                  </th>
                  <th className="px-3 lg:px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer
                  </th>
                  <th className="px-3 lg:px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-3 lg:px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total
                  </th>
                  <th className="px-3 lg:px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Placed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map((o) => {
                  const meta = STATUS_META.find((m) => m.key === o.status);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/60">
                      <td className="px-3 lg:px-5 py-3.5">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-medium text-slate-900 hover:text-[var(--admin-accent)]"
                        >
                          {orderNo(o.orderNumber)}
                        </Link>
                      </td>
                      <td className="px-3 lg:px-5 py-3.5">
                        <span className="block text-sm text-slate-700">
                          {o.shipName}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {o.email}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3.5">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{
                            backgroundColor: `${meta?.color ?? "#94A3B8"}1A`,
                            color: meta?.color ?? "#475569",
                          }}
                        >
                          {meta?.label ?? o.status}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                        {money.formatIn(o.totalCents, o.currency)}
                      </td>
                      <td className="px-3 lg:px-5 py-3.5 text-right text-sm text-slate-400">
                        {ymd(o.createdAt, tz)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
