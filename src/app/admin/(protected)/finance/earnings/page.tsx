import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card } from "@/components/admin/ui";
import { RevenueChart, type ChartPoint } from "@/components/admin/RevenueChart";
import { TH, Empty } from "@/components/admin/PageCard";
import { requireCapability } from "@/lib/permissions";
import { getTimeZone, ym, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Earning" };
export const dynamic = "force-dynamic";

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

export default async function EarningsPage() {
  const tz = await getTimeZone();
  await requireCapability("finance");
  const money = await getMoneyFormatter();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [allPaid, thisMonth, refunded, payouts] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalCents: true, taxCents: true, shippingCents: true },
      _count: { _all: true },
      where: { status: { in: [...PAID] } },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: { in: [...PAID] }, createdAt: { gte: monthStart } },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: "REFUNDED" },
    }),
    prisma.payout.findMany({ orderBy: { requestedAt: "desc" }, take: 10 }),
  ]);

  const grossCents = allPaid._sum.totalCents ?? 0;
  const taxCents = allPaid._sum.taxCents ?? 0;
  const shippingCents = allPaid._sum.shippingCents ?? 0;
  const refundedCents = refunded._sum.totalCents ?? 0;
  const paidOutCents = payouts
    .filter((p) => p.status === "PAID")
    .reduce((n, p) => n + p.amountCents, 0);

  // Tax is collected on behalf of the tax authority, so it is not yours to draw.
  const netCents = grossCents - taxCents - refundedCents;
  const availableCents = netCents - paidOutCents;

  // 12-month trend.
  const monthly = await prisma.order.findMany({
    where: {
      status: { in: [...PAID] },
      createdAt: { gte: new Date(Date.now() - 365 * 864e5) },
    },
    select: { createdAt: true, totalCents: true },
  });
  const buckets = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    buckets.set(ym(d, tz), 0);
  }
  for (const o of monthly) {
    const k = ym(o.createdAt, tz);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + o.totalCents);
  }
  const points: ChartPoint[] = [...buckets].map(([date, cents]) => ({
    date: `${date}-01`,
    cents,
    display: money.format(cents),
    // Monthly buckets, so the tooltip says "2026-08" rather than a day.
    label: date,
  }));

  const stats = [
    { label: "Gross revenue", value: money.compact(grossCents), exact: money.format(grossCents), tone: "bg-[#E2EEEA]" },
    { label: "This month", value: money.compact(thisMonth._sum.totalCents ?? 0), exact: money.format(thisMonth._sum.totalCents ?? 0), tone: "bg-[#F5EDDA]" },
    { label: "Tax collected", value: money.compact(taxCents), exact: money.format(taxCents), tone: "bg-[#F6E6DB]" },
    { label: "Shipping collected", value: money.compact(shippingCents), exact: money.format(shippingCents), tone: "bg-[#E3EAF3]" },
    { label: "Refunded", value: money.compact(refundedCents), exact: money.format(refundedCents), tone: "bg-[#F4E2E8]" },
    { label: "Available to withdraw", value: money.compact(availableCents), exact: money.format(availableCents), tone: "bg-[#E4EEDE]" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Earning</h1>
        <p className="mt-1 text-sm text-slate-500">
          Based on {allPaid._count._all} paid order
          {allPaid._count._all === 1 ? "" : "s"}. Tax collected is excluded from the
          withdrawable balance because it is owed onward, not earned.
        </p>
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
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Last 12 months
        </h2>
        <RevenueChart points={points} height={240} />
      </Card>

      <Card className="overflow-hidden">
        <div className="px-6 pt-6">
          <h2 className="text-lg font-semibold text-slate-900">Recent withdrawals</h2>
        </div>
        <div className="h-5" />
        {payouts.length === 0 ? (
          <Empty>No withdrawals recorded yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-slate-50/80">
                <tr>
                  <TH>Reference</TH>
                  <TH>Method</TH>
                  <TH>Status</TH>
                  <TH align="right">Amount</TH>
                  <TH align="right">Requested</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 lg:px-5 py-3 text-sm font-medium text-slate-900">
                      {p.reference}
                    </td>
                    <td className="px-3 lg:px-5 py-3 text-sm text-slate-600">
                      {p.method.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 lg:px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                          p.status === "PAID"
                            ? "bg-emerald-50 text-emerald-700"
                            : p.status === "CANCELLED"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {p.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-3 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                      {money.formatIn(p.amountCents, p.currency)}
                    </td>
                    <td className="px-3 lg:px-5 py-3 text-right text-sm text-slate-400">
                      {ymd(p.requestedAt, tz)}
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
