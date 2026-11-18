import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card } from "@/components/admin/ui";
import { StatusPill } from "@/components/StatusPill";
import { TH, Empty } from "@/components/admin/PageCard";
import { requireCapability, can } from "@/lib/permissions";
import { orderNo } from "@/lib/order-display";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Return & refund" };
export const dynamic = "force-dynamic";

export default async function RefundsPage() {
  const admin = await requireCapability("orders");
  const tz = await getTimeZone();
  const seePii = can(admin.role, "customer_pii");
  const [orders, money] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: ["CANCELLED", "REFUNDED"] } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { items: { select: { quantity: true } } },
    }),
    getMoneyFormatter(),
  ]);

  const refunded = orders.filter((o) => o.status === "REFUNDED");
  const refundedTotal = refunded.reduce((n, o) => n + o.totalCents, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#F4E2E8] p-5">
          <p className="text-sm font-medium text-slate-700">Refunded orders</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            {refunded.length}
          </p>
        </div>
        <div className="rounded-2xl bg-[#F2E4CC] p-5">
          <p className="text-sm font-medium text-slate-700">Cancelled orders</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            {orders.length - refunded.length}
          </p>
        </div>
        <div className="rounded-2xl bg-[#E3EAF3] p-5">
          <p className="text-sm font-medium text-slate-700">Value refunded</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            <span title={money.format(refundedTotal)}>{money.compact(refundedTotal)}</span>
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="px-6 pt-6">
          <h1 className="text-xl font-semibold text-slate-900">Return &amp; refund</h1>
          <p className="mt-1 text-sm text-slate-500">
            Orders you cancelled or refunded. Change an order&rsquo;s status from
            its detail page to move it in or out of this list.
          </p>
        </div>
        <div className="h-5" />

        {orders.length === 0 ? (
          <Empty>No returns or refunds yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-slate-50/80">
                <tr>
                  <TH>Order</TH>
                  <TH>Customer</TH>
                  <TH>Status</TH>
                  <TH align="right">Items</TH>
                  <TH align="right">Amount</TH>
                  <TH align="right">Updated</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60">
                    <td className="px-3 lg:px-5 py-4">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="text-sm font-medium text-slate-900 hover:text-[var(--admin-accent)]"
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
                    <td className="px-3 lg:px-5 py-4 text-right text-sm tabular-nums text-slate-600">
                      {o.items.reduce((n, i) => n + i.quantity, 0)}
                    </td>
                    <td className="px-3 lg:px-5 py-4 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                      {money.formatIn(o.totalCents, o.currency)}
                    </td>
                    <td className="px-3 lg:px-5 py-4 text-right text-sm text-slate-400">
                      {ymd(o.updatedAt, tz)}
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
