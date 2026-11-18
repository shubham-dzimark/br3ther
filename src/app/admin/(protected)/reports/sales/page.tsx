import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card } from "@/components/admin/ui";
import { RevenueChart, type ChartPoint } from "@/components/admin/RevenueChart";
import { TH, Empty } from "@/components/admin/PageCard";
import { requireCapability } from "@/lib/permissions";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Sales reports" };
export const dynamic = "force-dynamic";

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const tz = await getTimeZone();
  await requireCapability("reports");
  const { days: rawDays } = await searchParams;
  const days = RANGES.some((r) => r.value === rawDays) ? Number(rawDays) : 30;
  const since = new Date(Date.now() - (days - 1) * 864e5);
  since.setHours(0, 0, 0, 0);

  const [orders, money] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, createdAt: { gte: since } },
      select: { createdAt: true, totalCents: true, subtotalCents: true, shippingCents: true, taxCents: true, discountCents: true },
      orderBy: { createdAt: "asc" },
    }),
    getMoneyFormatter(),
  ]);

  const gross = orders.reduce((n, o) => n + o.totalCents, 0);
  const shipping = orders.reduce((n, o) => n + o.shippingCents, 0);
  const tax = orders.reduce((n, o) => n + o.taxCents, 0);
  const discounts = orders.reduce((n, o) => n + o.discountCents, 0);
  const avg = orders.length ? Math.round(gross / orders.length) : 0;

  // Bucket by day, including days with no sales.
  const buckets = new Map<string, { cents: number; count: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    buckets.set(ymd(d, tz), { cents: 0, count: 0 });
  }
  for (const o of orders) {
    const key = ymd(o.createdAt, tz);
    const b = buckets.get(key);
    if (b) {
      b.cents += o.totalCents;
      b.count += 1;
    }
  }

  const points: ChartPoint[] = [...buckets].map(([date, b]) => ({
    date,
    cents: b.cents,
    display: money.format(b.cents),
  }));
  const tableRows = [...buckets].reverse().filter(([, b]) => b.count > 0);

  const stats = [
    { label: "Gross revenue", value: money.compact(gross), exact: money.format(gross), tone: "bg-[#E2EEEA]" },
    { label: "Orders", value: String(orders.length), tone: "bg-[#F5EDDA]" },
    { label: "Average order", value: money.compact(avg), exact: money.format(avg), tone: "bg-[#F6E6DB]" },
    { label: "Shipping collected", value: money.compact(shipping), exact: money.format(shipping), tone: "bg-[#E3EAF3]" },
    { label: "Tax collected", value: money.compact(tax), exact: money.format(tax), tone: "bg-[#E4EEDE]" },
    { label: "Discounts given", value: money.compact(discounts), exact: money.format(discounts), tone: "bg-[#F4E2E8]" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Sales reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Confirmed payments only. Orders still awaiting an e-Transfer are excluded.
          </p>
        </div>
        <form action="/admin/reports/sales" className="flex items-center gap-2">
          <select
            name="days"
            defaultValue={String(days)}
            className="appearance-none rounded-full border border-slate-200 bg-white py-2.5 pl-5 pr-10 text-sm text-slate-700 outline-none focus:border-[var(--admin-accent)]"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Apply
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-2xl p-5 ${s.tone}`}>
            <p className="text-sm font-medium text-slate-700">{s.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900" title={s.exact}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Revenue over time</h2>
        <RevenueChart points={points} height={260} />
      </Card>

      <Card className="overflow-hidden">
        <div className="px-6 pt-6">
          <h2 className="text-lg font-semibold text-slate-900">Daily breakdown</h2>
        </div>
        <div className="h-5" />
        {tableRows.length === 0 ? (
          <Empty>No confirmed sales in this period.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-slate-50/80">
                <tr>
                  <TH>Date</TH>
                  <TH align="right">Orders</TH>
                  <TH align="right">Revenue</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableRows.map(([date, b]) => (
                  <tr key={date} className="hover:bg-slate-50/60">
                    <td className="px-3 lg:px-5 py-3 text-sm text-slate-700">{date}</td>
                    <td className="px-3 lg:px-5 py-3 text-right text-sm tabular-nums text-slate-600">
                      {b.count}
                    </td>
                    <td className="px-3 lg:px-5 py-3 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                      <span title={money.format(b.cents)}>{money.compact(b.cents)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
