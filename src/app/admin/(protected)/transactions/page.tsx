import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card } from "@/components/admin/ui";
import { IconSearch } from "@/components/admin/Icons";
import { TH, Empty } from "@/components/admin/PageCard";
import type { Prisma } from "@/generated/prisma";
import { requireCapability } from "@/lib/permissions";
import { orderNo } from "@/lib/order-display";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

const PAYMENT_LABEL: Record<string, string> = {
  emt: "Interac e-Transfer",
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; payment?: string }>;
}) {
  const tz = await getTimeZone();
  await requireCapability("finance");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const payment = sp.payment ?? "";

  const where: Prisma.OrderWhereInput = {
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { emtReference: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(payment === "paid" ? { status: { in: [...PAID] } } : {}),
    ...(payment === "pending" ? { status: "AWAITING_PAYMENT" as const } : {}),
  };

  const ep = new URLSearchParams();
  if (q) ep.set("q", q);
  if (payment) ep.set("payment", payment);
  const exportParams = ep.size ? `?${ep}` : "";

  const [orders, money] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getMoneyFormatter(),
  ]);

  const received = orders
    .filter((o) => (PAID as readonly string[]).includes(o.status))
    .reduce((n, o) => n + o.totalCents, 0);
  const pending = orders
    .filter((o) => o.status === "AWAITING_PAYMENT")
    .reduce((n, o) => n + o.totalCents, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#E2EEEA] p-5">
          <p className="text-sm font-medium text-slate-700">Received</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            <span title={money.format(received)}>{money.compact(received)}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-[#F5EDDA] p-5">
          <p className="text-sm font-medium text-slate-700">Pending transfer</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            <span title={money.format(pending)}>{money.compact(pending)}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-[#E3EAF3] p-5">
          <p className="text-sm font-medium text-slate-700">Transactions listed</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            {orders.length}
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
          <h1 className="text-xl font-semibold text-slate-900">Order transactions</h1>
          {/* Exports whatever the current search and filter show, so the file
              and the screen always agree. */}
          <a
            href={`/api/admin/export/transactions${exportParams}`}
            className="shrink-0 rounded-full border border-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
          >
            Export CSV
          </a>
        </div>

        <form action="/admin/transactions" className="flex flex-wrap items-center gap-3 px-3 lg:px-5 py-5">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Order number, email or e-Transfer reference"
              className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)]"
            />
          </div>
          <select
            name="payment"
            defaultValue={payment}
            className="appearance-none rounded-full border border-slate-200 bg-white py-2.5 pl-5 pr-10 text-sm text-slate-700 outline-none focus:border-[var(--admin-accent)]"
          >
            <option value="">Payment status</option>
            <option value="paid">Received</option>
            <option value="pending">Pending</option>
          </select>
          <button
            type="submit"
            className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Apply
          </button>
        </form>

        {orders.length === 0 ? (
          <Empty>No transactions yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-slate-50/80">
                <tr>
                  <TH>Order</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH>Email</TH>
                  <TH align="right">Delivery</TH>
                  <TH align="right">Amount</TH>
                  <TH align="right">Status</TH>
                  <TH align="right">Date</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => {
                  const isPaid = (PAID as readonly string[]).includes(o.status);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/60">
                      <td className="px-3 lg:px-5 py-4">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="text-sm font-medium text-slate-900 hover:text-[var(--admin-accent)]"
                        >
                          {orderNo(o.orderNumber)}
                        </Link>
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-sm text-slate-600">
                        {PAYMENT_LABEL[o.paymentMethodKey ?? "emt"] ??
                          "Interac e-Transfer"}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-sm text-slate-500">
                        {o.emtReference ?? "—"}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-sm text-slate-600">{o.email}</td>
                      <td className="px-3 lg:px-5 py-4 text-right text-sm tabular-nums text-slate-600">
                        {money.formatIn(o.shippingCents, o.currency)}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                        {money.formatIn(o.totalCents, o.currency)}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-right">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                            isPaid
                              ? "bg-emerald-50 text-emerald-700"
                              : o.status === "AWAITING_PAYMENT"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {isPaid
                            ? "Received"
                            : o.status === "AWAITING_PAYMENT"
                              ? "Pending"
                              : o.status.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-right text-sm text-slate-400">
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
