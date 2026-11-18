import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { TH, Empty } from "@/components/admin/PageCard";
import { requestWithdrawal, setPayoutStatus } from "./actions";
import { requireCapability } from "@/lib/permissions";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Withdraws" };
export const dynamic = "force-dynamic";

const PAID_ORDERS = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

export default async function WithdrawsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const tz = await getTimeZone();
  await requireCapability("finance");
  const [{ saved, error }, payouts, money, earned, refunded] = await Promise.all([
    searchParams,
    prisma.payout.findMany({ orderBy: { requestedAt: "desc" }, take: 100 }),
    getMoneyFormatter(),
    prisma.order.aggregate({
      _sum: { totalCents: true, taxCents: true },
      where: { status: { in: [...PAID_ORDERS] } },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: "REFUNDED" },
    }),
  ]);

  const net =
    (earned._sum.totalCents ?? 0) -
    (earned._sum.taxCents ?? 0) -
    (refunded._sum.totalCents ?? 0);
  const withdrawn = payouts
    .filter((p) => p.status === "PAID")
    .reduce((n, p) => n + p.amountCents, 0);
  const requested = payouts
    .filter((p) => p.status === "REQUESTED")
    .reduce((n, p) => n + p.amountCents, 0);
  const available = net - withdrawn - requested;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Withdraws
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl bg-[#E2EEEA] p-5">
          <p className="text-sm font-medium text-slate-700">Net earnings</p>
          <p className="mt-2 text-xl font-semibold text-slate-900" title={money.format(net)}>{money.compact(net)}</p>
        </div>
        <div className="rounded-2xl bg-[#F5EDDA] p-5">
          <p className="text-sm font-medium text-slate-700">Requested</p>
          <p className="mt-2 text-xl font-semibold text-slate-900" title={money.format(requested)}>{money.compact(requested)}</p>
        </div>
        <div className="rounded-2xl bg-[#E3EAF3] p-5">
          <p className="text-sm font-medium text-slate-700">Already withdrawn</p>
          <p className="mt-2 text-xl font-semibold text-slate-900" title={money.format(withdrawn)}>{money.compact(withdrawn)}</p>
        </div>
        <div className="rounded-2xl bg-[#E4EEDE] p-5">
          <p className="text-sm font-medium text-slate-700">Available</p>
          <p className="mt-2 text-xl font-semibold text-slate-900" title={money.format(available)}>{money.compact(available)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="px-6 pt-6">
            <h2 className="text-lg font-semibold text-slate-900">Withdrawal history</h2>
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
                    <TH align="right">Amount</TH>
                    <TH>Status</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-3 lg:px-5 py-3.5">
                        <span className="block text-sm font-medium text-slate-900">
                          {p.reference}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {ymd(p.requestedAt, tz)}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3.5 text-sm text-slate-600">
                        {p.method.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 lg:px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                        {money.formatIn(p.amountCents, p.currency)}
                      </td>
                      <td className="px-3 lg:px-5 py-3.5">
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
                      <td className="px-3 lg:px-5 py-3.5">
                        {p.status === "REQUESTED" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <form action={setPayoutStatus}>
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="status" value="PAID" />
                              <button
                                type="submit"
                                className="rounded-full border border-[var(--admin-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
                              >
                                Mark paid
                              </button>
                            </form>
                            <form action={setPayoutStatus}>
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="status" value="CANCELLED" />
                              <button
                                type="submit"
                                className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </form>
                          </div>
                        ) : (
                          <p className="text-right text-xs text-slate-300">&mdash;</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="h-fit p-6">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Record a withdrawal</h2>
          <p className="mb-6 text-sm text-slate-500">
            This is a ledger of money you moved out of the business. It does not
            move funds itself.
          </p>

          {error === "amount" ? (
            <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Enter an amount greater than zero.
            </p>
          ) : null}

          <form action={requestWithdrawal} className="space-y-7">
            <Field label="Amount" htmlFor="amount">
              <input id="amount" name="amount" inputMode="decimal" required placeholder="0.00" className={fieldInput} />
            </Field>
            <Field label="Method" htmlFor="method">
              <select id="method" name="method" className={fieldSelect}>
                <option value="bank_transfer">Bank transfer</option>
                <option value="interac_etransfer">Interac e-Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </Field>
            <Field label="Note" htmlFor="note">
              <textarea id="note" name="note" rows={3} className={fieldTextarea} />
            </Field>
            <button type="submit" className={btnPrimary}>
              Record withdrawal
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
